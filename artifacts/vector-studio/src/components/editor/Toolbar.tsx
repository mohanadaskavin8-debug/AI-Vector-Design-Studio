import React from 'react';
import { useEditorStore, editorStore } from '../../store/editor';
import { MousePointer2, Square, Circle, Type, Hexagon, Star, Minus } from 'lucide-react';
import { ShapeType } from '../../lib/types';

const tools: { id: ShapeType; icon: React.FC<any>; label: string; shortcut: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V' },
  { id: 'rect', icon: Square, label: 'Rectangle', shortcut: 'R' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse', shortcut: 'O' },
  { id: 'polygon', icon: Hexagon, label: 'Polygon', shortcut: 'P' },
  { id: 'star', icon: Star, label: 'Star', shortcut: 'S' },
  { id: 'line', icon: Minus, label: 'Line', shortcut: 'L' },
  { id: 'text', icon: Type, label: 'Text', shortcut: 'T' },
];

export default function Toolbar() {
  const { activeTool } = useEditorStore();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || e.ctrlKey || e.metaKey) return;
      const tool = tools.find(t => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (tool) {
        editorStore.set({ activeTool: tool.id });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="absolute left-6 top-1/2 -translate-y-1/2 z-10">
      <div className="flex flex-col gap-2 p-2 bg-card/80 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => editorStore.set({ activeTool: tool.id })}
              className={`p-3 rounded-xl transition-all duration-200 group relative ${
                isActive ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(139,92,246,0.3)]' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              }`}
              title={`${tool.label} (${tool.shortcut})`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              
              {/* Tooltip */}
              <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                {tool.label} <span className="text-muted-foreground ml-1">{tool.shortcut}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
