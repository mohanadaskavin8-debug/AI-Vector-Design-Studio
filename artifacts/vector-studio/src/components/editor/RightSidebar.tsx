import React, { useState } from 'react';
import { useEditorStore, editorStore, updateObject, updateSelectedObjects, selectObject, setObjects } from '../../store/editor';
import { Box, Wand2, Scissors, Eye, EyeOff, Lock, Unlock, Copy, Trash2, Group, Ungroup, Star } from 'lucide-react';
import { VectorObject } from '../../lib/types';

function PropertiesTab() {
  const { objects, selection, artboard } = useEditorStore();
  const selectedObj = objects.find(o => o.id === selection[0]);

  if (selection.length === 0) {
    return (
      <div className="p-4 space-y-6">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Artboard</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Width</label>
              <input 
                type="number" 
                value={artboard.width}
                onChange={e => editorStore.set({ artboard: { ...artboard, width: Number(e.target.value) } })}
                className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Height</label>
              <input 
                type="number" 
                value={artboard.height}
                onChange={e => editorStore.set({ artboard: { ...artboard, height: Number(e.target.value) } })}
                className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs text-muted-foreground block mb-1">Background</label>
            <div className="flex gap-2">
              <input 
                type="color" 
                value={artboard.fill}
                onChange={e => editorStore.set({ artboard: { ...artboard, fill: e.target.value } })}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
              />
              <input 
                type="text" 
                value={artboard.fill}
                onChange={e => editorStore.set({ artboard: { ...artboard, fill: e.target.value } })}
                className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm uppercase font-mono focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center h-32 border border-dashed border-white/10 rounded-lg bg-black/20">
           <p className="text-xs text-muted-foreground">Select an object to edit</p>
        </div>
      </div>
    );
  }

  if (selection.length > 1) {
    return (
      <div className="p-4 space-y-6">
        <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg flex items-center justify-between">
           <span className="text-sm font-medium text-primary">{selection.length} Objects Selected</span>
        </div>
        {/* Multi-edit attributes could go here */}
      </div>
    );
  }

  if (!selectedObj) return null;

  const handleUpdate = (partial: Partial<VectorObject>) => {
    updateObject(selectedObj.id, partial);
  };

  return (
    <div className="p-4 space-y-6">
      {/* Layout */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Box size={14}/> Layout</h3>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <div className="flex items-center bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary">
            <span className="text-xs text-muted-foreground w-4">X</span>
            <input 
              type="number" 
              value={Math.round(selectedObj.x)}
              onChange={e => handleUpdate({ x: Number(e.target.value) })}
              className="w-full bg-transparent border-none py-1.5 text-sm focus:outline-none text-right font-mono"
            />
          </div>
          <div className="flex items-center bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary">
            <span className="text-xs text-muted-foreground w-4">Y</span>
            <input 
              type="number" 
              value={Math.round(selectedObj.y)}
              onChange={e => handleUpdate({ y: Number(e.target.value) })}
              className="w-full bg-transparent border-none py-1.5 text-sm focus:outline-none text-right font-mono"
            />
          </div>
          <div className="flex items-center bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary">
            <span className="text-xs text-muted-foreground w-4">W</span>
            <input 
              type="number" 
              value={Math.round(selectedObj.width)}
              onChange={e => handleUpdate({ width: Math.max(1, Number(e.target.value)) })}
              className="w-full bg-transparent border-none py-1.5 text-sm focus:outline-none text-right font-mono"
            />
          </div>
          <div className="flex items-center bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary">
            <span className="text-xs text-muted-foreground w-4">H</span>
            <input 
              type="number" 
              value={Math.round(selectedObj.height)}
              onChange={e => handleUpdate({ height: Math.max(1, Number(e.target.value)) })}
              className="w-full bg-transparent border-none py-1.5 text-sm focus:outline-none text-right font-mono"
            />
          </div>
          <div className="flex items-center bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary">
            <span className="text-xs text-muted-foreground w-4">R°</span>
            <input 
              type="number" 
              value={Math.round(selectedObj.rotation)}
              onChange={e => handleUpdate({ rotation: Number(e.target.value) })}
              className="w-full bg-transparent border-none py-1.5 text-sm focus:outline-none text-right font-mono"
            />
          </div>
          <div className="flex items-center bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary">
            <span className="text-xs text-muted-foreground w-4">Op</span>
            <input 
              type="number" 
              value={Math.round(selectedObj.opacity * 100)}
              onChange={e => handleUpdate({ opacity: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })}
              className="w-full bg-transparent border-none py-1.5 text-sm focus:outline-none text-right font-mono"
            />
          </div>
          {selectedObj.type === 'rect' && (
            <div className="flex items-center bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary col-span-2">
              <span className="text-xs text-muted-foreground w-16">Radius</span>
              <input 
                type="number" 
                value={selectedObj.rx || 0}
                onChange={e => handleUpdate({ rx: Math.max(0, Number(e.target.value)) })}
                className="w-full bg-transparent border-none py-1.5 text-sm focus:outline-none text-right font-mono"
              />
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-white/10" />

      {/* Style */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Appearance</h3>
        
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Fill</label>
            <div className="flex gap-2">
              <input 
                type="color" 
                value={selectedObj.fill === 'none' ? '#000000' : selectedObj.fill}
                onChange={e => handleUpdate({ fill: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
              />
              <input 
                type="text" 
                value={selectedObj.fill}
                onChange={e => handleUpdate({ fill: e.target.value })}
                className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm font-mono focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Stroke</label>
            <div className="flex gap-2 mb-2">
              <input 
                type="color" 
                value={selectedObj.stroke === 'none' ? '#000000' : selectedObj.stroke}
                onChange={e => handleUpdate({ stroke: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
              />
              <input 
                type="text" 
                value={selectedObj.stroke}
                onChange={e => handleUpdate({ stroke: e.target.value })}
                className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm font-mono focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-md px-2 py-1">
               <span className="text-xs text-muted-foreground">Width</span>
               <input 
                 type="range" min="0" max="20" 
                 value={selectedObj.strokeWidth}
                 onChange={e => handleUpdate({ strokeWidth: Number(e.target.value) })}
                 className="flex-1 accent-primary"
               />
               <span className="text-xs font-mono w-4 text-right">{selectedObj.strokeWidth}</span>
            </div>
          </div>
        </div>
      </div>

      {selectedObj.type === 'text' && (
        <>
          <div className="h-px bg-white/10" />
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Text</h3>
            <textarea 
              value={selectedObj.text}
              onChange={e => handleUpdate({ text: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-2 text-sm focus:border-primary focus:outline-none min-h-[60px] resize-y"
            />
            <div className="flex items-center gap-2 mt-2 bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary">
              <span className="text-xs text-muted-foreground w-12">Size</span>
              <input 
                type="number" 
                value={selectedObj.fontSize}
                onChange={e => handleUpdate({ fontSize: Number(e.target.value) })}
                className="w-full bg-transparent border-none py-1.5 text-sm focus:outline-none text-right font-mono"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LayersTab() {
  const { objects, selection } = useEditorStore();
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const toggleVisibility = (e: React.MouseEvent, id: string, visible: boolean) => {
    e.stopPropagation();
    updateObject(id, { visible: !visible });
  };

  const toggleLock = (e: React.MouseEvent, id: string, locked: boolean) => {
    e.stopPropagation();
    updateObject(id, { locked: !locked });
  };

  const deleteSelected = () => {
    const newObjs = objects.filter(o => !selection.includes(o.id));
    setObjects(newObjs, true);
    selectObject(null);
  };
  
  const duplicateSelected = () => {
    const newObjs = [...objects];
    const newSelection: string[] = [];
    selection.forEach(id => {
      const obj = objects.find(o => o.id === id);
      if (obj) {
        const newId = Math.random().toString(36).substring(2, 9);
        newObjs.push({ ...obj, id: newId, x: obj.x + 10, y: obj.y + 10 });
        newSelection.push(newId);
      }
    });
    setObjects(newObjs, true);
    editorStore.set({ selection: newSelection });
  };

  const bringForward = () => {
    if (selection.length !== 1) return;
    const idx = objects.findIndex(o => o.id === selection[0]);
    if (idx < objects.length - 1) {
      const newObjs = [...objects];
      const temp = newObjs[idx];
      newObjs[idx] = newObjs[idx + 1];
      newObjs[idx + 1] = temp;
      setObjects(newObjs, true);
    }
  };
  
  const sendBackward = () => {
    if (selection.length !== 1) return;
    const idx = objects.findIndex(o => o.id === selection[0]);
    if (idx > 0) {
      const newObjs = [...objects];
      const temp = newObjs[idx];
      newObjs[idx] = newObjs[idx - 1];
      newObjs[idx - 1] = temp;
      setObjects(newObjs, true);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {[...objects].reverse().map(obj => (
          <div 
            key={obj.id}
            onClick={() => selectObject(obj.id)}
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm transition-colors ${
              selection.includes(obj.id) ? 'bg-primary/20 text-primary border border-primary/20' : 'hover:bg-white/5 text-foreground border border-transparent'
            }`}
          >
            <div className="w-4 h-4 rounded-sm bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
              {obj.type === 'rect' && <Box size={10} />}
              {obj.type === 'ellipse' && <div className="w-2 h-2 rounded-full border border-current" />}
              {obj.type === 'polygon' && <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-current" />}
              {obj.type === 'star' && <Star size={10} />}
              {obj.type === 'text' && <div className="text-[10px] font-bold leading-none">T</div>}
              {obj.type === 'line' && <div className="w-2 h-[2px] bg-current transform -rotate-45" />}
            </div>
             {renamingId === obj.id ? (
               <input autoFocus value={obj.name} onClick={e => e.stopPropagation()} onChange={e => updateObject(obj.id, { name: e.target.value }, false)} onBlur={() => { setObjects(editorStore.get().objects, true); setRenamingId(null); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="flex-1 min-w-0 bg-black/40 border border-primary/40 rounded px-1.5 py-0.5 outline-none" />
             ) : (
               <button className="flex-1 min-w-0 truncate text-left" onDoubleClick={e => { e.stopPropagation(); setRenamingId(obj.id); }}>{obj.name}</button>
             )}
            <button onClick={(e) => toggleLock(e, obj.id, obj.locked)} className="opacity-50 hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity">
              {obj.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <button onClick={(e) => toggleVisibility(e, obj.id, obj.visible)} className="opacity-50 hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity">
              {obj.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
        ))}
      </div>
      
      {selection.length > 0 && (
        <div className="p-3 border-t border-white/10 flex gap-2 justify-center bg-black/20">
          <button onClick={bringForward} className="p-1.5 hover:bg-white/10 rounded transition-colors" title="Bring Forward">↑</button>
          <button onClick={sendBackward} className="p-1.5 hover:bg-white/10 rounded transition-colors" title="Send Backward">↓</button>
          <div className="w-px bg-white/10" />
          <button onClick={duplicateSelected} className="p-1.5 hover:bg-white/10 rounded transition-colors" title="Duplicate"><Copy size={16} /></button>
           <button onClick={() => { const groupId = Math.random().toString(36).slice(2); updateSelectedObjects({ groupId }); }} disabled={selection.length < 2} className="p-1.5 hover:bg-white/10 disabled:opacity-30 rounded transition-colors" title="Group"><Group size={16} /></button>
           <button onClick={() => updateSelectedObjects({ groupId: undefined })} className="p-1.5 hover:bg-white/10 rounded transition-colors" title="Ungroup"><Ungroup size={16} /></button>
          <button onClick={deleteSelected} className="p-1.5 hover:bg-destructive/20 text-destructive rounded transition-colors" title="Delete"><Trash2 size={16} /></button>
        </div>
      )}
    </div>
  );
}

function AITab() {
  const [isProcessing, setIsProcessing] = useState(false);
  const { objects, selection } = useEditorStore();

  const handleAction = (label: string) => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      // Local deterministic actions stay reversible in editor history.
      if (label === 'Simplify Styles' && selection.length > 0) {
        updateSelectedObjects({ stroke: 'none', opacity: 1 });
      } else if (label === 'Recolor to Violet' && selection.length > 0) {
        updateSelectedObjects({ fill: '#8B5CF6' });
      }
    }, 800);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 rounded-xl p-4 relative overflow-hidden">
        <Wand2 className="text-primary mb-2" size={24} />
        <h3 className="font-semibold text-sm mb-1">AI Workspace</h3>
        <p className="text-xs text-muted-foreground mb-4 relative z-10">
          Transform selections deterministically or request generative edits.
        </p>
        
        <div className="space-y-2 relative z-10">
          <button 
            onClick={() => handleAction('Simplify Styles')}
            disabled={selection.length === 0 || isProcessing}
            className="w-full text-left px-3 py-2 text-sm bg-black/40 hover:bg-black/60 rounded border border-white/5 disabled:opacity-50 transition-colors"
          >
            {isProcessing ? 'Processing...' : 'Simplify Styles'}
          </button>
          <button 
            onClick={() => handleAction('Recolor to Violet')}
            disabled={selection.length === 0 || isProcessing}
            className="w-full text-left px-3 py-2 text-sm bg-black/40 hover:bg-black/60 rounded border border-white/5 disabled:opacity-50 transition-colors"
          >
            {isProcessing ? 'Processing...' : 'Recolor to Violet'}
          </button>
        </div>
      </div>
      
      <div className="p-3 border border-dashed border-white/10 rounded-xl bg-black/20">
         <p className="text-xs text-muted-foreground text-center">
            Generative functionality (e.g. "Generate icon set") requires an active LLM provider configuration.
         </p>
      </div>
    </div>
  );
}

function EmbroideryTab() {
  const { objects, selection } = useEditorStore();
  const selectedObjs = objects.filter(o => selection.includes(o.id));
  
  const estimateStitches = () => {
    if (selectedObjs.length === 0) return 0;
    return Math.floor(selectedObjs.reduce((acc, obj) => acc + (obj.width * obj.height * 0.05), 0));
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 text-primary mb-2">
        <Scissors size={20} />
        <h3 className="font-semibold text-sm">Embroidery Mode</h3>
      </div>
      
      <div className="bg-black/40 border border-white/5 p-4 rounded-xl space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Selection</span>
          <span>{selection.length} shape(s)</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Est. Stitches</span>
          <span className="font-mono text-primary font-medium">{estimateStitches().toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Colors</span>
          <span>{new Set(selectedObjs.map(o => o.fill).filter(f => f !== 'none')).size}</span>
        </div>
      </div>
      
      {selection.length > 0 ? (
        <button className="w-full py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors font-medium shadow-[0_0_15px_rgba(139,92,246,0.2)]">
          Preview Stitch Path
        </button>
      ) : (
        <p className="text-xs text-center text-muted-foreground mt-4">Select shapes to preview</p>
      )}

      <div className="mt-4 p-3 border border-white/5 bg-black/20 rounded-xl">
         <p className="text-xs text-muted-foreground text-center">
            Preview estimates only. Production machine-file export is not included in this foundation.
         </p>
      </div>
    </div>
  );
}

export default function RightSidebar() {
  const [activeTab, setActiveTab] = useState<'design'|'layers'|'ai'|'embroidery'>('design');

  const tabs = [
    { id: 'design', label: 'Design' },
    { id: 'layers', label: 'Layers' },
    { id: 'ai', label: 'AI' },
    { id: 'embroidery', label: 'Embroidery' },
  ] as const;

  return (
    <div className="editor-inspector absolute right-6 top-20 bottom-6 w-80 bg-card/80 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl flex flex-col overflow-hidden z-10 transition-[width,right] duration-200">
      <div className="flex p-2 gap-1 border-b border-white/5 bg-black/20">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
              activeTab === tab.id ? 'bg-primary/20 text-primary border border-primary/20 shadow-sm' : 'text-muted-foreground hover:bg-white/5 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {activeTab === 'design' && <PropertiesTab />}
        {activeTab === 'layers' && <LayersTab />}
        {activeTab === 'ai' && <AITab />}
        {activeTab === 'embroidery' && <EmbroideryTab />}
      </div>
    </div>
  );
}
