import { memo, useEffect, useMemo, useRef } from 'react';
import { Play, Pause, RotateCcw, X, Gauge, MoveRight, Scissors, Palette } from 'lucide-react';
import {
  PlaybackPlan,
  PlaybackChunk,
  playheadAt,
  buildPartialPath,
  boundaryStartFor,
} from '../../lib/stitchPlayback';
import {
  playbackStore,
  togglePlayback,
  restartPlayback,
  seekPlayback,
  setPlaybackSpeed,
  closePlayback,
  PLAYBACK_MAX_SPEED,
} from '../../store/playback';

/**
 * Completed chunks keep stable `d` strings, so memoization means the browser
 * never re-parses their geometry during playback — per frame only the partial
 * chunk, the live segment, and the needle marker change.
 */
const ChunkPath = memo(function ChunkPath({ chunk, zoom }: { chunk: PlaybackChunk; zoom: number }) {
  const underlay = chunk.layer === 'underlay';
  return (
    <path
      d={chunk.d}
      fill="none"
      stroke={chunk.colorHex}
      strokeWidth={(underlay ? 1 : 1.7) / zoom}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={underlay ? 0.5 : 1}
    />
  );
});

/** SVG layer that renders the stitch-out progressively up to the playhead. */
export function StitchPlaybackLayer({ plan, zoom }: { plan: PlaybackPlan; zoom: number }) {
  const time = playbackStore.useStore(state => state.time);
  const head = playheadAt(plan, time);
  if (!head) return null;

  const completed = head.completedIndex;
  const boundary = boundaryStartFor(plan, head.index);
  const partial = buildPartialPath(plan, boundary, completed);
  const anchor = plan.steps[boundary];
  const step = head.step;
  const underlayCurrent = step.layer === 'underlay';

  return (
    <g pointerEvents="none">
      {plan.chunks.map(chunk => (chunk.endIndex <= completed
        ? <ChunkPath key={chunk.startIndex} chunk={chunk} zoom={zoom} />
        : null))}
      {partial && (
        <path
          d={partial}
          fill="none"
          stroke={anchor.colorHex}
          strokeWidth={(anchor.layer === 'underlay' ? 1 : 1.7) / zoom}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={anchor.layer === 'underlay' ? 0.5 : 1}
        />
      )}

      {/* Segment currently being stitched, with a bright sheen so it pops. */}
      {step.type === 'stitch' && head.progress > 0 && (
        <g>
          <line x1={head.fromX} y1={head.fromY} x2={head.x} y2={head.y} stroke={step.colorHex} strokeWidth={(underlayCurrent ? 1 : 1.7) / zoom} strokeLinecap="round" opacity={underlayCurrent ? 0.5 : 1} />
          <line x1={head.fromX} y1={head.fromY} x2={head.x} y2={head.y} stroke="#ffffff" strokeWidth={0.7 / zoom} strokeLinecap="round" opacity={0.6} />
        </g>
      )}

      {/* Needle-up travel line while a jump is in flight. */}
      {step.type === 'jump' && (
        <line x1={head.fromX} y1={head.fromY} x2={head.x} y2={head.y} stroke="#f59e0b" strokeWidth={1.2 / zoom} strokeDasharray={`${5 / zoom} ${4 / zoom}`} opacity={0.9} />
      )}

      {/* Trim cue: the machine pauses here while the thread is cut. */}
      {step.type === 'trim' && (
        <g stroke="#ef4444" strokeWidth={1.6 / zoom}>
          <line x1={head.x - 5 / zoom} y1={head.y - 5 / zoom} x2={head.x + 5 / zoom} y2={head.y + 5 / zoom} />
          <line x1={head.x + 5 / zoom} y1={head.y - 5 / zoom} x2={head.x - 5 / zoom} y2={head.y + 5 / zoom} />
          <circle cx={head.x} cy={head.y} fill="none" r={6 / zoom}>
            <animate attributeName="r" values={`${4 / zoom};${12 / zoom}`} dur="0.7s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0" dur="0.7s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* Color-change cue: expanding ring in the incoming thread color. */}
      {step.type === 'color-change' && (
        <g>
          <circle cx={head.x} cy={head.y} r={8 / zoom} fill="none" stroke={step.colorHex} strokeWidth={1.6 / zoom}>
            <animate attributeName="r" values={`${4 / zoom};${13 / zoom}`} dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0" dur="0.8s" repeatCount="indefinite" />
          </circle>
          <circle cx={head.x} cy={head.y} r={4 / zoom} fill={step.colorHex} stroke="#0f1115" strokeWidth={1 / zoom} />
        </g>
      )}

      {/* Needle marker. */}
      <g transform={`translate(${head.x}, ${head.y})`} data-testid="marker-needle">
        <line y1={-8 / zoom} y2={8 / zoom} stroke="#0f1115" strokeWidth={2.6 / zoom} strokeLinecap="round" />
        <line x1={-8 / zoom} x2={8 / zoom} stroke="#0f1115" strokeWidth={2.6 / zoom} strokeLinecap="round" />
        <line y1={-8 / zoom} y2={8 / zoom} stroke="#ffffff" strokeWidth={1 / zoom} strokeLinecap="round" />
        <line x1={-8 / zoom} x2={8 / zoom} stroke="#ffffff" strokeWidth={1 / zoom} strokeLinecap="round" />
        <circle
          r={3.2 / zoom}
          fill={step.type === 'jump' ? 'none' : step.colorHex}
          stroke={step.type === 'jump' ? '#f59e0b' : '#ffffff'}
          strokeWidth={1.1 / zoom}
        />
      </g>
    </g>
  );
}

const SPEED_SLIDER_MAX = 1000;
const sliderToSpeed = (value: number) =>
  Math.max(1, Math.round(Math.exp((value / SPEED_SLIDER_MAX) * Math.log(PLAYBACK_MAX_SPEED))));
const speedToSlider = (speed: number) =>
  Math.round((Math.log(Math.max(1, speed)) / Math.log(PLAYBACK_MAX_SPEED)) * SPEED_SLIDER_MAX);

/** Video-player style transport bar: play/pause, restart, speed, scrubber, readouts. */
export function StitchPlaybackTransport({ plan }: { plan: PlaybackPlan }) {
  const playing = playbackStore.useStore(state => state.playing);
  const time = playbackStore.useStore(state => state.time);
  const speed = playbackStore.useStore(state => state.speed);

  // Drive the playhead from animation frames so large plans animate without
  // per-stitch state churn anywhere else in the editor.
  useEffect(() => {
    if (!playing || plan.duration <= 0) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const state = playbackStore.get();
      const next = state.time + dt * state.speed;
      if (next >= plan.duration) {
        playbackStore.set({ time: plan.duration, playing: false });
        return;
      }
      playbackStore.set({ time: next });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, plan.duration]);

  // The plan can be rebuilt while the player is open (re-digitizing, hiding,
  // deleting or reordering regions). The old playhead time then points at an
  // unrelated spot in the new machine order, so rewind to the start and pause;
  // close the player entirely when nothing is left to play.
  const planRef = useRef(plan);
  useEffect(() => {
    if (plan.steps.length === 0) {
      planRef.current = plan;
      closePlayback();
      return;
    }
    if (planRef.current !== plan) {
      planRef.current = plan;
      playbackStore.set({ time: 0, playing: false });
    }
  }, [plan]);

  const ticks = useMemo(() => {
    const jumpCount = plan.events.reduce((count, event) => count + (event.type === 'jump' ? 1 : 0), 0);
    // Fill regions jump at every row, so dense plans would bury the scrubber
    // in amber ticks — keep trim/color marks always, jumps only when sparse.
    const includeJumps = jumpCount <= 240;
    return plan.events.filter(event => event.type !== 'jump' || includeJumps);
  }, [plan]);

  const head = playheadAt(plan, time);
  if (!head) return null;
  const progressPct = plan.duration > 0 ? Math.min(100, (time / plan.duration) * 100) : 0;
  const eventType = head.step.type;

  return (
    <div className="absolute bottom-6 left-6 right-6 md:left-[300px] md:right-[352px] z-20 pointer-events-none flex justify-center">
      <div data-testid="panel-stitch-player" className="pointer-events-auto w-full max-w-[640px] rounded-xl border border-white/10 bg-black/85 backdrop-blur px-3 py-2 shadow-2xl space-y-1.5">
        <div className="flex items-center gap-2">
          <button
            data-testid="button-playback-toggle"
            aria-label={playing ? 'Pause stitch-out' : 'Play stitch-out'}
            onClick={() => togglePlayback(plan.duration)}
            className="p-1.5 rounded-md bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            data-testid="button-playback-restart"
            aria-label="Restart stitch-out"
            onClick={() => restartPlayback()}
            className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground transition-colors"
          >
            <RotateCcw size={13} />
          </button>

          <div data-testid="text-playback-counter" className="text-[10px] font-mono whitespace-nowrap text-foreground">
            Stitch {head.stitchNumber.toLocaleString()}<span className="text-muted-foreground"> / {plan.totalStitches.toLocaleString()}</span>
          </div>

          <div data-testid="text-playback-color" title={head.step.regionName} className="flex items-center gap-1.5 min-w-0">
            <span className="w-3 h-3 rounded-full border border-white/25 shrink-0" style={{ backgroundColor: head.step.colorHex }} />
            <span className="text-[9px] font-mono uppercase text-muted-foreground truncate">{head.step.colorHex}</span>
          </div>

          <div className="w-[76px] shrink-0 flex justify-center">
            {eventType === 'jump' && (
              <span data-testid="status-playback-event" className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-medium text-amber-300 border-amber-500/30 bg-amber-500/10">
                <MoveRight size={10} /> Jump
              </span>
            )}
            {eventType === 'trim' && (
              <span data-testid="status-playback-event" className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-medium text-red-300 border-red-500/30 bg-red-500/10">
                <Scissors size={10} /> Trim
              </span>
            )}
            {eventType === 'color-change' && (
              <span data-testid="status-playback-event" className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-medium text-sky-300 border-sky-500/30 bg-sky-500/10">
                <Palette size={10} /> Color
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5 shrink-0" title="Playback speed (≈ stitches per second)">
            <Gauge size={12} className="text-muted-foreground shrink-0" />
            <input
              data-testid="input-playback-speed"
              aria-label="Playback speed"
              type="range"
              min={0}
              max={SPEED_SLIDER_MAX}
              step={1}
              value={speedToSlider(speed)}
              onChange={event => setPlaybackSpeed(sliderToSpeed(Number(event.target.value)))}
              className="w-20 h-1 cursor-pointer"
              style={{ accentColor: 'hsl(var(--primary))' }}
            />
            <span data-testid="text-playback-speed" className="text-[9px] font-mono text-muted-foreground w-14 text-right whitespace-nowrap">{Math.round(speed).toLocaleString()} st/s</span>
          </div>

          <button
            data-testid="button-playback-close"
            aria-label="Close stitch-out player"
            onClick={() => closePlayback()}
            className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        <div className="relative flex items-center h-5">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 pointer-events-none">
            {ticks.map(mark => (
              <span
                key={mark.index}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full"
                style={{
                  left: `${mark.fraction * 100}%`,
                  width: mark.type === 'color-change' ? 3 : 2,
                  height: mark.type === 'color-change' ? 14 : mark.type === 'trim' ? 10 : 6,
                  backgroundColor: mark.type === 'color-change' ? mark.colorHex : mark.type === 'trim' ? 'rgba(239,68,68,0.85)' : 'rgba(245,158,11,0.5)',
                  boxShadow: mark.type === 'color-change' ? '0 0 0 1px rgba(255,255,255,0.35)' : undefined,
                }}
              />
            ))}
          </div>
          <input
            data-testid="input-playback-scrubber"
            aria-label="Stitch-out position"
            type="range"
            min={0}
            max={Math.max(plan.duration, 0.0001)}
            step="any"
            value={Math.min(time, plan.duration)}
            onChange={event => seekPlayback(Number(event.target.value))}
            className="relative w-full h-1.5 cursor-pointer"
            style={{ accentColor: 'hsl(var(--primary))' }}
          />
        </div>

        <div className="flex items-center justify-between text-[8px] leading-none text-muted-foreground/80">
          <span>Machine-order simulation — thread and fabric physics are not modeled.</span>
          <span data-testid="text-playback-progress" className="font-mono">{progressPct.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
