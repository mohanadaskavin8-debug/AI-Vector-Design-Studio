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
