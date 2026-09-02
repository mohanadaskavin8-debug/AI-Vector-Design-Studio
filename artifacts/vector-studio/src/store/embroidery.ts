import { createStore } from './createStore';
import { EmbroideryDesign, ViewSettings, HoopSettings, StitchRegion, EMBROIDERY_EXPORTERS, buildThreadPalette, normalizeRegionSequence, MAX_PLAN_COMMANDS, EmbroideryGenerationError } from '../lib/embroidery';

const INITIAL_HOOP: HoopSettings = {
  name: 'Standard 100x100mm',
  widthMm: 100,
  heightMm: 100,
  centerX: 400,
  centerY: 300
};

interface EmbroideryState {
  design: EmbroideryDesign;
  selectedRegionIds: string[];
  viewSettings: ViewSettings;
  storageWarning: string | null;
}

let initialDesign: EmbroideryDesign = {
  regions: [],
  hoop: INITIAL_HOOP,
  threadPalette: [],
  exporters: EMBROIDERY_EXPORTERS
};

let initialView: ViewSettings = {
  showRealistic: false,
  showDirection: false,
  showUnderlay: true,
  showJumps: true,
  showTrims: true,
  showOrder: false
};

try {
  const savedData = localStorage.getItem('vector-studio-embroidery');
  const parsed = savedData ? JSON.parse(savedData) : null;
  if (parsed && parsed.design) {
    const migratedRegions = Array.isArray(parsed.design.regions) ? parsed.design.regions.map((region: Partial<StitchRegion>) => ({
      ...region,
      sourceType: region.sourceType ?? 'path',
      geometryQuality: region.geometryQuality ?? 'approximate',
      geometryNote: region.geometryNote ?? 'Saved before geometry-quality metadata was available.',
      settings: {
        stitchType: region.settings?.stitchType ?? 'running',
        density: region.settings?.density ?? 0.4,
        angle: region.settings?.angle ?? 0,
        underlay: typeof region.settings?.underlay === 'boolean'
          ? (region.settings.underlay ? 'edge-run' : 'none')
          : (region.settings?.underlay ?? 'none'),
        pullCompensation: region.settings?.pullCompensation ?? 0.2,
        stitchLength: region.settings?.stitchLength ?? 2.5,
        color: region.settings?.color ?? { hex: '#ffffff' },
      },
      commands: (region.commands ?? []).map(command => ({ ...command, layer: command.layer ?? 'top' })),
    })) as StitchRegion[] : [];
    initialDesign = {
       ...initialDesign,
       regions: normalizeRegionSequence(migratedRegions),
       hoop: parsed.design.hoop?.widthMm ? { ...INITIAL_HOOP, ...parsed.design.hoop } : INITIAL_HOOP
    };
    initialDesign.threadPalette = buildThreadPalette(initialDesign.regions);
  }
  if (parsed && parsed.viewSettings) {
    initialView = { ...initialView, ...parsed.viewSettings };
  }
} catch {
  localStorage.removeItem('vector-studio-embroidery');
}

export const embroideryStore = createStore<EmbroideryState>({
  design: initialDesign,
  selectedRegionIds: [],
  viewSettings: initialView,
  storageWarning: null,
});

export const useEmbroideryStore = () => embroideryStore.useStore((state) => state);

let persistenceTimer: ReturnType<typeof setTimeout> | undefined;
embroideryStore.subscribe(() => {
  clearTimeout(persistenceTimer);
  persistenceTimer = setTimeout(() => {
    const state = embroideryStore.get();
    try {
      localStorage.setItem('vector-studio-embroidery', JSON.stringify({
        design: state.design,
        viewSettings: state.viewSettings
      }));
    } catch {
      if (!state.storageWarning) {
        embroideryStore.set({ storageWarning: 'The stitch plan is still usable, but this browser could not refresh its local recovery copy.' });
      }
    }
  }, 180);
});

export const setEmbroideryDesign = (design: EmbroideryDesign) => {
  embroideryStore.set({ design });
};

export const setEmbroideryRegions = (regions: StitchRegion[]) => {
  const normalized = normalizeRegionSequence(regions);
  const commandCount = normalized.reduce((total, region) => total + region.commands.length, 0);
  if (commandCount > MAX_PLAN_COMMANDS) {
    throw new EmbroideryGenerationError(`The plan would exceed the ${MAX_PLAN_COMMANDS.toLocaleString()} command safety limit. Increase row spacing, simplify regions, or remove another region first.`);
  }
  const threadPalette = buildThreadPalette(normalized);
  const design = { ...embroideryStore.get().design, regions: normalized, threadPalette };
  embroideryStore.set({ design });
};

export const updateEmbroideryRegion = (id: string, partial: Partial<StitchRegion>) => {
  const regions = embroideryStore.get().design.regions.map(r => r.id === id ? { ...r, ...partial } : r);
  setEmbroideryRegions(regions);
};

export const selectEmbroideryRegion = (id: string | null, multi = false) => {
  const { selectedRegionIds } = embroideryStore.get();
  if (id === null) {
    embroideryStore.set({ selectedRegionIds: [] });
    return;
  }
  if (multi) {
    if (selectedRegionIds.includes(id)) {
      embroideryStore.set({ selectedRegionIds: selectedRegionIds.filter(sid => sid !== id) });
    } else {
      embroideryStore.set({ selectedRegionIds: [...selectedRegionIds, id] });
    }
  } else {
    embroideryStore.set({ selectedRegionIds: [id] });
  }
};

export const setHoop = (hoop: HoopSettings) => {
  const design = { ...embroideryStore.get().design, hoop };
  embroideryStore.set({ design });
};

export const moveRegion = (id: string, direction: 'up' | 'down') => {
  const regions = [...embroideryStore.get().design.regions];
  const idx = regions.findIndex(r => r.id === id);
  if (idx < 0) return;
  if (direction === 'up' && idx > 0) {
    [regions[idx - 1], regions[idx]] = [regions[idx], regions[idx - 1]];
    setEmbroideryRegions(regions);
  } else if (direction === 'down' && idx < regions.length - 1) {
    [regions[idx + 1], regions[idx]] = [regions[idx], regions[idx + 1]];
    setEmbroideryRegions(regions);
  }
};

export const deleteRegion = (id: string) => {
  const regions = embroideryStore.get().design.regions.filter(r => r.id !== id);
  setEmbroideryRegions(regions);
  const { selectedRegionIds } = embroideryStore.get();
  if (selectedRegionIds.includes(id)) {
    embroideryStore.set({ selectedRegionIds: selectedRegionIds.filter(sid => sid !== id) });
  }
};
