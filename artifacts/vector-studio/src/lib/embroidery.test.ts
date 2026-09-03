import { describe, it, expect } from 'vitest';
import {
  generateStitches,
  computeSourceFingerprint,
  isRegionStale,
  StitchRegion,
  StitchRegionSettings,
} from './embroidery';
import type { VectorObject } from './types';

// Square ring: outer 100x100 square with a 40x40 hole (30,30)-(70,70).
const RING = 'M 0 0 L 100 0 L 100 100 L 0 100 Z M 30 30 L 70 30 L 70 70 L 30 70 Z';

const makeRingPath = (partial: Partial<VectorObject> = {}): VectorObject => ({
  id: 'ring',
  type: 'path',
  name: 'Ring',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  fill: '#ff0000',
  stroke: 'none',
  strokeWidth: 0,
  opacity: 1,
  visible: true,
  locked: false,
  points: RING,
  closed: true,
  ...partial,
});

const fillSettings = (partial: Partial<StitchRegionSettings> = {}): StitchRegionSettings => ({
  stitchType: 'fill',
  density: 0.4,
  angle: 0,
  underlay: 'none',
  pullCompensation: 0,
  stitchLength: 2.5,
  color: { hex: '#ff0000' },
  ...partial,
});

const stitchPoints = (object: VectorObject, settings: StitchRegionSettings) =>
  generateStitches(object, settings).filter(command => command.type === 'stitch');

describe('multi-contour fill (even-odd)', () => {
  it('fills the ring band on all four sides but keeps the hole empty', () => {
    const stitches = stitchPoints(makeRingPath(), fillSettings());
    expect(stitches.length).toBeGreaterThan(100);

    // Nothing inside the hole (4px safety margin against span endpoints).
    const inHole = stitches.filter(s => s.x > 34 && s.x < 66 && s.y > 34 && s.y < 66);
    expect(inHole).toHaveLength(0);

    // Every band around the hole is stitched, whatever the row orientation.
    expect(stitches.some(s => s.y < 30 && s.x > 30 && s.x < 70)).toBe(true); // top
    expect(stitches.some(s => s.y > 70 && s.x > 30 && s.x < 70)).toBe(true); // bottom
    expect(stitches.some(s => s.x < 30 && s.y > 30 && s.y < 70)).toBe(true); // left
    expect(stitches.some(s => s.x > 70 && s.y > 30 && s.y < 70)).toBe(true); // right
  });

  it('keeps the hole empty with a rotated object and angled stitches', () => {
    const stitches = stitchPoints(makeRingPath({ rotation: 30 }), fillSettings({ angle: 45 }));
    expect(stitches.length).toBeGreaterThan(100);
    // Rotation is about the object center (50,50), so the hole center stays put.
    const nearCenter = stitches.filter(s => Math.hypot(s.x - 50, s.y - 50) < 12);
    expect(nearCenter).toHaveLength(0);
  });

  it('respects pull compensation without invading the hole center', () => {
    const stitches = stitchPoints(makeRingPath(), fillSettings({ pullCompensation: 0.2 }));
    const nearCenter = stitches.filter(s => Math.hypot(s.x - 50, s.y - 50) < 10);
    expect(nearCenter).toHaveLength(0);
  });
});

describe('multi-contour running stitch', () => {
  it('traces both contours of the ring', () => {
    const object = makeRingPath({ fill: 'none', stroke: '#00d9ff', strokeWidth: 2 });
    const commands = generateStitches(object, fillSettings({ stitchType: 'running' }));
    const stitches = commands.filter(command => command.type === 'stitch');
    const onOuter = stitches.some(
      s => (Math.abs(s.y) < 2 || Math.abs(s.y - 100) < 2 || Math.abs(s.x) < 2 || Math.abs(s.x - 100) < 2),
    );
    const onInner = stitches.some(
      s =>
        s.x > 28 && s.x < 72 && s.y > 28 && s.y < 72 &&
        (Math.abs(s.x - 30) < 2 || Math.abs(s.x - 70) < 2 || Math.abs(s.y - 30) < 2 || Math.abs(s.y - 70) < 2),
    );
    expect(onOuter).toBe(true);
    expect(onInner).toBe(true);
  });
});

describe('source fingerprints and staleness', () => {
  const region = (fingerprint?: string): StitchRegion => ({
    id: 'r1',
    sourceObjectId: 'ring',
    sourceType: 'path',
    name: 'Stitch Region (Ring)',
    visible: true,
    settings: fillSettings(),
    commands: [],
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    geometryQuality: 'exact',
    sourceFingerprint: fingerprint,
  });

  it('is stable for identical geometry and ignores style-only changes', () => {
    const base = makeRingPath();
    expect(computeSourceFingerprint(base)).toBe(computeSourceFingerprint(makeRingPath()));
    expect(computeSourceFingerprint(makeRingPath({ fill: '#00ff00', stroke: '#123456', name: 'Renamed' })))
      .toBe(computeSourceFingerprint(base));
  });

  it('changes when geometry changes', () => {
    const base = computeSourceFingerprint(makeRingPath());
    expect(computeSourceFingerprint(makeRingPath({ x: 5 }))).not.toBe(base);
    expect(computeSourceFingerprint(makeRingPath({ width: 140 }))).not.toBe(base);
    expect(computeSourceFingerprint(makeRingPath({ rotation: 12 }))).not.toBe(base);
    expect(computeSourceFingerprint(makeRingPath({ points: 'M 0 0 L 10 0 L 10 10 Z' }))).not.toBe(base);
  });

  it('flags stale only when a fingerprinted region diverges from an existing source', () => {
    const source = makeRingPath();
    const fresh = computeSourceFingerprint(source);
    expect(isRegionStale(region(fresh), source)).toBe(false);
    expect(isRegionStale(region(undefined), source)).toBe(false); // legacy region
    expect(isRegionStale(region(fresh), undefined)).toBe(false); // source removed
    expect(isRegionStale(region(fresh), makeRingPath({ x: 25 }))).toBe(true);
    expect(isRegionStale(region(fresh), makeRingPath({ fill: '#00ff00' }))).toBe(false);
  });
});
