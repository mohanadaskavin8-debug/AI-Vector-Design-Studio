import { VectorObject } from './types';
import { generateId } from './utils';
import { nodesToSVGPath } from './pathUtils';

// Helper to check if object is an axis-aligned rectangle (rotation = 0)
export function isAxisAlignedRect(obj: VectorObject): boolean {
  return obj.type === 'rect' && (obj.rotation || 0) === 0;
}

export function objectToPathData(obj: VectorObject): string | null {
  if (obj.rotation !== 0) return null;
  if (obj.type === 'rect') return rectToPath({ x: obj.x, y: obj.y, w: obj.width, h: obj.height });
  if (obj.type === 'ellipse') {
    const rx = obj.width / 2;
    const ry = obj.height / 2;
    const cx = obj.x + rx;
    const cy = obj.y + ry;
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  }
  if (obj.type === 'line') return `M ${obj.x} ${obj.y} L ${obj.x + obj.width} ${obj.y + obj.height}`;
  if (obj.type === 'path') return obj.points || (obj.nodes ? nodesToSVGPath(obj.nodes, obj.closed) : null);
  if (obj.type === 'polygon' && obj.points) return `M ${obj.points.trim().replace(/\s+/g, ' L ').replace(/,/g, ' ')} Z`;
  return null;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectIntersection(r1: Rect, r2: Rect): Rect | null {
  const x = Math.max(r1.x, r2.x);
  const y = Math.max(r1.y, r2.y);
  const r = Math.min(r1.x + r1.w, r2.x + r2.w);
  const b = Math.min(r1.y + r1.h, r2.y + r2.h);
  if (x < r && y < b) {
    return { x, y, w: r - x, h: b - y };
  }
  return null;
}

function rectToPath(r: Rect): string {
  return `M ${r.x} ${r.y} L ${r.x + r.w} ${r.y} L ${r.x + r.w} ${r.y + r.h} L ${r.x} ${r.y + r.h} Z`;
}

function contains(rect: Rect, x: number, y: number) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// Generate the boolean operation as a path object.
// For true complex polygons, we output a path with 'points' (d string format).
export function performBooleanOp(
  op: 'union' | 'intersection' | 'difference' | 'exclusion',
  obj1: VectorObject,
  obj2: VectorObject
): VectorObject | null {
  if (!isAxisAlignedRect(obj1) || !isAxisAlignedRect(obj2)) return null;

  const r1 = { x: obj1.x, y: obj1.y, w: obj1.width, h: obj1.height };
  const r2 = { x: obj2.x, y: obj2.y, w: obj2.width, h: obj2.height };

  const ix = rectIntersection(r1, r2);
  if (!ix && op === 'intersection') return null;

  const xs = [...new Set([r1.x, r1.x + r1.w, r2.x, r2.x + r2.w])].sort((a, b) => a - b);
  const ys = [...new Set([r1.y, r1.y + r1.h, r2.y, r2.y + r2.h])].sort((a, b) => a - b);
  const cells: Rect[] = [];
  for (let xi = 0; xi < xs.length - 1; xi += 1) {
    for (let yi = 0; yi < ys.length - 1; yi += 1) {
      const cell = { x: xs[xi], y: ys[yi], w: xs[xi + 1] - xs[xi], h: ys[yi + 1] - ys[yi] };
      const cx = cell.x + cell.w / 2;
      const cy = cell.y + cell.h / 2;
      const inFirst = contains(r1, cx, cy);
      const inSecond = contains(r2, cx, cy);
      const include =
        op === 'union' ? inFirst || inSecond :
        op === 'intersection' ? inFirst && inSecond :
        op === 'difference' ? inFirst && !inSecond :
        inFirst !== inSecond;
      if (include && cell.w > 0 && cell.h > 0) cells.push(cell);
    }
  }
  if (!cells.length) return null;
  const d = cells.map(rectToPath).join(' ');
  const minX = Math.min(...cells.map(cell => cell.x));
  const minY = Math.min(...cells.map(cell => cell.y));
  const maxX = Math.max(...cells.map(cell => cell.x + cell.w));
  const maxY = Math.max(...cells.map(cell => cell.y + cell.h));

  return {
    ...obj1,
    id: generateId(),
    type: 'path',
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    points: d,
    fill: obj1.fill,
    stroke: obj1.stroke,
  };
}
