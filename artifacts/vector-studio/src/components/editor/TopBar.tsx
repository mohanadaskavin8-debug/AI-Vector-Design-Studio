import React, { useRef, useState } from 'react';
import { useEditorStore, editorStore, undo, redo, setObjects } from '../../store/editor';
import { Download, Undo2, Redo2, ZoomIn, ZoomOut, MousePointerSquareDashed, Upload, AlertTriangle, CheckCircle2, Users, Save, Scissors } from 'lucide-react';
import { nodesToSVGPath } from '../../lib/pathUtils';
import { useCloudProject } from '../../cloud/CloudProjectProvider';
import { embedPrivateImages } from '../../cloud/assets';
import { startAssistedDigitize } from '../../lib/assistedFlow';
import { useAssistStore } from '../../store/assist';
import { importSvgFile, isSafeImageSource } from '../../lib/svgImport';
import { importImageFiles } from '../../lib/imageImport';

const escapeXml = (value: string | undefined) => (value || '').replace(/[<>&"']/g, character => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
}[character] || character));

export default function TopBar() {
  const { zoom, history, historyIndex, objects, artboard, projectName, workspaceMode } = useEditorStore();
  const cloud = useCloudProject();
  const assistPhase = useAssistStore().phase;
  const storageWarning = useEditorStore().storageWarning;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [exportScale, setExportScale] = useState(1);
  const [transparentBackground, setTransparentBackground] = useState(false);

  const getSVGContent = (exportObjects = objects) => {
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artboard.width} ${artboard.height}" width="${artboard.width}" height="${artboard.height}">\n`;
    if (!transparentBackground) svgContent += `  <rect width="100%" height="100%" fill="${escapeXml(artboard.fill)}" />\n`;
    
    exportObjects.filter(o => o.visible).forEach(obj => {
      const transform = `transform="rotate(${obj.rotation} ${obj.x + obj.width/2} ${obj.y + obj.height/2})"`;
      const style = `fill="${escapeXml(obj.fill)}" stroke="${escapeXml(obj.stroke)}" stroke-width="${obj.strokeWidth}" opacity="${obj.opacity}"`;
      
      if (obj.type === 'rect') {
        svgContent += `  <rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="${obj.rx || 0}" ${transform} ${style} />\n`;
      } else if (obj.type === 'ellipse') {
        svgContent += `  <ellipse cx="${obj.x + obj.width/2}" cy="${obj.y + obj.height/2}" rx="${obj.width/2}" ry="${obj.height/2}" ${transform} ${style} />\n`;
      } else if (obj.type === 'text') {
        const ta = obj.textAlign === 'center' ? 'middle' : obj.textAlign === 'right' ? 'end' : 'start';
        let tx = obj.x;
        if (!obj.textPathId) {
           if (obj.textAlign === 'center') tx = obj.x + obj.width / 2;
           if (obj.textAlign === 'right') tx = obj.x + obj.width;
        }
        
        let textContent = `<text x="${tx}" y="${obj.y + (obj.fontSize || 16)}" font-family="${escapeXml(obj.fontFamily)}" font-size="${obj.fontSize}" font-weight="${escapeXml(obj.fontWeight || 'normal')}" letter-spacing="${obj.letterSpacing || 0}" text-anchor="${ta}" ${transform} ${style}>${escapeXml(obj.text)}</text>\n`;
        
        if (obj.textPathId) {
            const pathObj = exportObjects.find(o => o.id === obj.textPathId);
           if (pathObj) {
              const d = pathObj.points || (pathObj.nodes ? nodesToSVGPath(pathObj.nodes, pathObj.closed) : '');
              textContent = `  <defs><path id="path-${obj.id}" d="${d}" /></defs>\n`;
              textContent += `  <text font-family="${obj.fontFamily}" font-size="${obj.fontSize}" font-weight="${obj.fontWeight || 'normal'}" fill="${obj.fill}" opacity="${obj.opacity}">\n`;
               textContent += `    <textPath href="#path-${obj.id}" startOffset="${obj.textAlign === 'center' ? '50%' : obj.textAlign === 'right' ? '100%' : '0%'}" text-anchor="${ta}">${escapeXml(obj.text)}</textPath>\n`;
              textContent += `  </text>\n`;
           }
        }
        svgContent += textContent;
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
      } else if (obj.type === 'path') {
         let d = obj.points || '';
         if (!d && obj.nodes) d = nodesToSVGPath(obj.nodes, obj.closed);
         svgContent += `  <path d="${d}" fill-rule="evenodd" ${transform} ${style} />\n`;
      } else if (obj.type === 'image' && obj.imageSrc && isSafeImageSource(obj.imageSrc)) {
         svgContent += `  <image x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" href="${obj.imageSrc}" preserveAspectRatio="none" ${transform} ${style} />\n`;
      }
    });
    svgContent += `</svg>`;
    return svgContent;
  };

  const handleExportSVG = async () => {
    try {
    const svgContent = getSVGContent(await embedPrivateImages(objects));
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported SVG with ${objects.filter(object => object.visible).length} visible layers.`);
    } catch (error) { setNotice((error as Error).message); }
  };

  const handleExportPNG = async () => {
    let svgContent: string;
    try { svgContent = getSVGContent(await embedPrivateImages(objects)); }
    catch (error) { setNotice((error as Error).message); return; }
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(artboard.width * exportScale));
      canvas.height = Math.max(1, Math.round(artboard.height * exportScale));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${projectName}.png`;
        a.click();
        setNotice(`Exported PNG at ${exportScale}× (${canvas.width} × ${canvas.height}px).`);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleImportSVG = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    try {
      const { objects: newObjects, skipped } = await importSvgFile(file);
      if (newObjects.length > 0) {
        setObjects([...editorStore.get().objects, ...newObjects]);
        editorStore.set({ selection: newObjects.map(object => object.id) });
        setNotice(`Imported ${newObjects.length} editable layer${newObjects.length === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} unsupported or unsafe item${skipped === 1 ? '' : 's'}` : ''}.`);
      } else {
        setNotice('No supported SVG shapes were found. Groups, filters, masks, and external images are not imported.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Import failed: this file is not valid SVG.');
    }
  };

  const handleImportImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (!file) return;

    const { placed, errors } = await importImageFiles([file], artboard);
    if (placed.length > 0) {
      setObjects([...editorStore.get().objects, ...placed]);
      editorStore.set({ selection: placed.map(object => object.id) });
      setNotice(`Imported ${file.name} as an editable image layer.`);
    }
    if (errors.length > 0) setNotice(errors[0]);
  };

  const getPreflightWarnings = () => {
     const warnings: string[] = [];
     objects.forEach(obj => {
        if (!obj.visible) warnings.push(`Layer "${obj.name}" is hidden and won't export.`);
         if (obj.x < 0 || obj.y < 0 || obj.x + obj.width > artboard.width || obj.y + obj.height > artboard.height) {
            warnings.push(`Layer "${obj.name}" extends beyond the artboard and will be clipped.`);
        }
        if (obj.type === 'text' && obj.fontSize && obj.fontSize < 8) {
           warnings.push(`Text "${obj.name}" is very small (${obj.fontSize}px) and might not be legible.`);
        }
         if (obj.visible && Math.min(obj.width, obj.height) < 2) warnings.push(`Layer "${obj.name}" contains a detail smaller than 2px.`);
         if (obj.type === 'image' && (!obj.imageSrc || !isSafeImageSource(obj.imageSrc))) warnings.push(`Image "${obj.name}" has an unsupported source and will be omitted.`);
     });
      let overlaps = 0;
      const visible = objects.filter(object => object.visible && !object.locked && object.fill !== 'none');
      visible.forEach((object, index) => visible.slice(index + 1).forEach(other => {
        if (object.x < other.x + other.width && object.x + object.width > other.x && object.y < other.y + other.height && object.y + object.height > other.y) overlaps += 1;
      }));
      if (overlaps > 0) warnings.push(`${overlaps} filled layer overlap${overlaps === 1 ? '' : 's'} detected. Review stacking and transparency before export.`);
     return warnings;
  };

  return (
    <div className="editor-topbar absolute top-0 left-0 right-0 h-14 bg-card/80 backdrop-blur-xl border-b border-white/5 z-40 flex items-center justify-between px-6">
      <div className="editor-topbar-brand flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20 text-primary shadow-[0_0_15px_rgba(139,92,246,0.15)]">
          <MousePointerSquareDashed size={20} />
        </div>
        <div>
          <span className="font-semibold text-sm tracking-wide block">VECTOR STUDIO</span>
          <div className="flex items-center gap-1.5">
            <input aria-label="Project name" disabled={cloud.isReadOnly || (cloud.projectId !== undefined && cloud.permission !== 'owner')} value={projectName} onChange={event => editorStore.set({ projectName: event.target.value })} className="w-36 bg-transparent text-[10px] text-muted-foreground outline-none focus:text-foreground disabled:opacity-70" />
            <span role="status" title={cloud.message || storageWarning || ''} className={`text-[9px] ${cloud.status === 'error' || cloud.status === 'conflict' || storageWarning ? 'text-amber-400' : 'text-muted-foreground'}`}>
              {storageWarning || ({ loading: 'Loading cloud…', 'local-only': 'Local-only recovery', unsaved: 'Unsaved changes', saving: 'Saving…', saved: 'Saved to cloud', offline: 'Offline — unsaved', conflict: 'Conflict — action needed', 'read-only': 'Read-only', error: 'Cloud save error', updated: 'Updated from collaborator' }[cloud.status])}
            </span>
          </div>
        </div>
      </div>

      <div className="editor-zoom-controls flex items-center gap-2 bg-black/20 rounded-lg p-1 border border-white/5">
        {workspaceMode === 'design' && (
          <>
            <button
              onClick={undo}
              disabled={cloud.isReadOnly || historyIndex <= 0}
              aria-label="Undo design change"
              className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-transparent transition-colors text-muted-foreground hover:text-foreground"
              title="Undo the last design change (Ctrl/Cmd+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={redo}
              disabled={cloud.isReadOnly || historyIndex >= history.length - 1}
              aria-label="Redo design change"
              className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-transparent transition-colors text-muted-foreground hover:text-foreground"
              title="Redo the last undone change (Shift+Ctrl/Cmd+Z)"
            >
              <Redo2 size={16} />
            </button>
            <div className="w-px h-4 bg-white/10 mx-1" />
          </>
        )}
        <button
          onClick={() => editorStore.set({ zoom: Math.max(0.1, zoom - 0.2) })}
          aria-label="Zoom out"
          className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
            title="Zoom out to see more of the canvas"
          >
          <ZoomOut size={16} />
        </button>
        <span className="text-xs w-12 text-center font-mono select-none">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => editorStore.set({ zoom: Math.min(5, zoom + 0.2) })}
          aria-label="Zoom in"
          className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
            title="Zoom in for more precise editing"
          >
          <ZoomIn size={16} />
        </button>
      </div>

      <div className="editor-topbar-actions flex items-center gap-2 relative">
        {notice && <div role="status" className="absolute top-10 right-0 w-80 rounded-lg border border-white/10 bg-card px-3 py-2 text-xs text-muted-foreground shadow-xl">{notice}<button onClick={() => setNotice('')} className="float-right ml-2 text-foreground">Dismiss</button></div>}
        <input type="file" accept=".svg,image/svg+xml" ref={fileInputRef} onChange={e => { void handleImportSVG(e); }} className="hidden" />
        <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" ref={imageInputRef} onChange={e => { void handleImportImage(e); }} className="hidden" />
         {cloud.projectId && <><button aria-label="Save now" title="Save changes to the cloud now (Ctrl/Cmd+S)" disabled={cloud.isReadOnly || cloud.status === 'saving' || cloud.status === 'conflict'} onClick={() => void cloud.saveNow()} className="p-2 rounded hover:bg-white/10 disabled:opacity-40"><Save size={15}/></button><button aria-label="Open collaboration" title="See collaborators, save checkpoints, and create sharing links" onClick={() => cloud.setCollaborationOpen(true)} className="p-2 rounded hover:bg-white/10"><Users size={16}/></button></>}
        
        {workspaceMode === 'embroidery' ? (
          <div className="flex items-center px-3 py-1.5 bg-primary/20 text-primary text-xs font-medium rounded-md border border-primary/30">
             Stitch Plan Mode
          </div>
        ) : workspaceMode === 'preview' ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center px-3 py-1.5 bg-primary/20 text-primary text-xs font-medium rounded-md border border-primary/30">
               Visual Preview Mode
            </div>
             <button
               onClick={() => {
                  // Simulate composite download label, since real composite is hard without canvas
                  setNotice('Visual preview composite snapshot generation is not available in this version. Use "Design" mode to export vectors.');
               }}
               className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground"
            >
               <Download size={14} /> Snapshot
            </button>
          </div>
        ) : (
          <>
            {!cloud.isReadOnly && (
              <button
                onClick={() => void startAssistedDigitize()}
                disabled={assistPhase === 'working'}
                title="Digitize this design into an inspectable stitch plan"
                className="editor-embroider flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-[0_0_15px_rgba(139,92,246,0.25)]"
              >
                <Scissors size={14} /> {assistPhase === 'working' ? 'Digitizing\u2026' : 'Embroider design'}
              </button>
            )}

            <button
              onClick={() => setPreflightOpen(!preflightOpen)}
               className={`editor-preflight flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${getPreflightWarnings().length > 0 ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
              title="Preflight Checks"
            >
              {getPreflightWarnings().length > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              Preflight
            </button>

            {preflightOpen && (
               <div className="absolute top-10 right-32 w-72 bg-card border border-white/10 shadow-2xl rounded-xl p-3 z-50 animate-in fade-in slide-in-from-top-2">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Export Warnings</h4>
                  {getPreflightWarnings().length > 0 ? (
                     <ul className="space-y-2">
                        {getPreflightWarnings().map((w, i) => (
                           <li key={i} className="text-xs flex gap-2 items-start text-amber-500/90 bg-amber-500/10 p-2 rounded">
                              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                              <span>{w}</span>
                           </li>
                        ))}
                     </ul>
                  ) : (
                     <div className="text-xs flex gap-2 items-center text-emerald-500/90 bg-emerald-500/10 p-2 rounded">
                        <CheckCircle2 size={14} />
                        <span>No issues found by these checks. Review the downloaded output before production use.</span>
                     </div>
                  )}
               </div>
            )}

            <div className="w-px h-4 bg-white/10 mx-1" />

             {!cloud.isReadOnly && <div className="editor-import group relative">
               <button title="Add editable SVG layers or a raster image layer; drag and drop onto the canvas also works" className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground">
                 <Upload size={14} /> Import
               </button>
               <div className="absolute top-full right-0 mt-1 w-32 bg-card border border-white/10 rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <button onClick={() => fileInputRef.current?.click()} className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 text-muted-foreground hover:text-foreground">Import SVG</button>
                  <button onClick={() => imageInputRef.current?.click()} className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 text-muted-foreground hover:text-foreground">Import Image</button>
               </div>
            </div>}

             <div className="editor-export group relative">
               <button title="Download visible artwork as editable SVG or PNG; this does not include machine embroidery files" className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground">
                 <Download size={14} /> Export
               </button>
                <div className="absolute top-full right-0 mt-1 w-56 bg-card border border-white/10 rounded-md shadow-xl p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                   <label className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">PNG scale
                     <select value={exportScale} onChange={event => setExportScale(Number(event.target.value))} className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-foreground"><option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option></select>
                   </label>
                   <label className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"><input type="checkbox" checked={transparentBackground} onChange={event => setTransparentBackground(event.target.checked)} />Transparent background</label>
                   <div className="h-px bg-white/10 my-1" />
                   <button title="Downloads visible artwork as scalable vector shapes that can be reopened in vector editors" onClick={handleExportSVG} className="w-full text-left px-2 py-2 text-xs hover:bg-white/10 rounded text-muted-foreground hover:text-foreground">Export editable SVG</button>
                   <button title="Downloads a flattened pixel image at the selected scale; it will not remain editable as vector layers" onClick={handleExportPNG} className="w-full text-left px-2 py-2 text-xs hover:bg-white/10 rounded text-muted-foreground hover:text-foreground">Export PNG</button>
               </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}