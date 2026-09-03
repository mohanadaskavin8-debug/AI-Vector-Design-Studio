import { describe, it, expect } from 'vitest';
import { parsePathContours, contoursBounds, pointInContoursEvenOdd } from './pathUtils';

// Square ring: outer 100x100 square with a 40x40 hole in the middle.
const RING = 'M 0 0 L 100 0 L 100 100 L 0 100 Z M 30 30 L 70 30 L 70 70 L 30 70 Z';

describe('parsePathContours', () => {
  it('parses multiple subpaths as separate closed contours', () => {
    const contours = parsePathContours(RING);
    expect(contours).toHaveLength(2);
    expect(contours[0].closed).toBe(true);
    expect(contours[1].closed).toBe(true);
    const bounds = contoursBounds(contours);
    expect(bounds).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('handles relative commands', () => {
    const contours = parsePathContours('m 10 10 l 20 0 l 0 20 z');
    expect(contours).toHaveLength(1);
    expect(contours[0].closed).toBe(true);
    const bounds = contoursBounds(contours);
    expect(bounds.x).toBeCloseTo(10);
    expect(bounds.y).toBeCloseTo(10);
    expect(bounds.width).toBeCloseTo(20);
    expect(bounds.height).toBeCloseTo(20);
  });

  it('handles horizontal/vertical shorthands and open contours', () => {
    const contours = parsePathContours('M 0 0 H 50 V 25');
    expect(contours).toHaveLength(1);
    expect(contours[0].closed).toBe(false);
    const points = contours[0].points;
    expect(points[0]).toMatchObject({ x: 0, y: 0 });
    expect(points[points.length - 1].x).toBeCloseTo(50);
    expect(points[points.length - 1].y).toBeCloseTo(25);
  });

  it('flattens cubic curves with faithful extents', () => {
    const contours = parsePathContours('M 0 0 C 0 100 100 100 100 0');
    expect(contours).toHaveLength(1);
    const points = contours[0].points;
    expect(points.length).toBeGreaterThan(4);
    const maxY = Math.max(...points.map(point => point.y));
    // Cubic with both control points at y=100 peaks at y=75.
    expect(maxY).toBeGreaterThan(72);
    expect(maxY).toBeLessThan(78);
    expect(points[points.length - 1].x).toBeCloseTo(100, 1);
  });

  it('flattens quadratic curves', () => {
    const contours = parsePathContours('M 0 0 Q 50 100 100 0');
    const maxY = Math.max(...contours[0].points.map(point => point.y));
    // Quadratic peak at t=0.5 is y=50.
    expect(maxY).toBeGreaterThan(47);
    expect(maxY).toBeLessThan(53);
  });

  it('flattens arcs with correct extents and endpoints', () => {
    const contours = parsePathContours('M 0 0 A 50 50 0 0 1 100 0');
    expect(contours).toHaveLength(1);
    const points = contours[0].points;
    expect(points.length).toBeGreaterThan(5);
    const bounds = contoursBounds(contours);
    expect(bounds.width).toBeCloseTo(100, 0);
    expect(Math.abs(bounds.height - 50)).toBeLessThan(2);
    expect(points[points.length - 1].x).toBeCloseTo(100, 1);
    expect(points[points.length - 1].y).toBeCloseTo(0, 1);
  });

  it('survives compact arc-flag syntax', () => {
    // Flags packed against the following coordinates, as emitted by many tools.
    const contours = parsePathContours('M 0 0 a50 50 0 01100 0');
    expect(contours).toHaveLength(1);
    const bounds = contoursBounds(contours);
    expect(bounds.width).toBeCloseTo(100, 0);
  });
});

describe('pointInContoursEvenOdd', () => {
  const contours = parsePathContours(RING);

  it('reports the ring band as inside', () => {
    expect(pointInContoursEvenOdd({ x: 15, y: 50 }, contours)).toBe(true);
    expect(pointInContoursEvenOdd({ x: 50, y: 85 }, contours)).toBe(true);
  });

  it('keeps the hole empty (even-odd)', () => {
    expect(pointInContoursEvenOdd({ x: 50, y: 50 }, contours)).toBe(false);
  });

  it('reports points outside the outer contour as outside', () => {
    expect(pointInContoursEvenOdd({ x: 150, y: 50 }, contours)).toBe(false);
    expect(pointInContoursEvenOdd({ x: -10, y: -10 }, contours)).toBe(false);
  });
});
