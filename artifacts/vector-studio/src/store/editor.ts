import { createStore } from './createStore';
import { VectorObject, ShapeType, DocumentState } from '../lib/types';
import { generateId } from '../lib/utils';

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
const initialObjects = savedData ? JSON.parse(savedData) : INITIAL_ARTWORK;

export const editorStore = createStore<DocumentState>({
  objects: initialObjects,
  selection: [],
  activeTool: 'select',
  zoom: 1,
  pan: { x: window.innerWidth / 2 - 400, y: window.innerHeight / 2 - 300 },
  artboard: { width: 800, height: 600, fill: '#0A0A0B' },
  history: [initialObjects],
  historyIndex: 0,
});

export const useEditorStore = editorStore.useStore;

editorStore.subscribe(() => {
  const { objects } = editorStore.get();
  localStorage.setItem('vector-studio-doc', JSON.stringify(objects));
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

export const updateObject = (id: string, partial: Partial<VectorObject>) => {
  const { objects } = editorStore.get();
  setObjects(objects.map(obj => obj.id === id ? { ...obj, ...partial } : obj));
};

export const updateSelectedObjects = (partial: Partial<VectorObject>) => {
  const { objects, selection } = editorStore.get();
  setObjects(objects.map(obj => selection.includes(obj.id) ? { ...obj, ...partial } : obj));
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
