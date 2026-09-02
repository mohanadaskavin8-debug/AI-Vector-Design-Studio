/**
 * Security decisions for user-uploaded project assets.
 *
 * Threat model: signed PUT URLs mean the uploader fully controls the bytes
 * and the Content-Type metadata of the stored object. Nothing derived from
 * the upload itself can be trusted. Therefore:
 *  - Only a narrow set of formats is allowed (raster images + SVG for
 *    server-generated thumbnails).
 *  - The real bytes are sniffed at confirm time and must MATCH the claimed
 *    type; the canonical content type persisted on the row is derived from
 *    the sniffed bytes, never from uploader metadata.
 *  - SVG is an active document format (scripts execute on navigation), so it
 *    is always served with `Content-Disposition: attachment` plus a deny-all
 *    CSP. `<img>` rendering ignores the disposition, so thumbnails keep
 *    working while same-origin navigation cannot execute scripts.
 */

export const MAX_ASSET_BYTES = 26_214_400; // mirrors AssetUploadInput.size max (25 MB)
export const SNIFF_BYTES = 1024;

export type AssetFormat = "png" | "jpeg" | "webp" | "svg";

export const CANONICAL_TYPE: Record<AssetFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const CLAIMED_TYPES: Record<string, AssetFormat> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** Formats acceptable at request-url time. Everything else is rejected up front. */
export function formatFromClaimedType(contentType: string | null | undefined): AssetFormat | null {
  if (!contentType) return null;
  return CLAIMED_TYPES[contentType.toLowerCase().split(";")[0].trim()] ?? null;
}

/** Identify the real format from the object's leading bytes. */
export function sniffAssetFormat(bytes: Uint8Array): AssetFormat | null {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 // RIFF
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp"; // WEBP
  return looksLikeSvg(bytes) ? "svg" : null;
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, SNIFF_BYTES));
  } catch {
    return false;
  }
  const head = text.replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (!head.startsWith("<")) return false;
  return head.includes("<svg");
}

export type AssetValidation =
  | { ok: true; format: AssetFormat; canonicalType: string }
  | { ok: false; reason: string };

/**
 * Validate a completed upload against the type the uploader claimed when the
 * signed URL was issued. The claimed type and the sniffed bytes must agree —
 * a mismatch is a spoofing attempt, not a recoverable inconsistency.
 */
export function validateUploadedAsset(input: {
  bytes: Uint8Array;
  claimedType: string | null | undefined;
  size: number;
}): AssetValidation {
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, reason: "Uploaded object is empty." };
  if (input.size > MAX_ASSET_BYTES) {
    return { ok: false, reason: `Uploaded object exceeds the ${Math.floor(MAX_ASSET_BYTES / 1024 / 1024)} MB limit.` };
  }
  const claimed = formatFromClaimedType(input.claimedType);
  if (!claimed) return { ok: false, reason: "Unsupported asset content type." };
  const sniffed = sniffAssetFormat(input.bytes);
  if (!sniffed) return { ok: false, reason: "Uploaded bytes are not a supported image format." };
  if (sniffed !== claimed) return { ok: false, reason: "Uploaded bytes do not match the declared content type." };
  return { ok: true, format: sniffed, canonicalType: CANONICAL_TYPE[sniffed] };
}

/**
 * Response headers for serving a confirmed asset. `contentType` must be a
 * server-authored canonical type (set at confirm time), never uploader input.
 */
export function serveHeadersFor(contentType: string, name: string): Record<string, string> {
  const safeName = (name.replace(/[^\w.-]/g, "_").slice(0, 80) || "download").replace(/^\.+/, "download");
  const active = contentType === CANONICAL_TYPE.svg;
  return {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    // Deny-all CSP: even if a browser navigates to the object URL despite the
    // attachment disposition, no script/style/network activity is permitted.
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": active
      ? `attachment; filename="${safeName.endsWith(".svg") ? safeName : `${safeName}.svg`}"`
      : `inline; filename="${safeName}"`,
  };
}
