import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  ConfirmObjectUploadBody,
  ConfirmObjectUploadResponse,
  RequestObjectUploadUrlBody,
  RequestObjectUploadUrlResponse,
  ServeProjectObjectParams,
} from "@workspace/api-zod";
import { db, projectAssetsTable, projectMembersTable, projectsTable } from "@workspace/db";
import { createUpload, getPrivateObject } from "../lib/objectStorage";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use("/storage", requireAuth);

// Mirrors AssetUploadInput.size maximum in the API spec (25 MB). Signed PUT
// URLs cannot carry size conditions, so the real object is verified against
// this limit at confirm time and again before every serve.
const MAX_ASSET_BYTES = 26_214_400;

function allowedAssetType(contentType: string | undefined | null): boolean {
  if (!contentType) return false;
  return contentType.startsWith("image/")
    || contentType.startsWith("font/")
    || ["application/pdf", "application/octet-stream"].includes(contentType);
}

async function permission(projectId: string, userId: string) {
  const [row] = await db.select({
    ownerId: projectsTable.ownerId,
    permission: projectMembersTable.permission,
  }).from(projectsTable).leftJoin(projectMembersTable, and(
    eq(projectMembersTable.projectId, projectsTable.id),
    eq(projectMembersTable.userId, userId),
  )).where(eq(projectsTable.id, projectId));
  if (!row) return { exists: false, permission: null };
  return { exists: true, permission: row.ownerId === userId ? "owner" : row.permission };
}

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  const body = RequestObjectUploadUrlBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const actorId = (req as unknown as AuthenticatedRequest).userId;
  const projectAccess = await permission(body.data.projectId, actorId);
  if (!projectAccess.exists) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (projectAccess.permission !== "owner" && projectAccess.permission !== "edit") {
    res.status(403).json({ error: "Edit permission required." });
    return;
  }
  if (!allowedAssetType(body.data.contentType)) {
    res.status(400).json({ error: "Unsupported asset content type." });
    return;
  }
  const upload = await createUpload();
  await db.insert(projectAssetsTable).values({
    projectId: body.data.projectId,
    ownerId: actorId,
    objectPath: upload.objectPath,
    kind: body.data.kind,
    name: body.data.name,
    contentType: body.data.contentType,
    size: body.data.size,
  });
  res.json(RequestObjectUploadUrlResponse.parse(upload));
});

router.post("/storage/uploads/confirm", async (req, res): Promise<void> => {
  const body = ConfirmObjectUploadBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!body.data.objectPath.startsWith("/objects/")) {
    res.status(400).json({ error: "Invalid object path." });
    return;
  }
  const [asset] = await db.select().from(projectAssetsTable)
    .where(eq(projectAssetsTable.objectPath, body.data.objectPath));
  if (!asset) {
    res.status(404).json({ error: "Upload not found." });
    return;
  }
  const actorId = (req as unknown as AuthenticatedRequest).userId;
  const projectAccess = await permission(asset.projectId, actorId);
  if (projectAccess.permission !== "owner" && projectAccess.permission !== "edit") {
    res.status(403).json({ error: "Edit permission required." });
    return;
  }
  const file = await getPrivateObject(body.data.objectPath);
  if (!file) {
    res.status(404).json({ error: "Uploaded object not found. Upload the file before confirming." });
    return;
  }
  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size ?? 0);
  const actualType = metadata.contentType || null;
  if (actualSize > MAX_ASSET_BYTES || !allowedAssetType(actualType)) {
    req.log.warn({ objectPath: body.data.objectPath, actualSize, actualType }, "Rejected upload violating storage limits");
    await file.delete().catch(() => undefined);
    await db.delete(projectAssetsTable).where(eq(projectAssetsTable.id, asset.id));
    res.status(400).json({ error: `Upload rejected: objects must be an allowed type and at most ${Math.floor(MAX_ASSET_BYTES / 1024 / 1024)} MB.` });
    return;
  }
  const [updated] = await db.update(projectAssetsTable)
    .set({ size: actualSize, contentType: actualType ?? asset.contentType })
    .where(eq(projectAssetsTable.id, asset.id)).returning();
  res.json(ConfirmObjectUploadResponse.parse({
    objectPath: updated.objectPath, size: updated.size, contentType: updated.contentType,
  }));
});

router.get("/storage/objects/*objectPath", async (req, res): Promise<void> => {
  const rawPath = Array.isArray(req.params.objectPath)
    ? req.params.objectPath.join("/")
    : req.params.objectPath;
  const params = ServeProjectObjectParams.safeParse({ objectPath: rawPath });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const normalized = `/objects/${params.data.objectPath.replace(/^objects\//, "")}`;
  const [asset] = await db.select().from(projectAssetsTable).where(eq(projectAssetsTable.objectPath, normalized));
  if (!asset) {
    res.status(404).json({ error: "Object not found." });
    return;
  }
  const actorId = (req as unknown as AuthenticatedRequest).userId;
  const projectAccess = await permission(asset.projectId, actorId);
  if (!projectAccess.permission) {
    res.status(403).json({ error: "Project access denied." });
    return;
  }
  const file = await getPrivateObject(normalized);
  if (!file) {
    res.status(404).json({ error: "Object not found." });
    return;
  }
  const [metadata] = await file.getMetadata();
  // Enforce limits against the REAL object, not the caller-supplied row —
  // signed PUT URLs cannot constrain what actually got uploaded.
  const actualSize = Number(metadata.size ?? 0);
  const actualType = metadata.contentType || asset.contentType;
  if (actualSize > MAX_ASSET_BYTES || !allowedAssetType(actualType)) {
    req.log.warn({ objectPath: normalized, actualSize, actualType }, "Purging stored object violating storage limits");
    await file.delete().catch(() => undefined);
    await db.delete(projectAssetsTable).where(eq(projectAssetsTable.id, asset.id));
    res.status(403).json({ error: "Object violates storage limits and has been removed." });
    return;
  }
  res.setHeader("Content-Type", actualType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
  file.createReadStream().on("error", (error) => {
    req.log.error({ err: error, objectPath: normalized }, "Object stream failed");
    if (!res.headersSent) res.status(404).json({ error: "Object not found." });
    else res.destroy(error);
  }).pipe(res);
});

export default router;