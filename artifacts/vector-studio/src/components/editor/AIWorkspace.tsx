import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore, editorStore, setObjects } from '../../store/editor';
import { Wand2, Sparkles, SlidersHorizontal, ImagePlus, Undo2, Check, X, Loader2, AlertCircle, Maximize, FileWarning, Printer, History, Eraser, Activity, XSquare } from 'lucide-react';
import { VectorObject, PathNode } from '../../lib/types';
import { generateId } from '../../lib/utils';
import { ShapeRenderer } from './ShapeRenderer';

export default function AIWorkspace() {
  const [activeTab, setActiveTab] = useState<'generate' | 'vectorize' | 'edits'>('generate');
  const [recentActions, setRecentActions] = useState<{id: string, text: string}[]>([]);

  const addAction = (text: string) => {
    setRecentActions(prev => [{id: generateId(), text}, ...prev].slice(0, 3));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex p-2 gap-1 border-b border-white/5 bg-black/20">
        <button
          onClick={() => setActiveTab('generate')}
          className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all duration-200 ${
            activeTab === 'generate' ? 'bg-primary/20 text-primary border border-primary/20 shadow-sm' : 'text-muted-foreground hover:bg-white/5 border border-transparent'
          }`}
        >
          Generate
        </button>
        <button
          onClick={() => setActiveTab('vectorize')}
          className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all duration-200 ${
            activeTab === 'vectorize' ? 'bg-primary/20 text-primary border border-primary/20 shadow-sm' : 'text-muted-foreground hover:bg-white/5 border border-transparent'
          }`}
        >
          Vectorize
        </button>
        <button
          onClick={() => setActiveTab('edits')}
          className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all duration-200 ${
            activeTab === 'edits' ? 'bg-primary/20 text-primary border border-primary/20 shadow-sm' : 'text-muted-foreground hover:bg-white/5 border border-transparent'
          }`}
        >
          Edits
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {activeTab === 'generate' && <GenerateSection addAction={addAction} />}
        {activeTab === 'vectorize' && <VectorizeSection addAction={addAction} />}
        {activeTab === 'edits' && <EditsSection addAction={addAction} />}
      </div>

      <RecentActionsView actions={recentActions} />
    </div>
  );
}

function RecentActionsView({ actions }: { actions: {id: string, text: string}[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="border-t border-white/5 bg-black/20 p-2 shrink-0">
       <div className="text-[9px] font-medium text-muted-foreground mb-1.5 px-1">Recent Activity</div>
       <div className="space-y-1">
          {actions.map(a => (
             <div key={a.id} className="text-[9px] text-muted-foreground flex items-center gap-1.5 px-1">
                <History size={10} className="shrink-0 opacity-50" />
                <span className="truncate">{a.text}</span>
             </div>
          ))}
       </div>
    </div>
  );
}

function GenerateSection({ addAction }: { addAction: (msg: string) => void }) {
  const { artboard, objects } = useEditorStore();
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilityToken, setCapabilityToken] = useState<string | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  
  type Variation = { id: string; url: string; size: string; prompt: string };
  const [variations, setVariations] = useState<Variation[]>([]);
  const [selectedVariation, setSelectedVariation] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    setCapabilityLoading(true);
    fetch('/api/ai/capabilities', { credentials: 'same-origin' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'AI generation access is unavailable.');
        if (active) setCapabilityToken(data.capabilityToken);
      })
      .catch(err => {
        if (active) setError(err.message || 'AI generation access is unavailable.');
      })
      .finally(() => {
        if (active) setCapabilityLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim() || !capabilityToken) return;
    setIsGenerating(true);
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/ai/images', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-AI-Capability': capabilityToken,
        },
        body: JSON.stringify({ prompt, size }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        let errMsg = `Server error: ${response.statusText}`;
        try {
           const errJson = await response.json();
           if (errJson.error) errMsg = errJson.error;
           else if (errJson.message) errMsg = errJson.message;
        } catch(e) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      
      if (data && data.image) {
        const newVar = { id: generateId(), url: data.image, size: data.size || size, prompt: prompt.trim() };
        setVariations(prev => [newVar, ...prev]);
        setSelectedVariation(newVar.id);
        addAction('Generated image variation');
      } else {
        throw new Error('Unrecognized response format from image provider.');
      }
      
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Generation cancelled.');
      } else {
        setError(err.message || 'Failed to generate image.');
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const cancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const applyVariation = () => {
    const v = variations.find(x => x.id === selectedVariation);
    if (!v) return;
    
    let w = 1024, h = 1024;
    if (v.size) {
       const [sw, sh] = v.size.split('x').map(Number);
       if (!isNaN(sw) && !isNaN(sh)) { w = sw; h = sh; }
    }
    
    const scale = Math.min((artboard.width * 0.8) / w, (artboard.height * 0.8) / h, 1);
    const finalW = w * scale;
    const finalH = h * scale;

    const imgObj: VectorObject = {
      id: generateId(),
      type: 'image',
      name: `Generated: ${v.prompt.slice(0, 24)}`,
      x: artboard.width / 2 - finalW / 2,
      y: artboard.height / 2 - finalH / 2,
      width: finalW,
      height: finalH,
      rotation: 0,
      fill: 'none',
      stroke: 'none',
      strokeWidth: 0,
      opacity: 1,
      visible: true,
      locked: false,
      imageSrc: v.url
    };
    
    const currentObjects = editorStore.get().objects;
    setObjects([...currentObjects, imgObj]);
    editorStore.set({ selection: [imgObj.id] });

    if (!editorStore.get().objects.some(object => object.id === imgObj.id)) {
      setError('The generated image could not be inserted. The review result was preserved.');
      return;
    }

    const remaining = variations.filter(variation => variation.id !== v.id);
    setVariations(remaining);
    setSelectedVariation(remaining[0]?.id ?? null);
    addAction('Applied generated image as a selected layer');
  };
  
  const rejectSelected = () => {
     setVariations(prev => prev.filter(v => v.id !== selectedVariation));
     const remaining = variations.filter(v => v.id !== selectedVariation);
     setSelectedVariation(remaining.length > 0 ? remaining[0].id : null);
     addAction('Rejected image variation');
  };
  
  const rejectAll = () => {
     setVariations([]);
     setSelectedVariation(null);
     addAction('Rejected all variations');
  };

  const selectedVarData = variations.find(v => v.id === selectedVariation) || variations[0];

  return (
    <div className="space-y-4">
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="text-primary" size={16} />
          <h3 className="font-medium text-xs text-primary">AI Image Generation</h3>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          OpenAI via Replit AI Integrations, no API key required, usage billed to Replit credits.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground mb-1.5 block">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate..."
            className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-2 text-xs focus:border-primary focus:outline-none min-h-[80px] resize-y"
            disabled={isGenerating}
          />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {['Flat badge, limited palette', 'Editorial texture, no text', 'Product motif, isolated'].map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setPrompt(suggestion)}
                disabled={isGenerating}
                className="px-1.5 py-1 rounded border border-white/10 bg-white/5 text-[9px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground mb-1.5 block">Size</label>
          <select 
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            disabled={isGenerating}
          >
            <option value="1024x1024">1024 x 1024 (Square)</option>
            <option value="1536x1024">1536 x 1024 (Landscape)</option>
            <option value="1024x1536">1024 x 1536 (Portrait)</option>
          </select>
        </div>

        {!isGenerating && (
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || !capabilityToken || capabilityLoading}
            className="w-full py-2 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:hover:bg-primary"
          >
            {capabilityLoading ? 'Preparing secure access…' : 'Generate Image'}
          </button>
        )}

        {isGenerating && (
          <div className="space-y-2">
            <div className="flex items-center justify-center p-4 border border-white/10 rounded-md bg-black/20">
              <Loader2 className="animate-spin text-primary mr-2" size={16} />
              <span className="text-xs text-muted-foreground">Generating...</span>
            </div>
            <button
              onClick={cancelGeneration}
              className="w-full py-1.5 bg-destructive/20 text-destructive border border-destructive/30 text-xs rounded-md hover:bg-destructive/30 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="text-destructive shrink-0 mt-0.5" size={14} />
            <p className="text-[10px] text-destructive leading-tight">{error}</p>
          </div>
        )}

        {variations.length > 0 && selectedVarData && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 border-t border-white/10 pt-3 mt-2">
            <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2">
               {variations.map(v => (
                  <button 
                    key={v.id} 
                    onClick={() => setSelectedVariation(v.id)}
                    className={`relative w-10 h-10 shrink-0 rounded border overflow-hidden transition-all ${selectedVariation === v.id ? 'border-primary ring-2 ring-primary/30' : 'border-white/10 opacity-50 hover:opacity-100'}`}
                  >
                     <img src={v.url} className="w-full h-full object-cover" alt="Variation thumbnail" />
                  </button>
               ))}
            </div>
            
            <div className="rounded-md overflow-hidden border border-white/10 bg-black/40 aspect-square flex items-center justify-center relative group">
              <img src={selectedVarData.url} alt="Selected variation" className="w-full h-full object-contain" />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                onClick={applyVariation}
                className="flex-1 min-w-[100px] flex items-center justify-center gap-1.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-500 border border-emerald-500/30 text-xs rounded-md transition-colors"
              >
                <Check size={14} /> Apply
              </button>
              <button
                onClick={rejectSelected}
                className="flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-1.5 bg-white/5 hover:bg-white/10 text-muted-foreground text-xs rounded-md transition-colors"
              >
                <X size={14} /> Reject
              </button>
              {variations.length > 1 && (
                 <button
                   onClick={rejectAll}
                   className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white/5 hover:bg-white/10 text-muted-foreground text-xs rounded-md transition-colors"
                 >
                   <XSquare size={14} /> Reject All
                 </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VectorizeSection({ addAction }: { addAction: (msg: string) => void }) {
  const { artboard, objects } = useEditorStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [sourceImg, setSourceImg] = useState<string | null>(null);
  const [imgData, setImgData] = useState<{w: number, h: number, canvas: HTMLCanvasElement} | null>(null);
  
  const [detail, setDetail] = useState(20);
  const [smoothing, setSmoothing] = useState(5);
  const [colors, setColors] = useState(4);
  const [bgMode, setBgMode] = useState<'keep'|'remove-light'|'remove-dark'>('keep');
  
  const [stage, setStage] = useState<'upload' | 'analyze' | 'trace' | 'review'>('upload');
  const [progress, setProgress] = useState(0);
  
  const [resultObjects, setResultObjects] = useState<VectorObject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const processTokenRef = useRef(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Choose an image smaller than 5 MB.');
      return;
    }
    setError(null);
    const loadToken = ++processTokenRef.current;
    
    const reader = new FileReader();
    reader.onload = (event) => {
       if (processTokenRef.current !== loadToken) return;
       const url = event.target?.result as string;
       setSourceImg(url);
       setStage('analyze');
       
       const img = new Image();
       img.onload = () => {
           if (processTokenRef.current !== loadToken) return;
          const canvas = document.createElement('canvas');
          const maxDim = 400; 
          let w = img.width;
          let h = img.height;
          if (w > h && w > maxDim) { h *= maxDim/w; w = maxDim; }
          else if (h > maxDim) { w *= maxDim/h; h = maxDim; }
          
          canvas.width = Math.round(w);
          canvas.height = Math.round(h);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
             const nextImgData = { w: canvas.width, h: canvas.height, canvas };
             setImgData(nextImgData);
             processVectorization(nextImgData);
           } else {
             setError('This browser could not read the image pixels.');
             setStage('upload');
          }
       };
        img.onerror = () => {
          if (processTokenRef.current !== loadToken) return;
          setError('The selected image could not be decoded.');
          setStage('upload');
        };
       img.src = url;
    };
     reader.onerror = () => {
       if (processTokenRef.current !== loadToken) return;
       setError('The selected file could not be read.');
       setStage('upload');
     };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processVectorization = (sourceData = imgData) => {
    if (!sourceData) return;
    processTokenRef.current++;
    const currentToken = processTokenRef.current;
    
    setStage('trace');
    setProgress(10);
    
    setTimeout(() => {
      if (processTokenRef.current !== currentToken) return;
      
      const ctx = sourceData.canvas.getContext('2d');
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, sourceData.w, sourceData.h);
      const data = imageData.data;
      
      setProgress(30);
      
      const blockSize = Math.max(2, Math.floor(60 - detail));
      const cols = Math.max(1, Math.ceil(sourceData.w / blockSize));
      const rows = Math.max(1, Math.ceil(sourceData.h / blockSize));
      
      const samples: { r: number, g: number, b: number, a: number }[][] = [];
      const histogram = new Map<string, { r: number, g: number, b: number, count: number }>();
      
      setProgress(50);
      
      for (let y = 0; y < rows; y++) {
         samples[y] = [];
         for (let x = 0; x < cols; x++) {
            const px = Math.min(sourceData.w - 1, x * blockSize + Math.floor(blockSize/2));
            const py = Math.min(sourceData.h - 1, y * blockSize + Math.floor(blockSize/2));
            const idx = (py * sourceData.w + px) * 4;
            
            let r = data[idx];
            let g = data[idx+1];
            let b = data[idx+2];
            let a = data[idx+3];
            
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (bgMode === 'remove-light' && brightness > 220) a = 0;
            if (bgMode === 'remove-dark' && brightness < 35) a = 0;
            
            samples[y][x] = { r, g, b, a };
            if (a >= 128) {
              const qr = Math.min(255, Math.round(r / 32) * 32);
              const qg = Math.min(255, Math.round(g / 32) * 32);
              const qb = Math.min(255, Math.round(b / 32) * 32);
              const key = `${qr},${qg},${qb}`;
              const entry = histogram.get(key);
              if (entry) entry.count += 1;
              else histogram.set(key, { r: qr, g: qg, b: qb, count: 1 });
            }
         }
      }

      const palette = [...histogram.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, colors);
      const fallback = { r: 0, g: 0, b: 0, count: 1 };
      if (!palette.length) palette.push(fallback);

      const grid = samples.map(row => row.map(sample => {
        const closest = palette.reduce((best, candidate) => {
          const candidateDistance = (sample.r - candidate.r) ** 2 + (sample.g - candidate.g) ** 2 + (sample.b - candidate.b) ** 2;
          const bestDistance = (sample.r - best.r) ** 2 + (sample.g - best.g) ** 2 + (sample.b - best.b) ** 2;
          return candidateDistance < bestDistance ? candidate : best;
        }, palette[0]);
        const hex = `#${closest.r.toString(16).padStart(2, '0')}${closest.g.toString(16).padStart(2, '0')}${closest.b.toString(16).padStart(2, '0')}`;
        return { ...sample, r: closest.r, g: closest.g, b: closest.b, hex };
      }));
      
      setProgress(70);
      
      const newObjs: VectorObject[] = [];
      const visited = Array(rows).fill(0).map(() => Array(cols).fill(false));
      
      const groupScale = Math.min((artboard.width * 0.8) / sourceData.w, (artboard.height * 0.8) / sourceData.h);
      const startX = (artboard.width - sourceData.w * groupScale) / 2;
      const startY = (artboard.height - sourceData.h * groupScale) / 2;
      const groupId = generateId();
      
      const rxVal = (smoothing / 20) * (blockSize * groupScale / 2);
      
      for (let y = 0; y < rows; y++) {
         for (let x = 0; x < cols; x++) {
            if (visited[y][x] || grid[y][x].a < 128) continue;
            
            const targetColor = grid[y][x].hex;
            
            let w = 0;
            while (x + w < cols && !visited[y][x+w] && grid[y][x+w].hex === targetColor && grid[y][x+w].a >= 128) {
               w++;
            }
            
            let h = 1;
            let canExpand = true;
            while (y + h < rows && canExpand) {
               for (let i = 0; i < w; i++) {
                  if (visited[y+h][x+i] || grid[y+h][x+i].hex !== targetColor || grid[y+h][x+i].a < 128) {
                     canExpand = false;
                     break;
                  }
               }
               if (canExpand) h++;
            }
            
            for (let dy = 0; dy < h; dy++) {
               for (let dx = 0; dx < w; dx++) {
                  visited[y+dy][x+dx] = true;
               }
            }
            
            newObjs.push({
               id: generateId(),
               type: 'rect',
               name: `Shape (${targetColor})`,
               x: startX + (x * blockSize * groupScale),
               y: startY + (y * blockSize * groupScale),
               width: Math.min(w * blockSize, sourceData.w - x * blockSize) * groupScale,
               height: Math.min(h * blockSize, sourceData.h - y * blockSize) * groupScale,
               rotation: 0,
               fill: targetColor,
               stroke: 'none',
               strokeWidth: 0,
               opacity: 1,
               visible: true,
               locked: false,
               groupId,
               rx: rxVal
            });
         }
      }
      
      if (processTokenRef.current !== currentToken) return;
      
      setProgress(100);
      setResultObjects(newObjs);
      setStage('review');
    }, 150);
  };
  
  useEffect(() => {
     if (stage === 'review' && imgData) {
        const t = setTimeout(() => {
           processVectorization();
        }, 300);
        return () => clearTimeout(t);
     }
     return undefined;
  }, [detail, colors, bgMode, smoothing]);

  const applyVectorization = () => {
     setObjects([...objects, ...resultObjects]);
     setStage('upload');
     setSourceImg(null);
     setImgData(null);
     setResultObjects([]);
     addAction('Applied vectorization');
  };

  const cancelVectorization = () => {
     processTokenRef.current++; // Invalidates active scheduled work
     setStage('upload');
     setProgress(0);
     setSourceImg(null);
     setImgData(null);
     setResultObjects([]);
     addAction('Discarded vectorization');
  };

  return (
    <div className="space-y-4">
      {stage === 'upload' && (
        <>
          <button type="button" className="w-full border-2 border-dashed border-white/20 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-white/5 transition-colors" onClick={() => fileInputRef.current?.click()}>
             <ImagePlus className="text-muted-foreground mb-3" size={24} />
             <span className="text-xs font-semibold mb-1">Upload to Vectorize</span>
             <span className="text-[10px] text-muted-foreground">PNG, JPG, WebP up to 5 MB.</span>
          </button>
          <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
        </>
      )}
      {error && <p role="alert" className="text-[10px] text-destructive border border-destructive/20 bg-destructive/10 rounded-md p-2">{error}</p>}

      {(stage === 'analyze' || stage === 'trace') && (
        <div className="space-y-3">
           <div className="aspect-square bg-black/40 rounded-lg border border-white/10 flex items-center justify-center relative overflow-hidden">
              {sourceImg && <img src={sourceImg} alt="Source" className="w-full h-full object-contain opacity-50 blur-sm" />}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                 <Loader2 className="animate-spin text-primary mb-2" size={20} />
                 <span className="text-xs font-medium">{stage === 'analyze' ? 'Analyzing Image...' : 'Tracing Vectors...'}</span>
                 <div className="w-32 h-1 bg-white/10 rounded-full mt-3 overflow-hidden mb-4">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                 </div>
                 <button onClick={cancelVectorization} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-md text-[10px] transition-colors">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {stage === 'review' && (
        <div className="space-y-4 animate-in fade-in">
            <div className="grid grid-cols-2 gap-2">
              <div className="aspect-square bg-black/40 rounded-lg border border-white/10 relative overflow-hidden flex items-center justify-center">
                <span className="absolute top-1 left-1 z-10 rounded bg-black/60 px-1 text-[9px] text-muted-foreground">Source</span>
                {sourceImg && <img src={sourceImg} alt="Vectorization source" className="w-full h-full object-contain" />}
              </div>
              <div className="aspect-square bg-black/40 rounded-lg border border-white/10 relative overflow-hidden flex items-center justify-center">
                <span className="absolute top-1 left-1 z-10 rounded bg-black/60 px-1 text-[9px] text-muted-foreground">Vector</span>
                <svg viewBox={`0 0 ${artboard.width} ${artboard.height}`} className="w-full h-full">
                    {resultObjects.map(obj => (
                       <rect key={obj.id} x={obj.x} y={obj.y} width={obj.width} height={obj.height} rx={obj.rx} fill={obj.fill} />
                    ))}
                </svg>
              </div>
           </div>
           
           <div className="space-y-3 bg-black/20 p-3 rounded-lg border border-white/5">
              <div className="flex items-center justify-between">
                 <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">Detail / Mesh Size</label>
                 <span className="text-[10px] font-mono">{detail}</span>
              </div>
              <input type="range" min="10" max="50" value={detail} onChange={e => setDetail(Number(e.target.value))} className="w-full accent-primary" />
              
              <div className="flex items-center justify-between pt-1">
                 <label className="text-[10px] font-medium text-muted-foreground">Smoothing</label>
                 <span className="text-[10px] font-mono">{smoothing}</span>
              </div>
              <input type="range" min="0" max="20" value={smoothing} onChange={e => setSmoothing(Number(e.target.value))} className="w-full accent-primary" />
              
              <div className="flex items-center justify-between pt-1">
                  <label className="text-[10px] font-medium text-muted-foreground">Maximum Colors</label>
                 <span className="text-[10px] font-mono">{colors}</span>
              </div>
              <input type="range" min="2" max="16" value={colors} onChange={e => setColors(Number(e.target.value))} className="w-full accent-primary" />
              
              <div className="pt-1">
                 <label className="text-[10px] font-medium text-muted-foreground block mb-1">Background</label>
                 <select value={bgMode} onChange={e => setBgMode(e.target.value as any)} className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs focus:border-primary focus:outline-none">
                    <option value="keep">Keep All</option>
                    <option value="remove-light">Remove Light</option>
                    <option value="remove-dark">Remove Dark</option>
                 </select>
              </div>
              
              <div className="flex justify-between text-[10px] text-muted-foreground pt-1 border-t border-white/5 mt-2">
                 <span>Output:</span>
                 <span className="font-mono">{resultObjects.length} editable shapes</span>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-2">
              <button
                onClick={cancelVectorization}
                className="flex items-center justify-center gap-1.5 py-1.5 bg-white/5 hover:bg-white/10 text-muted-foreground text-xs rounded-md transition-colors"
              >
                <X size={14} /> Discard
              </button>
              <button
                onClick={applyVectorization}
                className="flex items-center justify-center gap-1.5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded-md transition-colors font-medium"
              >
                <Check size={14} /> Add to Canvas
              </button>
            </div>
        </div>
      )}
      <p className="rounded-md border border-white/10 bg-black/20 p-2 text-[9px] leading-relaxed text-muted-foreground">
        Deterministic, block-based vector approximation—not contour tracing. Flat artwork works best; photography may produce many simplified shapes.
      </p>
    </div>
  );
}

function EditsSection({ addAction }: { addAction: (msg: string) => void }) {
  const { selection, objects, artboard } = useEditorStore();
  
  const [stagedObjects, setStagedObjects] = useState<VectorObject[] | null>(null);
  const [summary, setSummary] = useState<string>('');
  const [affectedIds, setAffectedIds] = useState<string[]>([]);

  const selectedObjs = objects.filter(o => selection.includes(o.id));
  const hasPaths = selectedObjs.some(o => o.type === 'path' && o.nodes && o.nodes.length > 0);

  const handleAction = (action: string) => {
    if (selection.length === 0) return;
    
    let newObjs = objects.map(o => ({ ...o }));
    let actionSummary = '';
    let currentAffected = [...selection];

    if (action === 'cleanup') {
       let removed = 0;
       newObjs = newObjs.filter(obj => {
          if (selection.includes(obj.id)) {
             if (!obj.visible || obj.width === 0 || obj.height === 0 || obj.opacity === 0) {
                removed++;
                return false;
             }
          }
          return true;
       });
       actionSummary = `Cleanup: Removed ${removed} invisible or zero-size object(s).`;
    }
    else if (action === 'smooth' && hasPaths) {
       let smoothed = 0;
       newObjs = newObjs.map(obj => {
          if (selection.includes(obj.id) && obj.type === 'path' && obj.nodes) {
             smoothed++;
             const newNodes = obj.nodes.map((node, i, arr) => {
                const prev = arr[i === 0 ? arr.length - 1 : i - 1];
                const next = arr[i === arr.length - 1 ? 0 : i + 1];
                const dx = next.x - prev.x;
                const dy = next.y - prev.y;
                const len = Math.sqrt(dx*dx + dy*dy) || 1;
                const dirX = dx / len;
                const dirY = dy / len;
                const distPrev = Math.sqrt(Math.pow(node.x - prev.x, 2) + Math.pow(node.y - prev.y, 2));
                const distNext = Math.sqrt(Math.pow(next.x - node.x, 2) + Math.pow(next.y - node.y, 2));
                return { 
                   ...node, 
                   handleIn: { x: node.x - dirX * (distPrev * 0.25), y: node.y - dirY * (distPrev * 0.25) }, 
                   handleOut: { x: node.x + dirX * (distNext * 0.25), y: node.y + dirY * (distNext * 0.25) } 
                };
             });
             return { ...obj, nodes: newNodes };
          }
          return obj;
       });
       actionSummary = `Smoothed ${smoothed} path(s).`;
    }
    else if (action === 'simplify' && hasPaths) {
       let nodesRemoved = 0;
       newObjs = newObjs.map(obj => {
          if (selection.includes(obj.id) && obj.type === 'path' && obj.nodes) {
             const newNodes = obj.nodes.filter((_, i) => i % 2 === 0 || i === obj.nodes!.length - 1);
             nodesRemoved += obj.nodes.length - newNodes.length;
             return { ...obj, nodes: newNodes };
          }
          return obj;
       });
       actionSummary = `Simplified paths. Removed ${nodesRemoved} redundant nodes.`;
    } 
    else if (action === 'recolor') {
       const palette = ['#8B5CF6', '#d946ef', '#ec4899', '#f43f5e'];
       let i = 0;
       newObjs = newObjs.map(obj => {
          if (selection.includes(obj.id)) {
             const newFill = palette[i % palette.length];
             i++;
             return { ...obj, fill: newFill, stroke: 'none' };
          }
          return obj;
       });
       actionSummary = 'Applied unified color palette to selection.';
    }
    else if (action === 'mirror') {
       const copies: VectorObject[] = [];
       newObjs = newObjs.map(obj => {
          if (selection.includes(obj.id)) {
             const cx = obj.x + obj.width / 2;
             const axisX = artboard.width / 2;
             const newX = axisX + (axisX - cx) - obj.width / 2;
             copies.push({ ...obj, id: generateId(), x: newX });
          }
          return obj;
       });
       newObjs = [...newObjs, ...copies];
       currentAffected = [...selection, ...copies.map(c => c.id)];
        actionSummary = `Created ${copies.length} symmetric layout copy/copies across the artboard center.`;
    }
    else if (action === 'fit') {
       let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
       selectedObjs.forEach(o => {
          if (o.x < minX) minX = o.x;
          if (o.y < minY) minY = o.y;
          if (o.x + o.width > maxX) maxX = o.x + o.width;
          if (o.y + o.height > maxY) maxY = o.y + o.height;
       });
       
       const selW = maxX - minX;
       const selH = maxY - minY;
       
       const padding = 40;
       const availW = artboard.width - padding * 2;
       const availH = artboard.height - padding * 2;
       
       const scale = Math.min(availW / selW, availH / selH, 1);
       
       if (scale < 1) {
          newObjs = newObjs.map(obj => {
             if (selection.includes(obj.id)) {
                return {
                   ...obj,
                    x: padding + (obj.x - minX) * scale,
                    y: padding + (obj.y - minY) * scale,
                   width: obj.width * scale,
                   height: obj.height * scale
                };
             }
             return obj;
          });
          actionSummary = `Scaled selection down by ${Math.round((1 - scale) * 100)}% to fit artboard.`;
       } else {
          actionSummary = 'Selection already fits within artboard margins.';
       }
    }
    else if (action === 'print') {
       newObjs = newObjs.map(obj => {
          if (selection.includes(obj.id)) {
             return { ...obj, opacity: 1, stroke: 'none', strokeWidth: 0 };
          }
          return obj;
       });
       actionSummary = 'Flattened opacity and removed strokes for print preparation.';
    }
    
    if (actionSummary) {
       setStagedObjects(newObjs);
       setAffectedIds(currentAffected);
       setSummary(actionSummary);
    }
  };
  
  const applyEdit = () => {
     if (stagedObjects) {
        setObjects(stagedObjects);
        setStagedObjects(null);
        setAffectedIds([]);
        setSummary('');
        addAction('Applied selection edit');
     }
  };
  
  const cancelEdit = () => {
     setStagedObjects(null);
     setAffectedIds([]);
     setSummary('');
     addAction('Discarded selection edit');
  };
  
  let vBox = "0 0 100 100";
  if (stagedObjects && affectedIds.length > 0) {
     let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
     const processBounds = (objs: VectorObject[]) => {
        objs.forEach(o => {
           if (o.x < minX) minX = o.x;
           if (o.y < minY) minY = o.y;
           if (o.x + o.width > maxX) maxX = o.x + o.width;
           if (o.y + o.height > maxY) maxY = o.y + o.height;
        });
     };
     
     processBounds(selectedObjs);
     processBounds(stagedObjects.filter(o => affectedIds.includes(o.id)));
     
     if (minX === Infinity) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
     const pad = 20;
     vBox = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  }

  return (
    <div className="space-y-4">
       {selection.length === 0 ? (
         <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-white/10 rounded-xl bg-black/20">
            <Wand2 className="text-muted-foreground mb-2" size={24} />
            <p className="text-xs text-muted-foreground">Select one or more objects to apply deterministic edits.</p>
         </div>
       ) : stagedObjects ? (
         <div className="space-y-3 animate-in slide-in-from-right-4 fade-in">
            <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg flex items-start gap-2">
               <Sparkles className="text-primary mt-0.5 shrink-0" size={14} />
               <div>
                  <h4 className="text-[11px] font-medium text-primary mb-0.5">Edit Staged</h4>
                  <p className="text-[10px] text-muted-foreground leading-tight">{summary}</p>
               </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mt-3">
               <div className="bg-black/40 border border-white/5 rounded-md overflow-hidden aspect-square relative">
                  <div className="absolute top-1 left-1 text-[9px] text-muted-foreground bg-black/60 px-1 rounded z-10">Before</div>
                  <svg viewBox={vBox} className="w-full h-full relative">
                     {selectedObjs.map(obj => <ShapeRenderer key={obj.id} object={obj} />)}
                  </svg>
               </div>
               <div className="bg-black/40 border border-white/5 rounded-md overflow-hidden aspect-square relative">
                  <div className="absolute top-1 left-1 text-[9px] text-muted-foreground bg-black/60 px-1 rounded z-10">After</div>
                  <svg viewBox={vBox} className="w-full h-full relative">
                     {stagedObjects.filter(o => affectedIds.includes(o.id)).map(obj => <ShapeRenderer key={obj.id} object={obj} />)}
                  </svg>
               </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={cancelEdit}
                className="flex items-center justify-center gap-1.5 py-1.5 bg-white/5 hover:bg-white/10 text-muted-foreground text-xs rounded-md transition-colors"
              >
                <Undo2 size={14} /> Discard Edit
              </button>
              <button
                onClick={applyEdit}
                className="flex items-center justify-center gap-1.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-500 border border-emerald-500/30 text-xs rounded-md transition-colors"
              >
                <Check size={14} /> Commit Edit
              </button>
            </div>
         </div>
       ) : (
         <div className="space-y-3">
            <div className="text-xs font-medium px-1 flex items-center justify-between text-muted-foreground mb-2">
               Suggested Actions <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px]">{selection.length} selected</span>
            </div>
            
            <div className="space-y-1.5">
               <button onClick={() => handleAction('cleanup')} className="w-full flex items-center gap-3 px-3 py-2 text-left bg-black/40 hover:bg-white/5 border border-white/5 rounded-md transition-colors group">
                  <div className="p-1.5 bg-white/5 rounded-sm group-hover:bg-primary/20 group-hover:text-primary transition-colors"><Eraser size={14} /></div>
                  <div>
                     <div className="text-xs font-medium text-foreground">Cleanup Selection</div>
                     <div className="text-[9px] text-muted-foreground">Remove invisible or zero-size shapes</div>
                  </div>
               </button>
               
               {hasPaths && (
                  <>
                     <button onClick={() => handleAction('smooth')} className="w-full flex items-center gap-3 px-3 py-2 text-left bg-black/40 hover:bg-white/5 border border-white/5 rounded-md transition-colors group">
                        <div className="p-1.5 bg-white/5 rounded-sm group-hover:bg-primary/20 group-hover:text-primary transition-colors"><Activity size={14} /></div>
                        <div>
                           <div className="text-xs font-medium text-foreground">Smooth Path</div>
                           <div className="text-[9px] text-muted-foreground">Adjust nodes to create smoother curves</div>
                        </div>
                     </button>
                     <button onClick={() => handleAction('simplify')} className="w-full flex items-center gap-3 px-3 py-2 text-left bg-black/40 hover:bg-white/5 border border-white/5 rounded-md transition-colors group">
                        <div className="p-1.5 bg-white/5 rounded-sm group-hover:bg-primary/20 group-hover:text-primary transition-colors"><SlidersHorizontal size={14} /></div>
                        <div>
                           <div className="text-xs font-medium text-foreground">Simplify Path</div>
                           <div className="text-[9px] text-muted-foreground">Remove redundant path nodes</div>
                        </div>
                     </button>
                  </>
               )}
               
               <button onClick={() => handleAction('recolor')} className="w-full flex items-center gap-3 px-3 py-2 text-left bg-black/40 hover:bg-white/5 border border-white/5 rounded-md transition-colors group">
                  <div className="p-1.5 bg-white/5 rounded-sm group-hover:bg-primary/20 group-hover:text-primary transition-colors"><Wand2 size={14} /></div>
                  <div>
                     <div className="text-xs font-medium text-foreground">Recolor Palette</div>
                     <div className="text-[9px] text-muted-foreground">Apply a cohesive color scheme</div>
                  </div>
               </button>
               
               <button onClick={() => handleAction('mirror')} className="w-full flex items-center gap-3 px-3 py-2 text-left bg-black/40 hover:bg-white/5 border border-white/5 rounded-md transition-colors group">
                  <div className="p-1.5 bg-white/5 rounded-sm group-hover:bg-primary/20 group-hover:text-primary transition-colors"><Maximize size={14} /></div>
                  <div>
                      <div className="text-xs font-medium text-foreground">Symmetry Layout</div>
                      <div className="text-[9px] text-muted-foreground">Duplicate placement across artboard center</div>
                  </div>
               </button>

               <button onClick={() => handleAction('fit')} className="w-full flex items-center gap-3 px-3 py-2 text-left bg-black/40 hover:bg-white/5 border border-white/5 rounded-md transition-colors group">
                  <div className="p-1.5 bg-white/5 rounded-sm group-hover:bg-primary/20 group-hover:text-primary transition-colors"><FileWarning size={14} /></div>
                  <div>
                     <div className="text-xs font-medium text-foreground">Scale to Fit</div>
                     <div className="text-[9px] text-muted-foreground">Ensure selection fits within artboard</div>
                  </div>
               </button>

               <button onClick={() => handleAction('print')} className="w-full flex items-center gap-3 px-3 py-2 text-left bg-black/40 hover:bg-white/5 border border-white/5 rounded-md transition-colors group">
                  <div className="p-1.5 bg-white/5 rounded-sm group-hover:bg-primary/20 group-hover:text-primary transition-colors"><Printer size={14} /></div>
                  <div>
                     <div className="text-xs font-medium text-foreground">Print Prep</div>
                     <div className="text-[9px] text-muted-foreground">Flatten opacity and strip strokes</div>
                  </div>
               </button>
            </div>
         </div>
       )}
    </div>
  );
}