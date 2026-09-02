import React from 'react';
import { useEmbroideryStore, embroideryStore, selectEmbroideryRegion } from '../../store/embroidery';
import { useEditorStore } from '../../store/editor';
import { computeMetrics, EMBROIDERY_PX_PER_MM, type StitchCommand } from '../../lib/embroidery';
import { Eye, Navigation, Scissors, ListOrdered, MoveRight, Layers } from 'lucide-react';
import { useCloudProject } from '../../cloud/CloudProjectProvider';

const buildStitchPath = (commands: StitchCommand[], layer: 'underlay' | 'top') => {
  let path = '';
  commands.forEach((command, index) => {
    if (command.layer !== layer || command.type !== 'stitch') {
      return;
    }
    const previous = commands[index - 1];
    if (!previous || previous.type !== 'stitch' || previous.layer !== layer) {
      const start = previous?.type === 'jump' && previous.layer === layer ? previous : command;
      path += `M${start.x.toFixed(2)},${start.y.toFixed(2)} `;
    }
    path += `L${command.x.toFixed(2)},${command.y.toFixed(2)} `;
  });
  return path;
};

export default function EmbroideryWorkspace() {
  const { zoom, pan, artboard } = useEditorStore();
  const { design, selectedRegionIds, viewSettings } = useEmbroideryStore();
  const { isReadOnly } = useCloudProject();

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as SVGElement).id === 'embroidery-bg') {
       selectEmbroideryRegion(null);
    }
  };

  const hoopPxW = design.hoop.widthMm * EMBROIDERY_PX_PER_MM;
  const hoopPxH = design.hoop.heightMm * EMBROIDERY_PX_PER_MM;
  const hoopCenterX = design.hoop.centerX ?? artboard.width / 2;
  const hoopCenterY = design.hoop.centerY ?? artboard.height / 2;
  const metrics = computeMetrics(design);

  return (
    <div className="absolute inset-0 bg-[#0f1115] overflow-hidden" onPointerDown={handlePointerDown}>
      <svg 
        className="w-full h-full"
        style={{ cursor: 'grab' }}
      >
        <defs>
          <pattern id="fabric-texture" width="40" height="40" patternUnits="userSpaceOnUse">
             <rect width="40" height="40" fill="#18181b" />
             <path d="M0 20L40 20 M20 0L20 40" stroke="#ffffff" strokeWidth="0.5" strokeOpacity="0.03" />
             <path d="M0 10L40 10 M10 0L10 40 M0 30L40 30 M30 0L30 40" stroke="#ffffff" strokeWidth="0.5" strokeOpacity="0.015" />
          </pattern>
          <filter id="realistic-thread" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <marker id="direction-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
             <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity="0.8"/>
          </marker>
          <marker id="trim-marker" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6">
             <path d="M 2 2 L 8 8 M 8 2 L 2 8" stroke="#ef4444" strokeWidth="1.5" />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Background fabric */}
          <rect 
            id="embroidery-bg"
            x={0} 
            y={0} 
            width={artboard.width} 
            height={artboard.height} 
            fill="url(#fabric-texture)"
          />

          {/* Hoop bounds */}
          <rect
             x={hoopCenterX - hoopPxW / 2}
             y={hoopCenterY - hoopPxH / 2}
             width={hoopPxW}
             height={hoopPxH}
             fill="none"
             stroke="#ef4444"
             strokeWidth={2 / zoom}
             strokeDasharray={`${10/zoom} ${5/zoom}`}
             opacity={0.3}
             pointerEvents="none"
          />

          {/* Stitch regions */}
          {design.regions.filter(r => r.visible).map((region, i) => (
             <g key={region.id} opacity={selectedRegionIds.length === 0 || selectedRegionIds.includes(region.id) ? 1 : 0.4} className="transition-opacity">
                 {viewSettings.showUnderlay && (
                   <path
                     d={buildStitchPath(region.commands, 'underlay')}
                     fill="none"
                     stroke={region.settings.color.hex}
                     strokeWidth={(viewSettings.showRealistic ? 1.7 : 0.8) / zoom}
                     strokeLinecap="round"
                     opacity={0.35}
                   />
                 )}
                 <path
                   d={buildStitchPath(region.commands, 'top')}
                   fill="none"
                   stroke={region.settings.color.hex}
                   strokeWidth={(viewSettings.showRealistic ? 2.4 : 1) / zoom}
                   strokeLinecap="round"
                   filter={viewSettings.showRealistic ? "url(#realistic-thread)" : undefined}
                 />
                 {viewSettings.showDirection && region.commands.map((command, index, commands) => {
                   const previous = commands[index - 1];
                   if (!previous || command.type !== 'stitch' || command.layer !== 'top' || index % 12 !== 0) return null;
                   return <line key={`direction-${index}`} x1={previous.x} y1={previous.y} x2={command.x} y2={command.y} stroke={region.settings.color.hex} strokeWidth={1 / zoom} markerEnd="url(#direction-arrow)" />;
                 })}
                 {viewSettings.showJumps && region.commands.map((command, index, commands) => {
                   const previous = commands[index - 1];
                   if (!previous || command.type !== 'jump') return null;
                   return <line key={`jump-${index}`} x1={previous.x} y1={previous.y} x2={command.x} y2={command.y} stroke="#f59e0b" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} opacity={0.75} />;
                 })}
                 {viewSettings.showTrims && region.commands.map((command, index) => command.type === 'trim' ? (
                   <g key={`trim-${index}`} stroke="#ef4444" strokeWidth={1.5 / zoom} pointerEvents="none">
                     <line x1={command.x - 3 / zoom} y1={command.y - 3 / zoom} x2={command.x + 3 / zoom} y2={command.y + 3 / zoom} />
                     <line x1={command.x + 3 / zoom} y1={command.y - 3 / zoom} x2={command.x - 3 / zoom} y2={command.y + 3 / zoom} />
                   </g>
                 ) : null)}
                 {region.commands.map((command, index) => command.type === 'color-change' ? (
                   <circle key={`color-${index}`} cx={command.x} cy={command.y} r={4 / zoom} fill="#0f1115" stroke="#38bdf8" strokeWidth={1.5 / zoom} />
                 ) : null)}
                
                {/* Interaction bounds block */}
                <rect
                  x={region.bounds.x}
                  y={region.bounds.y}
                  width={region.bounds.width}
                  height={region.bounds.height}
                  fill="transparent"
                  stroke={selectedRegionIds.includes(region.id) ? "#38bdf8" : "transparent"}
                  strokeWidth={1 / zoom}
                  onPointerDown={(e) => { e.stopPropagation(); selectEmbroideryRegion(region.id, e.shiftKey || e.metaKey); }}
                  className="cursor-pointer"
                />
                
                {viewSettings.showOrder && (
                   <text 
                     x={region.bounds.x} 
                     y={region.bounds.y - (5/zoom)} 
                     fill="#38bdf8" 
                     fontSize={12/zoom} 
                     pointerEvents="none"
                   >
                      {i + 1}
                   </text>
                )}
             </g>
          ))}
        </g>
      </svg>
      
      {/* View Controls Overlay */}
      <div className="absolute bottom-6 left-6 flex items-center gap-1.5 bg-black/80 backdrop-blur border border-white/10 p-1.5 rounded-lg z-10 shadow-xl">
         <button 
            disabled={isReadOnly}
           title="Realistic view"
           aria-pressed={viewSettings.showRealistic}
           onClick={() => embroideryStore.set({ viewSettings: { ...viewSettings, showRealistic: !viewSettings.showRealistic }})}
           className={`p-2 rounded-md transition-colors flex items-center justify-center gap-1 ${viewSettings.showRealistic ? 'bg-primary/30 text-primary' : 'hover:bg-white/10 text-muted-foreground'}`}
         >
            <Eye size={14} />
         </button>
         <button 
            disabled={isReadOnly}
           title="Show stitch direction"
           aria-pressed={viewSettings.showDirection}
           onClick={() => embroideryStore.set({ viewSettings: { ...viewSettings, showDirection: !viewSettings.showDirection }})}
           className={`p-2 rounded-md transition-colors flex items-center justify-center gap-1 ${viewSettings.showDirection ? 'bg-primary/30 text-primary' : 'hover:bg-white/10 text-muted-foreground'}`}
         >
            <Navigation size={14} />
         </button>
         <button 
            disabled={isReadOnly}
           title="Show underlay"
           aria-pressed={viewSettings.showUnderlay}
           onClick={() => embroideryStore.set({ viewSettings: { ...viewSettings, showUnderlay: !viewSettings.showUnderlay }})}
           className={`p-2 rounded-md transition-colors flex items-center justify-center gap-1 ${viewSettings.showUnderlay ? 'bg-primary/30 text-primary' : 'hover:bg-white/10 text-muted-foreground'}`}
         >
            <Layers size={14} />
         </button>
         <div className="w-px h-6 bg-white/10 mx-1" />
         <button 
            disabled={isReadOnly}
           title="Show jumps"
           aria-pressed={viewSettings.showJumps}
           onClick={() => embroideryStore.set({ viewSettings: { ...viewSettings, showJumps: !viewSettings.showJumps }})}
           className={`p-2 rounded-md transition-colors flex items-center justify-center gap-1 ${viewSettings.showJumps ? 'bg-primary/30 text-primary' : 'hover:bg-white/10 text-muted-foreground'}`}
         >
            <MoveRight size={14} />
         </button>
         <button 
            disabled={isReadOnly}
           title="Show trims"
           aria-pressed={viewSettings.showTrims}
           onClick={() => embroideryStore.set({ viewSettings: { ...viewSettings, showTrims: !viewSettings.showTrims }})}
           className={`p-2 rounded-md transition-colors flex items-center justify-center gap-1 ${viewSettings.showTrims ? 'bg-primary/30 text-primary' : 'hover:bg-white/10 text-muted-foreground'}`}
         >
            <Scissors size={14} />
         </button>
         <button 
            disabled={isReadOnly}
           title="Show sequence order"
           aria-pressed={viewSettings.showOrder}
           onClick={() => embroideryStore.set({ viewSettings: { ...viewSettings, showOrder: !viewSettings.showOrder }})}
           className={`p-2 rounded-md transition-colors flex items-center justify-center gap-1 ${viewSettings.showOrder ? 'bg-primary/30 text-primary' : 'hover:bg-white/10 text-muted-foreground'}`}
         >
            <ListOrdered size={14} />
         </button>
      </div>
      
      {/* Mini Plan Overlay */}
      <div className="absolute top-16 left-6 flex flex-col gap-1 text-[10px] text-muted-foreground bg-black/60 backdrop-blur border border-white/5 p-3 rounded-lg z-10 pointer-events-none select-none">
         <div className="font-semibold text-foreground mb-1">Stitch Plan</div>
          <div>Stitches: <span className="text-foreground">{metrics.totalStitches.toLocaleString()}</span></div>
          <div>Colors: <span className="text-foreground">{metrics.colorCount}</span></div>
          <div>Plan: <span className="text-foreground">{metrics.widthMm.toFixed(1)} × {metrics.heightMm.toFixed(1)} mm</span></div>
          <div>Hoop: <span className="text-foreground">{design.hoop.widthMm} × {design.hoop.heightMm} mm</span></div>
      </div>
    </div>
  );
}