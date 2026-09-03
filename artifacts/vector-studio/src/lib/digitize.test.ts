import { describe, it, expect } from 'vitest';
import {
  runSmartDigitize,
  isBackgroundLikeRect,
  expandDigitizeScope,
  listConvertibleText,
  fitHoopToPlan,
  HOOP_PRESETS,
} from './digitize';
import { StitchRegion, EMBROIDERY_PX_PER_MM } from './embroidery';
import type { VectorObject } from './types';

const ARTBOARD = { width: 800, height: 600 };

let counter = 0;
const makeObj = (partial: Partial<VectorObject>): VectorObject => ({
  id: `obj-${counter += 1}`,
  type: 'ellipse',
  name: 'Shape',
  x: 300,
  y: 200,
  width: 100,
  height: 100,
  rotation: 0,
  fill: '#ff6b9d',
  stroke: 'none',
  strokeWidth: 0,
  opacity: 1,
  visible: true,
  locked: false,
  ...partial,
});

const smartDigitize = (objects: VectorObject[], overrides: Partial<Parameters<typeof runSmartDigitize>[0]> = {}) =>
  runSmartDigitize({ objects, selection: [], existingRegions: [], artboard: ARTBOARD, ...overrides });

describe('isBackgroundLikeRect', () => {
  it('detects artboard-covering rects and ignores everything else', () => {
    expect(isBackgroundLikeRect(makeObj({ type: 'rect', x: 0, y: 0, width: 800, height: 600 }), ARTBOARD)).toBe(true);
    // 700x500 at 50,50 covers ~73% of the artboard: not background.
    expect(isBackgroundLikeRect(makeObj({ type: 'rect', x: 50, y: 50, width: 700, height: 500 }), ARTBOARD)).toBe(false);
    // Rotated rects are treated as artwork.
    expect(isBackgroundLikeRect(makeObj({ type: 'rect', x: 0, y: 0, width: 800, height: 600, rotation: 45 }), ARTBOARD)).toBe(false);
    // Non-rects never count.
    expect(isBackgroundLikeRect(makeObj({ type: 'ellipse', x: 0, y: 0, width: 800, height: 600 }), ARTBOARD)).toBe(false);
    // Oversized rect hanging off the artboard still covers it.
    expect(isBackgroundLikeRect(makeObj({ type: 'rect', x: -100, y: -100, width: 1000, height: 800 }), ARTBOARD)).toBe(true);
  });
});

describe('expandDigitizeScope / listConvertibleText', () => {
  it('uses the whole document when nothing is selected', () => {
    const objects = [makeObj({}), makeObj({}), makeObj({})];
    expect(expandDigitizeScope(objects, [])).toHaveLength(3);
  });

  it('expands a selection to its whole group', () => {
    const a = makeObj({});
    const b = makeObj({ groupId: 'g1' });
    const c = makeObj({ groupId: 'g1' });
    const d = makeObj({ groupId: 'g2' });
    const scope = expandDigitizeScope([a, b, c, d], [b.id]);
    expect(scope.map(o => o.id).sort()).toEqual([b.id, c.id].sort());
  });

  it('lists only visible, unlocked text as convertible', () => {
    const text = makeObj({ type: 'text', text: 'doggy', fontFamily: 'Inter' });
    const hiddenText = makeObj({ type: 'text', visible: false });
    const lockedText = makeObj({ type: 'text', locked: true });
    const shape = makeObj({});
    const candidates = listConvertibleText([text, hiddenText, lockedText, shape], []);
    expect(candidates.map(candidate => candidate.id)).toEqual([text.id]);
  });
});

describe('runSmartDigitize', () => {
  it('classifies every skip with a reason and digitizes the rest', () => {
    const background = makeObj({ type: 'rect', name: 'Background', x: 0, y: 0, width: 800, height: 600, locked: true });
    const hidden = makeObj({ visible: false, name: 'Hidden' });
    const locked = makeObj({ locked: true, name: 'Locked' });
    const raster = makeObj({ type: 'image', name: 'Photo', imageSrc: 'x.png' });
    const text = makeObj({ type: 'text', name: 'Word', text: 'doggy' });
    const shape = makeObj({ name: 'Dot' });

    const result = smartDigitize([background, hidden, locked, raster, text, shape]);

    expect(result.backgroundSkipped).toBe(true);
    const reasons = Object.fromEntries(result.skipped.map(skip => [skip.id, skip.reason]));
    expect(reasons[background.id]).toBe('background');
    expect(reasons[hidden.id]).toBe('hidden');
    expect(reasons[locked.id]).toBe('locked');
    expect(reasons[raster.id]).toBe('raster');
    expect(reasons[text.id]).toBe('text');
    result.skipped.forEach(skip => expect(skip.detail.length).toBeGreaterThan(0));

    expect(result.converted).toHaveLength(1);
    expect(result.converted[0].id).toBe(shape.id);
    expect(result.converted[0].stitches).toBeGreaterThan(0);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].sourceFingerprint).toBeTruthy();
  });

  it('mirrors the manual digitize defaults exactly', () => {
    const filled = makeObj({ name: 'Dot' });
    const strokeOnly = makeObj({ type: 'polygon', name: 'Tri', x: 100, y: 100, width: 120, height: 120, fill: 'none', stroke: '#00d9ff', strokeWidth: 2 });
    const result = smartDigitize([filled, strokeOnly]);

    const filledRegion = result.regions.find(region => region.sourceObjectId === filled.id)!;
    expect(filledRegion.settings).toEqual({
      stitchType: 'fill',
      density: 0.4,
      angle: 45,
      underlay: 'edge-run',
      pullCompensation: 0.2,
      stitchLength: 2.5,
      color: { hex: '#ff6b9d' },
    });
    expect(filledRegion.name).toBe('Stitch Region (Dot)');

    const runningRegion = result.regions.find(region => region.sourceObjectId === strokeOnly.id)!;
    expect(runningRegion.settings.stitchType).toBe('running');
    expect(runningRegion.settings.underlay).toBe('none');
    expect(runningRegion.settings.color).toEqual({ hex: '#00d9ff' });
  });

  it('includes background rects only on explicit override, even when locked', () => {
    const artboard = { width: 200, height: 200 };
    const background = makeObj({ type: 'rect', name: 'Background', x: 0, y: 0, width: 200, height: 200, locked: true, fill: '#0b0b12' });
    const result = runSmartDigitize({ objects: [background], selection: [], existingRegions: [], artboard, includeBackground: true });
    expect(result.backgroundSkipped).toBe(false);
    expect(result.converted.map(entry => entry.id)).toEqual([background.id]);
    expect(result.regions[0].settings.color).toEqual({ hex: '#0b0b12' });
  });

  it('fails loudly (not silently) when an included background is too dense to preview', () => {
    // A full 800x600px fill at default density exceeds the per-region command
    // limit — same behavior as manual digitize, but with a recorded reason.
    const background = makeObj({ type: 'rect', name: 'Background', x: 0, y: 0, width: 800, height: 600, locked: true });
    const result = smartDigitize([background], { includeBackground: true });
    expect(result.backgroundSkipped).toBe(false);
    expect(result.converted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('generation-failed');
    expect(result.skipped[0].detail).toContain('command');
  });

  it('re-digitizes into an existing region, preserving id, visibility, and settings', () => {
    const shape = makeObj({ name: 'Dot' });
    const customSettings = {
      stitchType: 'fill' as const,
      density: 0.9,
      angle: 10,
      underlay: 'none' as const,
      pullCompensation: 0,
      stitchLength: 3,
      color: { hex: '#123456' },
    };
    const existing: StitchRegion = {
      id: 'keep-id',
      sourceObjectId: shape.id,
      sourceType: 'ellipse',
      name: 'Old Name',
      visible: false,
      settings: customSettings,
      commands: [],
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      geometryQuality: 'exact',
    };
    const result = smartDigitize([shape], { existingRegions: [existing] });
    expect(result.regions).toHaveLength(1);
    const region = result.regions[0];
    expect(region.id).toBe('keep-id');
    expect(region.visible).toBe(false);
    expect(region.settings).toEqual(customSettings);
    expect(region.name).toBe('Stitch Region (Dot)');
    expect(region.commands.length).toBeGreaterThan(0);
    expect(region.sourceFingerprint).toBeTruthy();
  });

  it('preserves regions whose sources are outside the digitize scope', () => {
    const inScope = makeObj({ name: 'A' });
    const outOfScope = makeObj({ name: 'B', x: 500 });
    const foreign: StitchRegion = {
      id: 'foreign',
      sourceObjectId: outOfScope.id,
      sourceType: 'ellipse',
      name: 'Stitch Region (B)',
      visible: true,
      settings: {
        stitchType: 'fill',
        density: 0.4,
        angle: 45,
        underlay: 'edge-run',
        pullCompensation: 0.2,
        stitchLength: 2.5,
        color: { hex: '#ffffff' },
      },
      commands: [{ x: 0, y: 0, type: 'stitch' }],
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      geometryQuality: 'exact',
    };
    const result = smartDigitize([inScope, outOfScope], { selection: [inScope.id], existingRegions: [foreign] });
    expect(result.regions.map(region => region.id)).toContain('foreign');
    expect(result.converted.map(entry => entry.id)).toEqual([inScope.id]);
  });
});

describe('fitHoopToPlan', () => {
  const regionWithBounds = (bounds: { x: number; y: number; width: number; height: number }, visible = true): StitchRegion => ({
    id: `region-${counter += 1}`,
    sourceObjectId: 'src',
    sourceType: 'path',
    name: 'Region',
    visible,
    settings: {
      stitchType: 'fill',
      density: 0.4,
      angle: 45,
      underlay: 'none',
      pullCompensation: 0,
      stitchLength: 2.5,
      color: { hex: '#ffffff' },
    },
    commands: [{ x: bounds.x, y: bounds.y, type: 'stitch' }],
    bounds,
    geometryQuality: 'exact',
  });

  it('picks the smallest preset that contains the plan', () => {
    const px = (mm: number) => mm * EMBROIDERY_PX_PER_MM;
    const small = fitHoopToPlan([regionWithBounds({ x: 0, y: 0, width: px(60), height: px(60) })]);
    expect(small?.hoop.name).toBe('100x100');
    expect(small?.fits).toBe(true);
    expect(small?.planWidthMm).toBeCloseTo(60, 0);

    const medium = fitHoopToPlan([regionWithBounds({ x: 0, y: 0, width: px(110), height: px(160) })]);
    expect(medium?.hoop.name).toBe('130x180');
    expect(medium?.fits).toBe(true);

    // Tall but narrow: 100x100 is too short, 130x180 catches it.
    const tall = fitHoopToPlan([regionWithBounds({ x: 0, y: 0, width: px(40), height: px(150) })]);
    expect(tall?.hoop.name).toBe('130x180');
  });

  it('falls back to the largest preset when nothing fits', () => {
    const huge = fitHoopToPlan([regionWithBounds({ x: 0, y: 0, width: 900, height: 900 })]);
    expect(huge?.hoop.name).toBe(HOOP_PRESETS[HOOP_PRESETS.length - 1].name);
    expect(huge?.fits).toBe(false);
    expect(huge?.planWidthMm).toBeGreaterThan(200);
  });

  it('centers the hoop on the plan and spans multiple regions', () => {
    const fit = fitHoopToPlan([
      regionWithBounds({ x: 100, y: 0, width: 100, height: 100 }),
      regionWithBounds({ x: 200, y: 100, width: 100, height: 100 }),
    ]);
    expect(fit?.hoop.centerX).toBe(200);
    expect(fit?.hoop.centerY).toBe(100);
  });

  it('returns null when there is nothing visible to stitch', () => {
    expect(fitHoopToPlan([])).toBeNull();
    expect(fitHoopToPlan([regionWithBounds({ x: 0, y: 0, width: 100, height: 100 }, false)])).toBeNull();
    const empty = regionWithBounds({ x: 0, y: 0, width: 100, height: 100 });
    empty.commands = [];
    expect(fitHoopToPlan([empty])).toBeNull();
  });
});
