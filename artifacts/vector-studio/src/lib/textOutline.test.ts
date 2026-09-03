import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Font } from 'opentype.js';
import { buildTextOutline } from './textOutline';
import { parsePathContours, pointInContoursEvenOdd, PathContour } from './pathUtils';
import { generateStitches } from './embroidery';
import type { VectorObject } from './types';

const require = createRequire(import.meta.url);

const loadFont = async (specifier: string): Promise<Font> => {
  const opentype = await import('opentype.js');
  const buffer = readFileSync(require.resolve(specifier));
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  return opentype.parse(arrayBuffer);
};

const makeText = (partial: Partial<VectorObject>): VectorObject => ({
  id: 'text-1',
  type: 'text',
  name: 'Text',
  x: 0,
  y: 0,
  width: 400,
  height: 120,
  rotation: 0,
  fill: '#ffffff',
  stroke: 'none',
  strokeWidth: 0,
  opacity: 1,
  visible: true,
  locked: false,
  text: 'doggy',
  fontSize: 100,
  fontFamily: 'Inter',
  fontWeight: '400',
  ...partial,
});

/** Counts distinct inside-runs along a horizontal scanline (ring => 2). */
const insideRuns = (contours: PathContour[], y: number, x0: number, x1: number, steps = 400): number => {
  let runs = 0;
  let previous = false;
  for (let i = 0; i <= steps; i += 1) {
    const inside = pointInContoursEvenOdd({ x: x0 + ((x1 - x0) * i) / steps, y }, contours);
    if (inside && !previous) runs += 1;
    previous = inside;
  }
  return runs;
};

let inter: Font;

beforeAll(async () => {
  inter = await loadFont('@fontsource/inter/files/inter-latin-400-normal.woff');
});

describe('buildTextOutline with the real bundled Inter font', () => {
  it('converts "doggy" to a multi-contour outline inside the object box', () => {
    const outline = buildTextOutline(makeText({}), inter);
    expect(outline.pathData.length).toBeGreaterThan(0);
    expect(outline.missingChars).toEqual([]);
    expect(outline.droppedOffPath).toBe(0);
    // d(2) + o(2) + g + g + y contours; counters make this at least 7.
    expect(outline.contourCount).toBeGreaterThanOrEqual(7);
    const contours = parsePathContours(outline.pathData);
    expect(contours).toHaveLength(outline.contourCount);
    contours.forEach(contour => expect(contour.closed).toBe(true));
    // Layout sanity: sits on the first baseline (y + fontSize), inside the box.
    expect(outline.bounds.y).toBeGreaterThan(10);
    expect(outline.bounds.y + outline.bounds.height).toBeLessThan(135);
    expect(outline.bounds.x).toBeGreaterThan(-6);
    expect(outline.bounds.width).toBeLessThan(400);
  });

  it('keeps the counter of "o" as a hole (even-odd ring topology)', () => {
    const outline = buildTextOutline(makeText({ text: 'o' }), inter);
    expect(outline.contourCount).toBe(2);
    const contours = parsePathContours(outline.pathData);
    const centerX = outline.bounds.x + outline.bounds.width / 2;
    const centerY = outline.bounds.y + outline.bounds.height / 2;
    expect(pointInContoursEvenOdd({ x: centerX, y: centerY }, contours)).toBe(false);
    expect(insideRuns(contours, centerY, outline.bounds.x - 5, outline.bounds.x + outline.bounds.width + 5)).toBe(2);
  });

  it('never fills the counter when the outline is stitched as a fill region', () => {
    const outline = buildTextOutline(makeText({ text: 'o', fontSize: 200, width: 300, height: 260 }), inter);
    const pathObject: VectorObject = {
      ...makeText({}),
      id: 'o-path',
      type: 'path',
      points: outline.pathData,
      closed: true,
      x: outline.bounds.x,
      y: outline.bounds.y,
      width: outline.bounds.width,
      height: outline.bounds.height,
    };
    const commands = generateStitches(pathObject, {
      stitchType: 'fill',
      density: 0.4,
      angle: 0,
      underlay: 'none',
      pullCompensation: 0,
      stitchLength: 2.5,
      color: { hex: '#222222' },
    });
    const stitches = commands.filter(command => command.type === 'stitch');
    expect(stitches.length).toBeGreaterThan(50);
    const centerX = outline.bounds.x + outline.bounds.width / 2;
    const centerY = outline.bounds.y + outline.bounds.height / 2;
    const radius = Math.min(outline.bounds.width, outline.bounds.height) * 0.08;
    const inHole = stitches.filter(
      stitch => Math.hypot(stitch.x - centerX, stitch.y - centerY) < radius,
    );
    expect(inHole).toHaveLength(0);
  });

  it('applies alignment and letter spacing', () => {
    const left = buildTextOutline(makeText({ textAlign: 'left' }), inter);
    const centered = buildTextOutline(makeText({ textAlign: 'center' }), inter);
    expect(centered.bounds.x).toBeGreaterThan(left.bounds.x + 10);

    const tight = buildTextOutline(makeText({}), inter);
    const spaced = buildTextOutline(makeText({ letterSpacing: 20 }), inter);
    expect(spaced.bounds.width).toBeGreaterThan(tight.bounds.width + 60);
  });

  it('lays out multiple lines downward', () => {
    const single = buildTextOutline(makeText({}), inter);
    const double = buildTextOutline(makeText({ text: 'do\nggy' }), inter);
    expect(double.bounds.height).toBeGreaterThan(single.bounds.height + 50);
  });

  it('reports characters missing from the bundled font', () => {
    const outline = buildTextOutline(makeText({ text: 'do\u4e2dgy' }), inter);
    expect(outline.missingChars).toContain('\u4e2d');
    expect(outline.contourCount).toBeGreaterThan(0);
  });

  it('traces text along a sampled path (best effort)', () => {
    const outline = buildTextOutline(makeText({ textPathId: 'p1' }), inter, {
      pathSampler: distance => ({ x: distance, y: 200, angle: 0 }),
      pathLength: 1000,
    });
    expect(outline.droppedOffPath).toBe(0);
    expect(outline.contourCount).toBeGreaterThanOrEqual(7);
    // Baseline rides the sampled path at y=200.
    expect(outline.bounds.y).toBeGreaterThan(110);
    expect(outline.bounds.y + outline.bounds.height).toBeLessThan(240);
  });
});
