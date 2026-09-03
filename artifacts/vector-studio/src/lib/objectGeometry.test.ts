import { describe, expect, it } from 'vitest';
import { transformObjectBounds } from './objectGeometry';
import { VectorObject } from './types';

const tracedPart = (partial: Partial<VectorObject> = {}): VectorObject => ({
  id: 'part',
  type: 'path',
  name: 'Part',
  x: 10,
  y: 20,
  width: 20,
  height: 20,
  rotation: 0,
  fill: '#ff0000',
  stroke: 'none',
  strokeWidth: 0,
  opacity: 1,
  visible: true,
  locked: false,
  closed: true,
  traceRole: 'region',
  ...partial,
});

describe('transformObjectBounds', () => {
  it('moves node-based traced paths with their bounds', () => {
    const result = transformObjectBounds(tracedPart({
      nodes: [{ x: 10, y: 20 }, { x: 30, y: 40, handleIn: { x: 25, y: 35 } }],
    }), { x: 50, y: 70 });
    expect(result.nodes).toEqual([
      { x: 50, y: 70 },
      { x: 70, y: 90, handleIn: { x: 65, y: 85 } },
    ]);
  });

  it('resizes multi-contour trace path data', () => {
    const result = transformObjectBounds(tracedPart({
      points: 'M 10 20 L 30 20 L 30 40 Z M 15 25 L 20 25 Z',
    }), { x: 0, y: 0, width: 40, height: 10 });
    expect(result.points).toBe('M 0 0 L 40 0 L 40 10 Z M 10 2.5 L 20 2.5 Z');
  });
});