// Local SVG files → editable vector layers.
//
// Shared by the top-bar "Import SVG" picker and canvas drag-and-drop. Parses a
// safe subset of SVG elements into VectorObjects; elements with transforms,
// animation, scripts, or external image sources are counted as skipped rather
// than imported.

import type { VectorObject } from './types';
import { generateId } from './utils';
import { pathDataBounds } from './pathUtils';

export const isSafeImageSource = (value: string) =>
  /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value) || value.startsWith('/objects/');

export interface SvgImportResult {
  objects: VectorObject[];
  skipped: number;
}

/** Parses SVG markup into editable layers. Throws with a friendly message when the markup is not valid SVG. */
export function parseSvgText(text: string, fileLabel = 'This file'): SvgImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    throw new Error(`${fileLabel} is not valid SVG.`);
  }

  const objects: VectorObject[] = [];
  let skipped = 0;

  // Basic SVG shape parser
  doc.querySelectorAll('rect, ellipse, circle, polygon, line, path, image, text').forEach((el, index) => {
    const tagName = el.tagName.toLowerCase();
    const fill = el.getAttribute('fill') || '#D9D9D9';
    const stroke = el.getAttribute('stroke') || 'none';
    const strokeWidth = parseFloat(el.getAttribute('stroke-width') || '0');
    const opacity = parseFloat(el.getAttribute('opacity') || '1');
    // Transforms are not representable in the object model (rotation-only), and
    // animated/scripted content is unsafe — skip these entirely rather than
    // importing them at the wrong geometry.
    if (el.hasAttribute('transform') || el.querySelector('animate, set, script, foreignObject')) {
      skipped += 1;
      return;
    }

    if (tagName === 'rect') {
      objects.push({
        id: generateId(), type: 'rect', name: `Imported Rect ${index + 1}`,
        x: parseFloat(el.getAttribute('x') || '0'), y: parseFloat(el.getAttribute('y') || '0'),
        width: parseFloat(el.getAttribute('width') || '100'), height: parseFloat(el.getAttribute('height') || '100'),
        rx: parseFloat(el.getAttribute('rx') || '0'), rotation: 0, fill, stroke, strokeWidth, opacity, visible: true, locked: false
      });
    } else if (tagName === 'ellipse' || tagName === 'circle') {
      const cx = parseFloat(el.getAttribute('cx') || '50');
      const cy = parseFloat(el.getAttribute('cy') || '50');
      const rx = parseFloat(el.getAttribute('rx') || el.getAttribute('r') || '50');
      const ry = parseFloat(el.getAttribute('ry') || el.getAttribute('r') || '50');
      objects.push({
        id: generateId(), type: 'ellipse', name: `Imported Ellipse ${index + 1}`,
        x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2,
        rotation: 0, fill, stroke, strokeWidth, opacity, visible: true, locked: false
      });
    } else if (tagName === 'polygon') {
      objects.push({
        id: generateId(), type: 'polygon', name: `Imported Polygon ${index + 1}`,
        x: 0, y: 0, width: 200, height: 200, rotation: 0, fill, stroke, strokeWidth, opacity, visible: true, locked: false, points: el.getAttribute('points') || undefined
      });
    } else if (tagName === 'line') {
      const x1 = parseFloat(el.getAttribute('x1') || '0');
      const y1 = parseFloat(el.getAttribute('y1') || '0');
      const x2 = parseFloat(el.getAttribute('x2') || '100');
      const y2 = parseFloat(el.getAttribute('y2') || '100');
      objects.push({
        id: generateId(), type: 'line', name: `Imported Line ${index + 1}`,
        x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
        rotation: 0, fill, stroke, strokeWidth, opacity, visible: true, locked: false
      });
    } else if (tagName === 'path') {
      const points = el.getAttribute('d') || '';
      objects.push({
        id: generateId(), type: 'path', name: `Imported Path ${index + 1}`,
        ...pathDataBounds(points), rotation: 0, fill, stroke, strokeWidth, opacity, visible: true, locked: false,
        points
      });
    } else if (tagName === 'image') {
      const imageSrc = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
      if (!isSafeImageSource(imageSrc)) {
        skipped += 1;
        return;
      }
      objects.push({
        id: generateId(), type: 'image', name: `Imported Image ${index + 1}`,
        x: parseFloat(el.getAttribute('x') || '0'), y: parseFloat(el.getAttribute('y') || '0'),
        width: parseFloat(el.getAttribute('width') || '100'), height: parseFloat(el.getAttribute('height') || '100'),
        rotation: 0, fill: 'none', stroke: 'none', strokeWidth: 0, opacity: 1, visible: true, locked: false,
        imageSrc
      });
    } else if (tagName === 'text') {
      const x = parseFloat(el.getAttribute('x') || '0');
      const y = parseFloat(el.getAttribute('y') || '16');
      const fontSize = parseFloat(el.getAttribute('font-size') || '16');
      objects.push({
        id: generateId(), type: 'text', name: `Imported Text ${index + 1}`,
        x, y: y - fontSize, width: Math.max(40, (el.textContent || '').length * fontSize * 0.6), height: fontSize * 1.2,
        rotation: 0, fill, stroke, strokeWidth, opacity, visible: true, locked: false,
        text: el.textContent || '', fontSize, fontFamily: el.getAttribute('font-family') || 'Inter',
        fontWeight: el.getAttribute('font-weight') || '400',
      });
    }
  });

  return { objects, skipped };
}

export const isSvgFile = (file: File): boolean =>
  file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`“${file.name}” could not be read.`));
    reader.readAsText(file);
  });

/** Reads and parses a local .svg file into editable layers. Throws with a friendly message. */
export async function importSvgFile(file: File): Promise<SvgImportResult> {
  const text = await readFileAsText(file);
  return parseSvgText(text, `“${file.name}”`);
}
