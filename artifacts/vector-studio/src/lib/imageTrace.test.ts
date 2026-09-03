import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRACE_OPTIONS,
  loopsToPathData,
  traceImageData,
  traceResultToObjects,
  type TraceOptions,
} from './imageTrace';
import { parsePathContours, pointInContoursEvenOdd, nodesToSVGPath } from './pathUtils';
import { runSmartDigitize } from './digitize';
import type { VectorObject } from './types';

/** Builds RGBA data from ASCII art rows; '.' is transparent, letters map to colors. */
function raster(rows: string[], colors: Record<string, [number, number, number]>): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) {
      const ch = row[x];
      const o = (y * width + x) * 4;
      if (ch === '.') continue; // transparent
      const [r, g, b] = colors[ch];
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  });
  return { data, width, height };
}

const opts = (overrides: Partial<TraceOptions> = {}): TraceOptions => ({
  ...DEFAULT_TRACE_OPTIONS,
  colors: 4,
  smoothing: 0,
  speckle: 0,
  background: 'keep',
  ...overrides,
});

const RED: [number, number, number] = [200, 30, 40];
const BLUE: [number, number, number] = [20, 60, 200];
const WHITE: [number, number, number] = [255, 255, 255];

describe('traceImageData', () => {
  it('traces a solid square into one shape with exact corners at zero smoothing', () => {
    const rows = [
      '..........',
      '.RRRR.....',
      '.RRRR.....',
      '.RRRR.....',
      '.RRRR.....',
      '..........',
    ];
    const { data, width, height } = raster(rows, { R: RED });
    const result = traceImageData(data, width, height, opts());
    expect(result.shapes).toHaveLength(1);
    const shape = result.shapes[0];
    expect(shape.area).toBe(16);
    expect(shape.loops).toHaveLength(1);
    // Rectilinear square collapses to its 4 corners.
    expect(shape.loops[0]).toHaveLength(4);
    expect(shape.bounds).toEqual({ x: 1, y: 1, width: 4, height: 4 });
    const xs = shape.loops[0].map(p => p.x);
    const ys = shape.loops[0].map(p => p.y);
    expect(Math.min(...xs)).toBe(1);
    expect(Math.max(...xs)).toBe(5);
    expect(Math.min(...ys)).toBe(1);
    expect(Math.max(...ys)).toBe(5);
  });

  it('preserves holes as separate loops that stay empty under even-odd fill', () => {
    const rows = [
      '.........',
      '.RRRRRRR.',
      '.RRRRRRR.',
      '.RR...RR.',
      '.RR...RR.',
      '.RR...RR.',
      '.RRRRRRR.',
      '.RRRRRRR.',
      '.........',
    ];
    const { data, width, height } = raster(rows, { R: RED });
    const result = traceImageData(data, width, height, opts());
    expect(result.shapes).toHaveLength(1);
    const shape = result.shapes[0];
    expect(shape.loops).toHaveLength(2);
    const pathData = loopsToPathData(shape.loops);
    const contours = parsePathContours(pathData);
    expect(contours).toHaveLength(2);
    // Centre of the hole is NOT filled; ring body is.
    expect(pointInContoursEvenOdd({ x: 4.5, y: 4.5 }, contours)).toBe(false);
    expect(pointInContoursEvenOdd({ x: 2, y: 4.5 }, contours)).toBe(true);
  });

  it('separates colors into distinct shapes with an honest palette', () => {
    const rows = [
      'RRRRBBBB',
      'RRRRBBBB',
      'RRRRBBBB',
      'RRRRBBBB',
    ];
    const { data, width, height } = raster(rows, { R: RED, B: BLUE });
    const result = traceImageData(data, width, height, opts({ colors: 2 }));
    expect(result.shapes).toHaveLength(2);
    expect(result.palette).toHaveLength(2);
    const colors = result.shapes.map(shape => shape.color).sort();
    expect(colors[0].startsWith('#')).toBe(true);
    expect(new Set(colors).size).toBe(2);
  });

  it('merges specks into their surroundings when speckle cleanup is on', () => {
    const rows = Array.from({ length: 12 }, (_, y) =>
      Array.from({ length: 12 }, (_, x) => (x === 6 && y === 6 ? 'B' : 'R')).join(''),
    );
    const { data, width, height } = raster(rows, { R: RED, B: BLUE });
    const kept = traceImageData(data, width, height, opts({ speckle: 0 }));
    expect(kept.shapes.length).toBe(2);
    const cleaned = traceImageData(data, width, height, opts({ speckle: 4 }));
    expect(cleaned.shapes.length).toBe(1);
    expect(cleaned.speckleMerged).toBeGreaterThan(0);
    expect(cleaned.shapes[0].area).toBe(144); // speck absorbed, not deleted
  });

  it('treats diagonal touches as separate parts (4-connectivity)', () => {
    const rows = [
      'R...',
      '.R..',
      '....',
    ];
    const { data, width, height } = raster(rows, { R: RED });
    const result = traceImageData(data, width, height, opts());
    expect(result.shapes).toHaveLength(2);
  });

  it('auto background removal floods the dominant border color only', () => {
    const rows = [
      'WWWWWWWWWW',
      'WWWWWWWWWW',
      'WWRRRRRRWW',
      'WWRRWWRRWW', // inner Ws are enclosed, must survive
      'WWRRWWRRWW',
      'WWRRRRRRWW',
      'WWWWWWWWWW',
      'WWWWWWWWWW',
    ];
    const { data, width, height } = raster(rows, { R: RED, W: WHITE });
    const result = traceImageData(data, width, height, opts({ background: 'auto' }));
    expect(result.backgroundRemoved).toBe(true);
    // Outer white gone; red ring + enclosed white island remain.
    expect(result.shapes).toHaveLength(2);
    const reds = result.shapes.filter(shape => shape.color !== '#ffffff');
    expect(reds).toHaveLength(1);
    expect(reds[0].loops.length).toBe(2); // ring keeps its hole
  });

  it('flags an untouched background when keeping it', () => {
    const rows = Array.from({ length: 10 }, (_, y) =>
      Array.from({ length: 10 }, (_, x) =>
        x >= 3 && x <= 6 && y >= 3 && y <= 6 ? 'R' : 'W',
      ).join(''),
    );
    const { data, width, height } = raster(rows, { R: RED, W: WHITE });
    const result = traceImageData(data, width, height, opts({ background: 'keep' }));
    expect(result.shapes).toHaveLength(2);
    const background = result.shapes.find(shape => shape.isBackground);
    expect(background).toBeDefined();
    expect(background!.color).toBe('#ffffff');
    const foreground = result.shapes.find(shape => !shape.isBackground);
    expect(foreground!.color).not.toBe('#ffffff');
  });

  it('removes light pixels globally in light mode', () => {
    const rows = [
      'WWWWWW',
      'WRRRRW',
      'WRRRRW',
      'WWWWWW',
    ];
    const { data, width, height } = raster(rows, { R: RED, W: WHITE });
    const result = traceImageData(data, width, height, opts({ background: 'light' }));
    expect(result.backgroundRemoved).toBe(true);
    expect(result.shapes).toHaveLength(1);
    expect(result.shapes[0].isBackground).toBe(false);
  });

  it('emits smooth handles when smoothing is enabled', () => {
    const size = 24;
    const rows = Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => {
        const dx = x - size / 2 + 0.5;
        const dy = y - size / 2 + 0.5;
        return dx * dx + dy * dy <= 81 ? 'R' : '.';
      }).join(''),
    );
    const { data, width, height } = raster(rows, { R: RED });
    const result = traceImageData(data, width, height, opts({ smoothing: 5 }));
    expect(result.shapes).toHaveLength(1);
    const loop = result.shapes[0].loops[0];
    expect(loop.some(node => node.handleIn && node.handleOut)).toBe(true);
    // Simplification kicked in: far fewer points than the raw pixel boundary.
    expect(loop.length).toBeLessThan(30);
  });

  it('returns an empty result for fully transparent input', () => {
    const rows = ['....', '....'];
    const { data, width, height } = raster(rows, {});
    const result = traceImageData(data, width, height, opts());
    expect(result.shapes).toHaveLength(0);
  });
});

describe('traceResultToObjects', () => {
  const ringRows = [
    '.........',
    '.RRRRRRR.',
    '.RR...RR.',
    '.RR...RR.',
    '.RRRRRRR.',
    '.........',
  ];

  it('produces grouped editable paths with holes and node data', () => {
    const { data, width, height } = raster(ringRows, { R: RED });
    const result = traceImageData(data, width, height, opts());
    const objects = traceResultToObjects(result, { x: 100, y: 50, width: 90, height: 60, rotation: 0 }, 'g1');
    expect(objects).toHaveLength(1);
    const object = objects[0];
    expect(object.type).toBe('path');
    expect(object.groupId).toBe('g1');
    expect(object.closed).toBe(true);
    expect(object.traceRole).toBe('region');
    // Multi-loop shapes carry path data (nodes cannot express holes).
    expect(object.points).toBeTruthy();
    expect(object.nodes).toBeUndefined();
    const contours = parsePathContours(object.points!);
    expect(contours).toHaveLength(2);
    // Scaled into placement: 9px image → 90 wide, so the ring spans x≈110..180.
    expect(object.x).toBeCloseTo(100 + 1 * 10, 5);
    expect(object.width).toBeCloseTo(70, 5);
  });

  it('gives single-loop shapes editable nodes that render to a path', () => {
    const rows = [
      '.....',
      '.RRR.',
      '.RRR.',
      '.....',
    ];
    const { data, width, height } = raster(rows, { R: RED });
    const result = traceImageData(data, width, height, opts());
    const objects = traceResultToObjects(result, { x: 0, y: 0, width: 50, height: 40, rotation: 0 });
    expect(objects).toHaveLength(1);
    expect(objects[0].nodes?.length).toBeGreaterThanOrEqual(3);
    expect(objects[0].points).toBeUndefined();
    expect(nodesToSVGPath(objects[0].nodes!, true).length).toBeGreaterThan(0);
  });

  it('bakes placement rotation into the geometry', () => {
    const rows = [
      'RR',
      'RR',
    ];
    const { data, width, height } = raster(rows, { R: RED });
    const result = traceImageData(data, width, height, opts());
    const objects = traceResultToObjects(result, { x: 0, y: 0, width: 10, height: 10, rotation: 90 });
    expect(objects).toHaveLength(1);
    expect(objects[0].rotation).toBe(0); // rotation baked in, not stored
    // A 90° rotation of the full square about its centre maps onto itself.
    expect(objects[0].x).toBeCloseTo(0, 4);
    expect(objects[0].width).toBeCloseTo(10, 4);
  });

  it('marks background shapes so digitizing skips them by default', () => {
    const rows = Array.from({ length: 10 }, (_, y) =>
      Array.from({ length: 10 }, (_, x) =>
        x >= 3 && x <= 6 && y >= 3 && y <= 6 ? 'R' : 'W',
      ).join(''),
    );
    const { data, width, height } = raster(rows, { R: RED, W: WHITE });
    const result = traceImageData(data, width, height, opts({ background: 'keep' }));
    const objects = traceResultToObjects(result, { x: 0, y: 0, width: 200, height: 200, rotation: 0 });
    const background = objects.find(object => object.traceRole === 'background');
    expect(background).toBeDefined();
    expect(background!.name).toBe('Background');

    const digitized = runSmartDigitize({
      objects,
      selection: [],
      existingRegions: [],
      artboard: { width: 800, height: 600 },
    });
    expect(digitized.backgroundSkipped).toBe(true);
    expect(digitized.skipped.some(skip => skip.reason === 'background' && skip.id === background!.id)).toBe(true);
    // The foreground part still converts.
    expect(digitized.converted.length).toBe(1);
  });

  it('digitizes traced rings with holes kept empty', () => {
    const { data, width, height } = raster(ringRows, { R: RED });
    const result = traceImageData(data, width, height, opts());
    const objects = traceResultToObjects(result, { x: 200, y: 150, width: 360, height: 240, rotation: 0 });
    const digitized = runSmartDigitize({
      objects,
      selection: [],
      existingRegions: [],
      artboard: { width: 800, height: 600 },
    });
    expect(digitized.converted).toHaveLength(1);
    const region = digitized.regions.find(r => r.sourceObjectId === objects[0].id)!;
    const stitches = region.commands.filter(command => command.type === 'stitch');
    expect(stitches.length).toBeGreaterThan(10);
    // No stitch may land inside the hole (central band well inside the ring's void).
    const holeCentreX = 200 + 4.5 * 40; // image px 4.5 of 9 → world
    const holeCentreY = 150 + 3 * 40; // image px 3 of 6 → world
    const inHole = stitches.filter(
      command => Math.abs(command.x - holeCentreX) < 30 && Math.abs(command.y - holeCentreY) < 30,
    );
    expect(inHole).toHaveLength(0);
  });
});

describe('trace guardrails', () => {
  it('keeps oversized regions but never sets both nodes and points', () => {
    const rows = [
      'RRRR',
      'RRRR',
    ];
    const { data, width, height } = raster(rows, { R: RED });
    const result = traceImageData(data, width, height, opts());
    const objects = traceResultToObjects(result, { x: 0, y: 0, width: 40, height: 20, rotation: 0 });
    objects.forEach(object => {
      expect(Boolean(object.nodes) && Boolean(object.points)).toBe(false);
    });
  });
});
