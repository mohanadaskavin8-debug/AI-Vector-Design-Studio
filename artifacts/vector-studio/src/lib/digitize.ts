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
  StitchRegionSettings,
  generateStitches,
  getGeometryQuality,
  getStitchContours,
  commandsBounds,
  computeSourceFingerprint,
  MAX_PLAN_COMMANDS,
  EMBROIDERY_PX_PER_MM,
  SATIN_SPAN_LIMIT_MM,
  HoopSettings,
} from './embroidery';
import { contoursBounds, estimateInkWidth } from './pathUtils';

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
  /** Present when the narrow-shape heuristic defaulted this region to satin instead of fill. */
  autoSatin?: SatinAssessment;
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

// ---------------------------------------------------------------------------
// Narrow-shape satin heuristic
//
// Thin closed shapes — letter strokes from "Convert to outlines", thin rings,
// narrow bars — cover poorly with a tatami fill but stitch cleanly as satin
// columns. A shape qualifies when its effective ink width (even-odd aware, so
// letter counters count) sits in the satin-friendly band, its geometry is
// consistently narrow rather than a solid blob, and its overall bounds stay
// inside the existing conservative satin-span preflight rule.
// ---------------------------------------------------------------------------

/** Narrowest ink width that satin covers better than fill. */
export const SATIN_MIN_WIDTH_MM = 1;
/** Widest ink width a single satin column handles cleanly. */
export const SATIN_MAX_WIDTH_MM = 8;
/**
 * Minimum isoperimetric elongation (perimeter²/4π·area) for "consistently
 * narrow". Solid blobs sit near 1 (circle) to 1.27 (square); 1.6 admits bars
 * from roughly 2.7:1 aspect up, rings, and letterforms while leaving compact
 * solids on the fill default.
 */
export const SATIN_MIN_ELONGATION = 1.6;
/** Default pull compensation applied by both digitize flows (mm per side). */
const DEFAULT_PULL_COMPENSATION_MM = 0.2;
/**
 * Auto-satin bounds gate: pull compensation widens stitched bounds by up to
 * one pull per side, so staying this far under the preflight limit guarantees
 * an auto-chosen satin region never triggers the satin-span warning.
 */
export const SATIN_AUTO_SPAN_LIMIT_MM = SATIN_SPAN_LIMIT_MM - 2 * DEFAULT_PULL_COMPENSATION_MM;

export interface SatinAssessment {
  /** Estimated ink width in millimetres (e.g. letter stroke or ring wall thickness). */
  widthMm: number;
}

/**
 * Decides whether a closed shape should default to satin instead of fill.
 * Works on multi-contour paths (letters with counters), not just primitives.
 * Returns the estimated ink width when satin is the better default, or null
 * to keep the fill default.
 */
export const assessSatinCandidate = (object: VectorObject): SatinAssessment | null => {
  const contours = getStitchContours(object);
  const estimate = estimateInkWidth(contours);
  if (!estimate) return null;
  const widthMm = estimate.width / EMBROIDERY_PX_PER_MM;
  if (widthMm < SATIN_MIN_WIDTH_MM || widthMm > SATIN_MAX_WIDTH_MM) return null;
  if (estimate.elongation < SATIN_MIN_ELONGATION) return null;
  const bounds = contoursBounds(contours);
  const maxDimensionMm = Math.max(bounds.width, bounds.height) / EMBROIDERY_PX_PER_MM;
  if (maxDimensionMm > SATIN_AUTO_SPAN_LIMIT_MM) return null;
  return { widthMm };
};

/** True for shapes stitched as an outline run rather than a filled area. */
export const isStrokeOnlyObject = (object: VectorObject): boolean =>
  object.fill === 'none' || object.fill === '' || object.type === 'line' || (object.type === 'path' && !object.closed);

export interface RegionDefaults {
  settings: StitchRegionSettings;
  /** Set when the narrow-shape heuristic switched the fill default to satin. */
  autoSatin: SatinAssessment | null;
}

/**
 * Default stitch settings for a shape — shared by the manual "Digitize
 * Selection" flow and the smart digitize pass so the two never diverge.
 * Closed shapes default to fill unless they are consistently narrow, in which
 * case a satin column covers them better (see assessSatinCandidate).
 */
export const buildDefaultRegionSettings = (object: VectorObject): RegionDefaults => {
  const strokeOnly = isStrokeOnlyObject(object);
  const autoSatin = strokeOnly ? null : assessSatinCandidate(object);
  return {
    settings: {
      stitchType: strokeOnly ? 'running' : autoSatin ? 'satin' : 'fill',
      density: 0.4,
      angle: 45,
      underlay: strokeOnly ? 'none' : 'edge-run',
      pullCompensation: DEFAULT_PULL_COMPENSATION_MM,
      stitchLength: 2.5,
      color: { hex: object.fill !== 'none' && object.fill ? object.fill : (object.stroke !== 'none' && object.stroke ? object.stroke : '#ffffff') },
    },
    autoSatin,
  };
};

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
    const existingIdx = regions.findIndex(region => region.sourceObjectId === object.id);
    const existing = existingIdx >= 0 ? regions[existingIdx] : null;
    // Existing regions keep their settings — a user who switched a region back
    // to fill (or anything else) is never overridden by the satin heuristic.
    const defaults = existing ? null : buildDefaultRegionSettings(object);
    const settings = existing ? existing.settings : defaults!.settings;

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
      ...(defaults?.autoSatin ? { autoSatin: defaults.autoSatin } : {}),
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
