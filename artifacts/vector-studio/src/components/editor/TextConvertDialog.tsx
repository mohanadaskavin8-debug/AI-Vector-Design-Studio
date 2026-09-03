import React from 'react';
import { Type } from 'lucide-react';
import { useAssistStore } from '../../store/assist';
import { resumeAssistedDigitize } from '../../lib/assistedFlow';

/**
 * Confirm step of the assisted "Embroider design" flow: offers to convert
 * in-scope text layers to outline paths (with font-substitution notices)
 * before digitizing, instead of silently skipping text.
 */
export default function TextConvertDialog() {
  const { phase, pendingText } = useAssistStore();
  if (phase !== 'confirm-text') return null;

  const plural = pendingText.length !== 1;
  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onPointerDown={() => void resumeAssistedDigitize('cancel')}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Convert text to outlines"
        className="bg-card w-[460px] max-w-[92vw] rounded-xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
          <Type size={16} className="text-primary" />
          <h2 className="text-sm font-semibold">Convert text to outlines?</h2>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {plural ? `${pendingText.length} text layers are` : 'One text layer is'} part of this design.
            Stitches need outline paths, so the assistant can convert {plural ? 'them' : 'it'} using bundled
            open-licensed fonts. Converted layers stop being editable as text — undo brings the text back.
          </p>
          <ul className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
            {pendingText.map(candidate => (
              <li key={candidate.id} className="flex items-center justify-between rounded-md bg-black/30 border border-white/5 px-2.5 py-1.5 text-xs">
                <span className="truncate">{candidate.name}</span>
                {candidate.substitution && (
                  <span
                    title="This font isn't bundled; the closest open-licensed outline font will be used."
                    className="ml-2 shrink-0 text-[9px] text-amber-400/90 border border-amber-500/20 bg-amber-500/10 rounded px-1.5 py-0.5"
                  >
                    {candidate.substitution}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="px-4 py-3 border-t border-white/10 flex flex-wrap justify-end gap-2">
          <button
            onClick={() => void resumeAssistedDigitize('cancel')}
            className="px-3 py-1.5 text-xs rounded-md text-muted-foreground hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void resumeAssistedDigitize('skip')}
            className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-black/30 hover:bg-white/5 transition-colors"
          >
            Skip text layers
          </button>
          <button
            autoFocus
            onClick={() => void resumeAssistedDigitize('convert')}
            className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors"
          >
            Convert text &amp; continue
          </button>
        </div>
      </div>
    </div>
  );
}
