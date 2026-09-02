import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gt, inArray, lte, or } from "drizzle-orm";
import {
  AcceptProjectShareLinkBody,
  AcceptProjectShareLinkResponse,
  ArchiveProjectBody,
  ArchiveProjectParams,
  ArchiveProjectResponse,
  CreateProjectBody,
  CreateProjectResponse,
  CreateProjectShareLinkBody,
  CreateProjectShareLinkParams,
  CreateProjectShareLinkResponse,
  CreateProjectVersionBody,
  CreateProjectVersionParams,
  CreateProjectVersionResponse,
  DeleteProjectParams,
  DuplicateProjectBody,
  DuplicateProjectParams,
  DuplicateProjectResponse,
  GetProjectParams,
  GetProjectResponse,
  HeartbeatProjectPresenceBody,
  HeartbeatProjectPresenceParams,
  HeartbeatProjectPresenceResponse,
  ListProjectPresenceParams,
  ListProjectPresenceResponse,
  ListProjectsQueryParams,
  ListProjectsResponse,
  ListProjectShareLinksParams,
  ListProjectShareLinksResponse,
  ListProjectVersionsParams,
  ListProjectVersionsResponse,
  RestoreProjectVersionBody,
  RestoreProjectVersionParams,
  RestoreProjectVersionResponse,
  RevokeProjectShareLinkParams,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
} from "@workspace/api-zod";
import {
  db,
  projectMembersTable,
  projectPresenceTable,
  projectsTable,
  projectShareLinksTable,
  projectVersionsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use("/projects", requireAuth);
router.use("/share-links", requireAuth);
const DOCUMENT_LIMIT = 2 * 1024 * 1024;
const STATE_LIMIT = 16 * 1024;

function userId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

function jsonSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

async function access(projectId: string, actorId: string) {
  const [row] = await db
    .select({ project: projectsTable, memberPermission: projectMembersTable.permission })
    .from(projectsTable)
    .leftJoin(projectMembersTable, and(
      eq(projectMembersTable.projectId, projectsTable.id),
      eq(projectMembersTable.userId, actorId),
    ))
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  if (!row) return null;
  const permission = row.project.ownerId === actorId ? "owner" as const : row.memberPermission;
  return { ...row.project, permission };
}

function editable(permission: "owner" | "view" | "edit" | null): boolean {
  return permission === "owner" || permission === "edit";
}

function failValidation(res: Response, error: { message: string }): void {
  res.status(400).json({ error: error.message });
}

router.get("/projects", async (req, res): Promise<void> => {
  const query = ListProjectsQueryParams.safeParse(req.query);
  if (!query.success) return failValidation(res, query.error);
  const actorId = userId(req);
  const rows = await db
    .select({ project: projectsTable, memberPermission: projectMembersTable.permission })
    .from(projectsTable)
    .leftJoin(projectMembersTable, and(
      eq(projectMembersTable.projectId, projectsTable.id),
      eq(projectMembersTable.userId, actorId),
    ))
    .where(and(
      eq(projectsTable.archived, query.data.archived ?? false),
      or(eq(projectsTable.ownerId, actorId), eq(projectMembersTable.userId, actorId)),
    ))
    .orderBy(desc(projectsTable.updatedAt));
  res.json(ListProjectsResponse.parse(rows.map(({ project, memberPermission }) => ({
    ...project,
    permission: project.ownerId === actorId ? "owner" : memberPermission,
  }))));
});

router.post("/projects", async (req, res): Promise<void> => {
  const body = CreateProjectBody.safeParse(req.body);
  if (!body.success) return failValidation(res, body.error);
  if (!body.data.name.trim() || body.data.document === undefined) {
    res.status(400).json({ error: "A non-empty name and document are required." });
    return;
  }
  if (jsonSize(body.data.document) > DOCUMENT_LIMIT) {
    res.status(400).json({ error: "Document exceeds the 2 MB limit." });
    return;
  }
  const actorId = userId(req);
  const project = await db.transaction(async (tx) => {
    const [created] = await tx.insert(projectsTable).values({
      ownerId: actorId,
      name: body.data.name.trim(),
      folder: body.data.folder?.trim() || null,
      document: body.data.document,
      schemaVersion: body.data.schemaVersion,
    }).returning();
    await tx.insert(projectVersionsTable).values({
      projectId: created.id,
      createdBy: actorId,
      label: "Initial version",
      document: created.document,
      schemaVersion: created.schemaVersion,
      revision: created.revision,
    });
    return created;
  });
  res.status(201).json(CreateProjectResponse.parse({ ...project, permission: "owner" }));
});

router.get("/projects/:projectId", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) return failValidation(res, params.error);
  const project = await access(params.data.projectId, userId(req));
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!project.permission) {
    res.status(403).json({ error: "Project access denied." });
    return;
  }
  res.json(GetProjectResponse.parse(project));
});

router.patch("/projects/:projectId", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  const body = UpdateProjectBody.safeParse(req.body);
  if (!params.success) return failValidation(res, params.error);
  if (!body.success) return failValidation(res, body.error);
  if (body.data.name !== undefined && !body.data.name.trim()) {
    res.status(400).json({ error: "Project name cannot be blank." });
    return;
  }
  if (body.data.document !== undefined && jsonSize(body.data.document) > DOCUMENT_LIMIT) {
    res.status(400).json({ error: "Document exceeds the 2 MB limit." });
    return;
  }
  const actorId = userId(req);
  const current = await access(params.data.projectId, actorId);
  if (!current) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!editable(current.permission)) {
    res.status(403).json({ error: "Edit permission required." });
    return;
  }
  const metadataChange = body.data.name !== undefined
    || body.data.folder !== undefined
    || body.data.thumbnailObjectPath !== undefined;
  if (metadataChange && current.permission !== "owner") {
    res.status(403).json({ error: "Only the owner may change project metadata." });
    return;
  }
  const { expectedRevision, ...changes } = body.data;
  if (!Object.keys(changes).length) {
    res.status(400).json({ error: "At least one project field is required." });
    return;
  }
  const [updated] = await db.update(projectsTable).set({
    ...changes,
    ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
    ...(changes.folder !== undefined ? { folder: changes.folder?.trim() || null } : {}),
    revision: expectedRevision + 1,
    updatedAt: new Date(),
  }).where(and(eq(projectsTable.id, current.id), eq(projectsTable.revision, expectedRevision))).returning();
  if (!updated) {
    const [latest] = await db.select({ revision: projectsTable.revision }).from(projectsTable).where(eq(projectsTable.id, current.id));
    res.status(409).json({ error: "Project was updated by another client.", currentRevision: latest?.revision ?? current.revision });
    return;
  }
  res.json(UpdateProjectResponse.parse({ ...updated, permission: current.permission }));
});

router.patch("/projects/:projectId/archive", async (req, res): Promise<void> => {
  const params = ArchiveProjectParams.safeParse(req.params);
  const body = ArchiveProjectBody.safeParse(req.body);
  if (!params.success) return failValidation(res, params.error);
  if (!body.success) return failValidation(res, body.error);
  const project = await access(params.data.projectId, userId(req));
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (project.permission !== "owner") {
    res.status(403).json({ error: "Only the owner may archive a project." });
    return;
  }
  const [updated] = await db.update(projectsTable).set({ archived: body.data.archived, updatedAt: new Date() })
    .where(eq(projectsTable.id, project.id)).returning();
  res.json(ArchiveProjectResponse.parse({ ...updated, permission: "owner" }));
});

router.delete("/projects/:projectId", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) return failValidation(res, params.error);
  const project = await access(params.data.projectId, userId(req));
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (project.permission !== "owner") {
    res.status(403).json({ error: "Only the owner may delete a project." });
    return;
  }
  await db.delete(projectsTable).where(eq(projectsTable.id, project.id));
  res.sendStatus(204);
});

router.post("/projects/:projectId/duplicate", async (req, res): Promise<void> => {
  const params = DuplicateProjectParams.safeParse(req.params);
  const body = DuplicateProjectBody.safeParse(req.body);
  if (!params.success) return failValidation(res, params.error);
  if (!body.success) return failValidation(res, body.error);
  if (body.data.name !== undefined && !body.data.name.trim()) {
    res.status(400).json({ error: "Project name cannot be blank." });
    return;
  }
  const actorId = userId(req);
  const source = await access(params.data.projectId, actorId);
  if (!source) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!source.permission) {
    res.status(403).json({ error: "Project access denied." });
    return;
  }
  const duplicate = await db.transaction(async (tx) => {
    const [created] = await tx.insert(projectsTable).values({
      ownerId: actorId,
      name: body.data.name?.trim() || `${source.name} copy`,
      folder: body.data.folder === undefined ? source.folder : body.data.folder?.trim() || null,
      document: source.document,
      schemaVersion: source.schemaVersion,
      thumbnailObjectPath: source.thumbnailObjectPath,
    }).returning();
    await tx.insert(projectVersionsTable).values({
      projectId: created.id, createdBy: actorId, label: "Initial version",
      document: created.document, schemaVersion: created.schemaVersion, revision: 0,
    });
    return created;
  });
  res.status(201).json(DuplicateProjectResponse.parse({ ...duplicate, permission: "owner" }));
});

const VERSION_RETENTION = 50;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function pruneProjectVersions(tx: Tx, projectId: string): Promise<void> {
  const stale = tx.select({ id: projectVersionsTable.id }).from(projectVersionsTable)
    .where(eq(projectVersionsTable.projectId, projectId))
    .orderBy(desc(projectVersionsTable.createdAt), desc(projectVersionsTable.id))
    .offset(VERSION_RETENTION);
  await tx.delete(projectVersionsTable).where(inArray(projectVersionsTable.id, stale));
}

router.get("/projects/:projectId/versions", async (req, res): Promise<void> => {
  const params = ListProjectVersionsParams.safeParse(req.params);
  if (!params.success) return failValidation(res, params.error);
  const project = await access(params.data.projectId, userId(req));
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!project.permission) {
    res.status(403).json({ error: "Project access denied." });
    return;
  }
  const versions = await db.select().from(projectVersionsTable)
    .where(eq(projectVersionsTable.projectId, project.id))
    .orderBy(desc(projectVersionsTable.createdAt), desc(projectVersionsTable.id))
    .limit(VERSION_RETENTION);
  res.json(ListProjectVersionsResponse.parse(versions));
});

router.post("/projects/:projectId/versions", async (req, res): Promise<void> => {
  const params = CreateProjectVersionParams.safeParse(req.params);
  const body = CreateProjectVersionBody.safeParse(req.body);
  if (!params.success) return failValidation(res, params.error);
  if (!body.success) return failValidation(res, body.error);
  const project = await access(params.data.projectId, userId(req));
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!editable(project.permission)) {
    res.status(403).json({ error: "Edit permission required." });
    return;
  }
  // Snapshot inside a transaction with the row locked, and honor the client's
  // expectedRevision — otherwise a collaborator's concurrent save could make a
  // user-labeled checkpoint capture someone else's document.
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(projectsTable)
      .where(eq(projectsTable.id, project.id)).for("update");
    if (!current) return { kind: "missing" as const };
    if (body.data.expectedRevision !== undefined && current.revision !== body.data.expectedRevision) {
      return { kind: "conflict" as const, currentRevision: current.revision };
    }
    const [version] = await tx.insert(projectVersionsTable).values({
      projectId: project.id, createdBy: userId(req), label: body.data.label?.trim() || null,
      document: current.document, schemaVersion: current.schemaVersion, revision: current.revision,
    }).returning();
    await pruneProjectVersions(tx, project.id);
    return { kind: "created" as const, version };
  });
  if (result.kind === "missing") {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "Project was updated by another client.", currentRevision: result.currentRevision });
    return;
  }
  res.status(201).json(CreateProjectVersionResponse.parse(result.version));
});

router.post("/projects/:projectId/versions/:versionId/restore", async (req, res): Promise<void> => {
  const params = RestoreProjectVersionParams.safeParse(req.params);
  const body = RestoreProjectVersionBody.safeParse(req.body);
  if (!params.success) return failValidation(res, params.error);
  if (!body.success) return failValidation(res, body.error);
  const actorId = userId(req);
  const project = await access(params.data.projectId, actorId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!editable(project.permission)) {
    res.status(403).json({ error: "Edit permission required." });
    return;
  }
  const [version] = await db.select().from(projectVersionsTable).where(and(
    eq(projectVersionsTable.id, params.data.versionId),
    eq(projectVersionsTable.projectId, project.id),
  ));
  if (!version) {
    res.status(404).json({ error: "Version not found." });
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const [locked] = await tx.update(projectsTable).set({
      document: version.document,
      schemaVersion: version.schemaVersion,
      revision: body.data.expectedRevision + 1,
      updatedAt: new Date(),
    }).where(and(eq(projectsTable.id, project.id), eq(projectsTable.revision, body.data.expectedRevision))).returning();
    if (!locked) return null;
    await tx.insert(projectVersionsTable).values({
      projectId: project.id, createdBy: actorId, label: "Before restore",
      document: project.document, schemaVersion: project.schemaVersion, revision: project.revision,
    });
    await pruneProjectVersions(tx, project.id);
    return locked;
  });
  if (!updated) {
    const [latest] = await db.select({ revision: projectsTable.revision }).from(projectsTable).where(eq(projectsTable.id, project.id));
    res.status(409).json({ error: "Project was updated by another client.", currentRevision: latest?.revision ?? project.revision });
    return;
  }
  res.json(RestoreProjectVersionResponse.parse({ ...updated, permission: project.permission }));
});

router.get("/projects/:projectId/share-links", async (req, res): Promise<void> => {
  const params = ListProjectShareLinksParams.safeParse(req.params);
  if (!params.success) return failValidation(res, params.error);
  const project = await access(params.data.projectId, userId(req));
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (project.permission !== "owner") {
    res.status(403).json({ error: "Only the owner may manage sharing." });
    return;
  }
  const links = await db.select({
    id: projectShareLinksTable.id, projectId: projectShareLinksTable.projectId,
    permission: projectShareLinksTable.permission, expiresAt: projectShareLinksTable.expiresAt,
    revokedAt: projectShareLinksTable.revokedAt, createdAt: projectShareLinksTable.createdAt,
  }).from(projectShareLinksTable).where(eq(projectShareLinksTable.projectId, project.id));
  res.json(ListProjectShareLinksResponse.parse(links));
});

router.post("/projects/:projectId/share-links", async (req, res): Promise<void> => {
  const params = CreateProjectShareLinkParams.safeParse(req.params);
  const body = CreateProjectShareLinkBody.safeParse(req.body);
  if (!params.success) return failValidation(res, params.error);
  if (!body.success) return failValidation(res, body.error);
  const project = await access(params.data.projectId, userId(req));
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (project.permission !== "owner") {
    res.status(403).json({ error: "Only the owner may manage sharing." });
    return;
  }
  const expiresAt = new Date(body.data.expiresAt);
  if (expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 90 * 24 * 60 * 60_000) {
    res.status(400).json({ error: "Expiry must be in the future and within 90 days." });
    return;
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [link] = await db.insert(projectShareLinksTable).values({
    projectId: project.id, permission: body.data.permission, expiresAt, tokenHash,
  }).returning();
  res.status(201).json(CreateProjectShareLinkResponse.parse({ ...link, token }));
});

router.delete("/projects/:projectId/share-links/:shareLinkId", async (req, res): Promise<void> => {
  const params = RevokeProjectShareLinkParams.safeParse(req.params);
  if (!params.success) return failValidation(res, params.error);
  const project = await access(params.data.projectId, userId(req));
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (project.permission !== "owner") {
    res.status(403).json({ error: "Only the owner may manage sharing." });
    return;
  }
  const [link] = await db.update(projectShareLinksTable).set({ revokedAt: new Date() }).where(and(
    eq(projectShareLinksTable.id, params.data.shareLinkId),
    eq(projectShareLinksTable.projectId, project.id),
  )).returning();
  if (!link) {
    res.status(404).json({ error: "Share link not found." });
    return;
  }
  res.sendStatus(204);
});

router.post("/share-links/accept", async (req, res): Promise<void> => {
  const body = AcceptProjectShareLinkBody.safeParse(req.body);
  if (!body.success) return failValidation(res, body.error);
  const digest = createHash("sha256").update(body.data.token).digest("hex");
  const [link] = await db.select().from(projectShareLinksTable).where(and(
    eq(projectShareLinksTable.tokenHash, digest),
    gt(projectShareLinksTable.expiresAt, new Date()),
  ));
  if (!link || link.revokedAt) {
    res.status(404).json({ error: "Share link is invalid, expired, or revoked." });
    return;
  }
  const actorId = userId(req);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, link.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (project.ownerId !== actorId) {
    await db.insert(projectMembersTable).values({
      projectId: project.id, userId: actorId, permission: link.permission,
    }).onConflictDoUpdate({
      target: [projectMembersTable.projectId, projectMembersTable.userId],
      set: { permission: link.permission, updatedAt: new Date() },
    });
  }
  res.json(AcceptProjectShareLinkResponse.parse({
    ...project, permission: project.ownerId === actorId ? "owner" : link.permission,
  }));
});

router.get("/projects/:projectId/presence", async (req, res): Promise<void> => {
  const params = ListProjectPresenceParams.safeParse(req.params);
  if (!params.success) return failValidation(res, params.error);
  const project = await access(params.data.projectId, userId(req));
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!project.permission) {
    res.status(403).json({ error: "Project access denied." });
    return;
  }
  const now = new Date();
  await db.delete(projectPresenceTable).where(and(
    eq(projectPresenceTable.projectId, project.id),
    lte(projectPresenceTable.expiresAt, now),
  ));
  const entries = await db.select().from(projectPresenceTable).where(and(
    eq(projectPresenceTable.projectId, project.id),
    gt(projectPresenceTable.expiresAt, now),
  ));
  res.json(ListProjectPresenceResponse.parse(entries));
});

router.post("/projects/:projectId/presence", async (req, res): Promise<void> => {
  const params = HeartbeatProjectPresenceParams.safeParse(req.params);
  const body = HeartbeatProjectPresenceBody.safeParse(req.body);
  if (!params.success) return failValidation(res, params.error);
  if (!body.success) return failValidation(res, body.error);
  if (body.data.state === undefined) {
    res.status(400).json({ error: "Presence state is required." });
    return;
  }
  if (jsonSize(body.data.state) > STATE_LIMIT) {
    res.status(400).json({ error: "Presence state exceeds the 16 KB limit." });
    return;
  }
  const actorId = userId(req);
  const project = await access(params.data.projectId, actorId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!project.permission) {
    res.status(403).json({ error: "Project access denied." });
    return;
  }
  // Viewers may heartbeat presence too — read-only collaborators should be
  // visible in the presence list; mutation routes still require edit access.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30_000);
  const [entry] = await db.insert(projectPresenceTable).values({
    projectId: project.id, userId: actorId, clientId: body.data.clientId,
    state: body.data.state, expiresAt, updatedAt: now,
  }).onConflictDoUpdate({
    target: [projectPresenceTable.projectId, projectPresenceTable.userId, projectPresenceTable.clientId],
    set: { state: body.data.state, expiresAt, updatedAt: now },
  }).returning();
  res.json(HeartbeatProjectPresenceResponse.parse(entry));
});

export default router;