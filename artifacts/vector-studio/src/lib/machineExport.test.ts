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

// --- Independent PES v6 parser (header, sew sections, addendum) ---------------

const s16 = (value: number) => (value >= 0x8000 ? value - 0x10000 : value);
const f32le = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, true);

interface PesV6 {
  pecOffset: number;
  name: string;
  threads: { r: number; g: number; b: number; description: string }[];
  transX: number;
  transY: number;
  width: number;
  height: number;
  sections: { flag: number; colorCode: number; points: { x: number; y: number }[] }[];
  colorLog: { section: number; colorCode: number }[];
  addendumIndices: number[];
  addendumRgbs: { r: number; g: number; b: number }[];
}

/** Walks the whole v6 layout, asserting every structural marker on the way. */
const parsePesV6 = (bytes: Uint8Array): PesV6 => {
  expect(ascii(bytes.slice(0, 8))).toBe('#PES0060');
  const pecOffset = u32le(bytes, 8);
  let o = 12;
  expect(u16le(bytes, o)).toBe(0x01); // hoop indicator
  o += 2;
  expect(ascii(bytes.slice(o, o + 2))).toBe('02'); // ASCII subversion
  o += 2;
  const readString8 = () => {
    const length = bytes[o];
    const text = ascii(bytes.slice(o + 1, o + 1 + length));
    o += 1 + length;
    return text;
  };
  const name = readString8();
  for (let i = 0; i < 4; i += 1) readString8(); // category/author/keywords/comments
  o += 18 * 2; // design page settings
  o += 1 + bytes[o]; // from-image filename
  o += 6 * 4; // image affine
  o += 3 * 2; // fill/motif/feather pattern counts
  const threadCount = u16le(bytes, o);
  o += 2;
  const threads: PesV6['threads'] = [];
  for (let i = 0; i < threadCount; i += 1) {
    o += 1 + bytes[o]; // catalog number
    const [r, g, b] = [bytes[o], bytes[o + 1], bytes[o + 2]];
    o += 4; // rgb + padding byte
    expect(u32le(bytes, o)).toBe(0x0a); // custom-color thread type
    o += 4;
    const description = readString8();
    o += 1 + bytes[o]; // brand
    o += 1 + bytes[o]; // chart
    threads.push({ r, g, b, description });
  }
  expect(u16le(bytes, o)).toBe(1); // one distinct block object
  o += 2;
  expect([u16le(bytes, o), u16le(bytes, o + 2)]).toEqual([0xffff, 0x0000]); // blocks follow
  o += 4;
  expect(u16le(bytes, o)).toBe(7);
  expect(ascii(bytes.slice(o + 2, o + 9))).toBe('CEmbOne');
  o += 9;
  o += 16; // unused bounding rectangles
  o += 16; // identity scale/rotation
  const transX = f32le(bytes, o);
  const transY = f32le(bytes, o + 4);
  o += 8;
  o += 6; // 1, 0, 0
  const width = u16le(bytes, o);
  const height = u16le(bytes, o + 2);
  o += 4;
  o += 8; // reserved
  const sectionCount = u16le(bytes, o);
  o += 2;
  expect([u16le(bytes, o), u16le(bytes, o + 2)]).toEqual([0xffff, 0x0000]);
  o += 4;
  expect(u16le(bytes, o)).toBe(7);
  expect(ascii(bytes.slice(o + 2, o + 9))).toBe('CSewSeg');
  o += 9;
  const sections: PesV6['sections'] = [];
  for (let i = 0; i < sectionCount; i += 1) {
    if (i > 0) {
      expect(u16le(bytes, o)).toBe(0x8003); // section separator
      o += 2;
    }
    const flag = u16le(bytes, o);
    const colorCode = u16le(bytes, o + 2);
    const count = u16le(bytes, o + 4);
    o += 6;
    const points: { x: number; y: number }[] = [];
    for (let p = 0; p < count; p += 1) {
      points.push({ x: s16(u16le(bytes, o)), y: s16(u16le(bytes, o + 2)) });
      o += 4;
    }
    sections.push({ flag, colorCode, points });
  }
  const logCount = u16le(bytes, o);
  o += 2;
  const colorLog: PesV6['colorLog'] = [];
  for (let i = 0; i < logCount; i += 1) {
    colorLog.push({ section: u16le(bytes, o), colorCode: u16le(bytes, o + 2) });
    o += 4;
  }
  expect([u16le(bytes, o), u16le(bytes, o + 2)]).toEqual([0, 0]); // no more blocks
  o += 4;
  expect([u32le(bytes, o), u32le(bytes, o + 4)]).toEqual([0, 0]); // node/order table
  o += 8;
  for (let i = 0; i < logCount; i += 1) {
    expect(u32le(bytes, o)).toBe(i);
    expect(u32le(bytes, o + 4)).toBe(0);
    o += 8;
  }
  expect(o).toBe(pecOffset); // the sew sections account for every header byte
  // Addendum sits after the PEC block (header + stitch block + thumbnails).
  const blockLength = u24le(bytes, pecOffset + PEC_HEADER + 2);
  const addendum = pecOffset + PEC_HEADER + blockLength + ICON_BYTES * (1 + threadCount);
  expect(bytes[addendum]).toBe(threadCount - 1);
  const addendumIndices = [...bytes.slice(addendum + 1, addendum + 1 + threadCount)];
  const rgbsAt = addendum + 128 + 0x90 * threadCount;
  const addendumRgbs: PesV6['addendumRgbs'] = [];
  for (let i = 0; i < threadCount; i += 1) {
    const value = u24le(bytes, rgbsAt + i * 3);
    addendumRgbs.push({ r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff });
  }
  expect(u16le(bytes, rgbsAt + threadCount * 3)).toBe(0); // v6 trailer
  expect(bytes.length).toBe(rgbsAt + threadCount * 3 + 2);
  return { pecOffset, name, threads, transX, transY, width, height, sections, colorLog, addendumIndices, addendumRgbs };
};

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
  it('writes a PES v6 header whose thread table carries the exact design colors', () => {
    const design = twoColorDesign();
    const parsed = parsePesV6(encodePes(design, { name: 'TESTDESIGN' }));

    expect(parsed.name).toBe('TESTDESIGN');
    expect(parsed.threads).toEqual([
      { r: 255, g: 255, b: 0, description: '#ffff00' },
      { r: 0, g: 0, b: 0, description: '#000000' },
    ]);
    // Bounds are 150×150 units; the CEmbOne affine centers them on the page.
    expect(parsed.width).toBe(150);
    expect(parsed.height).toBe(150);
    expect(parsed.transX).toBe(350 + 1300 / 2 - 75);
    expect(parsed.transY).toBe(100 + 150 + 1800 / 2 - 75);
  });

  it('writes CSewSeg sections that reproduce the machine ops with true color indices', () => {
    const design = twoColorDesign();
    const parsed = parsePesV6(encodePes(design, { name: 'TESTDESIGN' }));

    // Coordinates are relative to the design's bottom-left corner (minX -100,
    // maxY 50): travel connectors carry both endpoints, sewn sections every
    // stitch, and colorCode indexes the v6 thread table above.
    expect(parsed.sections).toEqual([
      { flag: 1, colorCode: 0, points: [{ x: 100, y: -50 }, { x: 120, y: -40 }] },
      { flag: 0, colorCode: 0, points: [{ x: 120, y: -40 }, { x: 150, y: -50 }, { x: 150, y: 0 }] },
      { flag: 1, colorCode: 1, points: [{ x: 150, y: 0 }, { x: 0, y: -150 }] },
      { flag: 0, colorCode: 1, points: [{ x: 0, y: -150 }, { x: 0, y: -100 }] },
      { flag: 1, colorCode: 1, points: [{ x: 0, y: -100 }, { x: 100, y: -150 }] },
      { flag: 0, colorCode: 1, points: [{ x: 100, y: -150 }, { x: 130, y: -150 }] },
    ]);
    expect(parsed.colorLog).toEqual([
      { section: 0, colorCode: 0 },
      { section: 2, colorCode: 1 },
    ]);
  });

  it('keeps the embedded PEC chart mapping and restores true RGBs in the addendum', () => {
    const design = twoColorDesign();
    const bytes = encodePes(design, { name: 'TESTDESIGN' });
    const parsed = parsePesV6(bytes);
    const pec = parsed.pecOffset;

    expect(ascii(bytes.slice(pec, pec + 19))).toBe('LA:TESTDESI        '); // name truncated to 8
    expect(bytes[pec + 19]).toBe(0x0d);
    expect(bytes[pec + 32]).toBe(0xff);
    expect(bytes[pec + 33]).toBe(0x00);
    expect(bytes[pec + 34]).toBe(6); // icon stride
    expect(bytes[pec + 35]).toBe(38); // icon height
    // PEC thread table: count-1 then Brother chart indices (yellow, black are exact).
    expect(bytes[pec + 48]).toBe(1);
    expect(bytes[pec + 49]).toBe(13);
    expect(bytes[pec + 50]).toBe(20);
    // The addendum repeats those chart indices and carries the exact colors.
    expect(parsed.addendumIndices).toEqual([13, 20]);
    expect(parsed.addendumRgbs).toEqual([
      { r: 255, g: 255, b: 0 },
      { r: 0, g: 0, b: 0 },
    ]);
  });

  it('round-trips stitches, trims, and color changes through PEC records', () => {
    const design = twoColorDesign();
    const bytes = encodePes(design, { name: 'TESTDESIGN' });
    const block = u32le(bytes, 8) + PEC_HEADER;

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
    const block = u32le(bytes, 8) + PEC_HEADER;
    const graphics = block + u24le(bytes, block + 2);

    const addendum = 128 + 0x90 * 2 + 3 * 2 + 2; // chart indices + reserved + RGBs + trailer
    expect(bytes.length).toBe(graphics + ICON_BYTES * 3 + addendum);
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
    const bytes = encodePes(design);
    const block = u32le(bytes, 8) + PEC_HEADER;
    const { events } = parsePecStitches(bytes, block + 16);
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

  it('exports a digitized fill to PES where v6 sections and embedded PEC agree with the plan', () => {
    const design = generatedDesign();
    const plan = planToMachineOps(design);
    const bytes = encodePes(design);
    const parsed = parsePesV6(bytes); // asserts the full v6 structure internally
    const block = parsed.pecOffset + PEC_HEADER;
    const { events, end } = parsePecStitches(bytes, block + 16);

    expect(u24le(bytes, block + 2)).toBe(end - block);
    expect(events.filter(event => event.type === 'stitch')).toHaveLength(plan.stitchCount);
    const last = events.filter(event => event.type !== 'end').at(-1);
    expect(last).toMatchObject({ x: plan.end.x, y: plan.end.y });

    // The v6 sew sections reproduce the exact stitch sequence of the plan.
    expect(parsed.threads).toEqual([{ r: 0x25, g: 0x63, b: 0xeb, description: '#2563eb' }]);
    const sewn = parsed.sections
      .filter(section => section.flag === 0)
      .flatMap(section => section.points.map(point => ({
        x: point.x + plan.bounds.minX,
        y: point.y + plan.bounds.maxY,
      })));
    expect(sewn).toEqual(plan.ops.filter(op => op.type === 'stitch').map(op => ({ x: op.x, y: op.y })));
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
    expect(warnings[0].severity).toBe('info');
    // v6 keeps true colors for software; only the machine display approximates.
    expect(warnings[0].message).toContain('exact design colors');
    expect(warnings[0].message).toContain('→ Red');
  });

  describe('hoop fit', () => {
    const hoopWarnings = (design: EmbroideryDesign, format: 'DST' | 'PES' = 'DST') =>
      machineExportPreflight(design, format).filter(warning => warning.message.includes('hoop'));

    it('stays quiet when the design fits inside the hoop', () => {
      for (const format of ['DST', 'PES'] as const) {
        expect(hoopWarnings(twoColorDesign(), format)).toEqual([]);
      }
    });

    it('stays quiet when the design exactly fills the hoop', () => {
      // ±10 mm from the hoop center exactly spans a 20 × 20 mm hoop.
      const design = makeDesign([
        makeRegion('a', '#000000', [
          cmd('jump', -10, -10),
          cmd('stitch', 10, -10),
          cmd('stitch', 10, 10),
          cmd('stitch', -10, 10),
        ]),
      ], { name: '20x20', widthMm: 20, heightMm: 20 });
      expect(hoopWarnings(design)).toEqual([]);
    });

    it('warns with the overhang in mm when the design exceeds the hoop', () => {
      // 15 mm from center against a 10 mm half-hoop → 5 mm overhang.
      const design = makeDesign([
        makeRegion('a', '#000000', [cmd('jump', 0, 0), cmd('stitch', 15, 0)]),
      ], { name: '20x20', widthMm: 20, heightMm: 20 });
      for (const format of ['DST', 'PES'] as const) {
        const warnings = hoopWarnings(design, format);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].severity).toBe('warning');
        expect(warnings[0].message).toContain('5.0 mm');
        expect(warnings[0].message).toContain('20 × 20 mm hoop');
      }
    });

    it('uses the plan-bounds center when the hoop has no center', () => {
      // A 10 mm-wide run far from the artboard center still fits a 20 mm hoop
      // because the plan centers itself when centerX/centerY are absent.
      const fitting = makeDesign([
        makeRegion('a', '#000000', [cmd('jump', 40, 40), cmd('stitch', 50, 40)]),
      ], { name: '20x20', widthMm: 20, heightMm: 20, centerX: undefined, centerY: undefined });
      expect(hoopWarnings(fitting)).toEqual([]);

      // A 30 mm-wide run overflows a 20 mm hoop by 5 mm on each side.
      const overflowing = makeDesign([
        makeRegion('a', '#000000', [cmd('jump', 40, 40), cmd('stitch', 70, 40)]),
      ], { name: '20x20', widthMm: 20, heightMm: 20, centerX: undefined, centerY: undefined });
      const warnings = hoopWarnings(overflowing);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].severity).toBe('warning');
      expect(warnings[0].message).toContain('5.0 mm');
    });
  });
});
