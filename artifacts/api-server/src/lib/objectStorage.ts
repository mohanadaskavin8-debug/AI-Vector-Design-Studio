import { randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: { url: `${SIDECAR}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function privateDir(): string {
  const value = process.env.PRIVATE_OBJECT_DIR;
  if (!value) throw new Error("PRIVATE_OBJECT_DIR is not configured.");
  return value.replace(/\/$/, "");
}

function split(path: string): { bucket: string; object: string } {
  const [bucket, ...parts] = path.replace(/^\//, "").split("/");
  if (!bucket || !parts.length) throw new Error("Invalid object storage path.");
  return { bucket, object: parts.join("/") };
}

async function sign(bucket: string, object: string): Promise<string> {
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: object,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Failed to sign object upload URL (${response.status}).`);
  const body = await response.json() as { signed_url?: string };
  if (!body.signed_url) throw new Error("Object storage returned no signed URL.");
  return body.signed_url;
}

export async function createUpload(): Promise<{ uploadURL: string; objectPath: string }> {
  const relative = `uploads/${randomUUID()}`;
  const target = split(`${privateDir()}/${relative}`);
  return { uploadURL: await sign(target.bucket, target.object), objectPath: `/objects/${relative}` };
}

export async function getPrivateObject(objectPath: string): Promise<File | null> {
  if (!objectPath.startsWith("/objects/")) return null;
  const target = split(`${privateDir()}/${objectPath.slice("/objects/".length)}`);
  const file = storage.bucket(target.bucket).file(target.object);
  const [exists] = await file.exists();
  return exists ? file : null;
}