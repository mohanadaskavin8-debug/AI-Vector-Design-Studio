import { describe, expect, it } from "vitest";
import {
  MAX_ASSET_BYTES,
  formatFromClaimedType,
  serveHeadersFor,
  sniffAssetFormat,
  validateUploadedAsset,
} from "./assetValidation";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x2a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>`);
const SCRIPTED_SVG = new TextEncoder().encode(`<?xml version="1.0"?>\n<!-- x -->\n<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)"><script>fetch('/api/projects')</script></svg>`);
const GARBAGE = new TextEncoder().encode("hello world, definitely not an image");

describe("sniffAssetFormat", () => {
  it("identifies real raster formats by magic bytes", () => {
    expect(sniffAssetFormat(PNG)).toBe("png");
    expect(sniffAssetFormat(JPEG)).toBe("jpeg");
    expect(sniffAssetFormat(WEBP)).toBe("webp");
  });
  it("identifies svg including scripted svg (classification, not sanitization)", () => {
    expect(sniffAssetFormat(SVG)).toBe("svg");
    expect(sniffAssetFormat(SCRIPTED_SVG)).toBe("svg");
  });
  it("rejects unknown bytes and binary junk", () => {
    expect(sniffAssetFormat(GARBAGE)).toBeNull();
    expect(sniffAssetFormat(Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0xfe]))).toBeNull();
    expect(sniffAssetFormat(new TextEncoder().encode("<html><body>hi</body></html>"))).toBeNull();
  });
});

describe("formatFromClaimedType (request-url allowlist)", () => {
  it("accepts only the narrow image allowlist", () => {
    expect(formatFromClaimedType("image/png")).toBe("png");
    expect(formatFromClaimedType("image/jpeg")).toBe("jpeg");
    expect(formatFromClaimedType("image/webp")).toBe("webp");
    expect(formatFromClaimedType("image/svg+xml")).toBe("svg");
    expect(formatFromClaimedType("IMAGE/PNG; charset=binary")).toBe("png");
  });
  it("rejects active/document/blanket types that used to pass", () => {
    for (const type of ["application/pdf", "application/octet-stream", "font/woff2", "text/html", "image/gif", "image/avif", "application/xhtml+xml", "", null, undefined]) {
      expect(formatFromClaimedType(type)).toBeNull();
    }
  });
});

describe("validateUploadedAsset", () => {
  it("accepts a truthful upload and returns the canonical server-authored type", () => {
    const result = validateUploadedAsset({ bytes: PNG, claimedType: "image/png", size: 1234 });
    expect(result).toEqual({ ok: true, format: "png", canonicalType: "image/png" });
  });
  it("rejects metadata spoofing in both directions", () => {
    // Scripted SVG bytes uploaded under an innocent raster claim:
    expect(validateUploadedAsset({ bytes: SCRIPTED_SVG, claimedType: "image/png", size: 100 }).ok).toBe(false);
    // Raster bytes under an svg claim (attempt to reach svg serving path):
    expect(validateUploadedAsset({ bytes: PNG, claimedType: "image/svg+xml", size: 100 }).ok).toBe(false);
  });
  it("rejects disallowed claimed types even with plausible bytes", () => {
    expect(validateUploadedAsset({ bytes: PNG, claimedType: "application/octet-stream", size: 100 }).ok).toBe(false);
  });
  it("rejects unknown bytes, oversize, and empty objects", () => {
    expect(validateUploadedAsset({ bytes: GARBAGE, claimedType: "image/png", size: 100 }).ok).toBe(false);
    expect(validateUploadedAsset({ bytes: PNG, claimedType: "image/png", size: MAX_ASSET_BYTES + 1 }).ok).toBe(false);
    expect(validateUploadedAsset({ bytes: PNG, claimedType: "image/png", size: 0 }).ok).toBe(false);
  });
});

describe("serveHeadersFor", () => {
  it("serves svg as attachment with a deny-all CSP so navigation cannot execute scripts", () => {
    const headers = serveHeadersFor("image/svg+xml", "thumbnail.svg");
    expect(headers["Content-Disposition"]).toMatch(/^attachment; filename="thumbnail.svg"$/);
    expect(headers["Content-Security-Policy"]).toBe("default-src 'none'; sandbox");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });
  it("serves raster images inline with hardened headers", () => {
    const headers = serveHeadersFor("image/png", "cat.png");
    expect(headers["Content-Disposition"]).toBe('inline; filename="cat.png"');
    expect(headers["Content-Security-Policy"]).toBe("default-src 'none'; sandbox");
  });
  it("sanitizes hostile filenames", () => {
    const headers = serveHeadersFor("image/svg+xml", `a"\r\nSet-Cookie: x=y;<script>.svg`);
    expect(headers["Content-Disposition"]).not.toMatch(/[\r\n<>]/);
    expect(headers["Content-Disposition"].startsWith("attachment; filename=\"")).toBe(true);
  });
});
