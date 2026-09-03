import { describe, it, expect } from 'vitest';
import { parsePathContours, contoursBounds, pointInContoursEvenOdd, estimateInkWidth } from './pathUtils';

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

describe('estimateInkWidth', () => {
  const rect = (x: number, y: number, w: number, h: number) =>
    `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;

  it('recovers the wall thickness of a square ring (counter subtracts area, adds perimeter)', () => {
    // Outer 100x100, inner 90x90 → a 5-unit wall on every side.
    const estimate = estimateInkWidth(parsePathContours(`${rect(0, 0, 100, 100)} ${rect(5, 5, 90, 90)}`))!;
    expect(estimate.width).toBeCloseTo(5, 1);
    expect(estimate.elongation).toBeGreaterThan(10);
  });

  it('recovers the wall thickness of a round O-glyph ring regardless of winding', () => {
    // Outer R=30 and inner r=20 circles swept the same direction: only
    // even-odd nesting depth (not winding order) makes the inner a hole.
    const ring = 'M 60 30 A 30 30 0 1 1 0 30 A 30 30 0 1 1 60 30 Z M 50 30 A 20 20 0 1 1 10 30 A 20 20 0 1 1 50 30 Z';
    const estimate = estimateInkWidth(parsePathContours(ring))!;
    expect(Math.abs(estimate.width - 10)).toBeLessThan(0.5);
    expect(estimate.elongation).toBeGreaterThan(4);
  });

  it('approximates the stroke width of an I-shaped bar', () => {
    const estimate = estimateInkWidth(parsePathContours(rect(0, 0, 10, 60)))!;
    expect(estimate.width).toBeGreaterThan(8);
    expect(estimate.width).toBeLessThanOrEqual(10);
    expect(estimate.elongation).toBeGreaterThan(2);
  });

  it('measures an H-shaped glyph outline (one contour with notches)', () => {
    // Two 10-wide stems joined by a 10-tall crossbar.
    const h = 'M 0 0 L 10 0 L 10 25 L 30 25 L 30 0 L 40 0 L 40 60 L 30 60 L 30 35 L 10 35 L 10 60 L 0 60 Z';
    const estimate = estimateInkWidth(parsePathContours(h))!;
    expect(estimate.width).toBeGreaterThan(8.5);
    expect(estimate.width).toBeLessThan(10.5);
    expect(estimate.elongation).toBeGreaterThan(3);
  });

  it('treats disjoint strokes (= sign) as additive parallel bars', () => {
    const estimate = estimateInkWidth(parsePathContours(`${rect(0, 0, 60, 8)} ${rect(0, 20, 60, 8)}`))!;
    expect(estimate.area).toBeCloseTo(960, 0);
    expect(estimate.width).toBeGreaterThan(6);
    expect(estimate.width).toBeLessThan(8.01);
  });

  it('adds islands nested at even depth back in (ring with a solid center)', () => {
    const contours = parsePathContours(`${rect(0, 0, 100, 100)} ${rect(5, 5, 90, 90)} ${rect(40, 40, 20, 20)}`);
    const estimate = estimateInkWidth(contours)!;
    expect(estimate.area).toBeCloseTo(1900 + 400, 0);
  });

  it('reports solid blobs as wide, not stroke-like', () => {
    const square = estimateInkWidth(parsePathContours(rect(0, 0, 100, 100)))!;
    expect(square.width).toBeCloseTo(50, 1);
    expect(square.elongation).toBeLessThan(1.6);

    const circle = estimateInkWidth(parsePathContours('M 100 50 A 50 50 0 1 1 0 50 A 50 50 0 1 1 100 50 Z'))!;
    expect(circle.width).toBeGreaterThan(48);
    expect(circle.elongation).toBeLessThan(1.1);
  });

  it('returns null when there is nothing closed to measure', () => {
    expect(estimateInkWidth([])).toBeNull();
    expect(estimateInkWidth(parsePathContours('M 0 0 L 50 25'))).toBeNull();
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
