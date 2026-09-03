import { describe, it, expect } from 'vitest';
import {
  EmbroideryDesign,
  EmbroideryGenerationError,
  EMBROIDERY_EXPORTERS,
  EMBROIDERY_PX_PER_MM,
  HoopSettings,
  StitchCommand,
  StitchRegion,
  StitchRegionSettings,
  generateStitches,
} from './embroidery';
import {
  DST_MAX_DELTA,
  PEC_MAX_DELTA,
  assignPecThreads,
  encodeDst,
  encodePes,
  machineExportPreflight,
  planToMachineOps,
} from './machineExport';
import type { VectorObject } from './types';

// --- Fixtures ---------------------------------------------------------------
// Machine units are 0.1 mm relative to the hoop center, so a command placed
// `mm` millimeters from the center must come back as `mm * 10` units.

const CENTER = { x: 400, y: 300 };
const at = (xMm: number, yMm: number) => ({
  x: CENTER.x + xMm * EMBROIDERY_PX_PER_MM,
  y: CENTER.y + yMm * EMBROIDERY_PX_PER_MM,
});
const cmd = (type: StitchCommand['type'], xMm: number, yMm: number, extra: Partial<StitchCommand> = {}): StitchCommand =>
  ({ ...at(xMm, yMm), type, ...extra });

const settings = (hex: string): StitchRegionSettings => ({
  stitchType: 'running',
  density: 0.4,
  angle: 0,
  underlay: 'none',
  pullCompensation: 0,
  stitchLength: 2.5,
  color: { hex },
});

const makeRegion = (id: string, hex: string, commands: StitchCommand[], partial: Partial<StitchRegion> = {}): StitchRegion => ({
  id,
  sourceObjectId: `src-${id}`,
  sourceType: 'path',
  name: id,
  visible: true,
  settings: settings(hex),
  commands,
  bounds: { x: 0, y: 0, width: 10, height: 10 },
  geometryQuality: 'exact',
  ...partial,
});

const makeDesign = (regions: StitchRegion[], hoop: Partial<HoopSettings> = {}): EmbroideryDesign => ({
  regions,
  hoop: { name: '100x100', widthMm: 100, heightMm: 100, centerX: CENTER.x, centerY: CENTER.y, ...hoop },
  threadPalette: [],
  exporters: EMBROIDERY_EXPORTERS,
});

/**
 * Two colors and three regions covering every command kind:
 * - region a (yellow): jump + two stitches, trailing trim consumed by the
 *   color change that follows.
 * - region b (black): color change, long jump (splits in DST), stitch.
 * - region c (black, same thread): trim + jump → a trimmed travel.
 */
const twoColorDesign = () => makeDesign([
  makeRegion('a', '#ffff00', [
    cmd('color-change', 2, 1, { threadHex: '#ffff00', initialThread: true }),
    cmd('jump', 2, 1),
    cmd('stitch', 5, 0),
    cmd('stitch', 5, 5),
    cmd('trim', 5, 5),
  ]),
  makeRegion('b', '#000000', [
    cmd('color-change', 5, 5, { threadHex: '#000000' }),
    cmd('jump', -10, -10),
    cmd('stitch', -10, -5),
    cmd('trim', -10, -5),
  ]),
  makeRegion('c', '#000000', [
    cmd('jump', 0, -10),
    cmd('stitch', 3, -10),
  ]),
]);

// --- Independent DST parser (decode table from the Tajima spec) --------------

type ParsedEvent = { type: string; x?: number; y?: number };

const bit = (value: number, index: number) => (value >> index) & 1;

const decodeDstRecord = (b0: number, b1: number, b2: number) => {
  const dx =
    bit(b2, 2) * 81 - bit(b2, 3) * 81 + bit(b1, 2) * 27 - bit(b1, 3) * 27 +
    bit(b0, 2) * 9 - bit(b0, 3) * 9 + bit(b1, 0) * 3 - bit(b1, 1) * 3 +
    bit(b0, 0) - bit(b0, 1);
  const dyUp =
    bit(b2, 5) * 81 - bit(b2, 4) * 81 + bit(b1, 5) * 27 - bit(b1, 4) * 27 +
    bit(b0, 5) * 9 - bit(b0, 4) * 9 + bit(b1, 7) * 3 - bit(b1, 6) * 3 +
    bit(b0, 7) - bit(b0, 6);
  return { dx, dy: -dyUp }; // Back to screen space (+Y down).
};

const ascii = (bytes: Uint8Array) => String.fromCharCode(...bytes);

const parseDst = (bytes: Uint8Array) => {
  const header = ascii(bytes.slice(0, 512));
  const raw: { type: string; dx: number; dy: number }[] = [];
  for (let i = 512; i + 2 < bytes.length; i += 3) {
    const [b0, b1, b2] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    if ((b2 & 0xf3) === 0xf3) { raw.push({ type: 'end', dx: 0, dy: 0 }); break; }
    const { dx, dy } = decodeDstRecord(b0, b1, b2);
    if ((b2 & 0xc3) === 0xc3) raw.push({ type: 'color-change', dx, dy });
    else if (b2 & 0x80) raw.push({ type: 'jump', dx, dy });
    else raw.push({ type: 'stitch', dx, dy });
  }
  return { header, raw };
};

/** Absolute events with trim triples collapsed and split jumps merged. */
const dstEvents = (raw: { type: string; dx: number; dy: number }[]): ParsedEvent[] => {
  const out: ParsedEvent[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const record = raw[i];
    if (
      record.type === 'jump' && record.dx === 2 && record.dy === 2 &&
      raw[i + 1]?.type === 'jump' && raw[i + 1].dx === -4 && raw[i + 1].dy === -4 &&
      raw[i + 2]?.type === 'jump' && raw[i + 2].dx === 2 && raw[i + 2].dy === 2
    ) {
      out.push({ type: 'trim' });
      i += 2;
      continue;
    }
    x += record.dx;
    y += record.dy;
    if (record.type === 'end') { out.push({ type: 'end' }); continue; }
    if (record.type === 'color-change') { out.push({ type: 'color-change' }); continue; }
    const previous = out.at(-1);
    if (record.type === 'jump' && previous?.type === 'jump') {
      previous.x = x;
      previous.y = y;
      continue;
    }
    out.push({ type: record.type, x, y });
  }
  return out;
};

/** What the parsers should reconstruct, straight from the machine ops. */
const expectedEvents = (design: EmbroideryDesign): ParsedEvent[] => {
  const events: ParsedEvent[] = [];
  for (const op of planToMachineOps(design).ops) {
    if (op.type === 'color-change') {
      events.push({ type: 'color-change' });
    } else if (op.type === 'jump') {
      if (op.trim) events.push({ type: 'trim' });
      const previous = events.at(-1);
      if (previous?.type === 'jump') { previous.x = op.x; previous.y = op.y; }
      else events.push({ type: 'jump', x: op.x, y: op.y });
    } else {
      events.push({ type: 'stitch', x: op.x, y: op.y });
    }
  }
  events.push({ type: 'end' });
  return events;
};

// --- Independent PEC parser (short/long forms from the PEC spec) -------------

const parsePecStitches = (bytes: Uint8Array, start: number) => {
  const events: (ParsedEvent & { arg?: number })[] = [];
  let i = start;
  let x = 0;
  let y = 0;
  const readValue = () => {
    const first = bytes[i];
    if (first & 0x80) {
      const flag = first & 0x30;
      let value = ((first & 0x0f) << 8) | bytes[i + 1];
      if (value >= 0x800) value -= 0x1000;
      i += 2;
      return { value, flag };
    }
    i += 1;
    return { value: first >= 64 ? first - 128 : first, flag: 0 };
  };
  while (i < bytes.length) {
    if (bytes[i] === 0xff) { events.push({ type: 'end' }); i += 1; break; }
    if (bytes[i] === 0xfe && bytes[i + 1] === 0xb0) {
      events.push({ type: 'color-change', arg: bytes[i + 2] });
      i += 3;
      continue;
    }
    const vx = readValue();
    const vy = readValue();
    x += vx.value;
    y += vy.value;
    const flag = vx.flag | vy.flag;
    events.push({ type: flag & 0x20 ? 'trim-jump' : flag & 0x10 ? 'jump' : 'stitch', x, y });
  }
  return { events, end: i };
};

/** Collapse PEC travel records and map trim flags back to plan-level events. */
const pecEvents = (events: (ParsedEvent & { arg?: number })[]): ParsedEvent[] => {
  const out: ParsedEvent[] = [];
  for (const event of events) {
    if (event.type === 'trim-jump' || event.type === 'jump') {
      const previous = out.at(-1);
      if (previous?.type === 'jump') { // merged split travel
        previous.x = event.x;
        previous.y = event.y;
        continue;
      }
      if (event.type === 'trim-jump') out.push({ type: 'trim' });
      out.push({ type: 'jump', x: event.x, y: event.y });
      continue;
    }
    if (event.type === 'color-change') { out.push({ type: 'color-change' }); continue; }
    if (event.type === 'end') { out.push({ type: 'end' }); continue; }
    out.push({ type: 'stitch', x: event.x, y: event.y });
  }
  return out;
};

const u32le = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
const u16le = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const u24le = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

const PEC_HEADER = 512;
const ICON_BYTES = 228;

// --- planToMachineOps --------------------------------------------------------

describe('planToMachineOps', () => {
  it('flattens the plan into hoop-relative machine units with anchors and folded trims', () => {
    const plan = planToMachineOps(twoColorDesign());
    expect(plan.ops).toEqual([
      { type: 'jump', x: 20, y: 10, trim: false },
      { type: 'stitch', x: 20, y: 10 }, // anchor after landing
      { type: 'stitch', x: 50, y: 0 },
      { type: 'stitch', x: 50, y: 50 },
      { type: 'color-change' }, // trailing trim folded into the color stop
      { type: 'jump', x: -100, y: -100, trim: false },
      { type: 'stitch', x: -100, y: -100 },
      { type: 'stitch', x: -100, y: -50 },
      { type: 'jump', x: 0, y: -100, trim: true }, // trim + travel
      { type: 'stitch', x: 0, y: -100 },
      { type: 'stitch', x: 30, y: -100 },
    ]);
    expect(plan.threads).toEqual(['#ffff00', '#000000']);
    expect(plan.bounds).toEqual({ minX: -100, minY: -100, maxX: 50, maxY: 50 });
    expect(plan.end).toEqual({ x: 30, y: -100 });
    expect(plan.stitchCount).toBe(7);
  });

  it('skips hidden regions', () => {
    const design = twoColorDesign();
    design.regions[1].visible = false;
    design.regions[2].visible = false;
    const plan = planToMachineOps(design);
    expect(plan.threads).toEqual(['#ffff00']);
    expect(plan.ops.every(op => op.type !== 'color-change')).toBe(true);
  });

  it('falls back to the plan-bounds center when the hoop has no center', () => {
    const design = makeDesign([
      makeRegion('a', '#ffff00', [cmd('jump', 0, 0), cmd('stitch', 10, 0)]),
    ], { name: 'Custom', centerX: undefined, centerY: undefined });
    const plan = planToMachineOps(design);
    expect(plan.ops[0]).toEqual({ type: 'jump', x: -50, y: 0, trim: false });
    expect(plan.ops.at(-1)).toEqual({ type: 'stitch', x: 50, y: 0 });
  });
});

// --- DST ----------------------------------------------------------------------

describe('encodeDst', () => {
  it('round-trips the stitch plan through Tajima ternary records', () => {
    const design = twoColorDesign();
    const bytes = encodeDst(design, { name: 'TESTDESIGN' });
    const { raw } = parseDst(bytes);

    expect(bytes.length).toBe(512 + raw.length * 3); // parser consumed every record
    expect(dstEvents(raw)).toEqual(expectedEvents(design));
    raw.forEach(record => {
      expect(Math.abs(record.dx)).toBeLessThanOrEqual(DST_MAX_DELTA);
      expect(Math.abs(record.dy)).toBeLessThanOrEqual(DST_MAX_DELTA);
    });
  });

  it('writes a spec-compliant 512-byte header', () => {
    const design = twoColorDesign();
    const bytes = encodeDst(design, { name: 'TESTDESIGN' });
    const { header, raw } = parseDst(bytes);

    expect(header.startsWith('LA:TESTDESIGN      \r')).toBe(true);
    const st = Number(/ST:\s*(\d+)\r/.exec(header)![1]);
    const co = Number(/CO:\s*(\d+)\r/.exec(header)![1]);
    expect(st).toBe(raw.length - 1); // all records except the end record
    expect(co).toBe(raw.filter(record => record.type === 'color-change').length);
    // Extents are written in DST's +Y-up frame; plan bounds are +Y-down.
    expect(Number(/\+X:\s*(\d+)\r/.exec(header)![1])).toBe(50);
    expect(Number(/-X:\s*(\d+)\r/.exec(header)![1])).toBe(100);
    expect(Number(/\+Y:\s*(\d+)\r/.exec(header)![1])).toBe(100);
    expect(Number(/-Y:\s*(\d+)\r/.exec(header)![1])).toBe(50);
    expect(header).toContain('AX:+   30\r');
    expect(header).toContain('AY:+  100\r');
    expect(header).toContain('PD:******\r');
    expect(bytes[header.indexOf('PD:******\r') + 'PD:******\r'.length]).toBe(0x1a);
  });

  it('splits long moves into jumps no record could carry alone', () => {
    // 30 mm straight stitch = 300 units, far beyond the ±121 record limit.
    const design = makeDesign([
      makeRegion('a', '#ffff00', [cmd('stitch', 0, 0), cmd('stitch', 30, 0)]),
    ]);
    const { raw } = parseDst(encodeDst(design));
    const moves = raw.slice(0, -1);
    expect(moves.map(record => record.type)).toEqual(['stitch', 'jump', 'jump', 'stitch']);
    expect(moves.reduce((sum, record) => sum + record.dx, 0)).toBe(300);
    moves.forEach(record => expect(Math.abs(record.dx)).toBeLessThanOrEqual(DST_MAX_DELTA));
  });

  it('refuses to export an empty plan', () => {
    expect(() => encodeDst(makeDesign([]))).toThrow(EmbroideryGenerationError);
  });
});

// --- PES / PEC ------------------------------------------------------------------

describe('encodePes', () => {
  it('wraps a PEC block in a truncated #PES0001 file', () => {
    const design = twoColorDesign();
    const bytes = encodePes(design, { name: 'TESTDESIGN' });

    expect(ascii(bytes.slice(0, 8))).toBe('#PES0001');
    expect(u32le(bytes, 8)).toBe(0x16); // PEC block offset
    const pec = 0x16;
    expect(ascii(bytes.slice(pec, pec + 19))).toBe('LA:TESTDESI        '); // name truncated to 8
    expect(bytes[pec + 19]).toBe(0x0d);
    expect(bytes[pec + 32]).toBe(0xff);
    expect(bytes[pec + 33]).toBe(0x00);
    expect(bytes[pec + 34]).toBe(6); // icon stride
    expect(bytes[pec + 35]).toBe(38); // icon height
    // Thread table: count-1 then Brother chart indices (yellow, black are exact).
    expect(bytes[pec + 48]).toBe(1);
    expect(bytes[pec + 49]).toBe(13);
    expect(bytes[pec + 50]).toBe(20);
  });

  it('round-trips stitches, trims, and color changes through PEC records', () => {
    const design = twoColorDesign();
    const bytes = encodePes(design, { name: 'TESTDESIGN' });
    const block = 0x16 + PEC_HEADER;

    expect(bytes[block]).toBe(0x00);
    expect(bytes[block + 1]).toBe(0x00);
    expect([bytes[block + 5], bytes[block + 6], bytes[block + 7]]).toEqual([0x31, 0xff, 0xf0]);
    expect(u16le(bytes, block + 8)).toBe(150); // width in units
    expect(u16le(bytes, block + 10)).toBe(150); // height in units
    expect(u16le(bytes, block + 12)).toBe(0x1e0);
    expect(u16le(bytes, block + 14)).toBe(0x1b0);

    const { events, end } = parsePecStitches(bytes, block + 16);
    expect(u24le(bytes, block + 2)).toBe(end - block); // block length locates thumbnails
    expect(pecEvents(events)).toEqual(expectedEvents(design));

    // The first color change writes 0x02, the next would write 0x01, ...
    expect(events.find(event => event.type === 'color-change')?.arg).toBe(0x02);
    // Untrimmed travels carry the jump flag; the trimmed one the trim flag.
    expect(events.filter(event => event.type === 'trim-jump')).toHaveLength(1);
    expect(events.filter(event => event.type === 'jump')).toHaveLength(2);
  });

  it('appends framed thumbnails: one main plus one per thread', () => {
    const design = twoColorDesign();
    const bytes = encodePes(design);
    const block = 0x16 + PEC_HEADER;
    const graphics = block + u24le(bytes, block + 2);

    expect(bytes.length).toBe(graphics + ICON_BYTES * 3);
    for (let icon = 0; icon < 3; icon += 1) {
      const start = graphics + icon * ICON_BYTES;
      // Second scanline of the frame is the rounded top border: f0 ff ff ff ff 0f.
      expect([...bytes.slice(start + 6, start + 12)]).toEqual([0xf0, 0xff, 0xff, 0xff, 0xff, 0x0f]);
      // Some design pixels were drawn beyond the frame template.
      const frameBits = 2 * 40 + 2 * 60; // rough frame pixel count upper bound
      let setBits = 0;
      for (let index = 0; index < ICON_BYTES; index += 1) {
        let value = bytes[start + index];
        while (value) { setBits += value & 1; value >>= 1; }
      }
      expect(setBits).toBeGreaterThan(frameBits / 2);
    }
  });

  it('splits travels longer than the 12-bit delta range', () => {
    // 250 mm jump = 2500 units > 2047; must arrive as two travel records.
    const design = makeDesign([
      makeRegion('a', '#ffff00', [
        cmd('stitch', 0, 0),
        cmd('jump', 250, 0),
        cmd('stitch', 250, 1),
      ]),
    ], { name: 'Custom', widthMm: 500, heightMm: 500 });
    const block = 0x16 + PEC_HEADER;
    const { events } = parsePecStitches(encodePes(design), block + 16);
    const jumps = events.filter(event => event.type === 'jump');
    expect(jumps).toHaveLength(2);
    expect(jumps.at(-1)).toMatchObject({ x: 2500, y: 0 });
    expect(events.at(-2)).toMatchObject({ type: 'stitch', x: 2500, y: 10 });
  });

  it('refuses to export an empty plan', () => {
    expect(() => encodePes(makeDesign([]))).toThrow(EmbroideryGenerationError);
  });
});

// --- Generated plans end-to-end ---------------------------------------------

describe('machine export of generated stitch plans', () => {
  const square: VectorObject = {
    id: 'square',
    type: 'path',
    name: 'Square',
    x: 0,
    y: 0,
    width: 40,
    height: 20,
    rotation: 0,
    fill: '#2563eb',
    stroke: 'none',
    strokeWidth: 0,
    opacity: 1,
    visible: true,
    locked: false,
    points: 'M 0 0 L 40 0 L 40 20 L 0 20 Z',
    closed: true,
  };

  const generatedDesign = () => {
    const fill = { ...settings('#2563eb'), stitchType: 'fill' as const, underlay: 'edge-run' as const };
    const commands = generateStitches(square, fill);
    return makeDesign(
      [makeRegion('square', '#2563eb', commands, { settings: fill })],
      { centerX: 20, centerY: 10 },
    );
  };

  it('exports a digitized fill to DST within record limits', () => {
    const design = generatedDesign();
    const plan = planToMachineOps(design);
    const { header, raw } = parseDst(encodeDst(design));

    raw.forEach(record => {
      expect(Math.abs(record.dx)).toBeLessThanOrEqual(DST_MAX_DELTA);
      expect(Math.abs(record.dy)).toBeLessThanOrEqual(DST_MAX_DELTA);
    });
    expect(raw.filter(record => record.type === 'stitch')).toHaveLength(plan.stitchCount);
    expect(Number(/ST:\s*(\d+)\r/.exec(header)![1])).toBe(raw.length - 1);

    let x = 0;
    let y = 0;
    raw.forEach(record => { x += record.dx; y += record.dy; });
    expect({ x, y }).toEqual(plan.end);
  });

  it('exports a digitized fill to PES with consistent structure', () => {
    const design = generatedDesign();
    const plan = planToMachineOps(design);
    const bytes = encodePes(design);
    const block = 0x16 + PEC_HEADER;
    const { events, end } = parsePecStitches(bytes, block + 16);

    expect(u24le(bytes, block + 2)).toBe(end - block);
    expect(bytes.length).toBe(block + (end - block) + ICON_BYTES * 2);
    expect(events.filter(event => event.type === 'stitch')).toHaveLength(plan.stitchCount);
    const last = events.filter(event => event.type !== 'end').at(-1);
    expect(last).toMatchObject({ x: plan.end.x, y: plan.end.y });
  });
});

// --- Capabilities & preflight -------------------------------------------------

describe('exporter capabilities', () => {
  it('marks DST and PES as machine-ready', () => {
    const dst = EMBROIDERY_EXPORTERS.find(exporter => exporter.format === 'DST');
    const pes = EMBROIDERY_EXPORTERS.find(exporter => exporter.format === 'PES');
    expect(dst).toMatchObject({ available: true, machineReady: true });
    expect(pes).toMatchObject({ available: true, machineReady: true });
    for (const format of ['JEF', 'EXP', 'VP3', 'XXX']) {
      expect(EMBROIDERY_EXPORTERS.find(exporter => exporter.format === format))
        .toMatchObject({ available: false, machineReady: false });
    }
  });
});

describe('assignPecThreads', () => {
  it('maps exact Brother chart colors to their indices', () => {
    const { indices, assignments } = assignPecThreads(['#ffff00', '#000000']);
    expect(indices).toEqual([13, 20]);
    expect(assignments.every(assignment => assignment.exact)).toBe(true);
  });

  it('approximates other colors with the red-mean nearest chart entry', () => {
    const { indices, assignments } = assignPecThreads(['#ff0000', '#0000ff']);
    expect(indices).toEqual([5, 21]); // Red, Ultramarine
    expect(assignments.every(assignment => !assignment.exact)).toBe(true);
  });

  it('never collapses two design colors into one chart slot', () => {
    const { indices } = assignPecThreads(['#ff0000', '#fe0000']);
    expect(new Set(indices).size).toBe(2);
  });
});

describe('machineExportPreflight', () => {
  it('errors when there is nothing to export', () => {
    for (const format of ['DST', 'PES'] as const) {
      const warnings = machineExportPreflight(makeDesign([]), format);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].severity).toBe('error');
    }
  });

  it('tells DST users about colorless stops and the trim convention', () => {
    const warnings = machineExportPreflight(twoColorDesign(), 'DST');
    expect(warnings.some(warning => warning.message.includes('no thread colors'))).toBe(true);
    expect(warnings.some(warning => warning.message.includes('3-jump'))).toBe(true);
    expect(warnings.every(warning => warning.severity === 'info')).toBe(true);
  });

  it('lists approximated PES chart colors, and stays quiet for exact ones', () => {
    expect(machineExportPreflight(twoColorDesign(), 'PES')).toEqual([]);
    const red = makeDesign([
      makeRegion('a', '#ff0000', [cmd('jump', 0, 0), cmd('stitch', 5, 0)]),
    ]);
    const warnings = machineExportPreflight(red, 'PES');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('→ Red');
  });
});
