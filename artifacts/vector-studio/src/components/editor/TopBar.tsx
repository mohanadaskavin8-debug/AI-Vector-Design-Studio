import React, { useRef } from 'react';
import { useEditorStore, editorStore, undo, redo, setObjects } from '../../store/editor';
import { Undo2, Redo2, ZoomIn, ZoomOut, MousePointerSquareDashed, FileImage, Image as ImageIcon, Upload, Check } from 'lucide-react';
import { VectorObject } from '../../lib/types';
import { generateId } from '../../lib/utils';

export default function TopBar() {
  const { zoom, history, historyIndex, objects, artboard, projectName } = useEditorStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getSVGContent = () => {
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artboard.width} ${artboard.height}" width="${artboard.width}" height="${artboard.height}">\n`;
    svgContent += `  <rect width="100%" height="100%" fill="${artboard.fill}" />\n`;
    
    objects.filter(o => o.visible).forEach(obj => {
      const transform = `transform="rotate(${obj.rotation} ${obj.x + obj.width/2} ${obj.y + obj.height/2})"`;
      const style = `fill="${obj.fill}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}" opacity="${obj.opacity}"`;
      
      if (obj.type === 'rect') {
        svgContent += `  <rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="${obj.rx || 0}" ${transform} ${style} />\n`;
      } else if (obj.type === 'ellipse') {
        svgContent += `  <ellipse cx="${obj.x + obj.width/2}" cy="${obj.y + obj.height/2}" rx="${obj.width/2}" ry="${obj.height/2}" ${transform} ${style} />\n`;
      } else if (obj.type === 'text') {
        svgContent += `  <text x="${obj.x}" y="${obj.y + (obj.fontSize || 16)}" font-family="${obj.fontFamily}" font-size="${obj.fontSize}" ${transform} ${style}>${obj.text}</text>\n`;
      } else if (obj.type === 'polygon' || obj.type === 'star') {
        const cx = obj.x + obj.width / 2;
        const cy = obj.y + obj.height / 2;
        let points = obj.points;
        if (!points && obj.type === 'polygon') {
           points = `${cx},${obj.y} ${obj.x + obj.width},${cy} ${cx},${obj.y + obj.height} ${obj.x},${cy}`;
        }
        if (points) {
           svgContent += `  <polygon points="${points}" ${transform} ${style} />\n`;
        }
      } else if (obj.type === 'line') {
         svgContent += `  <line x1="${obj.x}" y1="${obj.y}" x2="${obj.x + obj.width}" y2="${obj.y + obj.height}" ${transform} ${style} />\n`;
      }
    });
    svgContent += `</svg>`;
    return svgContent;
  };

  const handleExportSVG = () => {
    const svgContent = getSVGContent();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'artwork.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPNG = () => {
    const svgContent = getSVGContent();
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = artboard.width;
      canvas.height = artboard.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = 'artwork.png';
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleImportSVG = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'image/svg+xml');
      
      const newObjects: VectorObject[] = [];
      
      // A very basic SVG shape parser for MVP
      doc.querySelectorAll('rect, ellipse, circle, polygon, line').forEach((el, index) => {
        const tagName = el.tagName.toLowerCase();
        const fill = el.getAttribute('fill') || '#D9D9D9';
        const stroke = el.getAttribute('stroke') || 'none';
        const strokeWidth = parseFloat(el.getAttribute('stroke-width') || '0');
        const opacity = parseFloat(el.getAttribute('opacity') || '1');
        
        if (tagName === 'rect') {
          newObjects.push({
            id: generateId(),
            type: 'rect',
            name: `Imported Rect ${index + 1}`,
            x: parseFloat(el.getAttribute('x') || '0'),
            y: parseFloat(el.getAttribute('y') || '0'),
            width: parseFloat(el.getAttribute('width') || '100'),
            height: parseFloat(el.getAttribute('height') || '100'),
            rx: parseFloat(el.getAttribute('rx') || '0'),
            rotation: 0,
            fill, stroke, strokeWidth, opacity,
            visible: true, locked: false
          });
        } else if (tagName === 'ellipse' || tagName === 'circle') {
          const cx = parseFloat(el.getAttribute('cx') || '50');
          const cy = parseFloat(el.getAttribute('cy') || '50');
          const rx = parseFloat(el.getAttribute('rx') || el.getAttribute('r') || '50');
          const ry = parseFloat(el.getAttribute('ry') || el.getAttribute('r') || '50');
          newObjects.push({
            id: generateId(),
            type: 'ellipse',
            name: `Imported Ellipse ${index + 1}`,
            x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2,
            rotation: 0, fill, stroke, strokeWidth, opacity,
            visible: true, locked: false
          });
        } else if (tagName === 'polygon') {
          newObjects.push({
            id: generateId(),
            type: 'polygon',
            name: `Imported Polygon ${index + 1}`,
            x: 0, y: 0, width: 200, height: 200, // simplified bounds
            rotation: 0, fill, stroke, strokeWidth, opacity,
            visible: true, locked: false,
            points: el.getAttribute('points') || undefined
          });
        } else if (tagName === 'line') {
          const x1 = parseFloat(el.getAttribute('x1') || '0');
          const y1 = parseFloat(el.getAttribute('y1') || '0');
          const x2 = parseFloat(el.getAttribute('x2') || '100');
          const y2 = parseFloat(el.getAttribute('y2') || '100');
          newObjects.push({
            id: generateId(),
            type: 'line',
            name: `Imported Line ${index + 1}`,
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            width: Math.abs(x2 - x1),
            height: Math.abs(y2 - y1),
            rotation: 0, fill, stroke, strokeWidth, opacity,
            visible: true, locked: false
          });
        }
      });
      
      if (newObjects.length > 0) {
        setObjects([...objects, ...newObjects]);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="absolute top-0 left-0 right-0 h-14 bg-card/80 backdrop-blur-xl border-b border-white/5 z-10 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20 text-primary shadow-[0_0_15px_rgba(139,92,246,0.15)]">
          <MousePointerSquareDashed size={20} />
        </div>
        <div>
          <span className="font-semibold text-sm tracking-wide block">VECTOR STUDIO</span>
          <div className="flex items-center gap-1.5">
            <input aria-label="Project name" value={projectName} onChange={event => editorStore.set({ projectName: event.target.value })} className="w-36 bg-transparent text-[10px] text-muted-foreground outline-none focus:text-foreground" />
            <Check size={10} className="text-emerald-400" aria-hidden="true" />
            <span className="text-[9px] text-muted-foreground">Saved locally</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-black/20 rounded-lg p-1 border border-white/5">
        <button 
          onClick={undo}
          disabled={historyIndex <= 0}
          className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-transparent transition-colors text-muted-foreground hover:text-foreground"
        >
          <Undo2 size={16} />
        </button>
        <button 
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-transparent transition-colors text-muted-foreground hover:text-foreground"
        >
          <Redo2 size={16} />
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button 
          onClick={() => editorStore.set({ zoom: Math.max(0.1, zoom - 0.2) })}
          className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-xs w-12 text-center font-mono select-none">
          {Math.round(zoom * 100)}%
        </span>
        <button 
          onClick={() => editorStore.set({ zoom: Math.min(5, zoom + 0.2) })}
          className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ZoomIn size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input 
          type="file" 
          accept=".svg" 
          ref={fileInputRef} 
          onChange={handleImportSVG} 
          className="hidden" 
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground"
          title="Import SVG"
        >
          <Upload size={14} />
          Import
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button 
          onClick={handleExportSVG}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground"
          title="Export SVG"
        >
          <FileImage size={14} />
          SVG
        </button>
        <button 
          onClick={handleExportPNG}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground"
          title="Export PNG"
        >
          <ImageIcon size={14} />
          PNG
        </button>
      </div>
    </div>
  );
}
