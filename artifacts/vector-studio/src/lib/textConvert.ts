// Browser-side "Convert to outlines": resolves bundled fonts, measures bound
// paths with SVG geometry APIs, and produces replacement path objects for
// text layers. The replacement keeps the source object's id, so layer order,
// grouping, and selection survive the conversion.

import type { VectorObject } from './types';
import { buildTextOutline, TextOutlineOptions } from './textOutline';
import { loadBundledFont, resolveBundledFont } from './fonts';
import { nodesToSVGPath } from './pathUtils';

export interface TextConversionFailure {
  id: string;
  name: string;
  message: string;
}

export interface TextConversionResult {
  /** Source text object id -> replacement path object. */
  replacements: Map<string, VectorObject>;
  /** Human-readable notices (font substitutions, skipped glyphs, ...). */
  notes: string[];
  failures: TextConversionFailure[];
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const makePathSampler = (pathData: string): { options: TextOutlineOptions; } | null => {
  if (typeof document === 'undefined' || !pathData) return null;
  try {
    const element = document.createElementNS(SVG_NS, 'path');
    element.setAttribute('d', pathData);
    if (typeof element.getTotalLength !== 'function') return null;
    const length = element.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return null;
    return {
      options: {
        pathLength: length,
        pathSampler: (distance: number) => {
          const clamped = Math.min(length, Math.max(0, distance));
          const point = element.getPointAtLength(clamped);
          const before = element.getPointAtLength(Math.max(0, clamped - 0.5));
          const after = element.getPointAtLength(Math.min(length, clamped + 0.5));
          return { x: point.x, y: point.y, angle: Math.atan2(after.y - before.y, after.x - before.x) };
        },
      },
    };
  } catch {
    return null;
  }
};

/** Short mapping label for UI ("Trebuchet MS → Inter"), or null when exact. */
export function describeFontSubstitution(fontFamily?: string, fontWeight?: string): string | null {
  const resolved = resolveBundledFont(fontFamily, fontWeight);
  if (resolved.familyExact) return null;
  return `${resolved.requestedFamily} → ${resolved.family}`;
}

export async function convertTextObjectsToPaths(
  allObjects: VectorObject[],
  targetIds: string[],
): Promise<TextConversionResult> {
  const replacements = new Map<string, VectorObject>();
  const notes = new Set<string>();
  const failures: TextConversionFailure[] = [];

  for (const targetId of targetIds) {
    const object = allObjects.find(candidate => candidate.id === targetId);
    if (!object || object.type !== 'text') continue;

    const resolved = resolveBundledFont(object.fontFamily, object.fontWeight);
    let outlineOptions: TextOutlineOptions = {};

    if (object.textPathId) {
      const boundPath = allObjects.find(candidate => candidate.id === object.textPathId && candidate.type === 'path');
      const pathData = boundPath
        ? boundPath.points || (boundPath.nodes ? nodesToSVGPath(boundPath.nodes, boundPath.closed) : '')
        : '';
      const sampler = pathData ? makePathSampler(pathData) : null;
      if (sampler) {
        outlineOptions = sampler.options;
        notes.add(`"${object.name}": text on a path was traced as a best-effort approximation.`);
      } else {
        notes.add(`"${object.name}": the bound path could not be measured, so the text was converted as straight text.`);
      }
    }

    let replacement: VectorObject | null = null;
    try {
      const font = await loadBundledFont(resolved.family, resolved.weight);
      const outline = buildTextOutline(object, font, outlineOptions);

      if (!resolved.familyExact) {
        notes.add(resolved.metricCompatible
          ? `"${resolved.requestedFamily}" outlines aren't bundled — used ${resolved.family}, a metric-compatible open-licensed match.`
          : `"${resolved.requestedFamily}" outlines aren't bundled — used ${resolved.family}, the closest bundled match.`);
      }
      if (!resolved.weightExact) {
        notes.add(`Weight ${resolved.requestedWeight} isn't bundled for ${resolved.family}; used the ${resolved.weight} outline.`);
      }
      if (outline.missingChars.length) {
        const shown = outline.missingChars.slice(0, 6).join(' ');
        notes.add(`${outline.missingChars.length} character${outline.missingChars.length === 1 ? '' : 's'} (${shown}) have no outline in the bundled font and were skipped.`);
      }
      if (outline.droppedOffPath > 0) {
        notes.add(`${outline.droppedOffPath} glyph${outline.droppedOffPath === 1 ? '' : 's'} fell beyond the bound path and were dropped.`);
      }

      if (outline.contourCount === 0 || !outline.pathData) {
        failures.push({ id: object.id, name: object.name, message: `"${object.name}" produced no outline geometry (whitespace-only or unavailable characters).` });
        continue;
      }

      replacement = {
        id: object.id,
        type: 'path',
        name: `${object.name} (outlines)`,
        x: outline.bounds.x,
        y: outline.bounds.y,
        width: Math.max(0.1, outline.bounds.width),
        height: Math.max(0.1, outline.bounds.height),
        rotation: 0,
        fill: object.fill,
        stroke: object.stroke,
        strokeWidth: object.strokeWidth,
        opacity: object.opacity,
        visible: object.visible,
        locked: object.locked,
        ...(object.groupId ? { groupId: object.groupId } : {}),
        points: outline.pathData,
        closed: true,
      };
    } catch (error) {
      failures.push({
        id: object.id,
        name: object.name,
        message: error instanceof Error ? error.message : `"${object.name}" could not be converted.`,
      });
      continue;
    }
    replacements.set(object.id, replacement);
  }

  return { replacements, notes: [...notes], failures };
}
