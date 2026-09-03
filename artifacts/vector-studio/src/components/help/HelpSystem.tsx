import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, HelpCircle, Search, X } from 'lucide-react';

const TOUR_KEY = 'vector-studio-guided-tour-v1';

const allTourSteps = [
  { selector: '.editor-topbar-brand', title: 'Your project', body: 'Rename your design here. Cloud projects also show whether changes are saved, saving, offline, or need attention.' },
  { selector: '.editor-toolbar', title: 'Drawing tools', body: 'Choose a tool, then work on the canvas. Hover any tool to see what it creates and its keyboard shortcut.' },
  { selector: '.editor-canvas', title: 'The canvas', body: 'Click artwork to select it, drag to move it, and use corner handles to resize. Drop SVG or image files here to import them.' },
  { selector: '.editor-inspector', title: 'Properties and workflows', body: 'Design edits the selection, Layers controls stacking, AI generates and traces, Embroidery prepares stitches, and Preview shows products.' },
  { selector: '.editor-ai-tab', title: 'AI workspace', body: 'Generate artwork, turn images into editable color shapes, and apply safe automatic cleanup to selected objects.' },
  { selector: '.editor-embroider', title: 'Prepare embroidery', body: 'This converts eligible artwork into an inspectable stitch plan, chooses sensible defaults, and reports anything it skipped.' },
  { selector: '.editor-preflight', title: 'Check before export', body: 'Preflight finds clipped, hidden, tiny, or overlapping artwork before you download the design.' },
  { selector: '.editor-export', title: 'Export your work', body: 'Download editable SVG or PNG artwork. Embroidery mode provides machine-ready formats after digitizing.' },
];

const helpTopics = [
  { title: 'Select, move, and resize', section: 'Design', text: 'Use Select (V), click an object, drag it to move, and drag a corner handle to resize. Shift-click adds to the selection. Alt-click selects one part inside a traced group.' },
  { title: 'Edit path nodes', section: 'Design', text: 'Choose Edit nodes (A), select a path, then drag its nodes or curve handles. Multi-contour traced shapes may have limited node editing.' },
  { title: 'Draw shapes and paths', section: 'Design', text: 'Rectangle, ellipse, polygon, star, and line tools create standard objects. Pen builds precise paths; Pencil draws freehand and smooths when you finish.' },
  { title: 'Import artwork', section: 'Files', text: 'Import SVG for editable vector layers or PNG, JPG, and WebP as image layers. You can also drag files onto the canvas or paste an image from the clipboard.' },
  { title: 'Trace an image', section: 'AI', text: 'Open AI → Trace and upload or choose an image layer. Adjust color count, detail, smoothing, cleanup, and background handling, then apply the result as editable parts.' },
  { title: 'Generate an image', section: 'AI', text: 'Open AI → Generate, describe an image, choose its size, and review the result before applying it as a new layer. Generation uses Replit credits.' },
  { title: 'Edit traced parts', section: 'AI', text: 'Choose a part in the Traced parts list or Alt-click it. Then move, resize, recolor, or delete that part like normal artwork.' },
  { title: 'Layers and stacking', section: 'Layers', text: 'Layers lists front-to-back artwork. Select, rename, hide, lock, duplicate, group, reorder, or delete layers here.' },
  { title: 'Prepare embroidery', section: 'Embroidery', text: 'Embroider design converts supported visible artwork to stitch regions. Review stitch order and settings, refresh stale regions after artwork changes, then run preflight.' },
  { title: 'Stitch types', section: 'Embroidery', text: 'Fill covers solid areas, satin works best for narrow columns, and running stitch follows outlines. Density and underlay affect coverage, stiffness, and stitch count.' },
  { title: 'Preview on products', section: 'Preview', text: 'Choose a product, drag artwork into position, and adjust scale, finish, blend, shadows, and texture. This is an aesthetic preview, not a manufacturing proof.' },
  { title: 'Save and collaborate', section: 'Cloud', text: 'Cloud projects autosave. Save creates an immediate save; Collaboration shows recent editors, checkpoints, and expiring view or edit links.' },
  { title: 'Undo and shortcuts', section: 'Basics', text: 'Use Ctrl/Cmd+Z to undo, Shift+Ctrl/Cmd+Z to redo, Ctrl/Cmd+D to duplicate, Delete to remove, and Ctrl/Cmd+K to open editor commands.' },
];

export default function HelpSystem() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [tourSteps, setTourSteps] = useState(allTourSteps);
  const tourDialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const availableTourSteps = () => allTourSteps.filter(step => {
    const target = document.querySelector(step.selector);
    if (!(target instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(target);
    const bounds = target.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
  });

  const startTour = () => {
    const available = availableTourSteps();
    if (!available.length) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTourSteps(available);
    setTourIndex(0);
  };

  useEffect(() => {
    if (localStorage.getItem(TOUR_KEY)) return;
    const frame = requestAnimationFrame(startTour);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (open) setOpen(false);
      else if (tourIndex != null) finishTour();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, tourIndex]);

  useEffect(() => {
    document.querySelectorAll('.vector-tour-target').forEach(node => node.classList.remove('vector-tour-target'));
    if (tourIndex == null) return;
    const target = document.querySelector(tourSteps[tourIndex].selector);
    target?.classList.add('vector-tour-target');
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return () => target?.classList.remove('vector-tour-target');
  }, [tourIndex]);

  useEffect(() => {
    if (tourIndex == null) return;
    const dialog = tourDialogRef.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', trapFocus);
    return () => dialog.removeEventListener('keydown', trapFocus);
  }, [tourIndex]);

  const finishTour = () => {
    localStorage.setItem(TOUR_KEY, 'complete');
    setTourIndex(null);
    requestAnimationFrame(() => previousFocusRef.current?.focus());
  };
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? helpTopics.filter(topic => `${topic.title} ${topic.section} ${topic.text}`.toLowerCase().includes(normalized)) : helpTopics;
  }, [query]);

  return (
    <>
      <button
        type="button"
        aria-label="Open help and guided tour"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[65] flex items-center gap-2 rounded-full border border-white/10 bg-card/90 px-3 py-2 text-xs text-muted-foreground shadow-xl backdrop-blur hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <HelpCircle size={15} /> Help
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] bg-black/60" onPointerDown={() => setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-label="Vector Studio help" onPointerDown={event => event.stopPropagation()} className="absolute right-0 top-0 flex h-full w-[440px] max-w-full flex-col border-l border-white/10 bg-card shadow-2xl">
            <header className="border-b border-white/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="flex items-center gap-2 font-semibold"><BookOpen size={17} /> Help center</h2><p className="mt-1 text-[11px] text-muted-foreground">Find a workflow or replay the editor tour.</p></div>
                <button autoFocus aria-label="Close help" onClick={() => setOpen(false)} className="rounded p-2 hover:bg-white/10"><X size={18} /></button>
              </div>
              <button onClick={() => { setOpen(false); requestAnimationFrame(startTour); }} className="mt-3 w-full rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20">Start guided tour</button>
              <label className="mt-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3">
                <Search size={14} className="text-muted-foreground" />
                <span className="sr-only">Search help</span>
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search help…" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
              </label>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {filtered.map(topic => (
                <article key={topic.title} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-primary">{topic.section}</div>
                  <h3 className="mt-1 text-sm font-medium">{topic.title}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{topic.text}</p>
                </article>
              ))}
              {!filtered.length && <p className="rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-muted-foreground">No help topic matched. Try “trace”, “layers”, “stitches”, or “export”.</p>}
            </div>
          </aside>
        </div>
      )}

      {tourIndex != null && (
        <div role="dialog" aria-modal="true" aria-label="Guided editor tour" className="fixed inset-0 z-[85] bg-black/45">
          <div ref={tourDialogRef} className="absolute bottom-6 left-1/2 w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-primary/30 bg-card p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Quick tour · {tourIndex + 1} of {tourSteps.length}</div><h2 className="mt-1 font-semibold">{tourSteps[tourIndex].title}</h2></div>
              <button aria-label="Skip guided tour" onClick={finishTour} className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"><X size={16} /></button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{tourSteps[tourIndex].body}</p>
            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => setTourIndex(index => Math.max(0, (index ?? 0) - 1))} disabled={tourIndex === 0} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-white/5 disabled:opacity-30"><ChevronLeft size={14} /> Back</button>
              <button onClick={() => tourIndex === tourSteps.length - 1 ? finishTour() : setTourIndex(tourIndex + 1)} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">{tourIndex === tourSteps.length - 1 ? 'Finish' : 'Next'} {tourIndex < tourSteps.length - 1 && <ChevronRight size={14} />}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}