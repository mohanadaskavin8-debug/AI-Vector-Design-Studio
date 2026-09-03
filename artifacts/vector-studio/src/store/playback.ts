// Transient stitch-out playback state. Intentionally not persisted: playback
// is an ephemeral simulation over whatever the current stitch plan is, and it
// never mutates the design, so it is also safe for read-only viewers.

import { createStore } from './createStore';

export const PLAYBACK_MIN_SPEED = 1;
export const PLAYBACK_MAX_SPEED = 3000;
export const PLAYBACK_DEFAULT_SPEED = 120;

export interface PlaybackState {
  /** Player open (progressive rendering replaces the static preview). */
  active: boolean;
  playing: boolean;
  /** Playhead position in timeline ticks (1 tick ≈ 1 stitch). */
  time: number;
  /** Playback speed in ticks (≈ stitches) per second. */
  speed: number;
}

export const playbackStore = createStore<PlaybackState>({
  active: false,
  playing: false,
  time: 0,
  speed: PLAYBACK_DEFAULT_SPEED,
});

export const openPlayback = () => playbackStore.set({ active: true, playing: true, time: 0 });

export const closePlayback = () => playbackStore.set({ active: false, playing: false });

export const restartPlayback = () => playbackStore.set({ time: 0, playing: true });

export const seekPlayback = (time: number) => playbackStore.set({ time: Math.max(0, time), });

export const setPlaybackSpeed = (speed: number) =>
  playbackStore.set({ speed: Math.min(PLAYBACK_MAX_SPEED, Math.max(PLAYBACK_MIN_SPEED, speed)) });

/** Toggle play/pause; playing again from the end restarts from the top. */
export const togglePlayback = (duration: number) => {
  const { playing, time } = playbackStore.get();
  if (!playing && duration > 0 && time >= duration) {
    playbackStore.set({ playing: true, time: 0 });
    return;
  }
  playbackStore.set({ playing: !playing });
};
