export type ShapeType = 'rect' | 'ellipse' | 'text' | 'polygon' | 'star' | 'line' | 'path' | 'image';
export type ToolType = 'select' | 'node' | 'pen' | 'pencil' | ShapeType;

export interface PathNode {
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
}

export type UnitType = 'px' | 'mm' | 'cm' | 'in' | 'pt';

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
  groupId?: string;
  
  // Rect specific
  rx?: number;
  
  // Text specific
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  letterSpacing?: number;
  lineHeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  textPathId?: string; // ID of path object to bind text to
  
  // Path specific
  points?: string;
  nodes?: PathNode[];
  closed?: boolean;
  
  // Image specific
  imageSrc?: string;
}

export interface DocumentState {
  objects: VectorObject[];
  selection: string[];
  activeTool: ToolType;
  zoom: number;
  pan: { x: number; y: number };
  artboard: { width: number; height: number; fill: string };
  history: VectorObject[][];
  historyIndex: number;
  projectName: string;
  saveStatus: string;
  storageWarning: string | null;
  
  // Added features
  guides: { id: string, axis: 'x' | 'y', pos: number }[];
  snapToGrid: boolean;
  snapToObjects: boolean;
  gridSize: number;
  unit: UnitType;
  workspaceMode: 'design' | 'embroidery' | 'preview';
  previewState: PreviewState;
}

export interface PreviewState {
  scene: 'apparel' | 'accessories' | 'packaging' | 'stickers';
  preset: string;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'hard-light' | 'color-burn';
  printFinish: 'matte' | 'glossy' | 'metallic' | 'embossed';
  shadowStrength: number;
  textureStrength: number;
  surfaceColor: string;
  quality: 'draft' | 'high';
}
