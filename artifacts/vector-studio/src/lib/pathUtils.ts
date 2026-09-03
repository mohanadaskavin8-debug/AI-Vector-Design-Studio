import { PathNode } from './types';

export function smoothPathNodes(points: PathNode[]): PathNode[] {
  if (points.length < 2) return points;
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = (next.x - previous.x) / 6;
    const dy = (next.y - previous.y) / 6;
    return {
      x: point.x,
      y: point.y,
      ...(index > 0 ? { handleIn: { x: point.x - dx, y: point.y - dy } } : {}),
      ...(index < points.length - 1 ? { handleOut: { x: point.x + dx, y: point.y + dy } } : {}),
    };
  });
}

export function nodesToSVGPath(nodes: PathNode[], closed: boolean = false): string {
  if (nodes.length === 0) return '';
  let d = `M ${nodes[0].x} ${nodes[0].y}`;
  
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    
    if (prev.handleOut && curr.handleIn) {
      d += ` C ${prev.handleOut.x} ${prev.handleOut.y}, ${curr.handleIn.x} ${curr.handleIn.y}, ${curr.x} ${curr.y}`;
    } else if (prev.handleOut) {
      d += ` Q ${prev.handleOut.x} ${prev.handleOut.y}, ${curr.x} ${curr.y}`;
    } else if (curr.handleIn) {
      d += ` Q ${curr.handleIn.x} ${curr.handleIn.y}, ${curr.x} ${curr.y}`;
    } else {
      d += ` L ${curr.x} ${curr.y}`;
    }
  }
  
  if (closed && nodes.length > 1) {
    const prev = nodes[nodes.length - 1];
    const curr = nodes[0];
    
    if (prev.handleOut && curr.handleIn) {
      d += ` C ${prev.handleOut.x} ${prev.handleOut.y}, ${curr.handleIn.x} ${curr.handleIn.y}, ${curr.x} ${curr.y}`;
    } else {
      d += ' Z';
    }
  }
  
  return d;
}

export function computeBoundingBox(nodes: PathNode[]): { x: number, y: number, width: number, height: number } {
  if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = nodes[0].x;
  let maxX = nodes[0].x;
  let minY = nodes[0].y;
  let maxY = nodes[0].y;

  const check = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  nodes.forEach(n => {
    check(n.x, n.y);
    if (n.handleIn) check(n.handleIn.x, n.handleIn.y);
    if (n.handleOut) check(n.handleOut.x, n.handleOut.y);
  });

  return { x: minX, y: minY, width: Math.max(0.1, maxX - minX), height: Math.max(0.1, maxY - minY) };
}

export function pathDataBounds(data: string): { x: number, y: number, width: number, height: number } {
  const values = (data.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number).filter(Number.isFinite);
  if (values.length < 2) return { x: 0, y: 0, width: 100, height: 100 };
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    xs.push(values[index]);
    ys.push(values[index + 1]);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: Math.max(0.1, maxX - minX), height: Math.max(0.1, maxY - minY) };
}

// ---------------------------------------------------------------------------
// Path-data contour parsing and flattening
//
// Parses full SVG path data (M/L/H/V/C/S/Q/T/A/Z, absolute and relative) into
// polyline contours suitable for even-odd containment tests, stitch scanline
// fills, and accurate bounds. Curves are flattened adaptively.
// ---------------------------------------------------------------------------

export interface PathContour {
  points: { x: number; y: number }[];
  closed: boolean;
}

type Pt = { x: number; y: number };

/** Scans numbers (and single-digit arc flags) out of one command's argument string. */
class NumberScanner {
  private index = 0;
  constructor(private readonly text: string) {}

  private skipSeparators() {
    while (this.index < this.text.length && /[\s,]/.test(this.text[this.index])) this.index += 1;
  }

  hasMore(): boolean {
    this.skipSeparators();
    return this.index < this.text.length;
  }

  nextNumber(): number | null {
    this.skipSeparators();
    const rest = this.text.slice(this.index);
    const match = rest.match(/^[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/i);
    if (!match) return null;
    this.index += match[0].length;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
  }

  /** Arc flags may be written compactly ("11" = two flags); read exactly one digit. */
  nextFlag(): number | null {
    this.skipSeparators();
    const character = this.text[this.index];
    if (character === '0' || character === '1') {
      this.index += 1;
      return Number(character);
    }
    return null;
  }
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

const flattenCubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, out: Pt[]) => {
  const control = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
  const steps = Math.min(24, Math.max(4, Math.ceil(control / 2.5)));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
};

const flattenQuadratic = (p0: Pt, p1: Pt, p2: Pt, out: Pt[]) => {
  const control = dist(p0, p1) + dist(p1, p2);
  const steps = Math.min(20, Math.max(4, Math.ceil(control / 2.5)));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
};

const flattenArc = (
  from: Pt,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: number,
  sweep: number,
  to: Pt,
  out: Pt[],
) => {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-9 || ry < 1e-9 || (from.x === to.x && from.y === to.y)) {
    out.push(to);
    return;
  }
  const phi = (rotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }
  const sign = largeArc !== sweep ? 1 : -1;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / Math.max(denominator, 1e-12)));
  const cxp = (coefficient * rx * y1p) / ry;
  const cyp = (-coefficient * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2;

  const angleBetween = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let angle = Math.acos(Math.min(1, Math.max(-1, dot / Math.max(len, 1e-12))));
    if (ux * vy - uy * vx < 0) angle = -angle;
    return angle;
  };

  const startAngle = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let deltaAngle = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && deltaAngle > 0) deltaAngle -= 2 * Math.PI;
  if (sweep && deltaAngle < 0) deltaAngle += 2 * Math.PI;

  const steps = Math.max(4, Math.ceil(Math.abs(deltaAngle) / (Math.PI / 12)));
  for (let step = 1; step <= steps; step += 1) {
    const theta = startAngle + (deltaAngle * step) / steps;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    out.push({
      x: cx + rx * cosTheta * cosPhi - ry * sinTheta * sinPhi,
      y: cy + rx * cosTheta * sinPhi + ry * sinTheta * cosPhi,
    });
  }
  out[out.length - 1] = to;
};

/**
 * Parses SVG path data into flattened polyline contours.
 * Each `M` begins a new contour; `Z` marks the contour closed.
 */
export function parsePathContours(data: string): PathContour[] {
  const contours: PathContour[] = [];
  if (!data) return contours;

  let current: Pt[] = [];
  let currentClosed = false;
  let cursor: Pt = { x: 0, y: 0 };
  let contourStart: Pt = { x: 0, y: 0 };
  let previousCubicControl: Pt | null = null;
  let previousQuadraticControl: Pt | null = null;

  const flush = () => {
    if (current.length >= 2) {
      contours.push({ points: current, closed: currentClosed });
    }
    current = [];
    currentClosed = false;
  };

  const commandPattern = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match: RegExpExecArray | null;
  while ((match = commandPattern.exec(data)) !== null) {
    const command = match[1];
    const scanner = new NumberScanner(match[2]);
    const isRelative = command === command.toLowerCase();
    const upper = command.toUpperCase();

    if (upper !== 'C' && upper !== 'S') previousCubicControl = null;
    if (upper !== 'Q' && upper !== 'T') previousQuadraticControl = null;

    if (upper === 'Z') {
      if (current.length >= 2) {
        currentClosed = true;
        flush();
      } else {
        current = [];
        currentClosed = false;
      }
      cursor = { ...contourStart };
      current = [];
      continue;
    }

    let firstPair = upper === 'M';
    for (;;) {
      if (!scanner.hasMore()) break;
      if (upper === 'M') {
        const x = scanner.nextNumber();
        const y = scanner.nextNumber();
        if (x === null || y === null) break;
        const point = isRelative ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        if (firstPair) {
          flush();
          contourStart = point;
          current = [point];
          firstPair = false;
        } else {
          current.push(point);
        }
        cursor = point;
      } else if (upper === 'L') {
        const x = scanner.nextNumber();
        const y = scanner.nextNumber();
        if (x === null || y === null) break;
        const point = isRelative ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        if (!current.length) { current = [cursor]; contourStart = cursor; }
        current.push(point);
        cursor = point;
      } else if (upper === 'H' || upper === 'V') {
        const value = scanner.nextNumber();
        if (value === null) break;
        const point = upper === 'H'
          ? { x: isRelative ? cursor.x + value : value, y: cursor.y }
          : { x: cursor.x, y: isRelative ? cursor.y + value : value };
        if (!current.length) { current = [cursor]; contourStart = cursor; }
        current.push(point);
        cursor = point;
      } else if (upper === 'C' || upper === 'S') {
        let c1: Pt;
        if (upper === 'C') {
          const x1 = scanner.nextNumber();
          const y1 = scanner.nextNumber();
          if (x1 === null || y1 === null) break;
          c1 = isRelative ? { x: cursor.x + x1, y: cursor.y + y1 } : { x: x1, y: y1 };
        } else {
          c1 = previousCubicControl
            ? { x: 2 * cursor.x - previousCubicControl.x, y: 2 * cursor.y - previousCubicControl.y }
            : { ...cursor };
        }
        const x2 = scanner.nextNumber();
        const y2 = scanner.nextNumber();
        const x = scanner.nextNumber();
        const y = scanner.nextNumber();
        if (x2 === null || y2 === null || x === null || y === null) break;
        const c2 = isRelative ? { x: cursor.x + x2, y: cursor.y + y2 } : { x: x2, y: y2 };
        const end = isRelative ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        if (!current.length) { current = [cursor]; contourStart = cursor; }
        flattenCubic(cursor, c1, c2, end, current);
        previousCubicControl = c2;
        cursor = end;
      } else if (upper === 'Q' || upper === 'T') {
        let control: Pt;
        if (upper === 'Q') {
          const x1 = scanner.nextNumber();
          const y1 = scanner.nextNumber();
          if (x1 === null || y1 === null) break;
          control = isRelative ? { x: cursor.x + x1, y: cursor.y + y1 } : { x: x1, y: y1 };
        } else {
          control = previousQuadraticControl
            ? { x: 2 * cursor.x - previousQuadraticControl.x, y: 2 * cursor.y - previousQuadraticControl.y }
            : { ...cursor };
        }
        const x = scanner.nextNumber();
        const y = scanner.nextNumber();
        if (x === null || y === null) break;
        const end = isRelative ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        if (!current.length) { current = [cursor]; contourStart = cursor; }
        flattenQuadratic(cursor, control, end, current);
        previousQuadraticControl = control;
        cursor = end;
      } else if (upper === 'A') {
        const rx = scanner.nextNumber();
        const ry = scanner.nextNumber();
        const rotation = scanner.nextNumber();
        const largeArc = scanner.nextFlag();
        const sweep = scanner.nextFlag();
        const x = scanner.nextNumber();
        const y = scanner.nextNumber();
        if (rx === null || ry === null || rotation === null || largeArc === null || sweep === null || x === null || y === null) break;
        const end = isRelative ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        if (!current.length) { current = [cursor]; contourStart = cursor; }
        flattenArc(cursor, rx, ry, rotation, largeArc, sweep, end, current);
        cursor = end;
      } else {
        break;
      }
    }
  }
  flush();
  return contours;
}

/** Accurate bounds over flattened contour points (curves included). */
export function contoursBounds(contours: PathContour[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  contours.forEach(contour => contour.points.forEach(point => {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }));
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: Math.max(0.1, maxX - minX), height: Math.max(0.1, maxY - minY) };
}

// ---------------------------------------------------------------------------
// Ink-width estimation
//
// Estimates how wide the *inked* area of a shape is, treating multi-contour
// paths with even-odd fill semantics (letter counters subtract area but add
// perimeter). For stroke-like shapes — letter stems, rings, narrow bars —
// 2·area/perimeter converges on the true stroke width; for solid blobs it
// approaches half the diameter, which the elongation ratio disambiguates.
// ---------------------------------------------------------------------------

export interface InkWidthEstimate {
  /** Effective stroke width of the inked area: 2·area/perimeter (same units as the contours). */
  width: number;
  /**
   * Isoperimetric elongation: perimeter² / (4π·area). 1 for a solid circle,
   * ~1.27 for a square; grows with aspect ratio and with holes, so values
   * above ~1.6 indicate a consistently narrow, stroke-like shape.
   */
  elongation: number;
  /** Net even-odd filled area (holes subtracted). */
  area: number;
  /** Total boundary length across every closed contour (holes included). */
  perimeter: number;
}

const polygonArea = (points: Pt[]): number => {
  let doubled = 0;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
    doubled += points[previous].x * points[current].y - points[current].x * points[previous].y;
  }
  return Math.abs(doubled) / 2;
};

const polygonPerimeter = (points: Pt[]): number => {
  let length = 0;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
    length += dist(points[previous], points[current]);
  }
  return length;
};

const pointInSinglePolygon = (point: Pt, polygon: Pt[]): boolean => {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
};

/**
 * Estimates the effective ink width of a set of closed contours under
 * even-odd fill. Contours nested at odd depth (counters, ring holes) subtract
 * area; every boundary contributes perimeter — winding order is irrelevant.
 * Returns null when there is no closed, positive-area geometry to measure.
 */
export function estimateInkWidth(contours: PathContour[]): InkWidthEstimate | null {
  const closed = contours.filter(contour => contour.closed && contour.points.length >= 3);
  if (!closed.length) return null;

  let perimeter = 0;
  let area = 0;
  closed.forEach((contour, index) => {
    const contourArea = polygonArea(contour.points);
    perimeter += polygonPerimeter(contour.points);
    let depth = 0;
    closed.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      if (pointInSinglePolygon(contour.points[0], other.points)) depth += 1;
    });
    area += depth % 2 === 0 ? contourArea : -contourArea;
  });

  if (area <= 1e-6 || perimeter <= 1e-6) return null;
  return {
    width: (2 * area) / perimeter,
    elongation: (perimeter * perimeter) / (4 * Math.PI * area),
    area,
    perimeter,
  };
}

/** Even-odd containment across a set of closed contours. */
export function pointInContoursEvenOdd(point: { x: number; y: number }, contours: PathContour[]): boolean {
  let inside = false;
  for (const contour of contours) {
    const points = contour.points;
    for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
      const a = points[current];
      const b = points[previous];
      const crosses = (a.y > point.y) !== (b.y > point.y)
        && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
      if (crosses) inside = !inside;
    }
  }
  return inside;
}
