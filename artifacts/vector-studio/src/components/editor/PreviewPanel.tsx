import React from 'react';
import { useEditorStore, editorStore } from '../../store/editor';
import { RefreshCcw, Image, Box, SlidersHorizontal, Settings2 } from 'lucide-react';
import { PreviewState } from '../../lib/types';

const SCENES = [
  { id: 'apparel', label: 'Apparel' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'stickers', label: 'Stickers' }
];

const PRESETS: Record<string, { id: string; label: string }[]> = {
  apparel: [
    { id: 't-shirt', label: 'T-Shirt' },
    { id: 'hoodie', label: 'Hoodie' }
  ],
  accessories: [
    { id: 'tote-bag', label: 'Tote Bag' },
    { id: 'mug', label: 'Ceramic Mug' }
  ],
  packaging: [
    { id: 'box', label: 'Cardboard Box' },
    { id: 'mailer', label: 'Mailer Bag' }
  ],
  stickers: [
    { id: 'die-cut', label: 'Die-Cut' },
    { id: 'bumper', label: 'Bumper Sticker' }
  ]
};

export default function PreviewPanel() {
  const { previewState } = useEditorStore();

  const updatePreview = (partial: Partial<PreviewState>) => {
    editorStore.set({ previewState: { ...previewState, ...partial } });
  };

  const handleSceneChange = (scene: PreviewState['scene']) => {
    const preset = PRESETS[scene][0].id;
    updatePreview({ scene, preset, scale: 0.5, position: { x: 0.5, y: 0.5 }, rotation: 0 });
  };

  return (
    <div className="p-4 space-y-6">
      <div>
         <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Image size={14} /> Scene
         </h3>
         <div className="space-y-3">
            <label className="block">
               <span className="text-xs text-muted-foreground mb-1 block">Family</span>
               <select
                  value={previewState.scene}
                  onChange={e => handleSceneChange(e.target.value as PreviewState['scene'])}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
               >
                  {SCENES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
               </select>
            </label>
            <label className="block">
               <span className="text-xs text-muted-foreground mb-1 block">Product</span>
               <select
                  value={previewState.preset}
                  onChange={e => updatePreview({ preset: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
               >
                  {PRESETS[previewState.scene].map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
               </select>
            </label>
         </div>
      </div>

      <div className="h-px bg-white/10" />

      <div>
         <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Box size={14} /> Placement
         </h3>
         <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
               <span className="text-[10px] text-muted-foreground">Scale</span>
               <input
                  type="range" min="0.05" max="2" step="0.05"
                  value={previewState.scale}
                  onChange={e => updatePreview({ scale: Number(e.target.value) })}
                  className="w-full accent-primary"
                  aria-label="Scale artwork"
               />
            </div>
            <div className="space-y-1">
               <span className="text-[10px] text-muted-foreground">Rotate</span>
               <input
                  type="range" min="-180" max="180" step="1"
                  value={previewState.rotation}
                  onChange={e => updatePreview({ rotation: Number(e.target.value) })}
                  className="w-full accent-primary"
                  aria-label="Rotate artwork"
               />
            </div>
         </div>
         <div className="mt-3 flex gap-2">
            <button
               onClick={() => updatePreview({ scale: 0.5, position: { x: 0.5, y: 0.5 }, rotation: 0 })}
               className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-white/5 hover:bg-white/10 text-xs rounded-md transition-colors text-muted-foreground"
            >
               <RefreshCcw size={12} /> Reset Position
            </button>
         </div>
         <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            You can also drag the artwork directly on the product to move it.
         </p>
      </div>

      <div className="h-px bg-white/10" />

      <div>
         <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <SlidersHorizontal size={14} /> Material & Print
         </h3>
         <div className="space-y-3">
            <div>
               <label className="text-xs text-muted-foreground block mb-1">Surface Color</label>
               <div className="flex gap-2">
                  <input
                     type="color"
                     value={previewState.surfaceColor}
                     onChange={e => updatePreview({ surfaceColor: e.target.value })}
                     className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                     aria-label="Surface color"
                  />
                  <input
                     type="text"
                     value={previewState.surfaceColor}
                     onChange={e => updatePreview({ surfaceColor: e.target.value })}
                     className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm font-mono focus:border-primary focus:outline-none uppercase"
                  />
               </div>
            </div>

            <label className="block">
               <span className="text-xs text-muted-foreground mb-1 block">Print Finish</span>
               <select
                  value={previewState.printFinish}
                  onChange={e => updatePreview({ printFinish: e.target.value as PreviewState['printFinish'] })}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
               >
                  <option value="matte">Matte (Standard)</option>
                  <option value="glossy">Glossy (Shiny)</option>
                  <option value="metallic">Metallic (Reflective)</option>
                  <option value="embossed">Embossed (Raised)</option>
               </select>
            </label>

            <label className="block">
               <span className="text-xs text-muted-foreground mb-1 block">Blend Mode</span>
               <select
                  value={previewState.blendMode}
                  onChange={e => updatePreview({ blendMode: e.target.value as PreviewState['blendMode'] })}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
               >
                  <option value="normal">Normal (Opaque)</option>
                  <option value="multiply">Multiply (Ink on Fabric)</option>
                  <option value="screen">Screen (Light on Dark)</option>
                  <option value="overlay">Overlay (High Contrast)</option>
                  <option value="hard-light">Hard Light</option>
                  <option value="color-burn">Color Burn</option>
               </select>
            </label>
            
            <div>
               <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-muted-foreground">Opacity</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{Math.round(previewState.opacity * 100)}%</span>
               </div>
               <input
                  type="range" min="0" max="1" step="0.01"
                  value={previewState.opacity}
                  onChange={e => updatePreview({ opacity: Number(e.target.value) })}
                  className="w-full accent-primary"
                  aria-label="Artwork opacity"
               />
            </div>
         </div>
      </div>

      <div className="h-px bg-white/10" />

      <div>
         <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Settings2 size={14} /> Environment
         </h3>
         <div className="space-y-4">
            <div>
               <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-muted-foreground">Lighting & Shadows</span>
               </div>
               <input
                  type="range" min="0" max="1" step="0.05"
                  value={previewState.shadowStrength}
                  onChange={e => updatePreview({ shadowStrength: Number(e.target.value) })}
                  className="w-full accent-primary"
                  aria-label="Shadow strength"
               />
            </div>
            <div>
               <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-muted-foreground">Material Texture</span>
               </div>
               <input
                  type="range" min="0" max="1" step="0.05"
                  value={previewState.textureStrength}
                  onChange={e => updatePreview({ textureStrength: Number(e.target.value) })}
                  className="w-full accent-primary"
                  aria-label="Texture strength"
               />
            </div>
         </div>
      </div>

      <div className="p-3 bg-black/30 border border-white/5 rounded-lg text-[10px] text-muted-foreground leading-relaxed">
         <strong>Note:</strong> This is a realistic visual preview designed for aesthetic evaluation. It is not a manufacturing proof. Actual printed colors and placement may vary slightly depending on your vendor.
      </div>
    </div>
  );
}
