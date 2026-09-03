// Local image files → image layers.
//
// Shared by the toolbar import button, canvas drag-and-drop, and the trace
// panel upload. Validates type/size, decodes, downsizes oversized bitmaps so
// documents stay storable, and builds the placed image object. Data URLs are
// uploaded to cloud object storage automatically on save.

import type { VectorObject } from './types';
import { generateId } from './utils';

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024;
/** Stored bitmaps are capped at this edge length to keep documents saveable. */
const MAX_STORED_DIMENSION = 1600;

/** Returns a user-facing problem with the file, or null when it is importable. */
export function validateImageFile(file: File): string | null {
  if (!IMAGE_MIME_TYPES.includes(file.type)) return `“${file.name}” is not a PNG, JPG, or WebP image.`;
  if (file.size > MAX_IMAGE_FILE_BYTES) return `“${file.name}” is larger than 5 MB.`;
  return null;
}

export const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`“${file.name}” could not be read.`));
    reader.readAsDataURL(file);
  });

export const loadImageElement = (src: string, label = 'The image'): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${label} could not be decoded.`));
    img.src = src;
  });

export interface ImportedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Reads and (if oversized) downsizes a local image file. Throws with a friendly message. */
export async function importImageFile(file: File): Promise<ImportedImage> {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);
  const raw = await readFileAsDataURL(file);
  const img = await loadImageElement(raw, `“${file.name}”`);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error(`“${file.name}” has no readable pixels.`);
  if (Math.max(width, height) <= MAX_STORED_DIMENSION) return { dataUrl: raw, width, height };

  const scale = MAX_STORED_DIMENSION / Math.max(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: raw, width, height };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // JPEG stays JPEG (no alpha to lose); PNG/WebP re-encode as PNG to keep transparency.
  const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  return { dataUrl: canvas.toDataURL(mime, 0.92), width: canvas.width, height: canvas.height };
}

export const imageLayerName = (fileName: string): string =>
  fileName.replace(/\.[^.]+$/, '').trim() || 'Image';

/**
 * Builds the image layer object. Fits within 80% of the artboard without
 * upscaling; centres on the artboard or on the given canvas point.
 */
export function placeImportedImage(
  image: ImportedImage,
  artboard: { width: number; height: number },
  name: string,
  at?: { x: number; y: number },
  cascade = 0,
): VectorObject {
  const fit = Math.min(
    (artboard.width * 0.8) / image.width,
    (artboard.height * 0.8) / image.height,
    1,
  );
  const width = Math.max(1, image.width * fit);
  const height = Math.max(1, image.height * fit);
  const x = (at ? at.x - width / 2 : (artboard.width - width) / 2) + cascade;
  const y = (at ? at.y - height / 2 : (artboard.height - height) / 2) + cascade;
  return {
    id: generateId(),
    type: 'image',
    name,
    x,
    y,
    width,
    height,
    rotation: 0,
    fill: 'none',
    stroke: 'none',
    strokeWidth: 0,
    opacity: 1,
    visible: true,
    locked: false,
    imageSrc: image.dataUrl,
  };
}

/**
 * Imports a batch of files into image layers (used by picker and drag-drop).
 * Returns placed objects plus per-file errors; never throws.
 */
export async function importImageFiles(
  files: File[],
  artboard: { width: number; height: number },
  at?: { x: number; y: number },
): Promise<{ placed: VectorObject[]; errors: string[] }> {
  const placed: VectorObject[] = [];
  const errors: string[] = [];
  for (const file of files.slice(0, 8)) {
    try {
      const image = await importImageFile(file);
      placed.push(placeImportedImage(image, artboard, imageLayerName(file.name), at, placed.length * 24));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `“${file.name}” could not be imported.`);
    }
  }
  if (files.length > 8) errors.push(`Only the first 8 images were imported (${files.length} dropped).`);
  return { placed, errors };
}
