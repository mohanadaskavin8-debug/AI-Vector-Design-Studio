// Stitch-out playback engine: flattens the visible stitch plan into a single
// machine-order timeline and pre-builds chunked geometry so an animation-frame
// loop can render progress cheaply (no per-stitch React re-renders and no
// full-plan path rebuilds per frame). Pure module — no DOM, unit-testable.

import type { EmbroideryDesign, StitchCommandType } from './embroidery';

/** Relative time cost of each command, in ticks. One tick ≈ one stitch. */
export const STITCH_TICKS = 1;
export const JUMP_TICKS = 1;
/** Machines stop to cut thread; a short pause makes the trim cue readable. */
export const TRIM_TICKS = 10;
/** Thread swaps stop the machine much longer; scaled down to stay watchable. */
export const COLOR_CHANGE_TICKS = 24;
/** Mounting the first thread should not stall the start of playback. */
export const INITIAL_THREAD_TICKS = 2;
/**
 * Commands per pre-built geometry chunk. Completed chunks render as cached
 * <path> elements; only the chunk containing the playhead is rebuilt per
 * frame, so this bounds the per-frame string work.
 */
export const PLAYBACK_CHUNK_SIZE = 256;

export interface PlaybackStep {
  x: number;
  y: number;
  type: StitchCommandType;
  layer: 'underlay' | 'top';
  /** Thread color active while this command executes. */
  colorHex: string;
  regionId: string;
  regionName: string;
  initialThread: boolean;
}

export interface PlaybackChunk {
  startIndex: number;
  /** Inclusive. */
  endIndex: number;
  colorHex: string;
  layer: 'underlay' | 'top';
  d: string;
}

export interface PlaybackEventMark {
  index: number;
  type: 'jump' | 'trim' | 'color-change';
  /** Tick at which the event starts. */
  time: number;
  /** 0..1 position along the timeline, for scrubber tick marks. */
  fraction: number;
  /** New thread color for color-change events. */
  colorHex?: string;
}

export interface PlaybackPlan {
  steps: PlaybackStep[];
  /** cumTime[i] = tick at which command i completes. */
  cumTime: Float64Array;
  /** stitchOrdinal[i] = number of stitch commands in steps[0..i]. */
  stitchOrdinal: Int32Array;
  /** Sorted chunk start indices (includes chunks with no drawable geometry). */
  boundaries: number[];
  /** Pre-built path chunks; chunks with nothing to draw are omitted. */
  chunks: PlaybackChunk[];
  events: PlaybackEventMark[];
  totalStitches: number;
  duration: number;
}

export interface PlayheadState {
  /** Index of the command currently executing. */
  index: number;
  /** 0..1 progress through the current command. */
  progress: number;
  /** Last fully completed command index (-1 when none). */
  completedIndex: number;
  /** Needle position. */
  x: number;
  y: number;
  /** Start point of the segment currently being travelled. */
  fromX: number;
  fromY: number;
  step: PlaybackStep;
  /** "Stitch n of N" readout value at this position. */
  stitchNumber: number;
}

const ticksFor = (step: PlaybackStep): number => {
  switch (step.type) {
    case 'stitch':
      return STITCH_TICKS;
    case 'jump':
      return JUMP_TICKS;
    case 'trim':
      return TRIM_TICKS;
    case 'color-change':
      return step.initialThread ? INITIAL_THREAD_TICKS : COLOR_CHANGE_TICKS;
  }
};

/**
 * Flatten the visible regions into machine order and derive the timeline,
 * event marks, and chunked geometry in one pass over the commands.
 */
export const buildPlaybackPlan = (design: EmbroideryDesign): PlaybackPlan => {
  const steps: PlaybackStep[] = [];
  let threadHex = '';
  design.regions.forEach(region => {
    if (!region.visible) return;
    const fallback = region.settings.color.hex;
    region.commands.forEach(command => {
      if (command.type === 'color-change' && command.threadHex) threadHex = command.threadHex;
      steps.push({
        x: command.x,
        y: command.y,
        type: command.type,
        layer: command.layer ?? 'top',
        colorHex: threadHex || fallback,
        regionId: region.id,
        regionName: region.name,
        initialThread: Boolean(command.initialThread),
      });
    });
  });

  const cumTime = new Float64Array(steps.length);
  const stitchOrdinal = new Int32Array(steps.length);
  const events: PlaybackEventMark[] = [];
  let time = 0;
  let stitches = 0;
  steps.forEach((step, index) => {
    if (step.type === 'stitch') {
      stitches += 1;
    } else {
      events.push({
        index,
        type: step.type,
        time,
        fraction: 0,
        colorHex: step.type === 'color-change' ? step.colorHex : undefined,
      });
    }
    time += ticksFor(step);
    cumTime[index] = time;
    stitchOrdinal[index] = stitches;
  });
  const duration = time;
  events.forEach(event => {
    event.fraction = duration > 0 ? event.time / duration : 0;
  });

  // --- Chunked geometry -----------------------------------------------------
  // A chunk holds commands of one thread color and one layer so it can render
  // as a single stroked <path>. Boundaries also cap chunk length so the
  // partial chunk rebuilt every frame stays small.
  const boundaries: number[] = [];
  const chunks: PlaybackChunk[] = [];
  let chunkStart = -1;
  let d = '';
  let hasLine = false;
  let previousPoint: { x: number; y: number } | null = null;
  let needMove = true;

  const flush = (endIndex: number) => {
    if (chunkStart < 0) return;
    if (hasLine) {
      const anchor = steps[chunkStart];
      chunks.push({ startIndex: chunkStart, endIndex, colorHex: anchor.colorHex, layer: anchor.layer, d });
    }
    chunkStart = -1;
    d = '';
    hasLine = false;
  };

  steps.forEach((step, index) => {
    const shouldBreak = chunkStart >= 0 && (
      index - chunkStart >= PLAYBACK_CHUNK_SIZE
      || step.colorHex !== steps[chunkStart].colorHex
      || step.layer !== steps[chunkStart].layer
    );
    if (shouldBreak) flush(index - 1);
    if (chunkStart < 0) {
      chunkStart = index;
      boundaries.push(index);
      needMove = true;
    }
    if (step.type === 'stitch') {
      if (needMove) {
        const entry = previousPoint ?? step;
        d += `M${entry.x.toFixed(2)},${entry.y.toFixed(2)}`;
        needMove = false;
      }
      d += `L${step.x.toFixed(2)},${step.y.toFixed(2)}`;
      hasLine = true;
      previousPoint = step;
    } else if (step.type === 'jump') {
      previousPoint = step;
      needMove = true;
    } else {
      // Trim / color-change: the thread is cut or swapped, so the next stitch
      // must not connect back to the pre-cut point — it anchors fresh.
      previousPoint = null;
      needMove = true;
    }
  });
  flush(steps.length - 1);

  return { steps, cumTime, stitchOrdinal, boundaries, chunks, events, totalStitches: stitches, duration };
};

/** Largest chunk boundary at or before `index` (binary search). */
export const boundaryStartFor = (plan: PlaybackPlan, index: number): number => {
  const { boundaries } = plan;
  let low = 0;
  let high = boundaries.length - 1;
  let result = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (boundaries[mid] <= index) {
      result = boundaries[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
};

/**
 * Path for the not-yet-complete chunk: commands from a chunk boundary through
 * the last completed command. The span is guaranteed single-color/single-layer
 * because chunk boundaries break on both.
 */
export const buildPartialPath = (plan: PlaybackPlan, boundaryStart: number, completedIndex: number): string => {
  if (completedIndex < boundaryStart) return '';
  let d = '';
  let hasLine = false;
  let needMove = true;
  const before = boundaryStart > 0 ? plan.steps[boundaryStart - 1] : null;
  // A trim/color-change immediately before the boundary means the thread was
  // cut: the first stitch of this span must not connect back across it.
  let previous: { x: number; y: number } | null =
    before && (before.type === 'stitch' || before.type === 'jump') ? before : null;
  for (let index = boundaryStart; index <= completedIndex; index += 1) {
    const step = plan.steps[index];
    if (step.type === 'stitch') {
      if (needMove) {
        const entry = previous ?? step;
        d += `M${entry.x.toFixed(2)},${entry.y.toFixed(2)}`;
        needMove = false;
      }
      d += `L${step.x.toFixed(2)},${step.y.toFixed(2)}`;
      hasLine = true;
      previous = step;
    } else if (step.type === 'jump') {
      previous = step;
      needMove = true;
    } else {
      // Thread cut/swap: never connect across it (matches the chunk builder).
      previous = null;
      needMove = true;
    }
  }
  return hasLine ? d : '';
};

/** Resolve the playhead (current command, progress, needle position) at a time. */
export const playheadAt = (plan: PlaybackPlan, time: number): PlayheadState | null => {
  const { steps, cumTime } = plan;
  if (!steps.length) return null;
  const clamped = Math.min(Math.max(time, 0), plan.duration);
  // First index whose completion time is >= clamped.
  let low = 0;
  let high = steps.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (cumTime[mid] >= clamped) high = mid;
    else low = mid + 1;
  }
  const index = low;
  const start = index === 0 ? 0 : cumTime[index - 1];
  const span = cumTime[index] - start;
  const progress = span > 0 ? Math.min(1, Math.max(0, (clamped - start) / span)) : 1;
  const step = steps[index];
  const previous = index > 0 ? steps[index - 1] : step;
  const moving = step.type === 'stitch' || step.type === 'jump';
  return {
    index,
    progress,
    completedIndex: progress >= 1 ? index : index - 1,
    x: moving ? previous.x + (step.x - previous.x) * progress : step.x,
    y: moving ? previous.y + (step.y - previous.y) * progress : step.y,
    fromX: previous.x,
    fromY: previous.y,
    step,
    stitchNumber: plan.stitchOrdinal[index],
  };
};
