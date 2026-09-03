import { describe, it, expect } from 'vitest';
import {
  buildPlaybackPlan,
  playheadAt,
  buildPartialPath,
  boundaryStartFor,
  PLAYBACK_CHUNK_SIZE,
  STITCH_TICKS,
  JUMP_TICKS,
  TRIM_TICKS,
  COLOR_CHANGE_TICKS,
  INITIAL_THREAD_TICKS,
} from './stitchPlayback';
import type { EmbroideryDesign, StitchCommand, StitchRegion } from './embroidery';

const makeRegion = (id: string, colorHex: string, commands: StitchCommand[], visible = true): StitchRegion => ({
  id,
  sourceObjectId: `source-${id}`,
  sourceType: 'rect',
  name: `Region ${id}`,
  visible,
  settings: {
    stitchType: 'running',
    density: 0.4,
    angle: 0,
    underlay: 'none',
    pullCompensation: 0,
    stitchLength: 2.5,
    color: { hex: colorHex },
  },
  commands,
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  geometryQuality: 'exact',
});

const makeDesign = (regions: StitchRegion[]): EmbroideryDesign => ({
  regions,
  hoop: { name: 'test', widthMm: 100, heightMm: 100 },
  threadPalette: [],
  exporters: [],
});

const RED = '#ff0000';
const BLUE = '#0000ff';

const twoColorDesign = () => makeDesign([
  makeRegion('a', RED, [
    { type: 'color-change', x: 0, y: 0, threadHex: RED, initialThread: true },
    { type: 'jump', x: 0, y: 0 },
    { type: 'stitch', x: 10, y: 0 },
    { type: 'stitch', x: 20, y: 0 },
    { type: 'trim', x: 20, y: 0 },
  ]),
  makeRegion('hidden', '#00ff00', [
    { type: 'jump', x: 500, y: 500 },
    { type: 'stitch', x: 510, y: 500 },
  ], false),
  makeRegion('b', BLUE, [
    { type: 'color-change', x: 20, y: 0, threadHex: BLUE },
    { type: 'jump', x: 30, y: 0 },
    { type: 'stitch', x: 40, y: 0 },
    { type: 'stitch', x: 40, y: 10 },
    { type: 'trim', x: 40, y: 10 },
  ]),
]);

const bigDesign = (stitchCount: number) => {
  const commands: StitchCommand[] = [
    { type: 'color-change', x: 0, y: 0, threadHex: RED, initialThread: true },
  ];
  for (let i = 0; i < stitchCount; i += 1) {
    if (i % 97 === 0) commands.push({ type: 'jump', x: i, y: 0 });
    if (i % 401 === 0 && i > 0) commands.push({ type: 'trim', x: i, y: 0 });
    commands.push({ type: 'stitch', x: i, y: (i % 2) * 4 });
  }
  return makeDesign([makeRegion('big', RED, commands)]);
};

const countLines = (d: string) => (d.match(/L/g) ?? []).length;

describe('buildPlaybackPlan', () => {
  it('flattens visible regions in machine order and skips hidden regions', () => {
    const plan = buildPlaybackPlan(twoColorDesign());
    expect(plan.steps).toHaveLength(10);
    expect(plan.steps.every(step => step.regionId !== 'hidden')).toBe(true);
    expect(plan.totalStitches).toBe(4);
    expect(plan.steps.slice(0, 5).every(step => step.colorHex === RED)).toBe(true);
    expect(plan.steps.slice(5).every(step => step.colorHex === BLUE)).toBe(true);
  });

  it('prices commands so trims and color changes pause the timeline', () => {
    const plan = buildPlaybackPlan(twoColorDesign());
    const expected = INITIAL_THREAD_TICKS + JUMP_TICKS + STITCH_TICKS * 2 + TRIM_TICKS
      + COLOR_CHANGE_TICKS + JUMP_TICKS + STITCH_TICKS * 2 + TRIM_TICKS;
    expect(plan.duration).toBe(expected);
    for (let i = 1; i < plan.cumTime.length; i += 1) {
      expect(plan.cumTime[i]).toBeGreaterThan(plan.cumTime[i - 1]);
    }
  });

  it('collects scrubber event marks in timeline order', () => {
    const plan = buildPlaybackPlan(twoColorDesign());
    expect(plan.events.map(event => event.type)).toEqual([
      'color-change', 'jump', 'trim', 'color-change', 'jump', 'trim',
    ]);
    expect(plan.events[3].colorHex).toBe(BLUE);
    plan.events.forEach(event => {
      expect(event.fraction).toBeGreaterThanOrEqual(0);
      expect(event.fraction).toBeLessThan(1);
    });
    for (let i = 1; i < plan.events.length; i += 1) {
      expect(plan.events[i].fraction).toBeGreaterThan(plan.events[i - 1].fraction);
    }
  });

  it('falls back to the region color when a plan has no color-change commands', () => {
    const plan = buildPlaybackPlan(makeDesign([
      makeRegion('a', RED, [
        { type: 'jump', x: 0, y: 0 },
        { type: 'stitch', x: 10, y: 0 },
      ]),
    ]));
    expect(plan.steps.every(step => step.colorHex === RED)).toBe(true);
  });

  it('keeps every chunk single-color and within the size cap', () => {
    const plan = buildPlaybackPlan(bigDesign(3000));
    expect(plan.chunks.length).toBeGreaterThan(1);
    plan.chunks.forEach(chunk => {
      expect(chunk.endIndex - chunk.startIndex).toBeLessThan(PLAYBACK_CHUNK_SIZE);
      const range = plan.steps.slice(chunk.startIndex, chunk.endIndex + 1);
      expect(range.every(step => step.colorHex === chunk.colorHex)).toBe(true);
      expect(range.every(step => step.layer === chunk.layer)).toBe(true);
      expect(chunk.d.startsWith('M')).toBe(true);
    });
  });

  it('splits chunks when the layer changes within a region', () => {
    const commands: StitchCommand[] = [
      { type: 'color-change', x: 0, y: 0, threadHex: RED, initialThread: true },
      { type: 'jump', x: 0, y: 0, layer: 'underlay' },
      { type: 'stitch', x: 5, y: 0, layer: 'underlay' },
      { type: 'stitch', x: 10, y: 0, layer: 'underlay' },
      { type: 'jump', x: 0, y: 0, layer: 'top' },
      { type: 'stitch', x: 5, y: 5, layer: 'top' },
      { type: 'stitch', x: 10, y: 5, layer: 'top' },
    ];
    const plan = buildPlaybackPlan(makeDesign([makeRegion('u', RED, commands)]));
    expect(plan.chunks.map(chunk => chunk.layer)).toEqual(['underlay', 'top']);
  });

  it('handles plans at the 35k-command scale', () => {
    const plan = buildPlaybackPlan(bigDesign(34000));
    expect(plan.steps.length).toBeGreaterThan(34000);
    expect(plan.chunks.length).toBeGreaterThan(100);
    expect(plan.chunks.every(chunk => chunk.endIndex - chunk.startIndex < PLAYBACK_CHUNK_SIZE)).toBe(true);
    const head = playheadAt(plan, plan.duration / 2);
    expect(head).not.toBeNull();
    expect(head!.stitchNumber).toBeGreaterThan(0);
  });
});

describe('playheadAt', () => {
  const plan = buildPlaybackPlan(twoColorDesign());

  it('starts before anything is stitched', () => {
    const head = playheadAt(plan, 0)!;
    expect(head.index).toBe(0);
    expect(head.completedIndex).toBe(-1);
    expect(head.stitchNumber).toBe(0);
  });

  it('interpolates the needle along the stitch in progress', () => {
    const firstStitchStart = INITIAL_THREAD_TICKS + JUMP_TICKS;
    const head = playheadAt(plan, firstStitchStart + STITCH_TICKS / 2)!;
    expect(head.index).toBe(2);
    expect(head.step.type).toBe('stitch');
    expect(head.x).toBeCloseTo(5);
    expect(head.y).toBeCloseTo(0);
    expect(head.stitchNumber).toBe(1);
  });

  it('parks the needle during a trim pause', () => {
    const trimStart = INITIAL_THREAD_TICKS + JUMP_TICKS + 2 * STITCH_TICKS;
    const head = playheadAt(plan, trimStart + TRIM_TICKS / 2)!;
    expect(head.step.type).toBe('trim');
    expect(head.x).toBe(20);
    expect(head.y).toBe(0);
    expect(head.stitchNumber).toBe(2);
  });

  it('clamps to the timeline ends', () => {
    const before = playheadAt(plan, -50)!;
    expect(before.index).toBe(0);
    const after = playheadAt(plan, plan.duration + 99)!;
    expect(after.index).toBe(plan.steps.length - 1);
    expect(after.completedIndex).toBe(plan.steps.length - 1);
    expect(after.stitchNumber).toBe(plan.totalStitches);
  });

  it('returns null for an empty plan', () => {
    expect(playheadAt(buildPlaybackPlan(makeDesign([])), 3)).toBeNull();
  });
});

describe('progressive rendering coverage', () => {
  it('draws every completed stitch exactly once across full chunks plus the partial chunk', () => {
    const plan = buildPlaybackPlan(bigDesign(2000));
    const samples = [0, 1, 5, PLAYBACK_CHUNK_SIZE - 1, PLAYBACK_CHUNK_SIZE, PLAYBACK_CHUNK_SIZE + 1, 777, plan.steps.length - 2, plan.steps.length - 1];
    samples.forEach(current => {
      const completed = current - 1;
      const full = plan.chunks
        .filter(chunk => chunk.endIndex <= completed)
        .reduce((total, chunk) => total + countLines(chunk.d), 0);
      const boundary = boundaryStartFor(plan, current);
      const partial = countLines(buildPartialPath(plan, boundary, completed));
      const expected = completed >= 0 ? plan.stitchOrdinal[completed] : 0;
      expect(full + partial).toBe(expected);
    });
  });

  it('returns an empty string when the span contains no stitches', () => {
    const plan = buildPlaybackPlan(twoColorDesign());
    expect(buildPartialPath(plan, 0, -1)).toBe('');
    expect(buildPartialPath(plan, 0, 1)).toBe(''); // color-change + jump only
  });

  it('never draws thread across a trim, even without an intervening jump', () => {
    // Imported/hand-built streams may stitch directly after a trim; the cut
    // thread must anchor fresh instead of connecting back to (10,0).
    const plan = buildPlaybackPlan(makeDesign([
      makeRegion('a', RED, [
        { type: 'jump', x: 0, y: 0 },
        { type: 'stitch', x: 10, y: 0 },
        { type: 'trim', x: 10, y: 0 },
        { type: 'stitch', x: 50, y: 50 },
        { type: 'stitch', x: 60, y: 50 },
      ]),
    ]));
    const chunkD = plan.chunks.map(chunk => chunk.d).join(' ');
    expect(chunkD).not.toContain('M10.00,0.00L50.00,50.00'); // no thread from (10,0) into (50,50)
    expect(chunkD).toContain('M50.00,50.00L50.00,50.00'); // fresh anchor at (50,50)
    const partial = buildPartialPath(plan, 0, plan.steps.length - 1);
    expect(partial).toContain('M50.00,50.00L50.00,50.00');
    expect(partial).not.toContain('M10.00,0.00L50.00,50.00');
  });
});
