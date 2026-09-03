import React, { useState, useEffect } from 'react';
import { useEditorStore, editorStore, updateObject, updateSelectedObjects, selectObject, setObjects, alignSelection, distributeSelection, combineSelection, breakApartSelection, offsetSelection } from '../../store/editor';
import { convertTextObjectsToPaths, describeFontSubstitution } from '../../lib/textConvert';
import { Box, Wand2, Scissors, Eye, EyeOff, Lock, Unlock, Copy, Trash2, Group, Ungroup, Star, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, Rows3, Columns3, ScanSearch } from 'lucide-react';
import { VectorObject } from '../../lib/types';
import { performBooleanOp, isAxisAlignedRect, objectToPathData } from '../../lib/booleanOps';
import { pathDataBounds } from '../../lib/pathUtils';
import { generateId } from '../../lib/utils';
import { requestTraceLayer } from '../../lib/traceRequest';
import { pxToUnit, unitToPx } from '../../lib/units';
import AIWorkspace from './AIWorkspace';
import EmbroideryPanel from './EmbroideryPanel';
import PreviewPanel from './PreviewPanel';

function PrecisionPanel() {
  const { unit, snapToGrid, snapToObjects, gridSize, guides } = useEditorStore();
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Precision</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="space-y-1">
          <span className="text-muted-foreground">Units</span>
          <select value={unit} onChange={event => editorStore.set({ unit: event.target.value as typeof unit })} className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5">
            {['px', 'mm', 'cm', 'in', 'pt'].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">Grid ({unit})</span>
          <input type="number" min="0.1" value={Number(pxToUnit(gridSize, unit).toFixed(2))} onChange={event => editorStore.set({ gridSize: Math.max(0.1, unitToPx(Number(event.target.value), unit)) })} className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 font-mono" />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={() => editorStore.set({ snapToGrid: !snapToGrid })} className={`flex-1 px-2 py-1.5 rounded-md border text-xs ${snapToGrid ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-black/30 border-white/10 text-muted-foreground'}`}>Grid snap</button>
        <button onClick={() => editorStore.set({ snapToObjects: !snapToObjects })} className={`flex-1 px-2 py-1.5 rounded-md border text-xs ${snapToObjects ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-black/30 border-white/10 text-muted-foreground'}`}>Object snap</button>
      </div>
      {guides.length > 0 && <button onClick={() => editorStore.set({ guides: [] })} className="mt-2 text-xs text-muted-foreground hover:text-foreground">Clear {guides.length} guide{guides.length === 1 ? '' : 's'}</button>}
    </div>
  );
}

function SelectionTools() {
  const { objects, selection } = useEditorStore();
  const [notice, setNotice] = useState('');
  const [offset, setOffset] = useState(8);
  const runBoolean = (operation: 'union' | 'intersection' | 'difference' | 'exclusion') => {
    const selected = objects.filter(object => selection.includes(object.id));
    if (selected.length !== 2 || !selected.every(isAxisAlignedRect)) {
      setNotice('Boolean operations support exactly two unrotated rectangles.');
      return;
    }
    const result = performBooleanOp(operation, selected[0], selected[1]);
    if (!result) {
      setNotice(operation === 'intersection' ? 'The selected rectangles do not overlap.' : 'This operation produced no visible geometry.');
      return;
    }
    setObjects([...objects.filter(object => !selection.includes(object.id)), result]);
    editorStore.set({ selection: [result.id] });
    setNotice(`${operation[0].toUpperCase()}${operation.slice(1)} created an editable path.`);
  };
  const run = (action: () => string | null) => setNotice(action() || 'Operation completed.');

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Align & distribute</h3>
        <div className="grid grid-cols-4 gap-1">
          {[
            ['Left', AlignLeft, () => alignSelection('left')],
            ['Center', AlignCenter, () => alignSelection('center')],
            ['Right', AlignRight, () => alignSelection('right')],
            ['Top', AlignStartVertical, () => alignSelection('top')],
            ['Middle', AlignCenterVertical, () => alignSelection('middle')],
            ['Bottom', AlignEndVertical, () => alignSelection('bottom')],
            ['Distribute X', Columns3, () => distributeSelection('x')],
            ['Distribute Y', Rows3, () => distributeSelection('y')],
          ].map(([label, Icon, action]) => {
            const ToolIcon = Icon as typeof AlignLeft;
            return <button key={label as string} title={label as string} onClick={action as () => void} className="flex items-center justify-center p-2 bg-black/30 border border-white/10 rounded-md hover:border-primary/40 disabled:opacity-30" disabled={selection.length < ((label as string).startsWith('Distribute') ? 3 : 2)}><ToolIcon size={14} /></button>;
          })}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Geometry</h3>
        <div className="grid grid-cols-2 gap-1">
          {(['union', 'intersection', 'difference', 'exclusion'] as const).map(operation => <button key={operation} onClick={() => runBoolean(operation)} className="px-2 py-1.5 bg-black/30 border border-white/10 rounded-md text-xs capitalize hover:border-primary/40">{operation}</button>)}
          <button onClick={() => run(combineSelection)} className="px-2 py-1.5 bg-black/30 border border-white/10 rounded-md text-xs hover:border-primary/40">Combine</button>
          <button onClick={() => run(breakApartSelection)} className="px-2 py-1.5 bg-black/30 border border-white/10 rounded-md text-xs hover:border-primary/40">Break apart</button>
        </div>
        <div className="mt-2 flex gap-1">
          <input aria-label="Offset amount" type="number" value={offset} onChange={event => setOffset(Number(event.target.value))} className="w-20 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs font-mono" />
          <button onClick={() => run(() => offsetSelection(offset))} className="flex-1 px-2 py-1 bg-black/30 border border-white/10 rounded-md text-xs hover:border-primary/40">Offset rectangles</button>
        </div>
        {notice && <p role="status" className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{notice}</p>}
      </div>
    </div>
  );
}

function PropertiesTab({ onOpenTracePanel }: { onOpenTracePanel?: () => void }) {
  const { objects, selection, artboard, unit } = useEditorStore();
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
               value={Number(pxToUnit(artboard.width, unit).toFixed(unit === 'px' ? 0 : 2))}
               onChange={e => editorStore.set({ artboard: { ...artboard, width: Math.max(1, unitToPx(Number(e.target.value), unit)) } })}
                className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Height</label>
              <input 
                type="number" 
               value={Number(pxToUnit(artboard.height, unit).toFixed(unit === 'px' ? 0 : 2))}
               onChange={e => editorStore.set({ artboard: { ...artboard, height: Math.max(1, unitToPx(Number(e.target.value), unit)) } })}
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
        <PrecisionPanel />
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
        <GroupPartsPanel />
        <SelectionTools />
        <PrecisionPanel />
      </div>
    );
  }

  if (!selectedObj) return null;

  const handleUpdate = (partial: Partial<VectorObject>) => {
    updateObject(selectedObj.id, partial);
  };
  const displayed = (value: number) => Number(pxToUnit(value, unit).toFixed(unit === 'px' ? 0 : 2));
  const updateMeasurement = (key: 'x' | 'y' | 'width' | 'height', value: number) => handleUpdate({ [key]: key === 'width' || key === 'height' ? Math.max(0.1, unitToPx(value, unit)) : unitToPx(value, unit) });

  return (
    <div className="p-4 space-y-6">
      <PrecisionPanel />
      {/* Layout */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Box size={14}/> Layout</h3>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <div className="flex items-center bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary">
            <span className="text-xs text-muted-foreground w-4">X</span>
            <input 
              type="number" 
              value={displayed(selectedObj.x)}
              onChange={e => updateMeasurement('x', Number(e.target.value))}
              className="w-full bg-transparent border-none py-1.5 text-sm focus:outline-none text-right font-mono"
            />
          </div>
          <div className="flex items-center bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary">
            <span className="text-xs text-muted-foreground w-4">Y</span>
            <input 
              type="number" 
              value={displayed(selectedObj.y)}
              onChange={e => updateMeasurement('y', Number(e.target.value))}
              className="w-full bg-transparent border-none py-1.5 text-sm focus:outline-none text-right font-mono"
            />
          </div>
          <div className="flex items-center bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary">
            <span className="text-xs text-muted-foreground w-4">W</span>
            <input 
              type="number" 
              value={displayed(selectedObj.width)}
              onChange={e => updateMeasurement('width', Number(e.target.value))}
              className="w-full bg-transparent border-none py-1.5 text-sm focus:outline-none text-right font-mono"
            />
          </div>
          <div className="flex items-center bg-black/40 border border-white/10 rounded-md px-2 focus-within:border-primary">
            <span className="text-xs text-muted-foreground w-4">H</span>
            <input 
              type="number" 
              value={displayed(selectedObj.height)}
              onChange={e => updateMeasurement('height', Number(e.target.value))}
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

      <div className="h-px bg-white/10" />
      <SelectionTools />

      {selectedObj.type === 'image' && (
        <>
          <div className="h-px bg-white/10" />
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Image</h3>
            <button
              onClick={() => { requestTraceLayer(selectedObj.id); onOpenTracePanel?.(); }}
              data-testid="button-trace-to-shapes"
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
            >
              <ScanSearch size={13} /> Trace to shapes
            </button>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              Turns this image into editable color shapes you can recolor, reshape, delete, and stitch. Photos are simplified to a few flat colors.
            </p>
          </div>
        </>
      )}

      {selectedObj.type === 'path' && selectedObj.groupId && (
        <>
          <div className="h-px bg-white/10" />
          <GroupPartsPanel />
        </>
      )}

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
            <div className="grid grid-cols-2 gap-2 mt-2">
              <label className="text-xs text-muted-foreground">Family
                <select value={selectedObj.fontFamily || 'Inter'} onChange={e => handleUpdate({ fontFamily: e.target.value })} className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-foreground">
                  {['Inter', 'Arial', 'Georgia', 'Courier New', 'Trebuchet MS'].map(font => <option key={font}>{font}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">Weight
                <select value={selectedObj.fontWeight || '400'} onChange={e => handleUpdate({ fontWeight: e.target.value })} className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-foreground">
                  {['300', '400', '500', '600', '700', '800'].map(weight => <option key={weight}>{weight}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">Size
                <input type="number" min="1" value={selectedObj.fontSize || 16} onChange={e => handleUpdate({ fontSize: Math.max(1, Number(e.target.value)) })} className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-foreground font-mono" />
              </label>
              <label className="text-xs text-muted-foreground">Spacing
                <input type="number" value={selectedObj.letterSpacing || 0} onChange={e => handleUpdate({ letterSpacing: Number(e.target.value) })} className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-foreground font-mono" />
              </label>
              <label className="text-xs text-muted-foreground">Line height
                <input type="number" min="0.5" step="0.1" value={selectedObj.lineHeight || 1.2} onChange={e => handleUpdate({ lineHeight: Math.max(0.5, Number(e.target.value)) })} className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-foreground font-mono" />
              </label>
              <label className="text-xs text-muted-foreground">Alignment
                <select value={selectedObj.textAlign || 'left'} onChange={e => handleUpdate({ textAlign: e.target.value as VectorObject['textAlign'] })} className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-foreground">
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
              </label>
            </div>
            <label className="text-xs text-muted-foreground block mt-2">Text path
              <select value={selectedObj.textPathId || ''} onChange={e => handleUpdate({ textPathId: e.target.value || undefined })} className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-foreground">
                <option value="">No path</option>
                {objects.filter(object => object.type === 'path').map(path => <option key={path.id} value={path.id}>{path.name}</option>)}
              </select>
            </label>
            <ConvertToOutlines object={selectedObj} />
          </div>
        </>
      )}
    </div>
  );
}

function ConvertToOutlines({ object }: { object: VectorObject }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const substitution = describeFontSubstitution(object.fontFamily, object.fontWeight);

  const handleConvert = async () => {
    setBusy(true);
    setNotice('');
    try {
      const result = await convertTextObjectsToPaths(editorStore.get().objects, [object.id]);
      const replacement = result.replacements.get(object.id);
      if (replacement) {
        setObjects(editorStore.get().objects.map(item => (item.id === object.id ? replacement : item)));
      }
      const messages = [...result.notes, ...result.failures.map(failure => failure.message)];
      if (messages.length) setNotice(messages.join(' '));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The text could not be converted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-1.5">
      <button
        onClick={() => void handleConvert()}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-white/10 bg-black/30 hover:bg-white/5 disabled:opacity-50 text-xs transition-colors"
      >
        <Wand2 size={12} /> {busy ? 'Converting\u2026' : 'Convert to outlines'}
      </button>
      {substitution && (
        <p className="text-[10px] text-amber-400/90">This font isn't bundled for outlines {'\u2014'} conversion uses {substitution} (open-licensed match).</p>
      )}
      <p className="text-[10px] text-muted-foreground">Turns the text into editable paths so it can be stitched. Undo restores the editable text.</p>
      {notice && <p role="status" className="text-[10px] leading-relaxed text-amber-300">{notice}</p>}
    </div>
  );
}

/**
 * Quick actions for a group made of path parts (e.g. a traced image):
 * select/delete individual parts, merge same-color parts, drop tiny ones.
 */
function GroupPartsPanel() {
  const { objects, selection } = useEditorStore();
  const selected = objects.filter(object => selection.includes(object.id));
  const groupIds = new Set(selected.map(object => object.groupId).filter((value): value is string => Boolean(value)));
  if (!selected.length || groupIds.size !== 1) return null;
  const groupId = [...groupIds][0];
  const members = objects.filter(object => object.groupId === groupId);
  const paths = members.filter(object => object.type === 'path');
  if (paths.length < 2 || paths.length !== members.length) return null;

  const isTraced = paths.some(object => object.traceRole);
  const selectedPart = selection.length === 1 ? paths.find(object => object.id === selection[0]) : undefined;
  const bounds = members.reduce(
    (acc, object) => ({
      minX: Math.min(acc.minX, object.x),
      minY: Math.min(acc.minY, object.y),
      maxX: Math.max(acc.maxX, object.x + object.width),
      maxY: Math.max(acc.maxY, object.y + object.height),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const groupArea = Math.max(1, (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY));
  const tinyIds = paths
    .filter(object => object.traceRole !== 'background' && object.width * object.height < groupArea * 0.005)
    .map(object => object.id);

  const colorCounts = new Map<string, number>();
  paths.forEach(object => {
    const key = object.fill.toLowerCase();
    colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
  });
  const mergeableColors = [...colorCounts.entries()].filter(([, count]) => count > 1).map(([color]) => color);
  const hasBackground = paths.some(object => object.traceRole === 'background');

  const deletePart = (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    const current = editorStore.get();
    setObjects(current.objects.filter(object => object.id !== id));
    editorStore.set({ selection: current.selection.filter(selectedId => selectedId !== id) });
  };

  const mergeSameColors = () => {
    let next = [...editorStore.get().objects];
    const mergedIds: string[] = [];
    for (const color of mergeableColors) {
      const list = next.filter(object => object.groupId === groupId && object.type === 'path' && object.fill.toLowerCase() === color);
      if (list.length < 2) continue;
      const pathParts = list.map(objectToPathData);
      if (pathParts.some(part => !part)) continue;
      const points = pathParts.join(' ');
      // Only keep a trace role every member shares — merging the background
      // part with a regular part must not mark the result as background
      // (background parts are skipped when stitching).
      const sharedRole = list.every(object => object.traceRole === list[0].traceRole) ? list[0].traceRole : undefined;
      const merged: VectorObject = {
        ...list[0],
        id: generateId(),
        name: `Merged · ${list[0].fill}`,
        ...pathDataBounds(points),
        rotation: 0,
        points,
        nodes: undefined,
        closed: true,
        traceRole: sharedRole,
      };
      const insertAt = next.findIndex(object => object.id === list[0].id);
      const removed = new Set(list.map(object => object.id));
      next = next.filter(object => !removed.has(object.id));
      next.splice(Math.min(insertAt, next.length), 0, merged);
      mergedIds.push(merged.id);
    }
    if (!mergedIds.length) return;
    setObjects(next);
    editorStore.set({ selection: mergedIds });
  };

  const removeTinyParts = () => {
    if (!tinyIds.length || tinyIds.length >= paths.length) return;
    const removed = new Set(tinyIds);
    const current = editorStore.get();
    setObjects(current.objects.filter(object => !removed.has(object.id)));
    editorStore.set({ selection: current.selection.filter(id => !removed.has(id)) });
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {isTraced ? 'Traced parts' : 'Group parts'} ({paths.length})
      </h3>
      {isTraced && (
        <p className="mb-2 text-[9px] leading-relaxed text-muted-foreground">
          Choose one part below to move, resize, recolor, or delete it.
        </p>
      )}
      <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-1 pr-1">
        {paths.map(part => (
          <div
            key={part.id}
            role="button"
            tabIndex={0}
            data-testid={`row-part-${part.id}`}
            onClick={() => editorStore.set({ selection: [part.id] })}
            onKeyDown={event => { if (event.key === 'Enter') editorStore.set({ selection: [part.id] }); }}
            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md border cursor-pointer transition-colors ${
              selection.includes(part.id) && selection.length === 1
                ? 'border-primary/40 bg-primary/10'
                : 'border-white/10 bg-black/30 hover:border-primary/30'
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0" style={{ background: part.fill }} />
            <span className="text-[10px] truncate flex-1">{part.name}</span>
            {part.traceRole === 'background' && (
              <span className="text-[8px] px-1 rounded bg-white/10 text-muted-foreground shrink-0" title="Skipped when stitching unless included">BG</span>
            )}
            <button
              onClick={event => deletePart(event, part.id)}
              className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive shrink-0"
              title="Delete this part"
              data-testid={`button-delete-part-${part.id}`}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
      {selectedPart && isTraced && (
        <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[9px] text-muted-foreground">
          Editing <span className="font-medium text-foreground">{selectedPart.name}</span>. Use the Layout and Fill controls above, drag it on the canvas, or press Delete.
        </div>
      )}
      <div className="grid grid-cols-2 gap-1 mt-2">
        <button
          onClick={mergeSameColors}
          disabled={!mergeableColors.length}
          data-testid="button-merge-same-colors"
          className="px-2 py-1.5 bg-black/30 border border-white/10 rounded-md text-[10px] hover:border-primary/40 disabled:opacity-30"
          title="Combine parts that share a fill color into one path each"
        >
          Merge same colors
        </button>
        <button
          onClick={removeTinyParts}
          disabled={!tinyIds.length}
          data-testid="button-remove-tiny-parts"
          className="px-2 py-1.5 bg-black/30 border border-white/10 rounded-md text-[10px] hover:border-primary/40 disabled:opacity-30"
          title="Delete parts smaller than 0.5% of the group"
        >
          Remove tiny parts{tinyIds.length ? ` (${tinyIds.length})` : ''}
        </button>
      </div>
      {hasBackground && (
        <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
          The BG part is treated as the image background — digitizing skips it unless you choose to include it.
        </p>
      )}
      <p className="mt-1 text-[9px] text-muted-foreground">Tip: Alt-click a part on the canvas to select it directly.</p>
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



export default function RightSidebar() {
  const workspaceMode = useEditorStore().workspaceMode;
  const [activeTab, setActiveTab] = useState<'design'|'layers'|'ai'|'embroidery'|'preview'>('design');

  // Keep the tab in sync when another surface (e.g. the one-click
  // "Embroider design" flow) switches the workspace mode.
  useEffect(() => {
    setActiveTab(current => {
      if (workspaceMode === 'embroidery') return 'embroidery';
      if (workspaceMode === 'preview') return 'preview';
      return current === 'embroidery' || current === 'preview' ? 'design' : current;
    });
  }, [workspaceMode]);

  const tabs = [
    { id: 'design', label: 'Design' },
    { id: 'layers', label: 'Layers' },
    { id: 'ai', label: 'AI' },
    { id: 'embroidery', label: 'Embroidery' },
    { id: 'preview', label: 'Preview' },
  ] as const;

  return (
    <div className="editor-inspector absolute right-6 top-20 bottom-6 w-80 bg-card/80 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl flex flex-col overflow-hidden z-10 transition-[width,right] duration-200">
      <div className="flex p-2 gap-1 border-b border-white/5 bg-black/20 overflow-x-auto custom-scrollbar scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); editorStore.set({ workspaceMode: tab.id === "embroidery" ? "embroidery" : tab.id === "preview" ? "preview" : "design" }); }}
            className={`flex-none px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
              activeTab === tab.id ? 'bg-primary/20 text-primary border border-primary/20 shadow-sm' : 'text-muted-foreground hover:bg-white/5 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {activeTab === 'design' && <PropertiesTab onOpenTracePanel={() => setActiveTab('ai')} />}
        {activeTab === 'layers' && <LayersTab />}
        {activeTab === 'ai' && <AIWorkspace />}
        {activeTab === 'embroidery' && <EmbroideryPanel />}
        {activeTab === 'preview' && <PreviewPanel />}
      </div>
    </div>
  );
}
