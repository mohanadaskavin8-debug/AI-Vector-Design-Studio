// Bundled, open-licensed outline fonts used for "Convert to outlines".
//
// The editor offers five font families. Inter ships as-is; the other system
// families map to metric-compatible (or closest) open-licensed alternatives
// from Fontsource, because proprietary outlines cannot be bundled:
//   Arial        -> Arimo          (metric-compatible)
//   Georgia      -> Gelasio        (metric-compatible)
//   Courier New  -> Courier Prime  (metric-compatible)
//   Trebuchet MS -> Inter          (closest bundled match)
// WOFF (v1) files are used because opentype.js cannot decode WOFF2.

import type { Font } from 'opentype.js';

import inter400Url from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import inter700Url from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import arimo400Url from '@fontsource/arimo/files/arimo-latin-400-normal.woff?url';
import arimo700Url from '@fontsource/arimo/files/arimo-latin-700-normal.woff?url';
import gelasio400Url from '@fontsource/gelasio/files/gelasio-latin-400-normal.woff?url';
import gelasio700Url from '@fontsource/gelasio/files/gelasio-latin-700-normal.woff?url';
import courierPrime400Url from '@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff?url';
import courierPrime700Url from '@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff?url';

export type BundledFamily = 'Inter' | 'Arimo' | 'Gelasio' | 'Courier Prime';

const BUNDLED_FILES: Record<BundledFamily, { 400: string; 700: string }> = {
  Inter: { 400: inter400Url, 700: inter700Url },
  Arimo: { 400: arimo400Url, 700: arimo700Url },
  Gelasio: { 400: gelasio400Url, 700: gelasio700Url },
  'Courier Prime': { 400: courierPrime400Url, 700: courierPrime700Url },
};

interface FamilyMapping {
  family: BundledFamily;
  /** True when the bundled outline matches the requested family's glyph shapes. */
  matchesRequested: boolean;
  /** True for metric-compatible substitutes (same widths, different name). */
  metricCompatible: boolean;
}

const FAMILY_MAP: Record<string, FamilyMapping> = {
  inter: { family: 'Inter', matchesRequested: true, metricCompatible: true },
  arial: { family: 'Arimo', matchesRequested: false, metricCompatible: true },
  georgia: { family: 'Gelasio', matchesRequested: false, metricCompatible: true },
  'courier new': { family: 'Courier Prime', matchesRequested: false, metricCompatible: true },
  'trebuchet ms': { family: 'Inter', matchesRequested: false, metricCompatible: false },
};

export interface ResolvedBundledFont {
  requestedFamily: string;
  requestedWeight: number;
  family: BundledFamily;
  weight: 400 | 700;
  /** False when the requested family is not bundled and a substitute is used. */
  familyExact: boolean;
  /** True when the substitute keeps the requested family's metrics. */
  metricCompatible: boolean;
  /** False when the requested weight has no bundled file (e.g. 500 -> 400). */
  weightExact: boolean;
}

const parseWeight = (fontWeight?: string): number => {
  if (!fontWeight || fontWeight === 'normal') return 400;
  if (fontWeight === 'bold') return 700;
  const numeric = Number(fontWeight);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 400;
};

export function resolveBundledFont(fontFamily?: string, fontWeight?: string): ResolvedBundledFont {
  const requestedFamily = (fontFamily || 'Inter').trim();
  const mapping = FAMILY_MAP[requestedFamily.toLowerCase()]
    ?? { family: 'Inter' as const, matchesRequested: false, metricCompatible: false };
  const requestedWeight = parseWeight(fontWeight);
  const weight: 400 | 700 = requestedWeight >= 600 ? 700 : 400;
  return {
    requestedFamily,
    requestedWeight,
    family: mapping.family,
    weight,
    familyExact: mapping.matchesRequested,
    metricCompatible: mapping.metricCompatible,
    weightExact: requestedWeight === weight,
  };
}

const fontCache = new Map<string, Promise<Font>>();

/** Loads (and caches) a bundled outline font. Browser-only: uses fetch. */
export function loadBundledFont(family: BundledFamily, weight: 400 | 700): Promise<Font> {
  const key = `${family}-${weight}`;
  const cached = fontCache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const [opentype, response] = await Promise.all([
      import('opentype.js'),
      fetch(BUNDLED_FILES[family][weight]),
    ]);
    if (!response.ok) {
      throw new Error(`The bundled ${family} ${weight} outline font could not be downloaded (${response.status}).`);
    }
    const buffer = await response.arrayBuffer();
    return opentype.parse(buffer);
  })();
  promise.catch(() => fontCache.delete(key));
  fontCache.set(key, promise);
  return promise;
}
