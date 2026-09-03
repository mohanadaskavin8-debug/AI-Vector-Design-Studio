// Smart digitize pass: turns a scope of design objects into stitch regions
// with the same per-shape defaults as the manual "Digitize Selection" flow,
// while classifying everything it cannot (or should not) stitch.
//
// Node-safe on purpose (no store or DOM imports) so the classification and
// hoop-fit logic can be unit-tested directly.

import type { VectorObject } from './types';
import { generateId } from './utils';
import {
  StitchRegion,
  generateStitches,
  getGeometryQuality,
  commandsBounds,
  computeSourceFingerprint,
  MAX_PLAN_COMMANDS,
  EMBROIDERY_PX_PER_MM,
  HoopSettings,
} from './embroidery';

export type DigitizeSkipReason =
  | 'hidden'
  | 'locked'
  | 'raster'
  | 'text'
  | 'background'
  | 'generation-failed'
  | 'plan-limit';

export interface DigitizeSkip {
  id: string;
  name: string;
  reason: DigitizeSkipReason;
  detail: string;
}

export interface DigitizeConverted {
  id: string;
  name: string;
  regionId: string;
  stitchType: string;
  stitches: number;
}

export interface SmartDigitizeInput {
  objects: VectorObject[];
  /** Selected object ids; empty means the whole document. */
  selection: string[];
  existingRegions: StitchRegion[];
  artboard: { width: number; height: number };
  includeBackground?: boolean;
}

export interface SmartDigitizeResult {
  /** Full next region list (regions of out-of-scope sources are preserved). */
  regions: StitchRegion[];
  converted: DigitizeConverted[];
  skipped: DigitizeSkip[];
  /** True when at least one background-like rect was excluded by default. */
  backgroundSkipped: boolean;
}

/** How much of the artboard a rect must cover to count as background. */
export const BACKGROUND_COVERAGE_RATIO = 0.85;

/**
 * A rect is background-like when it covers ≥85% of the artboard — typically
 * a canvas-fill rectangle representing fabric, not stitchable artwork.
 */
export const isBackgroundLikeRect = (
  object: VectorObject,
  artboard: { width: number; height: number },
): boolean => {
  // Traced image backgrounds are flagged at trace time — same treatment as
  // canvas-fill rects: excluded by default, includable on request.
  if (object.traceRole === 'background') return true;
  if (object.type !== 'rect') return false;
  const rotation = Math.abs(((object.rotation % 360) + 360) % 360);
  const axisAligned = rotation < 1 || Math.abs(rotation - 180) < 1 || Math.abs(rotation - 360) < 1;
  if (!axisAligned) return false;
  const overlapWidth = Math.min(object.x + object.width, artboard.width) - Math.max(object.x, 0);
  const overlapHeight = Math.min(object.y + object.height, artboard.height) - Math.max(object.y, 0);
  if (overlapWidth <= 0 || overlapHeight <= 0) return false;
  const artboardArea = artboard.width * artboard.height;
  if (artboardArea <= 0) return false;
  return (overlapWidth * overlapHeight) / artboardArea >= BACKGROUND_COVERAGE_RATIO;
};

/** Expands a selection to whole groups; empty selection means every object. */
export const expandDigitizeScope = (objects: VectorObject[], selection: string[]): VectorObject[] => {
  if (!selection.length) return [...objects];
  const groupIds = new Set(
    objects.filter(object => selection.includes(object.id) && object.groupId).map(object => object.groupId as string),
  );
  return objects.filter(object => selection.includes(object.id) || (object.groupId ? groupIds.has(object.groupId) : false));
};

export interface ConvertibleText {
  id: string;
  name: string;
  fontFamily?: string;
  fontWeight?: string;
}

/** Visible, unlocked text layers in scope — candidates for outline conversion. */
export const listConvertibleText = (objects: VectorObject[], selection: string[]): ConvertibleText[] =>
  expandDigitizeScope(objects, selection)
    .filter(object => object.type === 'text' && object.visible && !object.locked)
    .map(object => ({ id: object.id, name: object.name, fontFamily: object.fontFamily, fontWeight: object.fontWeight }));

const planCommandTotal = (regions: StitchRegion[]) =>
  regions.reduce((total, region) => total + region.commands.length, 0);

export function runSmartDigitize(input: SmartDigitizeInput): SmartDigitizeResult {
  const { objects, selection, existingRegions, artboard } = input;
  const includeBackground = input.includeBackground ?? false;
  const scope = expandDigitizeScope(objects, selection);
  const scopeIds = new Set(scope.map(object => object.id));

  const regions = [...existingRegions];
  const converted: DigitizeConverted[] = [];
  const skipped: DigitizeSkip[] = [];
  let backgroundSkipped = false;

  objects.forEach(object => {
    if (!scopeIds.has(object.id)) return;

    const backgroundLike = isBackgroundLikeRect(object, artboard);
    if (!object.visible) {
      skipped.push({ id: object.id, name: object.name, reason: 'hidden', detail: 'Hidden layers are left out of the stitch plan.' });
      return;
    }
    if (backgroundLike && !includeBackground) {
      backgroundSkipped = true;
      skipped.push({
        id: object.id,
        name: object.name,
        reason: 'background',
        detail: object.traceRole === 'background'
          ? 'Traced as the image background, so it reads as fabric, not stitches.'
          : `Covers most of the artboard (≥${Math.round(BACKGROUND_COVERAGE_RATIO * 100)}%), so it reads as fabric, not stitches.`,
      });
      return;
    }
    if (object.locked && !backgroundLike) {
      skipped.push({ id: object.id, name: object.name, reason: 'locked', detail: 'Unlock this layer to include it.' });
      return;
    }
    if (object.type === 'image') {
      skipped.push({ id: object.id, name: object.name, reason: 'raster', detail: 'Raster images can\u2019t be digitized \u2014 trace them into vector shapes first.' });
      return;
    }
    if (object.type === 'text') {
      skipped.push({ id: object.id, name: object.name, reason: 'text', detail: 'Convert this text to outlines to stitch it.' });
      return;
    }

    // From here on, mirror the manual digitize defaults exactly.
    const isStrokeOnly = object.fill === 'none' || object.fill === '' || object.type === 'line' || (object.type === 'path' && !object.closed);
    const existingIdx = regions.findIndex(region => region.sourceObjectId === object.id);
    const existing = existingIdx >= 0 ? regions[existingIdx] : null;
    const settings = existing ? existing.settings : {
      stitchType: isStrokeOnly ? 'running' as const : 'fill' as const,
      density: 0.4,
      angle: 45,
      underlay: isStrokeOnly ? 'none' as const : 'edge-run' as const,
      pullCompensation: 0.2,
      stitchLength: 2.5,
      color: { hex: object.fill !== 'none' && object.fill ? object.fill : (object.stroke !== 'none' && object.stroke ? object.stroke : '#ffffff') },
    };

    let commands;
    try {
      commands = generateStitches(object, settings);
    } catch (error) {
      skipped.push({
        id: object.id,
        name: object.name,
        reason: 'generation-failed',
        detail: error instanceof Error ? error.message : 'Stitch generation failed.',
      });
      return;
    }

    const geometry = getGeometryQuality(object);
    const region: StitchRegion = {
      id: existing ? existing.id : generateId(),
      sourceObjectId: object.id,
      sourceType: object.type,
      name: `Stitch Region (${object.name})`,
      visible: existing ? existing.visible : true,
      settings,
      commands,
      bounds: commandsBounds(commands),
      geometryQuality: geometry.quality,
      geometryNote: geometry.note,
      sourceFingerprint: computeSourceFingerprint(object),
    };

    const candidate = [...regions];
    if (existingIdx >= 0) candidate[existingIdx] = region;
    else candidate.push(region);
    if (planCommandTotal(candidate) > MAX_PLAN_COMMANDS) {
      skipped.push({
        id: object.id,
        name: object.name,
        reason: 'plan-limit',
        detail: `Adding this region would exceed the ${MAX_PLAN_COMMANDS.toLocaleString()} command safety limit.`,
      });
      return;
    }

    if (existingIdx >= 0) regions[existingIdx] = region;
    else regions.push(region);
    converted.push({
      id: object.id,
      name: object.name,
      regionId: region.id,
      stitchType: settings.stitchType,
      stitches: commands.filter(command => command.type === 'stitch').length,
    });
  });

  return { regions, converted, skipped, backgroundSkipped };
}

// ---------------------------------------------------------------------------
// Hoop fitting
// ---------------------------------------------------------------------------

export const HOOP_PRESETS: Array<Pick<HoopSettings, 'name' | 'widthMm' | 'heightMm'>> = [
  { name: '100x100', widthMm: 100, heightMm: 100 },
  { name: '130x180', widthMm: 130, heightMm: 180 },
  { name: '200x200', widthMm: 200, heightMm: 200 },
];

export interface HoopFit {
  hoop: HoopSettings;
  /** False when even the largest preset cannot contain the plan. */
  fits: boolean;
  planWidthMm: number;
  planHeightMm: number;
}

/**
 * Picks the smallest hoop preset that contains the plan's visible regions,
 * centered on the plan. Falls back to the largest preset (fits: false) when
 * nothing is big enough. Returns null when the plan has no stitches.
 */
export const fitHoopToPlan = (regions: StitchRegion[]): HoopFit | null => {
  const stitched = regions.filter(region => region.visible && region.commands.length > 0);
  if (!stitched.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  stitched.forEach(region => {
    minX = Math.min(minX, region.bounds.x);
    minY = Math.min(minY, region.bounds.y);
    maxX = Math.max(maxX, region.bounds.x + region.bounds.width);
    maxY = Math.max(maxY, region.bounds.y + region.bounds.height);
  });
  if (minX === Infinity) return null;
  const planWidthMm = (maxX - minX) / EMBROIDERY_PX_PER_MM;
  const planHeightMm = (maxY - minY) / EMBROIDERY_PX_PER_MM;
  const center = { centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
  const preset = HOOP_PRESETS.find(candidate => candidate.widthMm >= planWidthMm && candidate.heightMm >= planHeightMm);
  const chosen = preset ?? HOOP_PRESETS[HOOP_PRESETS.length - 1];
  return {
    hoop: { ...chosen, ...center },
    fits: Boolean(preset),
    planWidthMm,
    planHeightMm,
  };
};
