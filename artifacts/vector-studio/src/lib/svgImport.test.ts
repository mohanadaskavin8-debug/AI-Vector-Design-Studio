// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseSvgText, isSvgFile } from './svgImport';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`;

describe('parseSvgText', () => {
  it('imports supported shapes as editable layers', () => {
    const { objects, skipped } = parseSvgText(wrap(`
      <rect x="10" y="20" width="30" height="40" fill="#ff0000" />
      <circle cx="50" cy="50" r="25" fill="#00ff00" />
      <path d="M 0 0 L 10 0 L 10 10 Z" fill="#0000ff" />
      <text x="5" y="20" font-size="10">Hello</text>
    `));
    expect(skipped).toBe(0);
    expect(objects.map(o => o.type)).toEqual(['rect', 'ellipse', 'path', 'text']);
    const rect = objects[0];
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([10, 20, 30, 40]);
    expect(rect.fill).toBe('#ff0000');
    const circle = objects[1];
    expect([circle.x, circle.y, circle.width, circle.height]).toEqual([25, 25, 50, 50]);
    expect(objects[3].text).toBe('Hello');
  });

  it('skips transformed elements entirely instead of importing them at the wrong geometry', () => {
    const { objects, skipped } = parseSvgText(wrap(`
      <rect x="0" y="0" width="10" height="10" transform="rotate(45 5 5)" />
      <rect x="20" y="20" width="10" height="10" />
    `));
    expect(skipped).toBe(1);
    expect(objects).toHaveLength(1);
    expect(objects[0].x).toBe(20);
  });

  it('skips animated and scripted content', () => {
    const { objects, skipped } = parseSvgText(wrap(`
      <rect x="0" y="0" width="10" height="10"><animate attributeName="x" to="90" dur="1s" /></rect>
      <ellipse cx="5" cy="5" rx="2" ry="2" />
    `));
    expect(skipped).toBe(1);
    expect(objects).toHaveLength(1);
    expect(objects[0].type).toBe('ellipse');
  });

  it('skips images with external sources but keeps safe data URLs', () => {
    const { objects, skipped } = parseSvgText(wrap(`
      <image href="https://evil.example/x.png" x="0" y="0" width="10" height="10" />
      <image href="data:image/png;base64,AAAA" x="0" y="0" width="10" height="10" />
    `));
    expect(skipped).toBe(1);
    expect(objects).toHaveLength(1);
    expect(objects[0].imageSrc).toBe('data:image/png;base64,AAAA');
  });

  it('throws a friendly error for invalid SVG markup', () => {
    expect(() => parseSvgText('<svg><rect', '“broken.svg”')).toThrow('“broken.svg” is not valid SVG.');
  });
});

describe('isSvgFile', () => {
  it('detects SVG by MIME type or extension', () => {
    expect(isSvgFile(new File([''], 'a.svg', { type: 'image/svg+xml' }))).toBe(true);
    expect(isSvgFile(new File([''], 'logo.SVG', { type: '' }))).toBe(true);
    expect(isSvgFile(new File([''], 'photo.png', { type: 'image/png' }))).toBe(false);
  });
});
