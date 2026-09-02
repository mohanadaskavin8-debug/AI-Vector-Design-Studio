import type { DocumentState, PreviewState, UnitType, VectorObject } from '../lib/types';
import type { EmbroideryDesign, ViewSettings } from '../lib/embroidery';

/** Version 1 of Vector Studio's durable cloud format. Unknown future fields are ignored. */
export interface CloudDocumentV1 {
  type: 'vector-studio-document';
  version: 1;
  objects: VectorObject[];
  artboard: DocumentState['artboard'];
  guides: DocumentState['guides'];
  snapping: { snapToGrid: boolean; snapToObjects: boolean; gridSize: number };
  unit: UnitType;
  preview: PreviewState;
  embroidery: { design: EmbroideryDesign; viewSettings: ViewSettings };
}

type DurableEditor = Pick<DocumentState, 'objects' | 'artboard' | 'guides' | 'snapToGrid' | 'snapToObjects' | 'gridSize' | 'unit' | 'previewState'>;
type DurableEmbroidery = { design: EmbroideryDesign; viewSettings: ViewSettings };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const shapeTypes = new Set(['rect', 'ellipse', 'text', 'polygon', 'star', 'line', 'path', 'image']);
const validNode = (value: unknown) => record(value) && finite(value.x) && finite(value.y)
  && (!('handleIn' in value) || (record(value.handleIn) && finite(value.handleIn.x) && finite(value.handleIn.y)))
  && (!('handleOut' in value) || (record(value.handleOut) && finite(value.handleOut.x) && finite(value.handleOut.y)));
const validObject = (value: unknown): value is VectorObject => record(value)
  && typeof value.id === 'string' && shapeTypes.has(String(value.type)) && typeof value.name === 'string'
  && finite(value.x) && finite(value.y) && finite(value.width) && finite(value.height) && finite(value.rotation)
  && typeof value.fill === 'string' && typeof value.stroke === 'string' && finite(value.strokeWidth)
  && finite(value.opacity) && typeof value.visible === 'boolean' && typeof value.locked === 'boolean'
  && (!('nodes' in value) || (Array.isArray(value.nodes) && value.nodes.every(validNode)));
const validEmbroideryDesign = (value: unknown): value is EmbroideryDesign => {
  if (!record(value) || !Array.isArray(value.regions) || !record(value.hoop)
    || typeof value.hoop.name !== 'string' || !finite(value.hoop.widthMm) || !finite(value.hoop.heightMm)
    || !Array.isArray(value.threadPalette) || !Array.isArray(value.exporters)) return false;
  return value.regions.every(region => record(region) && typeof region.id === 'string'
    && typeof region.sourceObjectId === 'string' && typeof region.name === 'string'
    && typeof region.visible === 'boolean' && record(region.settings) && Array.isArray(region.commands)
    && record(region.bounds) && finite(region.bounds.x) && finite(region.bounds.y)
    && finite(region.bounds.width) && finite(region.bounds.height));
};

export function serializeCloudDocument(editor: DurableEditor, embroidery: DurableEmbroidery): CloudDocumentV1 {
  return {
    type: 'vector-studio-document',
    version: 1,
    objects: structuredClone(editor.objects),
    artboard: structuredClone(editor.artboard),
    guides: structuredClone(editor.guides),
    snapping: { snapToGrid: editor.snapToGrid, snapToObjects: editor.snapToObjects, gridSize: editor.gridSize },
    unit: editor.unit,
    preview: structuredClone(editor.previewState),
    embroidery: structuredClone(embroidery),
  };
}

/** Validates the V1 boundary without rejecting harmless fields added by newer writers. */
export function deserializeCloudDocument(payload: unknown, fallback: CloudDocumentV1): CloudDocumentV1 {
  if (!record(payload) || payload.type !== 'vector-studio-document' || payload.version !== 1) return structuredClone(fallback);
  const objects = Array.isArray(payload.objects)
    ? payload.objects.filter(validObject)
    : fallback.objects;
  const artboard = record(payload.artboard) && finite(payload.artboard.width) && finite(payload.artboard.height) && typeof payload.artboard.fill === 'string'
    ? payload.artboard as unknown as DocumentState['artboard'] : fallback.artboard;
  const snapping = record(payload.snapping) ? payload.snapping : {};
  const unit = ['px', 'mm', 'cm', 'in', 'pt'].includes(String(payload.unit)) ? payload.unit as UnitType : fallback.unit;
  const preview = record(payload.preview) ? {
    ...fallback.preview,
    ...payload.preview,
    position: record(payload.preview.position) && finite(payload.preview.position.x) && finite(payload.preview.position.y)
      ? { x: payload.preview.position.x, y: payload.preview.position.y }
      : fallback.preview.position,
  } as PreviewState : fallback.preview;
  const embroidery = record(payload.embroidery) ? payload.embroidery : {};
  const design = validEmbroideryDesign(embroidery.design) ? embroidery.design : fallback.embroidery.design;
  const viewSettings = record(embroidery.viewSettings) ? { ...fallback.embroidery.viewSettings, ...embroidery.viewSettings } as ViewSettings : fallback.embroidery.viewSettings;
  return {
    type: 'vector-studio-document',
    version: 1,
    objects: structuredClone(objects),
    artboard: structuredClone(artboard),
    guides: Array.isArray(payload.guides) ? payload.guides.filter((guide): guide is DocumentState['guides'][number] => record(guide) && typeof guide.id === 'string' && (guide.axis === 'x' || guide.axis === 'y') && finite(guide.pos)) : structuredClone(fallback.guides),
    snapping: {
      snapToGrid: typeof snapping.snapToGrid === 'boolean' ? snapping.snapToGrid : fallback.snapping.snapToGrid,
      snapToObjects: typeof snapping.snapToObjects === 'boolean' ? snapping.snapToObjects : fallback.snapping.snapToObjects,
      gridSize: finite(snapping.gridSize) && snapping.gridSize > 0 ? snapping.gridSize : fallback.snapping.gridSize,
    },
    unit, preview: structuredClone(preview),
    embroidery: { design: structuredClone(design), viewSettings: structuredClone(viewSettings) },
  };
}

export function createBlankCloudDocument(): CloudDocumentV1 {
  return {
    type: 'vector-studio-document', version: 1, objects: [],
    artboard: { width: 800, height: 600, fill: '#0A0A0B' }, guides: [],
    snapping: { snapToGrid: false, snapToObjects: true, gridSize: 10 }, unit: 'px',
    preview: { scene: 'apparel', preset: 't-shirt', position: { x: .5, y: .5 }, scale: .5, rotation: 0, opacity: .9, blendMode: 'multiply', printFinish: 'matte', shadowStrength: .5, textureStrength: .5, surfaceColor: '#F3F4F6', quality: 'high' },
    embroidery: {
      design: { regions: [], hoop: { name: 'Standard 100x100mm', widthMm: 100, heightMm: 100, centerX: 400, centerY: 300 }, threadPalette: [], exporters: [] },
      viewSettings: { showRealistic: false, showDirection: false, showUnderlay: true, showJumps: true, showTrims: true, showOrder: false },
    },
  };
}

export const cloudDocumentFingerprint = (document: CloudDocumentV1) => JSON.stringify(document);