export type ShapeType = 'select' | 'rect' | 'ellipse' | 'text' | 'polygon' | 'star' | 'line';

export interface VectorObject {
  id: string;
  type: ShapeType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  rx?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  points?: string; // used for custom paths if needed, though for standard polygon we can derive it
}

export interface DocumentState {
  objects: VectorObject[];
  selection: string[];
  activeTool: ShapeType;
  zoom: number;
  pan: { x: number; y: number };
  artboard: { width: number; height: number; fill: string };
  history: VectorObject[][];
  historyIndex: number;
}
