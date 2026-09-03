import React, { useState, useRef } from 'react';
import { useEditorStore, editorStore, setObjects } from '../../store/editor';
import { useCloudProject } from '../../cloud/CloudProjectProvider';
import { ShapeRenderer } from './ShapeRenderer';
import { buildCopilotDocument, validateCopilotPlan, executeCopilotPlan, CopilotPlan } from '../../lib/designCopilot';
import { Sparkles, Loader2, AlertCircle, AlertTriangle, Check, X, CornerDownRight } from 'lucide-react';
import { VectorObject } from '../../lib/types';

export function CopilotSection({ addAction }: { addAction: (msg: string) => void }) {
  const { isReadOnly } = useCloudProject();
  const { artboard, selection } = useEditorStore();
  const [prompt, setPrompt] = useState('');
  const [scope, setScope] = useState<'selection' | 'all'>(selection.length > 0 ? 'selection' : 'all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [stagedPlan, setStagedPlan] = useState<CopilotPlan | null>(null);
  const [stagedResult, setStagedResult] = useState<any | null>(null);
  const [originalObjects, setOriginalObjects] = useState<VectorObject[]>([]);
  const [stagedScopeIds, setStagedScopeIds] = useState<string[] | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleGenerate = async (refinementContext?: string, scopeOverride?: string[] | null) => {
    if (!prompt.trim() || isReadOnly) return;
    const scopeIds = scopeOverride !== undefined
      ? scopeOverride
      : (scope === 'selection' ? editorStore.get().selection : null);
    if (scopeIds !== null && scopeIds.length === 0) {
      setError('Select at least one object first, or switch the scope to "Whole design".');
      return;
    }
    setIsGenerating(true);
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      const capRes = await fetch('/api/ai/capabilities', { credentials: 'same-origin' });
      if (!capRes.ok) {
        const capData = await capRes.json().catch(() => ({}));
        throw new Error(capData.error || 'AI generation access is unavailable.');
      }
      const capData = await capRes.json();
      const capabilityToken = capData.capabilityToken;
      
      const currentObjects = editorStore.get().objects;
      
      const doc = buildCopilotDocument(currentObjects, artboard);
      const reqSelection = scopeIds ?? [];
      
      const finalPrompt = refinementContext ? `${refinementContext}; Refinement: ${prompt}` : prompt;

      const response = await fetch('/api/ai/vector-copilot', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-AI-Capability': capabilityToken,
        },
        body: JSON.stringify({ 
          prompt: finalPrompt, 
          document: doc, 
          selection: reqSelection 
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        if (response.status === 429) {
          const retry = response.headers.get('Retry-After') || 'a few seconds';
          throw new Error(`Rate limited. Try again in ${retry}s.`);
        }
        let errMsg = `Server error: ${response.statusText}`;
        try {
           const errJson = await response.json();
           if (errJson.error) errMsg = errJson.error;
           else if (errJson.message) errMsg = errJson.message;
        } catch(e) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      
      const validation = validateCopilotPlan(data, currentObjects, scopeIds);
      if (!validation.valid) {
        throw new Error(`Invalid AI response: ${validation.error}`);
      }
      
      const plan = validation.plan!;
      const result = executeCopilotPlan(currentObjects, plan);
      
      setOriginalObjects(currentObjects);
      setStagedPlan(plan);
      setStagedResult(result);
      setStagedScopeIds(scopeIds);
      setPrompt(''); 
      
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Request cancelled.');
      } else {
        setError(err.message || 'Failed to generate proposal.');
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

  const applyProposal = () => {
    if (!stagedPlan || !stagedResult || isReadOnly) return;
    // Re-validate AND re-execute against the live document so edits made while
    // the proposal was under review are preserved, and objects locked or
    // removed in the meantime keep their guarantees.
    const liveObjects = editorStore.get().objects;
    const revalidation = validateCopilotPlan(stagedPlan, liveObjects, stagedScopeIds);
    if (!revalidation.valid || !revalidation.plan || revalidation.plan.operations.length === 0) {
      setError('The document changed while the proposal was under review, so it can no longer be applied. Ask the copilot again.');
      discardProposal();
      return;
    }
    const result = executeCopilotPlan(liveObjects, revalidation.plan);
    setObjects(result.objects);
    editorStore.set({ selection: result.selection });
    addAction(`AI Copilot applied ${result.summary.added + result.summary.changed + result.summary.removed} changes`);
    discardProposal();
  };

  const discardProposal = () => {
    setStagedPlan(null);
    setStagedResult(null);
    setOriginalObjects([]);
    setStagedScopeIds(null);
  };

  if (stagedPlan && stagedResult) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
        <div className={`p-3 rounded-md border ${stagedPlan.destructive ? 'bg-destructive/10 border-destructive/20' : 'bg-primary/10 border-primary/20'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className={stagedPlan.destructive ? "text-destructive" : "text-primary"} size={16} />
            <h3 className={`font-medium text-xs ${stagedPlan.destructive ? "text-destructive" : "text-primary"}`}>Review Proposal</h3>
          </div>
          <p className="text-[10px] text-foreground leading-relaxed mb-3">
            {stagedPlan.explanation}
          </p>
          
          <div className="flex flex-wrap gap-3 text-[9px] text-muted-foreground mb-3">
            {stagedResult.summary.added > 0 && <span><span className="text-emerald-500 font-medium">{stagedResult.summary.added}</span> added</span>}
            {stagedResult.summary.changed > 0 && <span><span className="text-blue-500 font-medium">{stagedResult.summary.changed}</span> changed</span>}
            {stagedResult.summary.removed > 0 && <span><span className="text-destructive font-medium">{stagedResult.summary.removed}</span> removed</span>}
            {stagedResult.summary.selectedOnly > 0 && <span><span className="text-foreground font-medium">{stagedResult.summary.selectedOnly}</span> selected</span>}
          </div>

          {(stagedPlan.warnings.length > 0 || stagedResult.warnings.length > 0) && (
            <div className="space-y-1 mb-3">
              {[...stagedPlan.warnings, ...stagedResult.warnings].map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[9px] text-amber-500/80">
                  <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="aspect-video bg-black/40 border border-white/10 rounded overflow-hidden relative">
              <span className="absolute top-1 left-1 text-[8px] bg-black/60 px-1 rounded text-muted-foreground z-10">Before</span>
              <svg viewBox={`0 0 ${artboard.width} ${artboard.height}`} className="w-full h-full">
                <rect width="100%" height="100%" fill={artboard.fill} />
                {originalObjects.map((obj) => <ShapeRenderer key={obj.id} object={obj} objects={originalObjects} />)}
              </svg>
            </div>
            <div className="aspect-video bg-black/40 border border-white/10 rounded overflow-hidden relative">
              <span className="absolute top-1 left-1 text-[8px] bg-primary/20 text-primary px-1 rounded z-10">After</span>
              <svg viewBox={`0 0 ${artboard.width} ${artboard.height}`} className="w-full h-full">
                <rect width="100%" height="100%" fill={artboard.fill} />
                {stagedResult.objects.map((obj: any) => <ShapeRenderer key={obj.id} object={obj} objects={stagedResult.objects} />)}
              </svg>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={applyProposal}
              disabled={isReadOnly}
              className="flex-1 py-1.5 bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 text-xs rounded-md hover:bg-emerald-500/30 transition-colors font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Check size={14} /> Apply
            </button>
            <button
              onClick={discardProposal}
              className="flex-1 py-1.5 bg-white/5 text-muted-foreground border border-white/10 text-xs rounded-md hover:bg-white/10 transition-colors font-medium flex items-center justify-center gap-1.5"
            >
              <X size={14} /> Discard
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[10px] font-medium text-muted-foreground mb-1.5 block">Refine this proposal</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Make it smaller..."
              className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleGenerate(`Earlier request: ${stagedPlan.explanation}`, stagedScopeIds);
              }}
            />
            <button
              onClick={() => handleGenerate(`Earlier request: ${stagedPlan.explanation}`, stagedScopeIds)}
              disabled={!prompt.trim() || isGenerating || isReadOnly}
              className="px-2 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-md hover:bg-primary/30 transition-colors disabled:opacity-50"
            >
              <CornerDownRight size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="text-primary" size={16} />
          <h3 className="font-medium text-xs text-primary">Vector Copilot</h3>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Describe layout changes, styling updates, or new shapes to generate. You will review the proposal before any changes are made.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-medium text-muted-foreground block">Prompt</label>
            <div className="flex gap-1 bg-black/20 p-0.5 rounded border border-white/5">
              <button 
                onClick={() => setScope('selection')}
                className={`px-1.5 py-0.5 text-[9px] rounded-sm transition-colors ${scope === 'selection' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Selected ({selection.length})
              </button>
              <button 
                onClick={() => setScope('all')}
                className={`px-1.5 py-0.5 text-[9px] rounded-sm transition-colors ${scope === 'all' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Whole design
              </button>
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should the assistant do?"
            className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-2 text-xs focus:border-primary focus:outline-none min-h-[80px] resize-y"
            disabled={isGenerating || isReadOnly}
          />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {[
              'Align everything to the center', 
              'Make all strokes 2px thick', 
              'Distribute horizontally'
            ].map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setPrompt(suggestion)}
                disabled={isGenerating || isReadOnly}
                className="px-1.5 py-1 rounded border border-white/10 bg-white/5 text-[9px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {!isGenerating && (
          <button
            onClick={() => handleGenerate()}
            disabled={!prompt.trim() || isReadOnly}
            className="w-full py-2 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
          >
            Review Proposal
          </button>
        )}

        {isGenerating && (
          <div className="space-y-2">
            <div className="flex items-center justify-center p-4 border border-white/10 rounded-md bg-black/20">
              <Loader2 className="animate-spin text-primary mr-2" size={16} />
              <span className="text-xs text-muted-foreground">Analyzing request...</span>
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
      </div>
    </div>
  );
}
