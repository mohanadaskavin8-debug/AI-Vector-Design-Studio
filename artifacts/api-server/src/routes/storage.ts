import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import type { File } from "@google-cloud/storage";
import {
  ConfirmObjectUploadBody,
  ConfirmObjectUploadResponse,
  RequestObjectUploadUrlBody,
  RequestObjectUploadUrlResponse,
  ServeProjectObjectParams,
} from "@workspace/api-zod";
import { db, projectAssetsTable, projectMembersTable, projectsTable } from "@workspace/db";
import { createUpload, getPrivateObject } from "../lib/objectStorage";
import {
  MAX_ASSET_BYTES,
  SNIFF_BYTES,
  formatFromClaimedType,
  serveHeadersFor,
  validateUploadedAsset,
} from "../lib/assetValidation";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use("/storage", requireAuth);

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

function readFirstBytes(file: File, limit = SNIFF_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    file.createReadStream({ start: 0, end: limit - 1 })
      .on("data", (chunk) => chunks.push(chunk as Buffer))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);
  });
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
  if (!formatFromClaimedType(body.data.contentType)) {
    res.status(400).json({ error: "Unsupported asset content type. Allowed: PNG, JPEG, WebP, SVG." });
    return;
  }
  const upload = await createUpload();
  // Rows start unconfirmed: the object is not serveable until the confirm
  // endpoint has verified the real uploaded bytes.
  await db.insert(projectAssetsTable).values({
    projectId: body.data.projectId,
    ownerId: actorId,
    objectPath: upload.objectPath,
    kind: body.data.kind,
    name: body.data.name,
    contentType: body.data.contentType,
    size: body.data.size,
    confirmed: false,
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
  const bytes = await readFirstBytes(file).catch(() => Buffer.alloc(0));
  // Verdict comes from the REAL bytes + the type claimed at request-url time.
  // GCS contentType metadata is uploader-controlled and is deliberately ignored.
  const verdict = validateUploadedAsset({ bytes, claimedType: asset.contentType, size: actualSize });
  if (!verdict.ok) {
    req.log.warn({ objectPath: body.data.objectPath, actualSize, reason: verdict.reason }, "Rejected upload failing verification");
    await file.delete().catch(() => undefined);
    await db.delete(projectAssetsTable).where(eq(projectAssetsTable.id, asset.id));
    res.status(400).json({ error: `Upload rejected: ${verdict.reason}` });
    return;
  }
  const [updated] = await db.update(projectAssetsTable)
    .set({ size: actualSize, contentType: verdict.canonicalType, confirmed: true })
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
  // Unconfirmed uploads are indistinguishable from missing objects: the
  // confirm endpoint is the only path that makes an asset serveable.
  if (!asset || !asset.confirmed) {
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
  // Defense in depth: a signed PUT URL stays valid briefly after confirm, so
  // re-check the REAL object size before streaming and purge violators.
  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size ?? 0);
  if (actualSize > MAX_ASSET_BYTES) {
    req.log.warn({ objectPath: normalized, actualSize }, "Purging stored object violating storage limits");
    await file.delete().catch(() => undefined);
    await db.delete(projectAssetsTable).where(eq(projectAssetsTable.id, asset.id));
    res.status(403).json({ error: "Object violates storage limits and has been removed." });
    return;
  }
  // Headers derive from the server-authored canonical type persisted at
  // confirm time — never from uploader-controlled GCS metadata. SVG goes out
  // as an attachment with a deny-all CSP (thumbnails render fine via <img>).
  const headers = serveHeadersFor(asset.contentType, asset.name);
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
  file.createReadStream().on("error", (error) => {
    req.log.error({ err: error, objectPath: normalized }, "Object stream failed");
    if (!res.headersSent) res.status(404).json({ error: "Object not found." });
    else res.destroy(error);
  }).pipe(res);
});

export default router;
