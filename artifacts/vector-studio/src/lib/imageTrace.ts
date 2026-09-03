// Real raster→vector tracing engine.
//
// Converts RGBA pixel data into a small palette of smooth, editable vector
// regions: palette quantization (k-means), connected-region extraction
// (4-connectivity), crack-edge contour tracing with hole support, speckle
// cleanup, simplification (Douglas-Peucker), and curve smoothing.
//
// Deliberately DOM-free so the whole pipeline is unit-testable in node. The
// caller is responsible for rasterizing an image to `Uint8ClampedArray` RGBA
// data (via canvas in the browser).

import type { PathNode, VectorObject } from './types';
import { generateId } from './utils';
import { computeBoundingBox } from './pathUtils';

export type TraceBackgroundMode = 'keep' | 'auto' | 'light' | 'dark';

export interface TraceOptions {
  /** Palette size, 2..8. Photos are simplified to exactly this many flat colors. */
  colors: number;
  /** 0..10. 0 keeps pixel-exact stair-steps; higher values simplify and round contours. */
  smoothing: number;
  /** Minimum region area in traced pixels; smaller specks merge into their surroundings. */
  speckle: number;
  /** Background handling: keep (flag only), auto (border flood), light/dark (by brightness). */
  background: TraceBackgroundMode;
}

export const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  colors: 6,
  smoothing: 4,
  speckle: 10,
  background: 'auto',
};

export const TRACE_MAX_SHAPES = 100;

export interface TracedShape {
  /** Fill color as #rrggbb. */
  color: string;
  /** Filled pixel count at trace resolution (z-order and speckle metric). */
  area: number;
  /** Pixel-space bounding box. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Closed contour loops in pixel coordinates. First loop is the outline; the rest are holes or islands. */
  loops: PathNode[][];
  /** True when this region reads as the image background (large + hugging the border). */
  isBackground: boolean;
}

export interface TraceResult {
  /** Largest area first, so inserting in order stacks small details on top. */
  shapes: TracedShape[];
  /** Palette actually used, as #rrggbb strings. */
  palette: string[];
  width: number;
  height: number;
  /** Specks merged into neighbours during cleanup. */
  speckleMerged: number;
  /** Regions beyond the shape cap that were left out. */
  shapesDropped: number;
  /** True when a background mode removed pixels. */
  backgroundRemoved: boolean;
}

const ALPHA_SOLID = 128;
const EMPTY = -1;

// --- palette -----------------------------------------------------------------

const luminance = (r: number, g: number, b: number) => (r * 299 + g * 587 + b * 114) / 1000;

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** K-means palette over opaque pixels, seeded from a coarse histogram. */
function buildPalette(data: Uint8ClampedArray, width: number, height: number, k: number): number[][] {
  const total = width * height;
  const stride = Math.max(1, Math.floor(total / 60000));
  const samples: number[] = [];
  const bins = new Map<number, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i < total; i += stride) {
    const o = i * 4;
    if (data[o + 3] < ALPHA_SOLID) continue;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    samples.push(r, g, b);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key);
    if (bin) {
      bin.r += r; bin.g += g; bin.b += b; bin.count += 1;
    } else {
      bins.set(key, { r, g, b, count: 1 });
    }
  }
  if (!samples.length) return [];

  // Seed centroids from the most common histogram bins, skipping near-duplicates.
  const ranked = [...bins.values()]
    .map(bin => ({ r: bin.r / bin.count, g: bin.g / bin.count, b: bin.b / bin.count, count: bin.count }))
    .sort((a, b) => b.count - a.count);
  const centroids: number[][] = [];
  for (const minGap of [900, 300, 0]) {
    for (const bin of ranked) {
      if (centroids.length >= k) break;
      const tooClose = centroids.some(c => (c[0] - bin.r) ** 2 + (c[1] - bin.g) ** 2 + (c[2] - bin.b) ** 2 < minGap);
      if (!tooClose) centroids.push([bin.r, bin.g, bin.b]);
    }
    if (centroids.length >= k) break;
  }
  if (!centroids.length) centroids.push([ranked[0].r, ranked[0].g, ranked[0].b]);

  // Lloyd iterations.
  const count = samples.length / 3;
  for (let iter = 0; iter < 10; iter += 1) {
    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (let s = 0; s < count; s += 1) {
      const r = samples[s * 3];
      const g = samples[s * 3 + 1];
      const b = samples[s * 3 + 2];
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const d = (centroids[c][0] - r) ** 2 + (centroids[c][1] - g) ** 2 + (centroids[c][2] - b) ** 2;
        if (d < bestDist) { bestDist = d; best = c; }
      }
      sums[best][0] += r; sums[best][1] += g; sums[best][2] += b; sums[best][3] += 1;
    }
    let moved = 0;
    for (let c = 0; c < centroids.length; c += 1) {
      if (!sums[c][3]) continue;
      const nr = sums[c][0] / sums[c][3];
      const ng = sums[c][1] / sums[c][3];
      const nb = sums[c][2] / sums[c][3];
      moved += Math.abs(nr - centroids[c][0]) + Math.abs(ng - centroids[c][1]) + Math.abs(nb - centroids[c][2]);
      centroids[c] = [nr, ng, nb];
    }
    if (moved < 1) break;
  }

  // Merge near-identical centroids so the palette stays honest.
  const merged: number[][] = [];
  for (const c of centroids) {
    if (!merged.some(m => (m[0] - c[0]) ** 2 + (m[1] - c[1]) ** 2 + (m[2] - c[2]) ** 2 < 64)) merged.push(c);
  }
  return merged;
}

// --- labeling / components -----------------------------------------------------

interface CompInfo {
  id: number;
  label: number;
  size: number;
  minX: number; minY: number; maxX: number; maxY: number;
  borderCells: number;
  /** Any pixel inside the component, used to seed contour scanning. */
  seed: number;
}

function labelComponents(labels: Int16Array, width: number, height: number) {
  const total = width * height;
  const compId = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);
  const comps: CompInfo[] = [];
  for (let start = 0; start < total; start += 1) {
    if (labels[start] === EMPTY || compId[start] !== -1) continue;
    const label = labels[start];
    const id = comps.length;
    const comp: CompInfo = {
      id, label, size: 0,
      minX: width, minY: height, maxX: -1, maxY: -1,
      borderCells: 0, seed: start,
    };
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    compId[start] = id;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = (index - x) / width;
      comp.size += 1;
      if (x < comp.minX) comp.minX = x;
      if (x > comp.maxX) comp.maxX = x;
      if (y < comp.minY) comp.minY = y;
      if (y > comp.maxY) comp.maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) comp.borderCells += 1;
      if (x > 0 && compId[index - 1] === -1 && labels[index - 1] === label) { compId[index - 1] = id; queue[tail++] = index - 1; }
      if (x < width - 1 && compId[index + 1] === -1 && labels[index + 1] === label) { compId[index + 1] = id; queue[tail++] = index + 1; }
      if (y > 0 && compId[index - width] === -1 && labels[index - width] === label) { compId[index - width] = id; queue[tail++] = index - width; }
      if (y < height - 1 && compId[index + width] === -1 && labels[index + width] === label) { compId[index + width] = id; queue[tail++] = index + width; }
    }
    comps.push(comp);
  }
  return { compId, comps };
}

/** Merges components smaller than minArea into their dominant neighbour label. */
function despeckle(labels: Int16Array, width: number, height: number, minArea: number): number {
  if (minArea <= 1) return 0;
  let mergedTotal = 0;
  for (let pass = 0; pass < 4; pass += 1) {
    const { compId, comps } = labelComponents(labels, width, height);
    const small = comps.filter(comp => comp.size < minArea);
    if (!small.length) break;
    const smallSet = new Set(small.map(comp => comp.id));
    // Dominant neighbour label per small component (EMPTY is a valid target).
    const votes = new Map<number, Map<number, number>>();
    small.forEach(comp => votes.set(comp.id, new Map()));
    const vote = (comp: number, label: number) => {
      const map = votes.get(comp)!;
      map.set(label, (map.get(label) ?? 0) + 1);
    };
    for (let index = 0; index < labels.length; index += 1) {
      const id = compId[index];
      if (id === -1 || !smallSet.has(id)) continue;
      const x = index % width;
      const y = (index - x) / width;
      const own = labels[index];
      const consider = (n: number) => {
        if (compId[n] !== id) {
          const neighbour = labels[n];
          if (neighbour !== own || compId[n] === -1) vote(id, neighbour);
          else if (neighbour === own) vote(id, neighbour); // separate blob of same colour still counts
        }
      };
      if (x > 0) consider(index - 1); else vote(id, EMPTY);
      if (x < width - 1) consider(index + 1); else vote(id, EMPTY);
      if (y > 0) consider(index - width); else vote(id, EMPTY);
      if (y < height - 1) consider(index + width); else vote(id, EMPTY);
    }
    const target = new Map<number, number>();
    small.forEach(comp => {
      const map = votes.get(comp.id)!;
      let bestLabel = EMPTY;
      let bestCount = -1;
      map.forEach((countValue, label) => {
        if (countValue > bestCount) { bestCount = countValue; bestLabel = label; }
      });
      target.set(comp.id, bestLabel);
    });
    for (let index = 0; index < labels.length; index += 1) {
      const id = compId[index];
      if (id !== -1 && smallSet.has(id)) labels[index] = target.get(id)! as number;
    }
    mergedTotal += small.length;
  }
  return mergedTotal;
}

// --- background removal ---------------------------------------------------------

/** Flood-removes the dominant border color region; returns count of cleared pixels. */
function removeAutoBackground(labels: Int16Array, width: number, height: number): number {
  const counts = new Map<number, number>();
  const border: number[] = [];
  const push = (index: number) => {
    border.push(index);
    const label = labels[index];
    if (label !== EMPTY) counts.set(label, (counts.get(label) ?? 0) + 1);
  };
  for (let x = 0; x < width; x += 1) { push(x); push((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y += 1) { push(y * width); push(y * width + width - 1); }
  let dominant = EMPTY;
  let best = 0;
  counts.forEach((countValue, label) => {
    if (countValue > best) { best = countValue; dominant = label; }
  });
  if (dominant === EMPTY) return 0;

  const queue = new Int32Array(width * height);
  const seen = new Uint8Array(width * height);
  let tail = 0;
  for (const index of border) {
    if (labels[index] === dominant && !seen[index]) { seen[index] = 1; queue[tail++] = index; }
  }
  let head = 0;
  let removed = 0;
  while (head < tail) {
    const index = queue[head++];
    labels[index] = EMPTY;
    removed += 1;
    const x = index % width;
    const y = (index - x) / width;
    const tryPush = (n: number) => {
      if (!seen[n] && labels[n] === dominant) { seen[n] = 1; queue[tail++] = n; }
    };
    if (x > 0) tryPush(index - 1);
    if (x < width - 1) tryPush(index + 1);
    if (y > 0) tryPush(index - width);
    if (y < height - 1) tryPush(index + width);
  }
  return removed;
}

// --- crack-edge contour tracing ---------------------------------------------------

// Directions: 0=E, 1=S, 2=W, 3=N (y grows downward). Walking keeps the
// component on the RIGHT; turn priority right → straight → left gives strict
// 4-connectivity at diagonal pinch points.
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
// Pixel offsets (from the lattice point) of front-right / front-left per direction.
const FR_X = [0, -1, -1, 0];
const FR_Y = [0, 0, -1, -1];
const FL_X = [0, 0, -1, -1];
const FL_Y = [-1, 0, 0, -1];

/** Traces every boundary loop of every kept component. Loops are lattice-point polygons. */
function traceLoops(
  compId: Int32Array,
  width: number,
  height: number,
  keep: Set<number>,
): Map<number, { x: number; y: number }[][]> {
  const loopsByComp = new Map<number, { x: number; y: number }[][]>();
  // Directed edge visited set: horizontal edges then vertical edges, ×2 directions.
  const hCount = width * (height + 1);
  const vCount = (width + 1) * height;
  const visited = new Uint8Array((hCount + vCount) * 2);
  const edgeKey = (px: number, py: number, dir: number) => {
    if (dir === 0) return (py * width + px) * 2;                         // E along horizontal edge (px,py)-(px+1,py)
    if (dir === 2) return (py * width + (px - 1)) * 2 + 1;               // W along horizontal edge (px-1,py)-(px,py)
    if (dir === 1) return (hCount + py * (width + 1) + px) * 2;          // S along vertical edge (px,py)-(px,py+1)
    return (hCount + (py - 1) * (width + 1) + px) * 2 + 1;               // N along vertical edge (px,py-1)-(px,py)
  };
  const inComp = (px: number, py: number, id: number) =>
    px >= 0 && py >= 0 && px < width && py < height && compId[py * width + px] === id;

  const maxSteps = (hCount + vCount) * 2 + 8;
  for (let index = 0; index < compId.length; index += 1) {
    const id = compId[index];
    if (id === -1 || !keep.has(id)) continue;
    const x = index % width;
    const y = (index - x) / width;
    // Start edge: top crack of a pixel whose upstairs neighbour is outside the component.
    if (inComp(x, y - 1, id)) continue;
    if (visited[edgeKey(x, y, 0)]) continue;

    const points: { x: number; y: number }[] = [];
    let cx = x;
    let cy = y;
    let dir = 0;
    let steps = 0;
    while (steps < maxSteps) {
      steps += 1;
      visited[edgeKey(cx, cy, dir)] = 1;
      points.push({ x: cx, y: cy });
      cx += DX[dir];
      cy += DY[dir];
      const fr = inComp(cx + FR_X[dir], cy + FR_Y[dir], id);
      const fl = inComp(cx + FL_X[dir], cy + FL_Y[dir], id);
      dir = fr ? (fl ? (dir + 3) % 4 : dir) : (dir + 1) % 4;
      if (cx === x && cy === y && dir === 0) break;
    }
    const list = loopsByComp.get(id) ?? [];
    list.push(points);
    loopsByComp.set(id, list);
  }
  return loopsByComp;
}

// --- simplification & smoothing -----------------------------------------------------

type Pt = { x: number; y: number };

/** Removes points that continue the previous direction (closed polygon). */
function mergeCollinear(points: Pt[]): Pt[] {
  const n = points.length;
  if (n < 4) return points.slice();
  const out: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i + n - 1) % n];
    const next = points[(i + 1) % n];
    const cur = points[i];
    const d1x = cur.x - prev.x;
    const d1y = cur.y - prev.y;
    const d2x = next.x - cur.x;
    const d2y = next.y - cur.y;
    if (d1x * d2y - d1y * d2x !== 0 || d1x * d2x + d1y * d2y < 0) out.push(cur);
  }
  return out.length >= 3 ? out : points.slice();
}

function perpendicularDistance(point: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Iterative Douglas-Peucker over an open polyline (keeps both endpoints). */
function simplifyOpen(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points.slice();
  const keepFlags = new Uint8Array(points.length);
  keepFlags[0] = 1;
  keepFlags[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i += 1) {
      const dist = perpendicularDistance(points[i], points[start], points[end]);
      if (dist > maxDist) { maxDist = dist; maxIndex = i; }
    }
    if (maxIndex !== -1 && maxDist > epsilon) {
      keepFlags[maxIndex] = 1;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }
  return points.filter((_, i) => keepFlags[i]);
}

/** Closed-loop simplification: splits at the two most distant anchors, DP each half. */
function simplifyLoop(points: Pt[], epsilon: number): Pt[] {
  if (epsilon <= 0 || points.length < 5) return points;
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < points.length; i += 1) {
    const d = (points[i].x - points[0].x) ** 2 + (points[i].y - points[0].y) ** 2;
    if (d > farDist) { farDist = d; far = i; }
  }
  if (far === 0) return points;
  const half1 = simplifyOpen(points.slice(0, far + 1), epsilon);
  const half2 = simplifyOpen([...points.slice(far), points[0]], epsilon);
  const merged = [...half1.slice(0, -1), ...half2.slice(0, -1)];
  return merged.length >= 3 ? merged : points;
}

/** Turns a polygon into path nodes, smoothing gentle turns and keeping sharp corners. */
function loopToNodes(points: Pt[], smoothing: number): PathNode[] {
  const n = points.length;
  if (smoothing <= 0 || n < 3) return points.map(point => ({ x: point.x, y: point.y }));
  const cornerCos = Math.cos((55 * Math.PI) / 180);
  return points.map((cur, i) => {
    const prev = points[(i + n - 1) % n];
    const next = points[(i + 1) % n];
    const ux = cur.x - prev.x;
    const uy = cur.y - prev.y;
    const vx = next.x - cur.x;
    const vy = next.y - cur.y;
    const lu = Math.hypot(ux, uy) || 1;
    const lv = Math.hypot(vx, vy) || 1;
    const cos = (ux * vx + uy * vy) / (lu * lv);
    if (cos < cornerCos) return { x: cur.x, y: cur.y }; // sharp corner: no handles
    let tx = (next.x - prev.x) / 6;
    let ty = (next.y - prev.y) / 6;
    const tLen = Math.hypot(tx, ty);
    const maxLen = Math.min(lu, lv) * 0.4;
    if (tLen > maxLen && tLen > 0) {
      tx = (tx / tLen) * maxLen;
      ty = (ty / tLen) * maxLen;
    }
    return {
      x: cur.x,
      y: cur.y,
      handleIn: { x: cur.x - tx, y: cur.y - ty },
      handleOut: { x: cur.x + tx, y: cur.y + ty },
    };
  });
}

// --- path building -------------------------------------------------------------

const fmt = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** Serializes closed node loops into SVG path data (evenodd-ready, one subpath per loop). */
export function loopsToPathData(loops: PathNode[][]): string {
  return loops
    .filter(loop => loop.length >= 3)
    .map(loop => {
      let d = `M ${fmt(loop[0].x)} ${fmt(loop[0].y)}`;
      for (let i = 1; i <= loop.length; i += 1) {
        const prev = loop[i - 1];
        const cur = loop[i % loop.length];
        if (prev.handleOut && cur.handleIn) {
          d += ` C ${fmt(prev.handleOut.x)} ${fmt(prev.handleOut.y)}, ${fmt(cur.handleIn.x)} ${fmt(cur.handleIn.y)}, ${fmt(cur.x)} ${fmt(cur.y)}`;
        } else if (i < loop.length) {
          d += ` L ${fmt(cur.x)} ${fmt(cur.y)}`;
        }
      }
      return `${d} Z`;
    })
    .join(' ');
}

// --- main entry ------------------------------------------------------------------

export function traceImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: TraceOptions,
): TraceResult {
  const empty: TraceResult = {
    shapes: [], palette: [], width, height,
    speckleMerged: 0, shapesDropped: 0, backgroundRemoved: false,
  };
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return empty;

  const k = Math.max(2, Math.min(8, Math.round(options.colors)));
  const centroids = buildPalette(data, width, height, k);
  if (!centroids.length) return empty;

  // Label every pixel with its nearest palette entry (or EMPTY for transparency).
  const total = width * height;
  const labels = new Int16Array(total).fill(EMPTY);
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    if (data[o + 3] < ALPHA_SOLID) continue;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < centroids.length; c += 1) {
      const d = (centroids[c][0] - r) ** 2 + (centroids[c][1] - g) ** 2 + (centroids[c][2] - b) ** 2;
      if (d < bestDist) { bestDist = d; best = c; }
    }
    labels[i] = best;
  }

  // Background removal.
  let backgroundRemoved = false;
  if (options.background === 'light' || options.background === 'dark') {
    const drop = new Set<number>();
    centroids.forEach((c, index) => {
      const lum = luminance(c[0], c[1], c[2]);
      if (options.background === 'light' ? lum >= 228 : lum <= 36) drop.add(index);
    });
    if (drop.size && drop.size < centroids.length) {
      for (let i = 0; i < total; i += 1) {
        if (labels[i] !== EMPTY && drop.has(labels[i])) { labels[i] = EMPTY; backgroundRemoved = true; }
      }
    }
  } else if (options.background === 'auto') {
    backgroundRemoved = removeAutoBackground(labels, width, height) > 0;
  }

  // Speckle cleanup.
  const speckleMerged = despeckle(labels, width, height, Math.max(0, options.speckle));

  // Final connected components.
  const { compId, comps } = labelComponents(labels, width, height);
  const minArea = Math.max(1, options.speckle);
  const eligible = comps.filter(comp => comp.size >= minArea);
  eligible.sort((a, b) => b.size - a.size);
  const kept = eligible.slice(0, TRACE_MAX_SHAPES);
  const shapesDropped = eligible.length - kept.length;
  if (!kept.length) return { ...empty, speckleMerged, shapesDropped, backgroundRemoved };

  const keepIds = new Set(kept.map(comp => comp.id));
  const loopsByComp = traceLoops(compId, width, height, keepIds);

  const epsilon = options.smoothing <= 0 ? 0 : 0.4 + options.smoothing * 0.32;
  const borderPerimeter = 2 * (width + height);
  const palette = centroids.map(c => toHex(c[0], c[1], c[2]));

  const shapes: TracedShape[] = [];
  for (const comp of kept) {
    const raw = loopsByComp.get(comp.id);
    if (!raw?.length) continue;
    const loops = raw
      .map(loop => {
        const collinear = mergeCollinear(loop);
        const simplified = simplifyLoop(collinear, epsilon);
        return loopToNodes(simplified, options.smoothing);
      })
      .filter(loop => loop.length >= 3);
    if (!loops.length) continue;
    // Outline first, so downstream consumers can rely on loops[0].
    loops.sort((a, b) => {
      const area = (loop: PathNode[]) => {
        let sum = 0;
        for (let i = 0; i < loop.length; i += 1) {
          const p = loop[i];
          const q = loop[(i + 1) % loop.length];
          sum += p.x * q.y - q.x * p.y;
        }
        return Math.abs(sum) / 2;
      };
      return area(b) - area(a);
    });
    const isBackground = comp.size >= 0.2 * total && comp.borderCells >= 0.2 * borderPerimeter;
    shapes.push({
      color: palette[comp.label],
      area: comp.size,
      bounds: {
        x: comp.minX,
        y: comp.minY,
        width: comp.maxX - comp.minX + 1,
        height: comp.maxY - comp.minY + 1,
      },
      loops,
      isBackground,
    });
  }
  shapes.sort((a, b) => b.area - a.area);

  const usedColors = new Set(shapes.map(shape => shape.color));
  return {
    shapes,
    palette: palette.filter(color => usedColors.has(color)),
    width,
    height,
    speckleMerged,
    shapesDropped,
    backgroundRemoved,
  };
}

// --- converting a trace into editor objects ------------------------------------------

export interface TracePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees; applied around the placement centre and baked into the region geometry. */
  rotation: number;
}

const transformLoop = (
  loop: PathNode[],
  mapPoint: (point: { x: number; y: number }) => { x: number; y: number },
): PathNode[] =>
  loop.map(node => ({
    ...mapPoint(node),
    ...(node.handleIn ? { handleIn: mapPoint(node.handleIn) } : {}),
    ...(node.handleOut ? { handleOut: mapPoint(node.handleOut) } : {}),
  }));

/**
 * Converts traced shapes into grouped, editable path objects placed inside the
 * given rectangle (largest first so small details stack on top). Single-loop
 * shapes keep node data for node editing; multi-loop shapes carry path data with
 * holes, which the renderer fills even-odd.
 */
export function traceResultToObjects(
  result: TraceResult,
  placement: TracePlacement,
  groupId: string = generateId(),
): VectorObject[] {
  if (!result.shapes.length || result.width <= 0 || result.height <= 0) return [];
  const scaleX = placement.width / result.width;
  const scaleY = placement.height / result.height;
  const centerX = placement.x + placement.width / 2;
  const centerY = placement.y + placement.height / 2;
  const angle = ((placement.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const mapPoint = (point: { x: number; y: number }) => {
    const wx = placement.x + point.x * scaleX;
    const wy = placement.y + point.y * scaleY;
    if (!angle) return { x: wx, y: wy };
    const dx = wx - centerX;
    const dy = wy - centerY;
    return { x: centerX + dx * cos - dy * sin, y: centerY + dx * sin + dy * cos };
  };

  let partIndex = 0;
  return result.shapes.map(shape => {
    const loops = shape.loops.map(loop => transformLoop(loop, mapPoint));
    const allNodes = loops.flat();
    const bounds = computeBoundingBox(allNodes);
    partIndex += 1;
    const base: VectorObject = {
      id: generateId(),
      type: 'path',
      name: shape.isBackground ? 'Background' : `Part ${partIndex} · ${shape.color}`,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      rotation: 0,
      fill: shape.color,
      stroke: 'none',
      strokeWidth: 0,
      opacity: 1,
      visible: true,
      locked: false,
      groupId,
      closed: true,
      traceRole: shape.isBackground ? 'background' : 'region',
    };
    if (loops.length === 1) base.nodes = loops[0];
    else base.points = loopsToPathData(loops);
    return base;
  });
}
