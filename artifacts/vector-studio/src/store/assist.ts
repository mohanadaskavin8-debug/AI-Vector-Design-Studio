// Transient state for the one-click "Embroider design" assisted flow.
// Intentionally not persisted: summaries describe a just-completed run.

import { createStore } from './createStore';
import type { PreflightWarning } from '../lib/embroidery';
import type { DigitizeSkip } from '../lib/digitize';

export interface AssistTextCandidate {
  id: string;
  name: string;
  /** e.g. "Trebuchet MS → Inter" when the outline font is a substitute. */
  substitution: string | null;
}

export interface AssistSummary {
  converted: Array<{
    name: string;
    stitchType: string;
    stitches: number;
    /** Estimated ink width when the narrow-shape heuristic defaulted this region to satin. */
    autoSatinWidthMm?: number;
  }>;
  skipped: DigitizeSkip[];
  /** Names of text layers converted to outlines during this run. */
  textConverted: string[];
  /** Font substitution / missing glyph notices from text conversion. */
  fontNotes: string[];
  /** Text layers that could not be converted. */
  failures: string[];
  hoop: {
    name: string;
    widthMm: number;
    heightMm: number;
    fits: boolean;
    planWidthMm: number;
    planHeightMm: number;
  } | null;
  /** Top preflight findings (errors first), at most three. */
  preflight: PreflightWarning[];
  totalStitches: number;
  backgroundSkipped: boolean;
  includeBackgroundUsed: boolean;
}

export interface AssistState {
  phase: 'idle' | 'confirm-text' | 'working';
  /** Selection snapshot when the run started; empty = whole design. */
  scopeSelection: string[];
  pendingText: AssistTextCandidate[];
  summary: AssistSummary | null;
  error: string | null;
}

export const assistStore = createStore<AssistState>({
  phase: 'idle',
  scopeSelection: [],
  pendingText: [],
  summary: null,
  error: null,
});

export const useAssistStore = () => assistStore.useStore(state => state);

export const dismissAssistSummary = () => assistStore.set({ summary: null });

export const clearAssistError = () => assistStore.set({ error: null });
