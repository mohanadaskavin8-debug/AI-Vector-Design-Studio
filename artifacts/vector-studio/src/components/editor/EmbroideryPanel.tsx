import React, { useState, useMemo } from 'react';
import { useEditorStore } from '../../store/editor';
import { useEmbroideryStore, setEmbroideryRegions, updateEmbroideryRegion, selectEmbroideryRegion, setHoop, moveRegion, deleteRegion } from '../../store/embroidery';
import { Scissors, AlertTriangle, Wand2, Download, Layers, CheckCircle2, Info, Eye, EyeOff, Trash2, ArrowUp, ArrowDown, RefreshCw, X, Play } from 'lucide-react';
import { generateId } from '../../lib/utils';
import { StitchRegion, generateStitches, computeMetrics, inspectEmbroidery, commandsBounds, getGeometryQuality, EmbroideryGenerationError, computeSourceFingerprint, isRegionStale } from '../../lib/embroidery';
import { encodeDst, encodePes, machineExportPreflight, MachineExportFormat } from '../../lib/machineExport';
import { useAssistStore, dismissAssistSummary, clearAssistError } from '../../store/assist';
import { buildDefaultRegionSettings } from '../../lib/digitize';
import { startAssistedDigitize } from '../../lib/assistedFlow';
import { openPlayback } from '../../store/playback';

export default function EmbroideryPanel() {
  const { objects, selection, artboard } = useEditorStore();
  const { design, selectedRegionIds, storageWarning } = useEmbroideryStore();
  const [activeTab, setActiveTab] = useState<'regions' | 'properties' | 'export'>('regions');
  const [digitizeNotice, setDigitizeNotice] = useState('');
  const assist = useAssistStore();

  const metrics = useMemo(() => computeMetrics(design), [design]);
  const warnings = useMemo(() => inspectEmbroidery(design), [design]);
  const machineWarnings = useMemo(() => ({
    DST: machineExportPreflight(design, 'DST'),
    PES: machineExportPreflight(design, 'PES'),
  }), [design]);
  const sourceById = useMemo(() => new Map(objects.map(o => [o.id, o])), [objects]);
  const staleRegionIds = useMemo(
    () => new Set(design.regions.filter(r => isRegionStale(r, sourceById.get(r.sourceObjectId))).map(r => r.id)),
    [design.regions, sourceById],
  );

  const handleDigitize = () => {
     if (selection.length === 0) return;
     
     let currentRegions = [...design.regions];
      let noticeSkipped = 0;
      const generationErrors: string[] = [];
      const satinNotes: string[] = [];
     
     objects.forEach(obj => {
         if (!selection.includes(obj.id)) return;
         if (!obj.visible || obj.locked) {
            noticeSkipped++;
            return;
         }
        
        if (['text', 'image'].includes(obj.type)) {
           noticeSkipped++;
           return;
        }

        // Find existing region for this source, or create new
        const existingIdx = currentRegions.findIndex(r => r.sourceObjectId === obj.id);
        const existing = existingIdx >= 0 ? currentRegions[existingIdx] : null;

        // Shared defaults (same as the assisted flow): thin closed shapes
        // default to satin columns; existing regions keep their settings.
        const defaults = existing ? null : buildDefaultRegionSettings(obj);
        const settings = existing ? existing.settings : defaults!.settings;
        if (defaults?.autoSatin) satinNotes.push(`${obj.name} (\u2248${defaults.autoSatin.widthMm.toFixed(1)} mm)`);
        
         let cmds;
         try {
           cmds = generateStitches(obj, settings);
         } catch (error) {
           noticeSkipped++;
           generationErrors.push(error instanceof Error ? `${obj.name}: ${error.message}` : `${obj.name}: stitch generation failed.`);
           return;
         }
        
         const geometry = getGeometryQuality(obj);
        
        const region: StitchRegion = {
           id: existing ? existing.id : generateId(),
           sourceObjectId: obj.id,
           sourceType: obj.type,
           name: `Stitch Region (${obj.name})`,
           visible: existing ? existing.visible : true,
           settings,
           commands: cmds,
           bounds: commandsBounds(cmds),
            geometryQuality: geometry.quality,
            geometryNote: geometry.note,
            sourceFingerprint: computeSourceFingerprint(obj)
        };
        
        if (existingIdx >= 0) {
           currentRegions[existingIdx] = region;
        } else {
           currentRegions.push(region);
        }
     });
     
      const skippedNotice = noticeSkipped > 0
        ? `Skipped ${noticeSkipped} layer${noticeSkipped === 1 ? '' : 's'}. Hidden/locked layers are excluded; convert text to paths or trace raster images first.`
        : `${selection.length} selected layer${selection.length === 1 ? '' : 's'} digitized or refreshed.`;
      const satinNotice = satinNotes.length > 0
        ? `Thin shapes defaulted to satin columns: ${satinNotes.join(', ')}. Switch any back to fill in Properties.`
        : '';
      setDigitizeNotice([skippedNotice, satinNotice, ...generationErrors].filter(Boolean).join(' '));
      if (!design.hoop.centerX || !design.hoop.centerY) {
        setHoop({ ...design.hoop, centerX: artboard.width / 2, centerY: artboard.height / 2 });
      }
      try {
        setEmbroideryRegions(currentRegions);
      } catch (error) {
        setDigitizeNotice(error instanceof Error ? error.message : 'The stitch plan could not be updated.');
      }
     setActiveTab('regions');
  };
  
  const handleUpdateRegion = (id: string, updates: Partial<StitchRegion['settings']>) => {
     const region = design.regions.find(r => r.id === id);
     if (!region) return;
     
     const newSettings = { ...region.settings, ...updates };
     
     const sourceObj = objects.find(o => o.id === region.sourceObjectId);
     let newCmds = region.commands;
     let bounds = region.bounds;
      if (sourceObj) {
         try {
           newCmds = generateStitches(sourceObj, newSettings);
           bounds = commandsBounds(newCmds);
         } catch (error) {
           setDigitizeNotice(error instanceof EmbroideryGenerationError ? error.message : 'This region could not be regenerated.');
           return;
         }
     }
     
      try {
        updateEmbroideryRegion(id, { 
          settings: newSettings,
          commands: newCmds,
          bounds,
          // Regeneration used the current source geometry, so the region is
          // fresh again after a settings change.
          ...(sourceObj ? { sourceFingerprint: computeSourceFingerprint(sourceObj) } : {})
        });
      } catch (error) {
        setDigitizeNotice(error instanceof Error ? error.message : 'The stitch plan could not be updated.');
      }
  };

  const handleRefreshStale = () => {
    const errors: string[] = [];
    let refreshed = 0;
    const next = design.regions.map(region => {
      if (!staleRegionIds.has(region.id)) return region;
      const source = sourceById.get(region.sourceObjectId);
      if (!source) return region;
      try {
        const cmds = generateStitches(source, region.settings);
        const geometry = getGeometryQuality(source);
        refreshed += 1;
        return {
          ...region,
          name: `Stitch Region (${source.name})`,
          commands: cmds,
          bounds: commandsBounds(cmds),
          geometryQuality: geometry.quality,
          geometryNote: geometry.note,
          sourceFingerprint: computeSourceFingerprint(source),
        };
      } catch (error) {
        errors.push(error instanceof Error ? `${source.name}: ${error.message}` : `${source.name}: regeneration failed.`);
        return region;
      }
    });
    try {
      setEmbroideryRegions(next);
      setDigitizeNotice(errors.length
        ? `Refreshed ${refreshed} region${refreshed === 1 ? '' : 's'}. Some failed \u2014 ${errors.join(' ')}`
        : `Refreshed ${refreshed} stale region${refreshed === 1 ? '' : 's'} from the latest artwork.`);
    } catch (error) {
      setDigitizeNotice(error instanceof Error ? error.message : 'The stitch plan could not be updated.');
    }
  };

  const exportSVG = () => {
    const minX = design.regions.reduce((min, r) => Math.min(min, r.bounds.x), Infinity);
    const minY = design.regions.reduce((min, r) => Math.min(min, r.bounds.y), Infinity);
    const maxX = design.regions.reduce((max, r) => Math.max(max, r.bounds.x + r.bounds.width), -Infinity);
    const maxY = design.regions.reduce((max, r) => Math.max(max, r.bounds.y + r.bounds.height), -Infinity);
    
    let vb = "0 0 100 100";
    if (minX !== Infinity) {
       vb = `${minX - 10} ${minY - 10} ${maxX - minX + 20} ${maxY - minY + 20}`;
    }

    const svgData = `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">
      ${design.regions.filter(r => r.visible).map(r => 
        `<path d="${r.commands.map(c => `${c.type === 'stitch' ? 'L' : 'M'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' ')}" stroke="${/^#[0-9a-f]{6}$/i.test(r.settings.color.hex) ? r.settings.color.hex : '#ffffff'}" stroke-width="1.5" fill="none" stroke-linejoin="round" />`
      ).join('\\n')}
    </svg>`;
    
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'embroidery-preview.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stitch-plan.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportMachineFile = (format: MachineExportFormat) => {
    try {
      const bytes = format === 'DST' ? encodeDst(design, { name: 'DESIGN' }) : encodePes(design, { name: 'DESIGN' });
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stitch-design.${format.toLowerCase()}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setDigitizeNotice(error instanceof Error ? error.message : 'Machine export failed.');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 bg-primary/10 border-b border-primary/20 shrink-0">
         <div className="flex items-center gap-2 text-primary mb-1">
           <Scissors size={16} />
           <h3 className="font-semibold text-xs">Embroidery Workspace</h3>
         </div>
         <p className="text-[9px] text-muted-foreground leading-tight">
           Deterministic preparation, stitch inspection, and machine-format export.
         </p>
         {storageWarning && <p role="status" className="mt-2 rounded border border-amber-500/20 bg-amber-500/10 p-2 text-[9px] leading-relaxed text-amber-300">{storageWarning}</p>}
      </div>

      <div className="flex p-2 gap-1 border-b border-white/5 bg-black/20 shrink-0">
        <button
          onClick={() => setActiveTab('regions')}
           title="Review stitch order, visibility, and which artwork has been digitized"
          className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all duration-200 ${
            activeTab === 'regions' ? 'bg-primary/20 text-primary border border-primary/20 shadow-sm' : 'text-muted-foreground hover:bg-white/5 border border-transparent'
          }`}
        >
          Regions
        </button>
        <button
          onClick={() => setActiveTab('properties')}
           title="Adjust stitch type, density, angle, underlay, pull compensation, and thread color for the selected region"
          className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all duration-200 ${
            activeTab === 'properties' ? 'bg-primary/20 text-primary border border-primary/20 shadow-sm' : 'text-muted-foreground hover:bg-white/5 border border-transparent'
          }`}
        >
          Properties
        </button>
        <button
          onClick={() => setActiveTab('export')}
           title="Choose a hoop, review production warnings and measurements, then download a machine file"
          className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all duration-200 ${
            activeTab === 'export' ? 'bg-primary/20 text-primary border border-primary/20 shadow-sm' : 'text-muted-foreground hover:bg-white/5 border border-transparent'
          }`}
        >
          Export
        </button>
      </div>
      {digitizeNotice && (
        <div role="status" className="mx-3 mt-3 rounded-md border border-white/10 bg-black/30 px-2.5 py-2 text-[9px] leading-relaxed text-muted-foreground">
          {digitizeNotice}
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {activeTab === 'regions' && (
           <div className="space-y-4">
              {assist.error && (
                <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[10px] leading-relaxed text-destructive">
                  {assist.error}
                  <button onClick={clearAssistError} className="ml-2 underline">Dismiss</button>
                </div>
              )}
              {assist.summary && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-primary">
                      <CheckCircle2 size={12} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Design digitized</span>
                    </div>
                    <button aria-label="Dismiss digitize summary" onClick={dismissAssistSummary} className="p-0.5 opacity-60 hover:opacity-100 transition-opacity"><X size={12} /></button>
                  </div>
                  <p className="text-[10px] text-foreground leading-snug">
                    {assist.summary.converted.length} region{assist.summary.converted.length === 1 ? '' : 's'} {'\u00b7'} {assist.summary.totalStitches.toLocaleString()} stitches
                    {assist.summary.textConverted.length > 0 && ` \u00b7 ${assist.summary.textConverted.length} text layer${assist.summary.textConverted.length === 1 ? '' : 's'} outlined`}
                  </p>
                  {assist.summary.hoop && (
                    <p className={`text-[10px] leading-snug ${assist.summary.hoop.fits ? 'text-muted-foreground' : 'text-amber-400'}`}>
                      {assist.summary.hoop.fits
                        ? `Hoop ${assist.summary.hoop.name} mm auto-selected \u2014 design is ${assist.summary.hoop.planWidthMm.toFixed(0)} \u00d7 ${assist.summary.hoop.planHeightMm.toFixed(0)} mm.`
                        : `Design is ${assist.summary.hoop.planWidthMm.toFixed(0)} \u00d7 ${assist.summary.hoop.planHeightMm.toFixed(0)} mm \u2014 larger than the biggest ${assist.summary.hoop.name} mm hoop. Scale the artwork down or split it.`}
                    </p>
                  )}
                  {assist.summary.totalStitches > 0 && (
                    <button
                      onClick={() => openPlayback()}
                      data-testid="button-watch-stitchout"
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-primary/30 bg-primary/15 text-primary hover:bg-primary/25 text-[10px] font-medium transition-colors"
                    >
                      <Play size={11} /> Watch stitch-out
                    </button>
                  )}
                  {assist.summary.converted.some(entry => entry.autoSatinWidthMm != null) && (
                    <div className="space-y-1 pt-1 border-t border-white/5">
                      <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Satin applied</div>
                      {assist.summary.converted.filter(entry => entry.autoSatinWidthMm != null).map((entry, i) => (
                        <p key={i} className="text-[9px] text-muted-foreground leading-tight">
                          <span className="text-foreground">{entry.name}</span> {'\u2014'} consistently {'\u2248'}{entry.autoSatinWidthMm!.toFixed(1)} mm across, so a satin column covers it more cleanly than fill.
                        </p>
                      ))}
                      <p className="text-[9px] text-muted-foreground leading-tight">Prefer fill? Switch any region{'\u2019'}s stitch type in the Properties tab.</p>
                    </div>
                  )}
                  {assist.summary.skipped.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-white/5">
                      <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Skipped</div>
                      {assist.summary.skipped.map(skip => (
                        <p key={skip.id} className="text-[9px] text-muted-foreground leading-tight">
                          <span className="text-foreground">{skip.name}</span> {'\u2014'} {skip.detail}
                        </p>
                      ))}
                    </div>
                  )}
                  {assist.summary.backgroundSkipped && !assist.summary.includeBackgroundUsed && (
                    <button
                      onClick={() => void startAssistedDigitize({ includeBackground: true, convertText: 'skip', scopeSelection: assist.scopeSelection })}
                      className="w-full py-1.5 rounded-md border border-white/10 bg-black/30 hover:bg-white/5 text-[10px] transition-colors"
                    >
                      Include background anyway
                    </button>
                  )}
                  {(assist.summary.fontNotes.length > 0 || assist.summary.failures.length > 0) && (
                    <div className="space-y-1 pt-1 border-t border-white/5">
                      {[...assist.summary.fontNotes, ...assist.summary.failures].map((note, i) => (
                        <p key={i} className="text-[9px] text-amber-300/90 leading-tight flex gap-1"><Info size={9} className="shrink-0 mt-0.5" />{note}</p>
                      ))}
                    </div>
                  )}
                  {assist.summary.preflight.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-white/5">
                      <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Top preflight findings</div>
                      {assist.summary.preflight.map((w, i) => (
                        <p key={i} className={`text-[9px] leading-tight ${w.severity === 'error' ? 'text-destructive' : w.severity === 'warning' ? 'text-amber-500' : 'text-blue-400'}`}>{w.message}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {selection.length > 0 && (
                <button 
                  onClick={handleDigitize}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 transition-colors font-medium shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                >
                  <Wand2 size={14} /> Digitize {selection.length} Selection(s)
                </button>
              )}
              {design.regions.length === 0 ? (
                 <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-white/10 rounded-xl bg-black/20 mt-4">
                    <Layers className="text-muted-foreground mb-2" size={24} />
                    <p className="text-xs text-muted-foreground mb-3">No stitch regions yet. Embroider the whole design in one click, or select artwork in Design mode and digitize it manually.</p>
                    <button
                      onClick={() => void startAssistedDigitize()}
                      disabled={assist.phase === 'working'}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors font-medium shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                    >
                      <Wand2 size={14} /> {assist.phase === 'working' ? 'Digitizing\u2026' : 'Embroider design'}
                    </button>
                 </div>
              ) : (
                 <div className="space-y-1">
                    <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">Digitized Sequence</div>
                    {staleRegionIds.size > 0 && (
                      <button
                        onClick={handleRefreshStale}
                        className="w-full flex items-center justify-center gap-2 py-1.5 mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-[10px] font-medium transition-colors"
                      >
                        <RefreshCw size={11} /> Refresh {staleRegionIds.size} stale region{staleRegionIds.size === 1 ? '' : 's'}
                      </button>
                    )}
                    {design.regions.map((region, i) => (
                       <div 
                         key={region.id} 
                         onClick={() => selectEmbroideryRegion(region.id)}
                         className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer text-xs transition-colors border ${selectedRegionIds.includes(region.id) ? 'bg-primary/20 text-primary border-primary/30' : 'bg-black/40 hover:bg-white/5 border-white/5'}`}
                       >
                          <div className="w-4 text-[9px] opacity-50 font-mono text-right shrink-0">{i+1}</div>
                          <div className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: region.settings.color.hex }} />
                           <div className="min-w-0 flex-1">
                             <div className="text-[11px] flex items-center gap-1.5">
                               <span className="truncate">{region.name}</span>
                               {staleRegionIds.has(region.id) && (
                                 <span title="The source artwork changed after this region was digitized." className="shrink-0 text-[8px] px-1 py-px rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">Stale</span>
                               )}
                               {!sourceById.get(region.sourceObjectId) && (
                                 <span title="The source object was removed; this region can no longer be regenerated." className="shrink-0 text-[8px] px-1 py-px rounded border border-destructive/30 bg-destructive/10 text-destructive">Source removed</span>
                               )}
                             </div>
                             <div className="text-[8px] text-muted-foreground">{region.commands.filter(command => command.type === 'stitch').length.toLocaleString()} stitches</div>
                           </div>
                          
                          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                              <button aria-label={`${region.visible ? 'Hide' : 'Show'} ${region.name}`} onClick={() => updateEmbroideryRegion(region.id, { visible: !region.visible })} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
                               {region.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                             </button>
                              <button aria-label={`Move ${region.name} earlier`} disabled={i === 0} onClick={() => moveRegion(region.id, 'up')} className="p-1 opacity-50 hover:opacity-100 disabled:opacity-20 transition-opacity"><ArrowUp size={12} /></button>
                              <button aria-label={`Move ${region.name} later`} disabled={i === design.regions.length - 1} onClick={() => moveRegion(region.id, 'down')} className="p-1 opacity-50 hover:opacity-100 disabled:opacity-20 transition-opacity"><ArrowDown size={12} /></button>
                              <button aria-label={`Delete ${region.name}`} title="Remove this region from the stitch plan; the source artwork remains on the canvas" onClick={() => { if (confirm(`Remove ${region.name} from the stitch plan? The source artwork will not be deleted.`)) deleteRegion(region.id); }} className="p-1 text-destructive opacity-50 hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                          </div>
                       </div>
                    ))}
                 </div>
              )}
           </div>
        )}

        {activeTab === 'properties' && (
           <div className="space-y-4">
              {selectedRegionIds.length === 0 ? (
                  <p className="text-xs text-center leading-relaxed text-muted-foreground mt-4">Choose a stitch region in the Regions tab, then return here to adjust its stitch type, density, underlay, angle, and thread.</p>
              ) : (
                 selectedRegionIds.length === 1 ? (
                    <RegionSettingsPanel 
                       region={design.regions.find(r => r.id === selectedRegionIds[0])!} 
                       onUpdate={(u) => handleUpdateRegion(selectedRegionIds[0], u)} 
                       sourceMissing={!objects.find(o => o.id === design.regions.find(r => r.id === selectedRegionIds[0])?.sourceObjectId)}
                    />
                 ) : (
                    <p className="text-xs text-center text-muted-foreground mt-4">Multiple regions selected. Batch editing not supported in MVP.</p>
                 )
              )}
           </div>
        )}

        {activeTab === 'export' && (
           <div className="space-y-4">
              <div className="space-y-2 mb-4">
                 <label className="text-[10px] font-medium text-muted-foreground">Hoop Preset</label>
                 <select 
                   value={design.hoop.name.includes('Custom') ? 'Custom' : design.hoop.name}
                   onChange={e => {
                       const center = { centerX: design.hoop.centerX ?? artboard.width / 2, centerY: design.hoop.centerY ?? artboard.height / 2 };
                       if (e.target.value === '100x100') setHoop({ name: '100x100', widthMm: 100, heightMm: 100, ...center });
                       else if (e.target.value === '130x180') setHoop({ name: '130x180', widthMm: 130, heightMm: 180, ...center });
                       else if (e.target.value === '200x200') setHoop({ name: '200x200', widthMm: 200, heightMm: 200, ...center });
                      else setHoop({ name: 'Custom', widthMm: design.hoop.widthMm, heightMm: design.hoop.heightMm });
                   }}
                   className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                 >
                   <option value="100x100">100x100 mm</option>
                   <option value="130x180">130x180 mm</option>
                   <option value="200x200">200x200 mm</option>
                   <option value="Custom">Custom...</option>
                 </select>
                 {design.hoop.name.includes('Custom') && (
                    <div className="flex gap-2">
                        <label className="min-w-0 flex-1 text-[9px] text-muted-foreground">Width mm<input aria-label="Custom hoop width in millimeters" min={20} max={500} type="number" value={design.hoop.widthMm} onChange={e => setHoop({ ...design.hoop, widthMm: Number(e.target.value) })} className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs" /></label>
                        <label className="min-w-0 flex-1 text-[9px] text-muted-foreground">Height mm<input aria-label="Custom hoop height in millimeters" min={20} max={500} type="number" value={design.hoop.heightMm} onChange={e => setHoop({ ...design.hoop, heightMm: Number(e.target.value) })} className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs" /></label>
                    </div>
                 )}
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                 <div className="bg-black/40 border border-white/5 p-2 rounded-lg">
                    <div className="text-[9px] text-muted-foreground">Dimensions</div>
                    <div className="text-xs font-mono text-foreground">{metrics.widthMm.toFixed(1)} × {metrics.heightMm.toFixed(1)} mm</div>
                 </div>
                 <div className="bg-black/40 border border-white/5 p-2 rounded-lg">
                    <div className="text-[9px] text-muted-foreground">Total Stitches</div>
                    <div className="text-xs font-mono text-foreground">{metrics.totalStitches.toLocaleString()}</div>
                 </div>
                 <div className="bg-black/40 border border-white/5 p-2 rounded-lg">
                    <div className="text-[9px] text-muted-foreground">Colors / Changes</div>
                    <div className="text-xs font-mono text-foreground">{metrics.colorCount} / {metrics.colorChanges}</div>
                 </div>
                 <div className="bg-black/40 border border-white/5 p-2 rounded-lg">
                    <div className="text-[9px] text-muted-foreground">Est. Sew Time</div>
                    <div className="text-xs font-mono text-foreground">{metrics.sewTimeMins} min</div>
                 </div>
                 <div className="bg-black/40 border border-white/5 p-2 rounded-lg">
                    <div className="text-[9px] text-muted-foreground">Jumps / Trims</div>
                    <div className="text-xs font-mono text-foreground">{metrics.jumps} / {metrics.trims}</div>
                 </div>
                 <div className="bg-black/40 border border-white/5 p-2 rounded-lg">
                    <div className="text-[9px] text-muted-foreground">Thread</div>
                    <div className="text-xs font-mono text-foreground">{metrics.threadLengthM.toFixed(1)} m</div>
                 </div>
              </div>

              {/* Preflight */}
              <div className="bg-black/20 border border-white/5 rounded-xl p-3">
                 <div className="text-[10px] font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><CheckCircle2 size={12} /> Inspection Report</div>
                 <ul className="space-y-1.5">
                     {warnings.map((w, i) => (
                       <li key={i} className={`text-[9px] flex gap-1.5 items-start leading-tight ${w.severity === 'error' ? 'text-destructive' : w.severity === 'warning' ? 'text-amber-500' : 'text-blue-400'}`}>
                          <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                          <div>
                             <span className="block font-medium">{w.message}</span>
                             <span className="block opacity-80">{w.recommendation}</span>
                          </div>
                       </li>
                    ))}
                     {warnings.length === 0 && (
                       <li className="text-[9px] flex gap-1.5 items-center text-emerald-500/90">
                          <CheckCircle2 size={10} /> All heuristics nominal.
                       </li>
                    )}
                 </ul>
              </div>

              {/* Export Actions */}
              <div className="space-y-2">
                 <div className="text-[10px] font-medium text-muted-foreground mb-1.5 px-1">Inspection Data</div>
                 <button onClick={exportSVG} className="w-full flex items-center gap-2 px-3 py-2 bg-black/40 hover:bg-white/5 border border-white/5 rounded-md transition-colors text-xs text-left">
                    <Download size={14} className="text-muted-foreground shrink-0" />
                    <div>
                       <div className="font-medium text-foreground">Preview SVG</div>
                       <div className="text-[9px] text-muted-foreground">Inspectable stitch-path preview.</div>
                    </div>
                 </button>
                 <button onClick={exportJSON} className="w-full flex items-center gap-2 px-3 py-2 bg-black/40 hover:bg-white/5 border border-white/5 rounded-md transition-colors text-xs text-left">
                    <Download size={14} className="text-muted-foreground shrink-0" />
                    <div>
                       <div className="font-medium text-foreground">Plan JSON</div>
                       <div className="text-[9px] text-muted-foreground">Editable stitch-plan commands and metadata.</div>
                    </div>
                 </button>
              </div>

              <div className="space-y-2 pt-2 border-t border-white/10">
                 <div className="text-[10px] font-medium text-muted-foreground mb-1.5 px-1">Machine Formats</div>
                 <div className="flex flex-col gap-1.5">
                     {design.exporters.filter(e => e.machineReady).map(e => {
                       const formatWarnings = machineWarnings[e.format as MachineExportFormat] ?? [];
                       const blocked = formatWarnings.some(w => w.severity === 'error');
                       return (
                         <div key={e.format} className="space-y-1">
                            <button
                              onClick={() => exportMachineFile(e.format as MachineExportFormat)}
                              disabled={blocked}
                              data-testid={`button-export-${e.format.toLowerCase()}`}
                              className="w-full flex items-center gap-2 px-3 py-2 bg-black/40 hover:bg-white/5 border border-white/5 rounded-md transition-colors text-xs text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-black/40"
                            >
                               <Download size={14} className="text-muted-foreground shrink-0" />
                               <div className="min-w-0 flex-1">
                                  <div className="font-medium text-foreground flex items-center gap-1.5">
                                     {e.format === 'DST' ? 'Tajima DST' : `Brother ${e.format}`}
                                     <span className="text-[8px] px-1 py-px rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">Machine ready</span>
                                  </div>
                                  <div className="text-[9px] text-muted-foreground">{e.description}</div>
                               </div>
                            </button>
                            {formatWarnings.map((w, i) => (
                               <p key={i} className={`text-[9px] flex gap-1.5 items-start leading-tight px-1 ${w.severity === 'error' ? 'text-destructive' : w.severity === 'warning' ? 'text-amber-500' : 'text-blue-400/80'}`}>
                                  <Info size={10} className="shrink-0 mt-0.5" />
                                  <span><span className="font-medium">{w.message}</span> {w.recommendation}</span>
                               </p>
                            ))}
                         </div>
                       );
                     })}
                     {design.exporters.filter(e => !e.available).map(e => (
                       <div key={e.format} className="flex items-center justify-between px-3 py-1.5 bg-black/20 border border-white/5 rounded-md opacity-50 select-none">
                          <span className="text-[10px] font-medium">{e.format}</span>
                          <span className="text-[8px] bg-black/40 px-1.5 py-0.5 rounded text-muted-foreground border border-white/10">{e.description}</span>
                       </div>
                    ))}
                 </div>
                 <p className="text-[9px] text-muted-foreground flex items-start gap-1 mt-2">
                    <Info size={10} className="shrink-0 mt-0.5" />
                    Machine files use 0.1 mm units relative to the hoop center. Test the first run on scrap fabric.
                 </p>
              </div>
           </div>
        )}
      </div>
    </div>
  );
}

function RegionSettingsPanel({ region, onUpdate, sourceMissing }: { region: StitchRegion, onUpdate: (u: Partial<StitchRegion['settings']>) => void, sourceMissing: boolean }) {
   const { settings } = region;

   return (
      <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
         {sourceMissing && (
            <div className="bg-destructive/10 border border-destructive/20 p-2 rounded text-[10px] text-destructive flex items-start gap-1">
               <AlertTriangle size={12} className="shrink-0 mt-0.5" />
               Source object missing. Stitch commands cannot be regenerated if settings change.
            </div>
         )}
         
         <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Stitch Type</label>
            <select 
               value={settings.stitchType} 
               onChange={e => onUpdate({ stitchType: e.target.value as any })}
               className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            >
               <option value="fill">Tatami Fill</option>
                <option value="satin">Satin-style scan (approx.)</option>
               <option value="running">Running Stitch</option>
            </select>
         </div>

         <div className="grid grid-cols-2 gap-3">
            <div>
               <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Density (mm)</label>
               <input 
                  type="number" step="0.1" min="0.1" max="2.0"
                  value={settings.density}
                  onChange={e => onUpdate({ density: Number(e.target.value) })}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
               />
            </div>
            <div>
               <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Angle (°)</label>
               <input 
                  type="number" step="1" min="0" max="360"
                  value={settings.angle}
                  onChange={e => onUpdate({ angle: Number(e.target.value) })}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
               />
            </div>
            <div>
               <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Length (mm)</label>
               <input 
                  type="number" step="0.1" min="1.0" max="8.0"
                  value={settings.stitchLength}
                  onChange={e => onUpdate({ stitchLength: Number(e.target.value) })}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
               />
            </div>
            <div>
               <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Pull Comp (mm)</label>
               <input 
                  type="number" step="0.05" min="0" max="1.0"
                  value={settings.pullCompensation}
                  onChange={e => onUpdate({ pullCompensation: Number(e.target.value) })}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
               />
            </div>
         </div>

         <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Underlay</label>
            <select 
               value={settings.underlay} 
               onChange={e => onUpdate({ underlay: e.target.value as any })}
               className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            >
               <option value="none">None</option>
               <option value="center-run">Center Run</option>
               <option value="edge-run">Edge Run</option>
               <option value="zigzag">Zigzag</option>
            </select>
         </div>

         <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Thread Color</label>
            <div className="flex gap-2">
               <input 
                  type="color" 
                  value={settings.color.hex}
                  onChange={e => onUpdate({ color: { hex: e.target.value } })}
                  className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent shrink-0"
               />
               <input 
                  type="text" 
                  value={settings.color.hex}
                  onChange={e => onUpdate({ color: { hex: e.target.value } })}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none uppercase"
               />
            </div>
         </div>
      </div>
   );
}