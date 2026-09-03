// Machine-format stitch exporters: Tajima DST and Brother PES (embedded PEC).
//
// Both encoders flatten the visible stitch plan in machine order and emit
// coordinates in machine units (0.1 mm) relative to the hoop center — the
// position where embroidery machines park the needle before the first stitch.
// Byte-level layouts follow the community-documented formats as implemented by
// the widely machine-tested pyembroidery stack (used by Ink/Stitch):
//   DST — 512-byte ASCII header, then ternary-coded 3-byte records
//         (max ±121 units per record, +Y up, trims via the 3-jump convention).
//   PES — "#PES0060" (PES v6): header with exact RGB thread definitions,
//         CEmbOne/CSewSeg sew sections, then the PEC block (512-byte header
//         with palette indices, stitch section with 7-bit short / 12-bit long
//         deltas, 48×38 px thumbnails) and the v6 color addendum. Brother
//         machines stitch from the embedded PEC and approximate colors to the
//         64-entry chart; editing software reads the v6 sections and shows the
//         design's true colors.
// Pure module — no DOM access — so exporters stay unit-testable.

import {
  EmbroideryDesign,
  EmbroideryGenerationError,
  EMBROIDERY_PX_PER_MM,
  PreflightWarning,
  commandsBounds,
} from './embroidery';

export const MACHINE_UNITS_PER_MM = 10;
/** Largest delta a single DST record can carry (81 + 27 + 9 + 3 + 1). */
export const DST_MAX_DELTA = 121;
/** Largest delta a PEC long-form value can carry (12-bit two's complement). */
export const PEC_MAX_DELTA = 2047;

export type MachineExportFormat = 'DST' | 'PES';

export type MachineOp =
  | { type: 'stitch'; x: number; y: number }
  /** `trim` cuts the thread at the current position before travelling. */
  | { type: 'jump'; x: number; y: number; trim: boolean }
  | { type: 'color-change' };

export interface MachinePlan {
  ops: MachineOp[];
  /** Thread sequence: entry 0 is the initial thread, one more per change. */
  threads: string[];
  /** Extents over stitch/jump targets, machine units, +Y down (screen space). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Needle position after the final movement. */
  end: { x: number; y: number };
  stitchCount: number;
}

export interface MachineExportOptions {
  /** Design name embedded in the file header (machine display). */
  name?: string;
}

type Point = { x: number; y: number };

const pxToUnits = (px: number) => Math.round((px * MACHINE_UNITS_PER_MM) / EMBROIDERY_PX_PER_MM);

const resolveHoopCenterPx = (design: EmbroideryDesign, commands: { x: number; y: number; type: string }[]): Point => {
  const bounds = commandsBounds(commands as Parameters<typeof commandsBounds>[0]);
  return {
    x: design.hoop.centerX ?? bounds.x + bounds.width / 2,
    y: design.hoop.centerY ?? bounds.y + bounds.height / 2,
  };
};

/**
 * Interpolated integer waypoints from `from` to `to` so no single step exceeds
 * `limit` units on either axis. Long moves become several records — the
 * standard "split into jumps" handling for machine formats.
 */
const splitMove = (from: Point, to: Point, limit: number): Point[] => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / limit));
  const points: Point[] = [];
  for (let step = 1; step <= steps; step += 1) {
    points.push({ x: from.x + Math.round((dx * step) / steps), y: from.y + Math.round((dy * step) / steps) });
  }
  return points;
};

/**
 * Flatten the visible plan into machine ops in 0.1 mm hoop-relative units.
 *
 * Mapping rules (shared by every machine format):
 * - Plan `color-change` markers: the first defines the initial thread (no op —
 *   machines start threaded); later markers become COLOR_CHANGE ops.
 * - Plan `trim` commands fold into the next jump (`trim: true`). A trim right
 *   before a color change or at the end of the design is dropped because color
 *   stops and the end-of-design stop already cut the thread.
 * - After a jump lands, a zero-delta anchor stitch is inserted so the first
 *   run point is actually penetrated (jumps move the frame without sewing).
 * - Zero-motion jumps are dropped; positions are tracked as integers so
 *   rounding never accumulates.
 */
export const planToMachineOps = (design: EmbroideryDesign): MachinePlan => {
  const visibleRegions = design.regions.filter(region => region.visible);
  const commands = visibleRegions.flatMap(region => region.commands);
  const center = resolveHoopCenterPx(design, commands);
  const fallbackThread = visibleRegions[0]?.settings.color.hex ?? '#000000';

  const ops: MachineOp[] = [];
  const threads: string[] = [];
  let current: Point = { x: 0, y: 0 };
  let pendingTrim = false;
  let hasMoved = false;
  let stitchCount = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const track = (point: Point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };
  const pushStitch = (point: Point) => {
    ops.push({ type: 'stitch', x: point.x, y: point.y });
    stitchCount += 1;
    track(point);
  };
  /** Jumps do not sew; anchor the landing point before sewing on from it. */
  const anchorAfterJump = () => {
    const last = ops.at(-1);
    if (last && last.type === 'jump') pushStitch({ x: last.x, y: last.y });
  };

  for (const command of commands) {
    if (command.type === 'color-change') {
      const hex = (command.threadHex ?? fallbackThread).toLowerCase();
      if (threads.length === 0) {
        threads.push(hex);
      } else {
        anchorAfterJump();
        ops.push({ type: 'color-change' });
        threads.push(hex);
      }
      pendingTrim = false; // Color stops cut the thread on their own.
      continue;
    }
    if (command.type === 'trim') {
      if (hasMoved) pendingTrim = true;
      continue;
    }
    const target: Point = { x: pxToUnits(command.x - center.x), y: pxToUnits(command.y - center.y) };
    if (command.type === 'jump') {
      if (target.x === current.x && target.y === current.y && !pendingTrim) continue;
      ops.push({ type: 'jump', x: target.x, y: target.y, trim: pendingTrim });
      track(target);
      pendingTrim = false;
    } else {
      if (threads.length === 0) threads.push(fallbackThread.toLowerCase());
      if (pendingTrim) {
        // A trim followed directly by sewing: cut in place, then continue.
        ops.push({ type: 'jump', x: current.x, y: current.y, trim: true });
        pendingTrim = false;
      }
      const last = ops.at(-1);
      if (last && last.type === 'jump' && (last.x !== target.x || last.y !== target.y)) anchorAfterJump();
      pushStitch(target);
    }
    current = target;
    hasMoved = true;
  }
  // A trailing trim is implied by the end-of-design stop.

  const hasBounds = minX !== Infinity;
  return {
    ops,
    threads,
    bounds: hasBounds ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    end: current,
    stitchCount,
  };
};

// --- Shared byte helpers ----------------------------------------------------

const pushAscii = (out: number[], text: string) => {
  for (let index = 0; index < text.length; index += 1) out.push(text.charCodeAt(index) & 0x7f);
};
const pushU16le = (out: number[], value: number) => {
  out.push(value & 0xff, (value >> 8) & 0xff);
};
const pushU24le = (out: number[], value: number) => {
  out.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff);
};
const pushU32le = (out: number[], value: number) => {
  out.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
};
const pushF32le = (out: number[], value: number) => {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  out.push(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
};
/** PES length-prefixed strings: u8 length (string8) / u16le length (string16). */
const pushPesString8 = (out: number[], text: string) => {
  const value = text.slice(0, 255);
  out.push(value.length);
  pushAscii(out, value);
};
const pushPesString16 = (out: number[], text: string) => {
  pushU16le(out, text.length);
  pushAscii(out, text);
};
const repeat = (out: number[], byte: number, count: number) => {
  for (let index = 0; index < count; index += 1) out.push(byte);
};

const sanitizeName = (name: string | undefined, maxLength: number) => {
  const cleaned = (name ?? '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim();
  return (cleaned || 'UNTITLED').slice(0, maxLength);
};

const requireStitches = (plan: MachinePlan) => {
  if (!plan.stitchCount) {
    throw new EmbroideryGenerationError('There are no visible stitches to export. Digitize artwork or unhide regions first.');
  }
};

// --- DST (Tajima) -----------------------------------------------------------

const DST_HEADER_SIZE = 512;

type DstRecordFlag = 'stitch' | 'jump' | 'color-change' | 'end';

/**
 * Ternary-code one 3-byte DST record. DST's +Y axis points up, so the
 * screen-space dy is negated here. Deltas decompose into ±81/±27/±9/±3/±1
 * contributions, one bit per magnitude and direction.
 */
export const encodeDstRecord = (dx: number, dy: number, flag: DstRecordFlag): [number, number, number] => {
  if (flag === 'color-change') return [0, 0, 0b11000011];
  if (flag === 'end') return [0, 0, 0b11110011];
  let x = dx;
  let y = -dy;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0b00000011;
  if (flag === 'jump') b2 |= 0b10000000;
  if (x > 40) { b2 |= 0b0100; x -= 81; }
  if (x < -40) { b2 |= 0b1000; x += 81; }
  if (x > 13) { b1 |= 0b0100; x -= 27; }
  if (x < -13) { b1 |= 0b1000; x += 27; }
  if (x > 4) { b0 |= 0b0100; x -= 9; }
  if (x < -4) { b0 |= 0b1000; x += 9; }
  if (x > 1) { b1 |= 0b01; x -= 3; }
  if (x < -1) { b1 |= 0b10; x += 3; }
  if (x > 0) { b0 |= 0b01; x -= 1; }
  if (x < 0) { b0 |= 0b10; x += 1; }
  if (y > 40) { b2 |= 0b100000; y -= 81; }
  if (y < -40) { b2 |= 0b010000; y += 81; }
  if (y > 13) { b1 |= 0b100000; y -= 27; }
  if (y < -13) { b1 |= 0b010000; y += 27; }
  if (y > 4) { b0 |= 0b100000; y -= 9; }
  if (y < -4) { b0 |= 0b010000; y += 9; }
  if (y > 1) { b1 |= 0b10000000; y -= 3; }
  if (y < -1) { b1 |= 0b01000000; y += 3; }
  if (y > 0) { b0 |= 0b10000000; y -= 1; }
  if (y < 0) { b0 |= 0b01000000; y += 1; }
  if (x !== 0 || y !== 0) {
    throw new EmbroideryGenerationError(`DST records cannot move more than ${DST_MAX_DELTA} units (${DST_MAX_DELTA / MACHINE_UNITS_PER_MM} mm) at once.`);
  }
  return [b0, b1, b2];
};

export const encodeDst = (design: EmbroideryDesign, options: MachineExportOptions = {}): Uint8Array<ArrayBuffer> => {
  const plan = planToMachineOps(design);
  requireStitches(plan);

  const body: number[] = [];
  let records = 0;
  let colorChanges = 0;
  let current: Point = { x: 0, y: 0 };
  const emit = (dx: number, dy: number, flag: DstRecordFlag) => {
    const record = encodeDstRecord(dx, dy, flag);
    body.push(record[0], record[1], record[2]);
    records += 1;
    current = { x: current.x + dx, y: current.y + dy };
  };

  for (const op of plan.ops) {
    if (op.type === 'color-change') {
      emit(0, 0, 'color-change');
      colorChanges += 1;
      continue;
    }
    if (op.type === 'jump' && op.trim) {
      // Tajima convention: three tiny net-zero jumps signal a thread trim.
      emit(2, 2, 'jump');
      emit(-4, -4, 'jump');
      emit(2, 2, 'jump');
    }
    const segments = splitMove(current, op, DST_MAX_DELTA);
    segments.forEach((point, index) => {
      const isFinalStitch = op.type === 'stitch' && index === segments.length - 1;
      emit(point.x - current.x, point.y - current.y, isFinalStitch ? 'stitch' : 'jump');
    });
  }

  // Header extents come from the plan bounds (reference-writer behavior: the
  // ±2-unit trim wobble is not counted) and are spec'd in DST's +Y-up frame.
  const { minX, minY, maxX, maxY } = plan.bounds;
  const upMax = -minY;
  const upMin = -maxY;
  const pad = (value: number, width: number) => String(value).padStart(width);
  const signed = (value: number, width: number) => `${value < 0 ? '-' : '+'}${pad(Math.abs(value), width)}`;
  const header =
    `LA:${sanitizeName(options.name, 16).padEnd(16)}\r` +
    `ST:${pad(records, 7)}\r` +
    `CO:${pad(colorChanges, 3)}\r` +
    `+X:${pad(Math.max(0, maxX), 5)}\r` +
    `-X:${pad(Math.max(0, -minX), 5)}\r` +
    `+Y:${pad(Math.max(0, upMax), 5)}\r` +
    `-Y:${pad(Math.max(0, -upMin), 5)}\r` +
    `AX:${signed(current.x, 5)}\r` +
    `AY:${signed(-current.y, 5)}\r` +
    `MX:${signed(0, 5)}\r` +
    `MY:${signed(0, 5)}\r` +
    `PD:******\r`;

  const out: number[] = [];
  pushAscii(out, header);
  out.push(0x1a);
  repeat(out, 0x20, DST_HEADER_SIZE - out.length);
  out.push(...body);
  out.push(0, 0, 0b11110011); // End-of-design record.
  return Uint8Array.from(out);
};

// --- PES / PEC (Brother) ----------------------------------------------------

export interface PecPaletteEntry {
  /** 1-based position in the Brother 64-color chart (index 0 is reserved). */
  index: number;
  r: number;
  g: number;
  b: number;
  name: string;
}

export const PEC_THREAD_PALETTE: PecPaletteEntry[] = [
  [14, 31, 124, 'Prussian Blue'], [10, 85, 163, 'Blue'], [0, 135, 119, 'Teal Green'],
  [75, 107, 175, 'Cornflower Blue'], [237, 23, 31, 'Red'], [209, 92, 0, 'Reddish Brown'],
  [145, 54, 151, 'Magenta'], [228, 154, 203, 'Light Lilac'], [145, 95, 172, 'Lilac'],
  [158, 214, 125, 'Mint Green'], [232, 169, 0, 'Deep Gold'], [254, 186, 53, 'Orange'],
  [255, 255, 0, 'Yellow'], [112, 188, 31, 'Lime Green'], [186, 152, 0, 'Brass'],
  [168, 168, 168, 'Silver'], [125, 111, 0, 'Russet Brown'], [255, 255, 179, 'Cream Brown'],
  [79, 85, 86, 'Pewter'], [0, 0, 0, 'Black'], [11, 61, 145, 'Ultramarine'],
  [119, 1, 118, 'Royal Purple'], [41, 49, 51, 'Dark Gray'], [42, 19, 1, 'Dark Brown'],
  [246, 74, 138, 'Deep Rose'], [178, 118, 36, 'Light Brown'], [252, 187, 197, 'Salmon Pink'],
  [254, 55, 15, 'Vermilion'], [240, 240, 240, 'White'], [106, 28, 138, 'Violet'],
  [168, 221, 196, 'Seacrest'], [37, 132, 187, 'Sky Blue'], [254, 179, 67, 'Pumpkin'],
  [255, 243, 107, 'Cream Yellow'], [208, 166, 96, 'Khaki'], [209, 84, 0, 'Clay Brown'],
  [102, 186, 73, 'Leaf Green'], [19, 74, 70, 'Peacock Blue'], [135, 135, 135, 'Gray'],
  [216, 204, 198, 'Warm Gray'], [67, 86, 7, 'Dark Olive'], [253, 217, 222, 'Flesh Pink'],
  [249, 147, 188, 'Pink'], [0, 56, 34, 'Deep Green'], [178, 175, 212, 'Lavender'],
  [104, 106, 176, 'Wisteria Violet'], [239, 227, 185, 'Beige'], [247, 56, 102, 'Carmine'],
  [181, 75, 100, 'Amber Red'], [19, 43, 26, 'Olive Green'], [199, 1, 86, 'Dark Fuchsia'],
  [254, 158, 50, 'Tangerine'], [168, 222, 235, 'Light Blue'], [0, 103, 62, 'Emerald Green'],
  [78, 41, 144, 'Purple'], [47, 126, 32, 'Moss Green'], [255, 204, 204, 'Flesh Pink'],
  [255, 217, 17, 'Harvest Gold'], [9, 91, 166, 'Electric Blue'], [240, 249, 112, 'Lemon Yellow'],
  [227, 243, 91, 'Fresh Green'], [255, 153, 0, 'Orange'], [255, 240, 141, 'Cream Yellow'],
  [255, 200, 200, 'Applique'],
].map(([r, g, b, name], index) => ({ index: index + 1, r: r as number, g: g as number, b: b as number, name: name as string }));

const parseHexColor = (hex: string): { r: number; g: number; b: number } => {
  const long = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (long) {
    const value = parseInt(long[1], 16);
    return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
  }
  const short = /^#?([0-9a-f]{3})$/i.exec(hex.trim());
  if (short) {
    const [r, g, b] = short[1].split('').map(ch => parseInt(ch + ch, 16));
    return { r, g, b };
  }
  return { r: 0, g: 0, b: 0 };
};

/** Perceptual "red-mean" RGB distance — the metric Brother chart matching uses. */
const colorDistance = (a: { r: number; g: number; b: number }, entry: PecPaletteEntry) => {
  const redMean = Math.round((a.r + entry.r) / 2);
  const dr = a.r - entry.r;
  const dg = a.g - entry.g;
  const db = a.b - entry.b;
  return (((512 + redMean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - redMean) * db * db) >> 8);
};

export interface PecThreadAssignment {
  hex: string;
  paletteIndex: number;
  paletteName: string;
  exact: boolean;
}

/**
 * Map the thread sequence onto the 64-color Brother chart. Each distinct
 * design color claims its nearest still-unclaimed chart entry so two design
 * colors never collapse into one machine color.
 */
export const assignPecThreads = (threads: string[]): { indices: number[]; assignments: PecThreadAssignment[] } => {
  const used = new Set<number>();
  const byHex = new Map<string, PecThreadAssignment>();
  for (const thread of threads) {
    const key = thread.toLowerCase();
    if (byHex.has(key)) continue;
    const rgb = parseHexColor(key);
    let best: { entry: PecPaletteEntry; distance: number } | null = null;
    for (const entry of PEC_THREAD_PALETTE) {
      if (used.has(entry.index) && used.size < PEC_THREAD_PALETTE.length) continue;
      const distance = colorDistance(rgb, entry);
      if (!best || distance < best.distance) best = { entry, distance };
    }
    const chosen = best!;
    used.add(chosen.entry.index);
    byHex.set(key, {
      hex: key,
      paletteIndex: chosen.entry.index,
      paletteName: chosen.entry.name,
      exact: chosen.distance === 0,
    });
  }
  return {
    indices: threads.map(thread => byHex.get(thread.toLowerCase())!.paletteIndex),
    assignments: [...byHex.values()],
  };
};

const PEC_ICON_WIDTH = 48;
const PEC_ICON_HEIGHT = 38;
const PEC_ICON_BYTES = (PEC_ICON_WIDTH / 8) * PEC_ICON_HEIGHT;
/**
 * Rounded-rectangle frame Brother machines expect around each thumbnail,
 * one 6-byte hex row per 48-pixel scanline (LSB-first within each byte).
 */
const PEC_THUMBNAIL_FRAME_ROWS: string[] = [
  '000000000000',
  'f0ffffffff0f',
  '080000000010',
  '040000000020',
  ...Array.from({ length: 30 }, () => '020000000040'),
  '040000000020',
  '080000000010',
  'f0ffffffff0f',
  '000000000000',
];

const pecFrameBytes = (() => {
  const hex = PEC_THUMBNAIL_FRAME_ROWS.join('');
  const bytes: number[] = [];
  for (let index = 0; index < hex.length; index += 2) bytes.push(parseInt(hex.slice(index, index + 2), 16));
  return bytes;
})();

const drawPecThumbnail = (points: Point[], bounds: MachinePlan['bounds'], margin: number): number[] => {
  const graphic = [...pecFrameBytes];
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min((PEC_ICON_WIDTH - margin) / width, (PEC_ICON_HEIGHT - margin) / height);
  const translateX = PEC_ICON_WIDTH / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
  const translateY = PEC_ICON_HEIGHT / 2 - ((bounds.minY + bounds.maxY) / 2) * scale;
  points.forEach(point => {
    const x = Math.floor(point.x * scale + translateX);
    const y = Math.floor(point.y * scale + translateY);
    if (x >= 0 && x < PEC_ICON_WIDTH && y >= 0 && y < PEC_ICON_HEIGHT) {
      graphic[y * (PEC_ICON_WIDTH / 8) + (x >> 3)] |= 1 << (x & 7);
    }
  });
  return graphic;
};

const PEC_JUMP_CODE = 0x10;
const PEC_TRIM_CODE = 0x20;

/** Short form: single 7-bit two's complement byte. Long form: 12-bit value with flag bits. */
const pushPecValue = (out: number[], value: number, long: boolean, flag: number) => {
  if (!long && value > -64 && value < 63) {
    out.push(value & 0x7f);
    return;
  }
  let encoded = value & 0x0fff;
  encoded |= 0x8000;
  encoded |= flag << 8;
  out.push((encoded >> 8) & 0xff, encoded & 0xff);
};

const encodePecStitches = (plan: MachinePlan): number[] => {
  const out: number[] = [];
  let current: Point = { x: 0, y: 0 };
  let colorTwo = true;
  for (const op of plan.ops) {
    if (op.type === 'color-change') {
      out.push(0xfe, 0xb0, colorTwo ? 0x02 : 0x01);
      colorTwo = !colorTwo;
      continue;
    }
    const segments = splitMove(current, op, PEC_MAX_DELTA);
    segments.forEach((point, index) => {
      const dx = point.x - current.x;
      const dy = point.y - current.y;
      const isFinalStitch = op.type === 'stitch' && index === segments.length - 1;
      if (isFinalStitch) {
        pushPecValue(out, dx, false, 0);
        pushPecValue(out, dy, false, 0);
      } else {
        // Travels: the first segment carries the trim flag when the plan cut
        // the thread; the rest (and plain travels) use the jump flag.
        const flag = op.type === 'jump' && op.trim && index === 0 ? PEC_TRIM_CODE : PEC_JUMP_CODE;
        pushPecValue(out, dx, true, flag);
        pushPecValue(out, dy, true, flag);
      }
      current = point;
    });
  }
  out.push(0xff); // End of stitch section.
  return out;
};

const encodePecHeader = (plan: MachinePlan, name: string | undefined): number[] => {
  const { indices } = assignPecThreads(plan.threads);
  if (indices.length > 255) {
    throw new EmbroideryGenerationError('PES supports at most 255 thread blocks.');
  }
  const out: number[] = [];
  pushAscii(out, `LA:${sanitizeName(name, 8).padEnd(16)}\r`);
  repeat(out, 0x20, 12);
  out.push(0xff, 0x00);
  out.push(PEC_ICON_WIDTH / 8, PEC_ICON_HEIGHT);
  repeat(out, 0x20, 12);
  out.push(indices.length - 1, ...indices);
  repeat(out, 0x20, 463 - indices.length);
  return out;
};

const encodePecBlock = (plan: MachinePlan): number[] => {
  const stitches = encodePecStitches(plan);
  const out: number[] = [];
  out.push(0x00, 0x00);
  // Length of this block (16-byte mini header + stitch bytes); the thumbnail
  // graphics start right after, which is how machines locate them.
  pushU24le(out, 16 + stitches.length);
  out.push(0x31, 0xff, 0xf0);
  pushU16le(out, Math.max(0, plan.bounds.maxX - plan.bounds.minX));
  pushU16le(out, Math.max(0, plan.bounds.maxY - plan.bounds.minY));
  pushU16le(out, 0x1e0);
  pushU16le(out, 0x1b0);
  out.push(...stitches);
  return out;
};

const encodePecGraphics = (plan: MachinePlan): number[] => {
  const allStitchPoints: Point[] = [];
  const perThread: Point[][] = plan.threads.map(() => []);
  let threadIndex = 0;
  for (const op of plan.ops) {
    if (op.type === 'color-change') {
      threadIndex = Math.min(threadIndex + 1, perThread.length - 1);
    } else if (op.type === 'stitch') {
      const point = { x: op.x, y: op.y };
      allStitchPoints.push(point);
      perThread[threadIndex]?.push(point);
    }
  }
  const out: number[] = [];
  out.push(...drawPecThumbnail(allStitchPoints, plan.bounds, 4));
  perThread.forEach(points => out.push(...drawPecThumbnail(points, plan.bounds, 5)));
  return out;
};

/** Full PEC body (header, stitch block, thumbnails) — shared by PES and .pec. */
const encodePec = (plan: MachinePlan, name: string | undefined): number[] => [
  ...encodePecHeader(plan, name),
  ...encodePecBlock(plan),
  ...encodePecGraphics(plan),
];

// --- PES v6 sew sections ------------------------------------------------------
// Layout mirrors the reference writer's write_version_6: a v6 header carrying
// full RGB thread definitions, one CEmbOne/CSewSeg block pair with the flat
// stitch geometry, a node/order table, the PEC block machines stitch from, and
// the color addendum. Editing software reads its palette from the v6 thread
// table, so exact design colors survive even though the PEC block still maps
// to the 64-entry Brother chart.

interface PesSewSection {
  /** 0 = sewn polyline, 1 = jump/travel connector. */
  flag: 0 | 1;
  /** 0-based index into the v6 thread table (first occurrence of the color). */
  colorCode: number;
  points: Point[];
}

/**
 * Group machine ops into CSewSeg sections: consecutive stitches form one sewn
 * section, a travel (with any split continuations) becomes a two-point jump
 * section, and color changes advance the thread without emitting a section.
 * The color log records the section index of every thread transition.
 */
const buildSewSections = (plan: MachinePlan): {
  sections: PesSewSection[];
  colorLog: { section: number; colorCode: number }[];
} => {
  const sections: PesSewSection[] = [];
  let threadIndex = 0;
  let position: Point = { x: 0, y: 0 };
  let previousType: 'jump' | 'stitch' | null = null;
  for (const op of plan.ops) {
    if (op.type === 'color-change') {
      threadIndex = Math.min(threadIndex + 1, plan.threads.length - 1);
      previousType = null;
      continue;
    }
    const colorCode = plan.threads.indexOf(plan.threads[threadIndex]);
    const point = { x: op.x, y: op.y };
    if (op.type === 'jump') {
      // Consecutive travels extend the same connector to its final landing.
      if (previousType === 'jump') sections.at(-1)!.points[1] = point;
      else sections.push({ flag: 1, colorCode, points: [{ ...position }, point] });
    } else if (previousType === 'stitch') {
      sections.at(-1)!.points.push(point);
    } else {
      sections.push({ flag: 0, colorCode, points: [point] });
    }
    position = point;
    previousType = op.type;
  }
  const colorLog: { section: number; colorCode: number }[] = [];
  sections.forEach((section, index) => {
    if (!colorLog.length || colorLog.at(-1)!.colorCode !== section.colorCode) {
      colorLog.push({ section: index, colorCode: section.colorCode });
    }
  });
  return { sections, colorLog };
};

const writePesHeaderV6 = (out: number[], plan: MachinePlan, name: string | undefined) => {
  pushU16le(out, 0x01); // Hoop size indicator.
  pushAscii(out, '02'); // Two-digit ASCII subversion.
  pushPesString8(out, sanitizeName(name, 16)); // Design name.
  repeat(out, 0x00, 4); // Empty category / author / keywords / comments strings.
  // Design page settings, verbatim from the reference writer (editing software
  // treats these as workspace preferences, not design geometry).
  const settings = [
    0x00, // OptimizeHoopChange = false
    0x00, // DesignPageIsCustom = false
    0x64, // hoop width (mm)
    0x64, // hoop height (mm)
    0x00, // UseExistingDesignArea = false
    0xc8, // design width
    0xc8, // design height
    0x64, // design page section width
    0x64, // design page section height
    0x64, // p6
    0x07, // design page background color
    0x13, // design page foreground color
    0x01, // ShowGrid
    0x01, // WithAxes
    0x00, // SnapToGrid
    100,  // GridInterval
    0x01, // p9
    0x00, // OptimizeEntryExitPoints
  ];
  settings.forEach(value => pushU16le(out, value));
  out.push(0x00); // No from-image filename.
  [1, 0, 0, 1, 0, 0].forEach(value => pushF32le(out, value)); // Identity image affine.
  pushU16le(out, 0); // No programmable fill patterns.
  pushU16le(out, 0); // No motif patterns.
  pushU16le(out, 0); // No feather patterns.
  // The thread table carrying the design's true colors: one entry per thread
  // block, exact RGB plus the hex code as the thread description.
  pushU16le(out, plan.threads.length);
  for (const hex of plan.threads) {
    const { r, g, b } = parseHexColor(hex);
    out.push(0x00); // Empty catalog number.
    out.push(r, g, b, 0x00);
    pushU32le(out, 0x0a); // Thread type: custom color.
    pushPesString8(out, hex);
    out.push(0x00, 0x00); // Empty brand / chart strings.
  }
  pushU16le(out, 1); // One distinct block object (the CEmbOne below).
};

const writeEmbOne = (out: number[], plan: MachinePlan, sectionCount: number) => {
  pushPesString16(out, 'CEmbOne');
  const width = plan.bounds.maxX - plan.bounds.minX;
  const height = plan.bounds.maxY - plan.bounds.minY;
  repeat(out, 0x00, 16); // Two unused bounding rectangles.
  [1, 0, 0, 1].forEach(value => pushF32le(out, value)); // Identity scale/rotation.
  // Translation centering the design on the reference writer's 130×180 page.
  pushF32le(out, 350 + 1300 / 2 - width / 2);
  pushF32le(out, 100 + height + 1800 / 2 - height / 2);
  pushU16le(out, 1);
  pushU16le(out, 0);
  pushU16le(out, 0);
  pushU16le(out, width);
  pushU16le(out, height);
  repeat(out, 0x00, 8);
  pushU16le(out, sectionCount);
};

const writeSewSeg = (
  out: number[],
  bounds: MachinePlan['bounds'],
  sections: PesSewSection[],
  colorLog: { section: number; colorCode: number }[],
) => {
  pushPesString16(out, 'CSewSeg');
  // Section coordinates are relative to the design's bottom-left corner:
  // x in [0, width], y in [-height, 0] (two's complement in the u16 write).
  const adjustX = bounds.minX;
  const adjustY = bounds.maxY;
  sections.forEach((section, index) => {
    if (index > 0) pushU16le(out, 0x8003); // Section separator.
    pushU16le(out, section.flag);
    pushU16le(out, section.colorCode);
    pushU16le(out, section.points.length);
    for (const point of section.points) {
      pushU16le(out, point.x - adjustX);
      pushU16le(out, point.y - adjustY);
    }
  });
  pushU16le(out, colorLog.length);
  for (const entry of colorLog) {
    pushU16le(out, entry.section);
    pushU16le(out, entry.colorCode);
  }
};

/**
 * v6 color addendum after the PEC block: the PEC chart-index list — including
 * its leading count-1 byte, exactly as it appears in the PEC header — padded
 * with 0x20 to 128 bytes, a 0x90-byte reserved block per thread, then each
 * thread's true color as a 24-bit little-endian RGB value, and a u16 trailer.
 * Verified byte-identical to pyembroidery's write_version_6 output for the
 * same design (its write_pec_header returns the index list with the count-1
 * byte already inserted at position 0, and write_pes_addendum writes that
 * list verbatim).
 */
const writePesAddendum = (out: number[], plan: MachinePlan) => {
  const { indices } = assignPecThreads(plan.threads);
  const list = [indices.length - 1, ...indices];
  out.push(...list);
  repeat(out, 0x20, 128 - list.length);
  repeat(out, 0x00, 0x90 * plan.threads.length);
  for (const hex of plan.threads) {
    const { r, g, b } = parseHexColor(hex);
    pushU24le(out, (r << 16) | (g << 8) | b);
  }
};

export const encodePes = (design: EmbroideryDesign, options: MachineExportOptions = {}): Uint8Array<ArrayBuffer> => {
  const plan = planToMachineOps(design);
  requireStitches(plan);
  const out: number[] = [];
  pushAscii(out, '#PES0060');
  const pecOffsetAt = out.length;
  pushU32le(out, 0); // Patched below once the PEC block position is known.
  writePesHeaderV6(out, plan, options.name);
  pushU16le(out, 0xffff);
  pushU16le(out, 0x0000); // FFFF 0000: sew section blocks follow.
  const { sections, colorLog } = buildSewSections(plan);
  writeEmbOne(out, plan, sections.length);
  pushU16le(out, 0xffff);
  pushU16le(out, 0x0000);
  writeSewSeg(out, plan.bounds, sections, colorLog);
  pushU16le(out, 0x0000);
  pushU16le(out, 0x0000); // 0000 0000: no more blocks.
  // v6 node/order table: one identity entry per color transition.
  pushU32le(out, 0);
  pushU32le(out, 0);
  colorLog.forEach((_, index) => {
    pushU32le(out, index);
    pushU32le(out, 0);
  });
  const pecStart = out.length;
  out[pecOffsetAt] = pecStart & 0xff;
  out[pecOffsetAt + 1] = (pecStart >> 8) & 0xff;
  out[pecOffsetAt + 2] = (pecStart >> 16) & 0xff;
  out[pecOffsetAt + 3] = (pecStart >> 24) & 0xff;
  out.push(...encodePec(plan, options.name));
  writePesAddendum(out, plan);
  pushU16le(out, 0x0000); // v6 trailer.
  return Uint8Array.from(out);
};

// --- Preflight --------------------------------------------------------------

/** Format-specific warnings for anything the machine file cannot represent. */
export const machineExportPreflight = (design: EmbroideryDesign, format: MachineExportFormat): PreflightWarning[] => {
  const plan = planToMachineOps(design);
  if (!plan.stitchCount) {
    return [{
      severity: 'error',
      message: `Nothing to export — the plan has no visible stitches.`,
      recommendation: 'Digitize artwork in the Regions tab or unhide regions first.',
    }];
  }
  const warnings: PreflightWarning[] = [];
  const hasTrims = plan.ops.some(op => op.type === 'jump' && op.trim);
  if (format === 'DST') {
    const shown = plan.threads.slice(0, 8).join(', ');
    warnings.push({
      severity: 'info',
      message: 'DST stores color stops but no thread colors.',
      recommendation: `Load threads at the machine in region order: ${shown}${plan.threads.length > 8 ? ', …' : ''}.`,
    });
    if (hasTrims) {
      warnings.push({
        severity: 'info',
        message: 'Trims are encoded as the Tajima 3-jump convention.',
        recommendation: 'Enable jump-count trimming on machines that do not cut automatically.',
      });
    }
  } else {
    if (plan.threads.length > 255) {
      warnings.push({
        severity: 'error',
        message: `${plan.threads.length} thread blocks exceed the PES limit of 255.`,
        recommendation: 'Merge same-color regions before exporting.',
      });
    }
    const { assignments } = assignPecThreads(plan.threads);
    const approximate = assignments.filter(assignment => !assignment.exact);
    if (approximate.length) {
      warnings.push({
        severity: 'info',
        message: `Editing software sees the exact design colors (stored in the PES 6 sections); only the machine's own display approximates them to the Brother chart: ${approximate.map(a => `${a.hex} → ${a.paletteName}`).join(', ')}.`,
        recommendation: 'No action needed — expect the chart names above on the machine display only.',
      });
    }
  }
  return warnings;
};
