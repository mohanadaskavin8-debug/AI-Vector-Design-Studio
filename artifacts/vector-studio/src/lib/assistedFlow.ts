// Orchestrates the one-click "Embroider design" flow:
//   1. snapshot the scope (selection or whole design)
//   2. offer text -> outline conversion when text layers are in scope
//   3. run the smart digitize pass (background exclusion, skip reasons)
//   4. auto-fit the smallest hoop preset and land in Embroidery mode
//   5. publish a conversion summary with the top preflight findings

import { editorStore, setObjects } from '../store/editor';
import { embroideryStore, setEmbroideryRegions, setHoop } from '../store/embroidery';
import { assistStore, AssistSummary } from '../store/assist';
import { runSmartDigitize, listConvertibleText, fitHoopToPlan } from './digitize';
import { convertTextObjectsToPaths } from './textConvert';
import { resolveBundledFont } from './fonts';
import { inspectEmbroidery, computeMetrics, PreflightWarning } from './embroidery';

const SEVERITY_ORDER: Record<PreflightWarning['severity'], number> = { error: 0, warning: 1, info: 2 };

export interface StartAssistOptions {
  includeBackground?: boolean;
  /** 'ask' pauses on a confirm dialog when text is in scope. */
  convertText?: 'ask' | 'convert' | 'skip';
  /** Re-run with a previously captured scope (e.g. "Include background"). */
  scopeSelection?: string[];
}

export async function startAssistedDigitize(options: StartAssistOptions = {}): Promise<void> {
  const convertText = options.convertText ?? 'ask';
  const { objects, selection } = editorStore.get();
  const scopeSelection = options.scopeSelection ?? selection;
  const textCandidates = listConvertibleText(objects, scopeSelection);

  if (convertText === 'ask' && textCandidates.length > 0) {
    assistStore.set({
      phase: 'confirm-text',
      scopeSelection,
      pendingText: textCandidates.map(candidate => {
        const resolved = resolveBundledFont(candidate.fontFamily, candidate.fontWeight);
        return {
          id: candidate.id,
          name: candidate.name,
          substitution: resolved.familyExact ? null : `${resolved.requestedFamily} \u2192 ${resolved.family}`,
        };
      }),
      error: null,
    });
    return;
  }

  await executeAssistedDigitize({
    scopeSelection,
    includeBackground: options.includeBackground ?? false,
    convertTextIds: convertText === 'convert' ? textCandidates.map(candidate => candidate.id) : [],
  });
}

/** Resolves the confirm-text dialog. */
export async function resumeAssistedDigitize(choice: 'convert' | 'skip' | 'cancel'): Promise<void> {
  const { scopeSelection, pendingText, phase } = assistStore.get();
  if (phase !== 'confirm-text') return;
  if (choice === 'cancel') {
    assistStore.set({ phase: 'idle', pendingText: [] });
    return;
  }
  await executeAssistedDigitize({
    scopeSelection,
    includeBackground: false,
    convertTextIds: choice === 'convert' ? pendingText.map(candidate => candidate.id) : [],
  });
}

interface ExecuteInput {
  scopeSelection: string[];
  includeBackground: boolean;
  convertTextIds: string[];
}

async function executeAssistedDigitize(input: ExecuteInput): Promise<void> {
  assistStore.set({ phase: 'working', pendingText: [], scopeSelection: input.scopeSelection, error: null });
  try {
    let { objects } = editorStore.get();
    const { artboard } = editorStore.get();

    let textConverted: string[] = [];
    let fontNotes: string[] = [];
    let failures: string[] = [];
    if (input.convertTextIds.length > 0) {
      const conversion = await convertTextObjectsToPaths(objects, input.convertTextIds);
      if (conversion.replacements.size > 0) {
        // One setObjects call = one undo entry for the whole conversion.
        const next = objects.map(object => conversion.replacements.get(object.id) ?? object);
        setObjects(next);
        objects = next;
        textConverted = [...conversion.replacements.values()].map(replacement => replacement.name);
      }
      fontNotes = conversion.notes;
      failures = conversion.failures.map(failure => failure.message);
    }

    const { design } = embroideryStore.get();
    const result = runSmartDigitize({
      objects,
      selection: input.scopeSelection,
      existingRegions: design.regions,
      artboard,
      includeBackground: input.includeBackground,
    });

    if (result.converted.length === 0 && result.skipped.length === 0 && failures.length === 0) {
      assistStore.set({ phase: 'idle', error: 'Nothing to embroider yet \u2014 draw or import artwork first.' });
      return;
    }

    setEmbroideryRegions(result.regions);

    const fit = fitHoopToPlan(embroideryStore.get().design.regions);
    if (fit) setHoop(fit.hoop);

    const currentDesign = embroideryStore.get().design;
    const preflight = [...inspectEmbroidery(currentDesign)]
      .sort((first, second) => SEVERITY_ORDER[first.severity] - SEVERITY_ORDER[second.severity])
      .slice(0, 3);
    const metrics = computeMetrics(currentDesign);

    const summary: AssistSummary = {
      converted: result.converted.map(item => ({ name: item.name, stitchType: item.stitchType, stitches: item.stitches })),
      skipped: result.skipped,
      textConverted,
      fontNotes,
      failures,
      hoop: fit
        ? {
            name: fit.hoop.name,
            widthMm: fit.hoop.widthMm,
            heightMm: fit.hoop.heightMm,
            fits: fit.fits,
            planWidthMm: fit.planWidthMm,
            planHeightMm: fit.planHeightMm,
          }
        : null,
      preflight,
      totalStitches: metrics.totalStitches,
      backgroundSkipped: result.backgroundSkipped,
      includeBackgroundUsed: input.includeBackground,
    };

    assistStore.set({ phase: 'idle', summary, error: null });
    editorStore.set({ workspaceMode: 'embroidery' });
  } catch (error) {
    assistStore.set({
      phase: 'idle',
      summary: null,
      error: error instanceof Error ? error.message : 'The assisted digitize run failed.',
    });
    editorStore.set({ workspaceMode: 'embroidery' });
  }
}
