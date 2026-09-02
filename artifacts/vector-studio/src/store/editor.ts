import { createStore } from './createStore';
import { VectorObject, ShapeType, DocumentState } from '../lib/types';
import { generateId } from '../lib/utils';
import { objectToPathData } from '../lib/booleanOps';
import { pathDataBounds } from '../lib/pathUtils';

const INITIAL_ARTWORK: VectorObject[] = [
  {
    id: generateId(),
    type: 'rect',
    name: 'Background',
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    rotation: 0,
    fill: '#1a1a1f',
    stroke: 'none',
    strokeWidth: 0,
    opacity: 1,
    visible: true,
    locked: true,
    rx: 0
  },
  {
    id: generateId(),
    type: 'polygon',
    name: 'Logo Diamond',
    x: 250,
    y: 150,
    width: 300,
    height: 300,
    rotation: 0,
    fill: 'none',
    stroke: '#8B5CF6',
    strokeWidth: 4,
    opacity: 1,
    visible: true,
    locked: false,
  },
  {
    id: generateId(),
    type: 'ellipse',
    name: 'Logo Core',
    x: 350,
    y: 250,
    width: 100,
    height: 100,
    rotation: 0,
    fill: '#8B5CF6',
    stroke: 'none',
    strokeWidth: 0,
    opacity: 1,
    visible: true,
    locked: false
  },
  {
    id: generateId(),
    type: 'text',
    name: 'Brand Name',
    x: 235,
    y: 500,
    width: 330,
    height: 50,
    rotation: 0,
    fill: '#ffffff',
    stroke: 'none',
    strokeWidth: 0,
    opacity: 1,
    visible: true,
    locked: false,
    text: 'VECTOR STUDIO',
    fontSize: 42,
    fontFamily: 'Inter'
  }
];

const savedData = localStorage.getItem('vector-studio-doc');
let initialObjects = INITIAL_ARTWORK;
try {
  const parsed = savedData ? JSON.parse(savedData) : null;
  if (Array.isArray(parsed)) initialObjects = parsed;
} catch {
  localStorage.removeItem('vector-studio-doc');
}

export const editorStore = createStore<DocumentState>({
  objects: initialObjects,
  selection: [],
  activeTool: 'select',
  zoom: 1,
  pan: { x: window.innerWidth / 2 - 400, y: window.innerHeight / 2 - 300 },
  artboard: { width: 800, height: 600, fill: '#0A0A0B' },
  history: [initialObjects],
  historyIndex: 0,
  projectName: localStorage.getItem('vector-studio-name') || 'Untitled composition',
  saveStatus: 'saved',
  storageWarning: null,
  guides: [],
  snapToGrid: false,
  snapToObjects: true,
  gridSize: 10,
  unit: 'px',
  workspaceMode: 'design',
  previewState: {
    scene: 'apparel',
    preset: 't-shirt',
    position: { x: 0.5, y: 0.5 },
    scale: 0.5,
    rotation: 0,
    opacity: 0.9,
    blendMode: 'multiply',
    printFinish: 'matte',
    shadowStrength: 0.5,
    textureStrength: 0.5,
    surfaceColor: '#F3F4F6',
    quality: 'high'
  }
});

export const useEditorStore = () => editorStore.useStore((state) => state);

let persistenceTimer: ReturnType<typeof setTimeout> | undefined;
editorStore.subscribe(() => {
  clearTimeout(persistenceTimer);
  persistenceTimer = setTimeout(() => {
    const { objects, projectName, storageWarning } = editorStore.get();
    try {
      localStorage.setItem('vector-studio-doc', JSON.stringify(objects));
      localStorage.setItem('vector-studio-name', projectName);
      if (storageWarning) editorStore.set({ storageWarning: null });
    } catch {
      if (!storageWarning) editorStore.set({ storageWarning: 'Browser recovery could not be refreshed (storage quota). Keep this tab open or save to cloud.' });
    }
  }, 250);
});

// Actions
export const setObjects = (objects: VectorObject[], addToHistory = true) => {
  const state = editorStore.get();
  
  let newHistory = state.history;
  let newIndex = state.historyIndex;
  
  if (addToHistory) {
    const historyToKeep = state.history.slice(0, state.historyIndex + 1);
    newHistory = [...historyToKeep, objects];
    newIndex = newHistory.length - 1;
    
    if (newHistory.length > 50) {
      newHistory = newHistory.slice(newHistory.length - 50);
      newIndex = newHistory.length - 1;
    }
  }

  editorStore.set({ objects, history: newHistory, historyIndex: newIndex });
};

export const updateObject = (id: string, partial: Partial<VectorObject>, addToHistory = true) => {
  const { objects } = editorStore.get();
  setObjects(objects.map(obj => obj.id === id ? { ...obj, ...partial } : obj), addToHistory);
};

export const updateSelectedObjects = (partial: Partial<VectorObject>) => {
  const { objects, selection } = editorStore.get();
  setObjects(objects.map(obj => selection.includes(obj.id) ? { ...obj, ...partial } : obj));
};

export const duplicateSelection = () => {
  const { objects, selection } = editorStore.get();
  const copies = objects
    .filter(object => selection.includes(object.id))
    .map(object => ({ ...object, id: generateId(), name: `${object.name} copy`, x: object.x + 16, y: object.y + 16 }));
  if (!copies.length) return;
  setObjects([...objects, ...copies]);
  editorStore.set({ selection: copies.map(object => object.id) });
};

export const deleteSelection = () => {
  const { objects, selection } = editorStore.get();
  if (!selection.length) return;
  setObjects(objects.filter(object => !selection.includes(object.id)));
  editorStore.set({ selection: [] });
};

export const groupSelection = () => {
  const { selection } = editorStore.get();
  if (selection.length < 2) return;
  updateSelectedObjects({ groupId: generateId() });
};

export const ungroupSelection = () => updateSelectedObjects({ groupId: undefined });

export const alignSelection = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
  const { objects, selection } = editorStore.get();
  if (selection.length < 2) return;
  
  const selectedObjs = objects.filter(o => selection.includes(o.id));
  let targetVal = 0;
  
  if (alignment === 'left') targetVal = Math.min(...selectedObjs.map(o => o.x));
  if (alignment === 'right') targetVal = Math.max(...selectedObjs.map(o => o.x + o.width));
  if (alignment === 'center') targetVal = selectedObjs.reduce((sum, o) => sum + o.x + o.width/2, 0) / selectedObjs.length;
  
  if (alignment === 'top') targetVal = Math.min(...selectedObjs.map(o => o.y));
  if (alignment === 'bottom') targetVal = Math.max(...selectedObjs.map(o => o.y + o.height));
  if (alignment === 'middle') targetVal = selectedObjs.reduce((sum, o) => sum + o.y + o.height/2, 0) / selectedObjs.length;

  const newObjs = objects.map(obj => {
    if (!selection.includes(obj.id)) return obj;
    let newX = obj.x, newY = obj.y;
    if (alignment === 'left') newX = targetVal;
    if (alignment === 'right') newX = targetVal - obj.width;
    if (alignment === 'center') newX = targetVal - obj.width/2;
    if (alignment === 'top') newY = targetVal;
    if (alignment === 'bottom') newY = targetVal - obj.height;
    if (alignment === 'middle') newY = targetVal - obj.height/2;
    return { ...obj, x: newX, y: newY };
  });
  
  setObjects(newObjs, true);
};

export const distributeSelection = (axis: 'x' | 'y') => {
  const { objects, selection } = editorStore.get();
  if (selection.length < 3) return;
  
  const selectedObjs = objects.filter(o => selection.includes(o.id));
  selectedObjs.sort((a, b) => a[axis] - b[axis]);
  
  const first = selectedObjs[0];
  const last = selectedObjs[selectedObjs.length - 1];
  
  const totalSpace = (last[axis] + (axis === 'x' ? last.width : last.height)) - first[axis];
  const totalElementsSize = selectedObjs.reduce((sum, o) => sum + (axis === 'x' ? o.width : o.height), 0);
  
  const gap = (totalSpace - totalElementsSize) / (selectedObjs.length - 1);
  
  let pos = first[axis];
  const updatedObjs = [...objects];
  selectedObjs.forEach((obj, i) => {
    const objIdx = updatedObjs.findIndex(o => o.id === obj.id);
    if (objIdx > -1) {
       updatedObjs[objIdx] = { 
         ...updatedObjs[objIdx], 
         [axis]: pos 
       };
    }
    pos += (axis === 'x' ? obj.width : obj.height) + gap;
  });
  
  setObjects(updatedObjs, true);
};

export const combineSelection = (): string | null => {
  const { objects, selection } = editorStore.get();
  if (selection.length < 2) return 'Select at least two supported, unrotated vector objects.';
  const selected = objects.filter(object => selection.includes(object.id));
  const pathParts = selected.map(objectToPathData);
  if (pathParts.some(part => !part)) return 'Combine supports unrotated rectangles, ellipses, lines, polygons, and paths.';
  const points = pathParts.join(' ');
  const bounds = pathDataBounds(points);
  const combined: VectorObject = {
    ...selected[selected.length - 1],
    id: generateId(),
    type: 'path',
    name: 'Combined path',
    ...bounds,
    points,
    nodes: undefined,
    closed: true,
  };
  setObjects([...objects.filter(object => !selection.includes(object.id)), combined]);
  editorStore.set({ selection: [combined.id] });
  return null;
};

export const breakApartSelection = (): string | null => {
  const { objects, selection } = editorStore.get();
  if (selection.length !== 1) return 'Select one combined path.';
  const source = objects.find(object => object.id === selection[0]);
  if (!source || source.type !== 'path' || !source.points) return 'Break apart requires one imported or combined path.';
  const parts = source.points.split(/(?=\bM\s)/i).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return 'This path contains only one subpath.';
  const created = parts.map((points, index): VectorObject => ({
    ...source,
    id: generateId(),
    name: `${source.name} ${index + 1}`,
    points,
    ...pathDataBounds(points),
  }));
  setObjects([...objects.filter(object => object.id !== source.id), ...created]);
  editorStore.set({ selection: created.map(object => object.id) });
  return null;
};

export const offsetSelection = (amount: number): string | null => {
  const { objects, selection } = editorStore.get();
  if (!selection.length) return 'Select one or more rectangles.';
  const selected = objects.filter(object => selection.includes(object.id));
  if (selected.some(object => !isFinite(amount) || !object || object.type !== 'rect' || object.rotation !== 0)) {
    return 'Offset currently supports unrotated rectangles only.';
  }
  const updated = objects.map(object => selection.includes(object.id)
    ? { ...object, x: object.x - amount, y: object.y - amount, width: Math.max(0.1, object.width + amount * 2), height: Math.max(0.1, object.height + amount * 2) }
    : object);
  setObjects(updated);
  return null;
};

export const selectObject = (id: string | null, multi = false) => {
  const { selection } = editorStore.get();
  if (id === null) {
    editorStore.set({ selection: [] });
    return;
  }
  
  if (multi) {
    if (selection.includes(id)) {
      editorStore.set({ selection: selection.filter(sid => sid !== id) });
    } else {
      editorStore.set({ selection: [...selection, id] });
    }
  } else {
    editorStore.set({ selection: [id] });
  }
};

export const undo = () => {
  const { history, historyIndex } = editorStore.get();
  if (historyIndex > 0) {
    editorStore.set({ 
      historyIndex: historyIndex - 1, 
      objects: history[historyIndex - 1],
      selection: []
    });
  }
};

export const redo = () => {
  const { history, historyIndex } = editorStore.get();
  if (historyIndex < history.length - 1) {
    editorStore.set({ 
      historyIndex: historyIndex + 1, 
      objects: history[historyIndex + 1],
      selection: []
    });
  }
};
