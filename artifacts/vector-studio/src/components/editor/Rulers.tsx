import React from 'react';
import { useEditorStore } from '../../store/editor';
import { formatUnit } from '../../lib/units';

interface RulersProps {
  onGuideStart: (event: React.PointerEvent, axis: 'x' | 'y') => void;
}

export default function Rulers({ onGuideStart }: RulersProps) {
  const { zoom, pan, unit } = useEditorStore();
  const interval = zoom < 0.5 ? 200 : zoom > 2 ? 50 : 100;
  const marks = Array.from({ length: 41 }, (_, index) => (index - 10) * interval);
  
  return (
    <>
      {/* Top Ruler */}
       <div id="ruler-top" onPointerDown={event => onGuideStart(event, 'y')} className="absolute top-0 left-5 right-0 h-5 bg-card border-b border-white/5 overflow-hidden select-none z-20 text-[9px] text-muted-foreground cursor-ns-resize">
          {marks.map(mark => (
            <div key={mark} className="absolute bottom-0 h-2 border-l border-white/20 pointer-events-none" style={{ left: pan.x + mark * zoom }}>
              <span className="absolute bottom-2 left-1 font-mono whitespace-nowrap">{formatUnit(mark, unit)}</span>
            </div>
          ))}
      </div>
      
      {/* Left Ruler */}
       <div id="ruler-left" onPointerDown={event => onGuideStart(event, 'x')} className="absolute top-5 left-0 bottom-0 w-5 bg-card border-r border-white/5 overflow-hidden select-none z-20 text-[9px] text-muted-foreground cursor-ew-resize">
          {marks.map(mark => (
            <div key={mark} className="absolute right-0 w-2 border-t border-white/20 pointer-events-none" style={{ top: pan.y + mark * zoom }}>
              <span className="absolute left-[-2px] top-1 font-mono [writing-mode:vertical-rl]">{formatUnit(mark, unit)}</span>
            </div>
          ))}
      </div>
      
      {/* Corner block */}
      <div className="absolute top-0 left-0 w-5 h-5 bg-card border-r border-b border-white/5 z-30 pointer-events-none" />
    </>
  );
}