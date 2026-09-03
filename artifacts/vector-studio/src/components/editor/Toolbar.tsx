import React from 'react';
import { useEditorStore, editorStore, setObjects } from '../../store/editor';
import { MousePointer2, Square, Circle, Type, Hexagon, Star, Minus, PenTool, Pencil, ScanSearch, ImagePlus } from 'lucide-react';
import { ToolType } from '../../lib/types';
import { importImageFiles, IMAGE_MIME_TYPES } from '../../lib/imageImport';
import { useCloudProject } from '../../cloud/CloudProjectProvider';
import { GuideTip } from '../help/GuideTip';

const tools: { id: ToolType; icon: React.FC<any>; label: string; shortcut: string; detail: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V', detail: 'Click artwork to select it, then drag to move or use the corner handles to resize.' },
  { id: 'node', icon: ScanSearch, label: 'Edit nodes', shortcut: 'A', detail: 'Select a path and drag its points or curve handles to reshape the outline.' },
  { id: 'pen', icon: PenTool, label: 'Pen', shortcut: 'P', detail: 'Click to place precise path nodes. Press Enter for an open path or Escape to finish.' },
  { id: 'pencil', icon: Pencil, label: 'Pencil', shortcut: 'N', detail: 'Drag freely on the canvas. The stroke is smoothed when you release.' },
  { id: 'rect', icon: Square, label: 'Rectangle', shortcut: 'R', detail: 'Drag on the canvas to create a rectangle.' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse', shortcut: 'O', detail: 'Drag on the canvas to create a circle or ellipse.' },
  { id: 'polygon', icon: Hexagon, label: 'Polygon', shortcut: 'Shift+P', detail: 'Drag on the canvas to create a polygon shape.' },
  { id: 'star', icon: Star, label: 'Star', shortcut: 'S', detail: 'Drag on the canvas to create a five-point star.' },
  { id: 'line', icon: Minus, label: 'Line', shortcut: 'L', detail: 'Drag between two points to create a straight stroked line.' },
  { id: 'text', icon: Type, label: 'Text', shortcut: 'T', detail: 'Click or drag to add editable text, then change its content in Design properties.' },
];

export default function Toolbar() {
  const { activeTool } = useEditorStore();
  const { isReadOnly } = useCloudProject();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  const errorTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showImportError = (message: string) => {
    setImportError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setImportError(null), 5000);
  };

  React.useEffect(() => () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
  }, []);

  const handleImageFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || isReadOnly) return;
    const { artboard } = editorStore.get();
    const { placed, errors } = await importImageFiles(Array.from(fileList), artboard);
    if (placed.length) {
      const current = editorStore.get().objects;
      setObjects([...current, ...placed]);
      editorStore.set({ selection: placed.map(object => object.id), activeTool: 'select' });
    }
    if (errors.length) {
      showImportError(errors.length > 1 ? `${errors[0]} (+${errors.length - 1} more)` : errors[0]);
    }
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || e.ctrlKey || e.metaKey) return;
      const tool = tools.find(t => t.shortcut.toLowerCase() === (e.shiftKey ? 'shift+' + e.key.toLowerCase() : e.key.toLowerCase()));
      if (tool) {
        editorStore.set({ activeTool: tool.id });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="editor-toolbar absolute left-6 top-1/2 -translate-y-1/2 z-10">
      <div className="flex flex-col gap-2 p-2 bg-card/80 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <GuideTip key={tool.id} label={tool.label} detail={tool.detail} shortcut={tool.shortcut}>
              <button
                onClick={() => editorStore.set({ activeTool: tool.id })}
                aria-label={`${tool.label} tool (${tool.shortcut})`}
                className={`p-3 rounded-xl transition-all duration-200 relative ${
                  isActive ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(139,92,246,0.3)]' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </button>
            </GuideTip>
          );
        })}

        <div className="mx-2 border-t border-white/10" />

        <GuideTip label="Import image" detail="Adds PNG, JPG, or WebP files as image layers. You can also drag files onto the canvas or paste an image." side="right">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isReadOnly}
            className="p-3 rounded-xl transition-all duration-200 relative text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Import an image layer"
            data-testid="button-import-image"
          >
            <ImagePlus size={20} strokeWidth={2} />
          </button>
        </GuideTip>
      </div>

      <input
        type="file"
        multiple
        accept={`.png,.jpg,.jpeg,.webp,${IMAGE_MIME_TYPES.join(',')}`}
        className="hidden"
        ref={fileInputRef}
        onChange={event => {
          void handleImageFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {importError && (
        <div role="alert" className="absolute left-full ml-4 bottom-0 w-56 rounded-md border border-destructive/30 bg-black/80 backdrop-blur px-3 py-2 text-[10px] text-destructive shadow-xl">
          {importError}
        </div>
      )}
    </div>
  );
}
