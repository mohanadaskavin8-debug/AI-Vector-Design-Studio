import { VectorObject } from './types';

type BoundsUpdate = Partial<Pick<VectorObject, 'x' | 'y' | 'width' | 'height'>>;

const transformPoint = (
  point: { x: number; y: number },
  from: Pick<VectorObject, 'x' | 'y' | 'width' | 'height'>,
  to: Pick<VectorObject, 'x' | 'y' | 'width' | 'height'>,
) => ({
  x: to.x + (point.x - from.x) * (to.width / Math.max(0.1, from.width)),
  y: to.y + (point.y - from.y) * (to.height / Math.max(0.1, from.height)),
});

const transformTracePathData = (
  data: string,
  from: Pick<VectorObject, 'x' | 'y' | 'width' | 'height'>,
  to: Pick<VectorObject, 'x' | 'y' | 'width' | 'height'>,
) => {
  let coordinateIndex = 0;
  return data.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, token => {
    const value = Number(token);
    const isX = coordinateIndex++ % 2 === 0;
    const next = isX
      ? to.x + (value - from.x) * (to.width / Math.max(0.1, from.width))
      : to.y + (value - from.y) * (to.height / Math.max(0.1, from.height));
    return Number(next.toFixed(4)).toString();
  });
};

/**
 * Updates an object's bounds while keeping absolute path geometry in sync.
 * Traced multi-contour paths only contain M/L coordinates, so their path data
 * can be transformed without changing curve or arc parameters.
 */
export function transformObjectBounds(object: VectorObject, update: BoundsUpdate): VectorObject {
  const to = {
    x: update.x ?? object.x,
    y: update.y ?? object.y,
    width: Math.max(0.1, update.width ?? object.width),
    height: Math.max(0.1, update.height ?? object.height),
  };
  if (to.x === object.x && to.y === object.y && to.width === object.width && to.height === object.height) {
    return object;
  }

  const next: VectorObject = { ...object, ...to };
  if (object.type !== 'path') return next;

  if (object.nodes) {
    next.nodes = object.nodes.map(node => ({
      ...transformPoint(node, object, to),
      ...(node.handleIn ? { handleIn: transformPoint(node.handleIn, object, to) } : {}),
      ...(node.handleOut ? { handleOut: transformPoint(node.handleOut, object, to) } : {}),
    }));
  } else if (object.points && object.traceRole) {
    next.points = transformTracePathData(object.points, object, to);
  }
  return next;
}