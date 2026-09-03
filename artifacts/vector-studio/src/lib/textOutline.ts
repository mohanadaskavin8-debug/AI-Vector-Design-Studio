// Pure text -> outline-path layout.
//
// Mirrors ShapeRenderer's SVG text layout exactly so converted outlines land
// where the live text rendered:
//   - first baseline at object.y + fontSize
//   - each further line advances by lineHeight (em) via tspan dy
//   - textAlign anchors each line at object.x / object.x + width/2 / object.x + width
//   - letterSpacing (px) is added after every glyph, including the last,
//     which is how browsers measure the anchored line advance
// Text bound to a path is traced best-effort through a caller-provided
// sampler (browser SVG geometry), matching startOffset 0% / 50% / 100%.
//
// This module is intentionally node-safe (no DOM, no asset imports) so the
// glyph geometry can be unit-tested against the real bundled fonts.

import type { Font, Glyph } from 'opentype.js';
import type { VectorObject } from './types';
import { parsePathContours, contoursBounds } from './pathUtils';

export interface TextPathSample {
  x: number;
  y: number;
  /** Tangent angle in radians. */
  angle: number;
}

export interface TextOutlineOptions {
  /** Samples a point + tangent at a distance along the bound path (browser only). */
  pathSampler?: (distance: number) => TextPathSample;
  /** Total length of the bound path, required with pathSampler. */
  pathLength?: number;
}

export interface TextOutlineData {
  /** Multi-contour SVG path data (each glyph contour explicitly closed). */
  pathData: string;
  /** Accurate bounds of the flattened outline. */
  bounds: { x: number; y: number; width: number; height: number };
  contourCount: number;
  /** Distinct characters with no outline in the bundled font. */
  missingChars: string[];
  /** Glyphs skipped because they fell beyond the bound path's ends. */
  droppedOffPath: number;
}

type Pt = { x: number; y: number };
type Transform = (point: Pt) => Pt;

interface PlacedGlyph {
  glyph: Glyph;
  /** Pen x offset from the line start, before alignment. */
  penX: number;
  advancePx: number;
}

interface LaidOutLine {
  glyphs: PlacedGlyph[];
  /** Advance width including trailing letter spacing (browser anchor measure). */
  width: number;
}

const safeKerning = (font: Font, left: Glyph, right: Glyph): number => {
  try {
    return font.getKerningValue(left, right) || 0;
  } catch {
    return 0;
  }
};

const layoutLine = (
  font: Font,
  line: string,
  fontSize: number,
  letterSpacing: number,
  missing: Set<string>,
): LaidOutLine => {
  const scale = fontSize / font.unitsPerEm;
  const glyphs: PlacedGlyph[] = [];
  let penX = 0;
  let previous: Glyph | null = null;
  for (const char of line) {
    const glyph = font.charToGlyph(char);
    if ((glyph.index ?? 0) === 0 && char.trim().length > 0) missing.add(char);
    if (previous) penX += safeKerning(font, previous, glyph) * scale;
    glyphs.push({ glyph, penX, advancePx: (glyph.advanceWidth ?? 0) * scale });
    penX += (glyph.advanceWidth ?? 0) * scale + letterSpacing;
    previous = glyph;
  }
  return { glyphs, width: penX };
};

const roundCoord = (value: number) => Math.round(value * 100) / 100;

/**
 * Serializes opentype glyph path commands (applying `transform`) into SVG path
 * data. opentype.js 2.x omits Z commands, so every contour (M-delimited) is
 * closed explicitly — required for correct even-odd hole rendering.
 */
const appendGlyphCommands = (
  commands: Array<{ type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }>,
  transform: Transform,
  parts: string[],
): number => {
  let contours = 0;
  let open = false;
  const emit = (x: number, y: number) => {
    const point = transform({ x, y });
    return `${roundCoord(point.x)} ${roundCoord(point.y)}`;
  };
  for (const command of commands) {
    if (command.type === 'M') {
      if (open) parts.push('Z');
      parts.push(`M ${emit(command.x ?? 0, command.y ?? 0)}`);
      open = true;
      contours += 1;
    } else if (command.type === 'L') {
      if (!open) continue;
      parts.push(`L ${emit(command.x ?? 0, command.y ?? 0)}`);
    } else if (command.type === 'Q') {
      if (!open) continue;
      parts.push(`Q ${emit(command.x1 ?? 0, command.y1 ?? 0)} ${emit(command.x ?? 0, command.y ?? 0)}`);
    } else if (command.type === 'C') {
      if (!open) continue;
      parts.push(`C ${emit(command.x1 ?? 0, command.y1 ?? 0)} ${emit(command.x2 ?? 0, command.y2 ?? 0)} ${emit(command.x ?? 0, command.y ?? 0)}`);
    } else if (command.type === 'Z') {
      if (open) parts.push('Z');
      open = false;
    }
  }
  if (open) parts.push('Z');
  return contours;
};

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Converts a text object's content into multi-contour outline path data using
 * a parsed outline font. The caller supplies the resolved font; substitution
 * decisions and notices live in fonts.ts / textConvert.ts.
 */
export function buildTextOutline(object: VectorObject, font: Font, options: TextOutlineOptions = {}): TextOutlineData {
  const fontSize = object.fontSize || 16;
  const lineHeight = object.lineHeight || 1.2;
  const letterSpacing = object.letterSpacing || 0;
  const align = object.textAlign || 'left';
  const missing = new Set<string>();
  const parts: string[] = [];
  let contourCount = 0;
  let droppedOffPath = 0;

  // Rotation is baked into the outline so the converted path is pure
  // geometry; the replacement object carries rotation 0.
  const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
  const rotation = degreesToRadians(object.rotation || 0);
  const rotationCos = Math.cos(rotation);
  const rotationSin = Math.sin(rotation);
  const bakeRotation: Transform = point => {
    if (!object.rotation) return point;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * rotationCos - dy * rotationSin,
      y: center.y + dx * rotationSin + dy * rotationCos,
    };
  };

  const usePath = Boolean(options.pathSampler && options.pathLength && options.pathLength > 0);

  if (usePath && options.pathSampler && options.pathLength) {
    // SVG collapses whitespace (including newlines) inside <textPath>.
    const text = (object.text || 'Text').replace(/\s+/g, ' ');
    const line = layoutLine(font, text, fontSize, letterSpacing, missing);
    const pathLength = options.pathLength;
    const anchorDistance = align === 'center' ? pathLength / 2 : align === 'right' ? pathLength : 0;
    const startDistance = anchorDistance - (align === 'center' ? line.width / 2 : align === 'right' ? line.width : 0);
    for (const placed of line.glyphs) {
      const centerDistance = startDistance + placed.penX + placed.advancePx / 2;
      if (centerDistance < 0 || centerDistance > pathLength) {
        droppedOffPath += 1;
        continue;
      }
      const sample = options.pathSampler(centerDistance);
      const cos = Math.cos(sample.angle);
      const sin = Math.sin(sample.angle);
      const transform: Transform = point => bakeRotation({
        x: sample.x + point.x * cos - point.y * sin,
        y: sample.y + point.x * sin + point.y * cos,
      });
      const commands = placed.glyph.getPath(-placed.advancePx / 2, 0, fontSize).commands;
      contourCount += appendGlyphCommands(commands, transform, parts);
    }
  } else {
    const lines = (object.text || 'Text').split('\n');
    lines.forEach((rawLine, lineIndex) => {
      // The renderer emits a single space for empty lines to preserve spacing.
      const lineText = rawLine || ' ';
      const line = layoutLine(font, lineText, fontSize, letterSpacing, missing);
      const lineStartX = align === 'center'
        ? object.x + object.width / 2 - line.width / 2
        : align === 'right'
          ? object.x + object.width - line.width
          : object.x;
      const baselineY = object.y + fontSize + lineIndex * lineHeight * fontSize;
      for (const placed of line.glyphs) {
        const commands = placed.glyph.getPath(lineStartX + placed.penX, baselineY, fontSize).commands;
        contourCount += appendGlyphCommands(commands, bakeRotation, parts);
      }
    });
  }

  const pathData = parts.join(' ');
  const bounds = contourCount > 0 ? contoursBounds(parsePathContours(pathData)) : { x: object.x, y: object.y, width: 0, height: 0 };
  return {
    pathData,
    bounds,
    contourCount,
    missingChars: [...missing],
    droppedOffPath,
  };
}
