import { VectorObject } from './types';
import { generateId } from './utils';
import { pathDataBounds } from './pathUtils';
import { transformObjectBounds } from './objectGeometry';

export interface CopilotPlan {
  version: number;
  explanation: string;
  warnings: string[];
  operations: any[];
  destructive: boolean;
  provider?: string;
  model?: string;
}

export function buildCopilotDocument(objects: VectorObject[], artboard: { width: number; height: number; fill: string }) {
  const docObjects = objects.map(o => {
    const docObj: any = {
      id: o.id,
      type: o.type,
      name: o.name,
      x: o.x,
      y: o.y,
      width: o.width,
      height: o.height,
      rotation: o.rotation,
      fill: o.fill,
      stroke: o.stroke,
      strokeWidth: o.strokeWidth,
      opacity: o.opacity,
      visible: o.visible,
      locked: o.locked,
    };
    if (o.groupId !== undefined) docObj.groupId = o.groupId;
    if (o.traceRole !== undefined) docObj.traceRole = o.traceRole;
    if (o.points !== undefined) docObj.pointsLength = o.points.length;
    if (o.nodes !== undefined) docObj.nodeCount = o.nodes.length;
    if (o.closed !== undefined) docObj.closed = o.closed;
    if (o.text !== undefined) docObj.text = o.text.substring(0, 80);
    return docObj;
  });

  return {
    artboard: {
      width: artboard.width,
      height: artboard.height,
      fill: artboard.fill
    },
    objects: docObjects
  };
}

function isValidNumber(n: any, min: number, max: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
}

function isValidColor(c: any): boolean {
  if (typeof c !== 'string') return false;
  if (c === 'none') return true;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c);
}

/**
 * Paths/polygons carrying raw point data without editable nodes or a trace
 * role render their geometry directly from `points`, so bounds-only moves and
 * resizes would silently desync the visible shape. Treat them as style-only.
 */
export function isRigidGeometry(o: VectorObject): boolean {
  return (o.type === 'path' || o.type === 'polygon')
    && typeof o.points === 'string' && o.points.length > 0
    && !o.nodes && !o.traceRole;
}

export function validateCopilotPlan(raw: any, objects: VectorObject[], scopeIds: string[] | null = null): { valid: boolean; plan?: CopilotPlan; error?: string; warnings: string[] } {
  const scopeSet = scopeIds && scopeIds.length > 0 ? new Set(scopeIds) : null;
  if (!raw || typeof raw !== 'object') return { valid: false, error: 'Invalid response format', warnings: [] };
  if (raw.version !== 1) return { valid: false, error: 'Unsupported version', warnings: [] };
  
  const warnings = [...(Array.isArray(raw.warnings) ? raw.warnings.filter((w: any) => typeof w === 'string') : [])];
  
  if (!Array.isArray(raw.operations)) return { valid: false, error: 'Operations must be an array', warnings: [] };
  if (raw.operations.length > 40) return { valid: false, error: 'Too many operations', warnings: [] };
  
  let insertedCount = 0;
  
  const knownIds = new Set(objects.map(o => o.id));
  const lockedIds = new Set(objects.filter(o => o.locked).map(o => o.id));
  
  const validOps: any[] = [];
  
  for (const op of raw.operations) {
    if (!op || typeof op !== 'object') return { valid: false, error: 'Invalid operation object', warnings: [] };
    
    const type = op.op;
    if (!['select', 'update', 'delete', 'duplicate', 'insert', 'group', 'ungroup', 'align', 'distribute'].includes(type)) {
      return { valid: false, error: `Unknown operation: ${type}`, warnings: [] };
    }
    
    if (type !== 'insert') {
      if (!Array.isArray(op.ids)) return { valid: false, error: `Operation ${type} requires ids array`, warnings: [] };
      const validIds = [];
      for (const id of op.ids) {
        if (typeof id !== 'string' || id.length === 0 || id.length > 64) {
          return { valid: false, error: 'Invalid id format', warnings: [] };
        }
        if (!knownIds.has(id)) {
          warnings.push(`Unknown id ${id} in ${type} operation`);
          continue;
        }
        if (lockedIds.has(id)) {
          // Parity with the server validator: locked objects are excluded from
          // every ID-based operation so deferred (apply-time) revalidation
          // honors locks added while a proposal was under review.
          warnings.push(`Cannot ${type} locked object ${id}`);
          continue;
        }
        if (scopeSet && !scopeSet.has(id)) {
          warnings.push(`Skipped ${type} on an object outside the current selection`);
          continue;
        }
        validIds.push(id);
      }
      
      if (['align'].includes(type) && validIds.length < 2) {
        warnings.push(`Align needs at least 2 valid objects`);
        continue;
      }
      if (['distribute'].includes(type) && validIds.length < 3) {
        warnings.push(`Distribute needs at least 3 valid objects`);
        continue;
      }
      
      if (validIds.length === 0 && op.ids.length > 0) {
        continue;
      }
      
      op.ids = validIds;
    }
    
    if (type === 'insert') {
      if (!Array.isArray(op.objects)) return { valid: false, error: 'Insert requires objects array', warnings: [] };
      for (const obj of op.objects) {
        insertedCount++;
        if (insertedCount > 60) return { valid: false, error: 'Too many inserted objects', warnings: [] };
        
        if (!['rect', 'ellipse', 'polygon', 'star', 'line', 'path'].includes(obj.type)) return { valid: false, error: `Invalid insert type ${obj.type}`, warnings: [] };
        if (obj.text !== undefined || obj.imageSrc !== undefined) return { valid: false, error: 'Cannot insert text or images', warnings: [] };
        if (!isValidNumber(obj.x, -10000, 10000) || !isValidNumber(obj.y, -10000, 10000)) return { valid: false, error: 'Invalid coordinates', warnings: [] };
        if (!isValidNumber(obj.width, 0.1, 10000) || !isValidNumber(obj.height, 0.1, 10000)) return { valid: false, error: 'Invalid dimensions', warnings: [] };
        if (obj.rotation !== undefined && !isValidNumber(obj.rotation, -3600, 3600)) return { valid: false, error: 'Invalid rotation', warnings: [] };
        if (obj.fill !== undefined && !isValidColor(obj.fill)) return { valid: false, error: 'Invalid fill color', warnings: [] };
        if (obj.stroke !== undefined && !isValidColor(obj.stroke)) return { valid: false, error: 'Invalid stroke color', warnings: [] };
        if (obj.strokeWidth !== undefined && !isValidNumber(obj.strokeWidth, 0, 100)) return { valid: false, error: 'Invalid strokeWidth', warnings: [] };
        if (obj.opacity !== undefined && !isValidNumber(obj.opacity, 0, 1)) return { valid: false, error: 'Invalid opacity', warnings: [] };
        
        if (obj.type === 'path' || obj.type === 'polygon') {
          if (obj.points !== undefined) {
            if (typeof obj.points !== 'string' || obj.points.length > 4000) return { valid: false, error: 'Points string too long', warnings: [] };
            if (!/^[MmLlHhVvCcSsQqTtAaZz0-9 ,.eE+-]*$/.test(obj.points)) return { valid: false, error: 'Invalid characters in path data', warnings: [] };
          }
        }
        
        if (obj.name && (typeof obj.name !== 'string' || obj.name.length > 60)) {
           obj.name = typeof obj.name === 'string' ? obj.name.substring(0, 60) : 'Generated Object';
        }
      }
    }
    
    if (type === 'update') {
      if (!op.patch || typeof op.patch !== 'object') return { valid: false, error: 'Update missing patch object', warnings: [] };
      const p = { ...op.patch };
      if (p.x !== undefined && !isValidNumber(p.x, -10000, 10000)) return { valid: false, error: 'Invalid patch x', warnings: [] };
      if (p.y !== undefined && !isValidNumber(p.y, -10000, 10000)) return { valid: false, error: 'Invalid patch y', warnings: [] };
      if (p.width !== undefined && !isValidNumber(p.width, 0.1, 10000)) return { valid: false, error: 'Invalid patch width', warnings: [] };
      if (p.height !== undefined && !isValidNumber(p.height, 0.1, 10000)) return { valid: false, error: 'Invalid patch height', warnings: [] };
      if (p.rotation !== undefined && !isValidNumber(p.rotation, -3600, 3600)) return { valid: false, error: 'Invalid patch rotation', warnings: [] };
      if (p.fill !== undefined && !isValidColor(p.fill)) return { valid: false, error: 'Invalid patch fill color', warnings: [] };
      if (p.stroke !== undefined && !isValidColor(p.stroke)) return { valid: false, error: 'Invalid patch stroke color', warnings: [] };
      if (p.strokeWidth !== undefined && !isValidNumber(p.strokeWidth, 0, 100)) return { valid: false, error: 'Invalid patch strokeWidth', warnings: [] };
      if (p.opacity !== undefined && !isValidNumber(p.opacity, 0, 1)) return { valid: false, error: 'Invalid patch opacity', warnings: [] };
      
      const allowedKeys = ['x', 'y', 'width', 'height', 'rotation', 'fill', 'stroke', 'strokeWidth', 'opacity', 'name'];
      for (const k of Object.keys(p)) {
        if (!allowedKeys.includes(k)) {
           warnings.push(`Ignored unknown patch field: ${k}`);
           delete p[k];
        }
      }
      op.patch = p;
    }
    
    if (type === 'align' && !['left', 'center', 'right', 'top', 'middle', 'bottom'].includes(op.alignment)) {
      return { valid: false, error: `Invalid alignment: ${op.alignment}`, warnings: [] };
    }
    
    if (type === 'distribute' && !['x', 'y'].includes(op.axis)) {
      return { valid: false, error: `Invalid axis: ${op.axis}`, warnings: [] };
    }
    
    if (type === 'duplicate') {
      if (op.offsetX !== undefined && !isValidNumber(op.offsetX, -1000, 1000)) op.offsetX = 16;
      if (op.offsetY !== undefined && !isValidNumber(op.offsetY, -1000, 1000)) op.offsetY = 16;
    }
    
    validOps.push(op);
  }
  
  return { 
    valid: true, 
    plan: {
      version: raw.version,
      explanation: typeof raw.explanation === 'string' ? raw.explanation.substring(0, 600) : '',
      warnings: warnings.slice(0, 10),
      operations: validOps,
      destructive: Boolean(raw.destructive),
      provider: raw.provider,
      model: raw.model
    },
    warnings 
  };
}

export function executeCopilotPlan(objects: VectorObject[], plan: CopilotPlan) {
  let nextObjects = objects.map(o => ({ ...o }));
  let selection = new Set<string>();
  const warnings = [...plan.warnings];
  const summary = { added: 0, changed: 0, removed: 0, selectedOnly: 0 };
  
  const changedIds = new Set<string>();
  const addedIds = new Set<string>();
  const removedIds = new Set<string>();

  for (const op of plan.operations) {
    if (op.op === 'select') {
      op.ids.forEach((id: string) => selection.add(id));
    }
    if (op.op === 'update') {
      let rigidGeometrySkipped = false;
      op.ids.forEach((id: string) => {
        const idx = nextObjects.findIndex(o => o.id === id);
        if (idx !== -1) {
          const target = nextObjects[idx];
          const { x, y, width, height, ...stylePatch } = op.patch;
          const geometryPatch: Record<string, number> = {};
          if (x !== undefined) geometryPatch.x = x;
          if (y !== undefined) geometryPatch.y = y;
          if (width !== undefined) geometryPatch.width = width;
          if (height !== undefined) geometryPatch.height = height;
          const hasGeometry = Object.keys(geometryPatch).length > 0;
          if (hasGeometry && isRigidGeometry(target)) {
            rigidGeometrySkipped = true;
            if (Object.keys(stylePatch).length === 0) return;
            nextObjects[idx] = { ...target, ...stylePatch };
          } else {
            const moved = hasGeometry ? transformObjectBounds(target, geometryPatch) : target;
            nextObjects[idx] = { ...moved, ...stylePatch, ...geometryPatch };
          }
          selection.add(id);
          changedIds.add(id);
        }
      });
      if (rigidGeometrySkipped) {
        warnings.push('Some imported paths cannot be moved or resized yet; only their styling was updated.');
      }
    }
    if (op.op === 'delete') {
      op.ids.forEach((id: string) => {
        const idx = nextObjects.findIndex(o => o.id === id);
        if (idx !== -1) {
          nextObjects.splice(idx, 1);
          selection.delete(id);
          removedIds.add(id);
        }
      });
    }
    if (op.op === 'duplicate') {
      const copies: VectorObject[] = [];
      let rigidSkipped = false;
      op.ids.forEach((id: string) => {
        const obj = nextObjects.find(o => o.id === id);
        if (obj) {
          if (isRigidGeometry(obj)) {
            rigidSkipped = true;
            return;
          }
          const offsetX = op.offsetX ?? 16;
          const offsetY = op.offsetY ?? 16;
          const newObj = {
            ...obj,
            id: generateId(),
            name: `${obj.name} copy`,
            x: obj.x + offsetX,
            y: obj.y + offsetY
          };
          copies.push(newObj);
          addedIds.add(newObj.id);
        }
      });
      if (rigidSkipped) {
        warnings.push('Some imported paths were not duplicated because their copies could not be placed apart yet.');
      }
      nextObjects.push(...copies);
      copies.forEach(c => selection.add(c.id));
    }
    if (op.op === 'insert') {
      const inserts: VectorObject[] = op.objects.map((obj: any) => {
        const newObj: VectorObject = {
          id: generateId(),
          type: obj.type,
          name: obj.name || `New ${obj.type}`,
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
          rotation: obj.rotation || 0,
          fill: obj.fill || '#D9D9D9',
          stroke: obj.stroke || 'none',
          strokeWidth: obj.strokeWidth || 0,
          opacity: obj.opacity !== undefined ? obj.opacity : 1,
          visible: true,
          locked: false
        };
        if (obj.rx !== undefined && obj.type === 'rect') newObj.rx = obj.rx;
        if (obj.points !== undefined && (obj.type === 'path' || obj.type === 'polygon')) {
          newObj.points = obj.points;
          const bounds = pathDataBounds(obj.points);
          newObj.x = bounds.x;
          newObj.y = bounds.y;
          newObj.width = bounds.width;
          newObj.height = bounds.height;
        }
        if (obj.closed !== undefined) newObj.closed = obj.closed;
        return newObj;
      });
      nextObjects.push(...inserts);
      inserts.forEach(c => {
        selection.add(c.id);
        addedIds.add(c.id);
      });
    }
    if (op.op === 'group') {
      const groupId = generateId();
      op.ids.forEach((id: string) => {
        const obj = nextObjects.find(o => o.id === id);
        if (obj) {
          obj.groupId = groupId;
          selection.add(id);
          changedIds.add(id);
        }
      });
    }
    if (op.op === 'ungroup') {
      op.ids.forEach((id: string) => {
        const obj = nextObjects.find(o => o.id === id);
        if (obj) {
          obj.groupId = undefined;
          selection.add(id);
          changedIds.add(id);
        }
      });
    }
    if (op.op === 'align') {
      const alignObjects = nextObjects.filter(o => op.ids.includes(o.id));
      const movable = alignObjects.filter(o => !isRigidGeometry(o));
      if (movable.length < alignObjects.length) {
        warnings.push('Some imported paths kept their position during alignment because they cannot be moved yet.');
      }
      if (alignObjects.length >= 2 && movable.length >= 1) {
        const alignment = op.alignment;
        let targetVal = 0;
        if (alignment === 'left') targetVal = Math.min(...alignObjects.map(o => o.x));
        if (alignment === 'right') targetVal = Math.max(...alignObjects.map(o => o.x + o.width));
        if (alignment === 'center') targetVal = alignObjects.reduce((sum, o) => sum + o.x + o.width/2, 0) / alignObjects.length;
        if (alignment === 'top') targetVal = Math.min(...alignObjects.map(o => o.y));
        if (alignment === 'bottom') targetVal = Math.max(...alignObjects.map(o => o.y + o.height));
        if (alignment === 'middle') targetVal = alignObjects.reduce((sum, o) => sum + o.y + o.height/2, 0) / alignObjects.length;

        nextObjects = nextObjects.map(obj => {
          if (!op.ids.includes(obj.id) || isRigidGeometry(obj)) return obj;
          let newX = obj.x, newY = obj.y;
          if (alignment === 'left') newX = targetVal;
          if (alignment === 'right') newX = targetVal - obj.width;
          if (alignment === 'center') newX = targetVal - obj.width/2;
          if (alignment === 'top') newY = targetVal;
          if (alignment === 'bottom') newY = targetVal - obj.height;
          if (alignment === 'middle') newY = targetVal - obj.height/2;
          const nextObj = transformObjectBounds(obj, { x: newX, y: newY });
          selection.add(obj.id);
          changedIds.add(obj.id);
          return nextObj;
        });
      }
    }
    if (op.op === 'distribute') {
      const axis = op.axis === 'x' ? 'x' : 'y';
      const participants = nextObjects.filter(o => op.ids.includes(o.id));
      const distributeObjects = participants.filter(o => !isRigidGeometry(o));
      if (distributeObjects.length < participants.length) {
        warnings.push('Some imported paths were left out of distribution because they cannot be moved yet.');
      }
      if (distributeObjects.length >= 3) {
        distributeObjects.sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y));
        const first = distributeObjects[0];
        const last = distributeObjects[distributeObjects.length - 1];
        const totalSpace = ((axis === 'x' ? last.x : last.y) + (axis === 'x' ? last.width : last.height)) - (axis === 'x' ? first.x : first.y);
        const totalElementsSize = distributeObjects.reduce((sum, o) => sum + (axis === 'x' ? o.width : o.height), 0);
        const gap = (totalSpace - totalElementsSize) / (distributeObjects.length - 1);
        
        let pos = (axis === 'x' ? first.x : first.y);
        distributeObjects.forEach(obj => {
          const idx = nextObjects.findIndex(o => o.id === obj.id);
          if (idx > -1) {
             nextObjects[idx] = transformObjectBounds(nextObjects[idx], { [axis]: pos });
             selection.add(obj.id);
             changedIds.add(obj.id);
          }
          pos += (axis === 'x' ? obj.width : obj.height) + gap;
        });
      }
    }
  }

  const survivingIds = new Set(nextObjects.map(o => o.id));
  const validSelection = Array.from(selection).filter(id => survivingIds.has(id));
  
  let selectedOnly = 0;
  for (const id of validSelection) {
    if (!addedIds.has(id) && !changedIds.has(id)) {
      selectedOnly++;
    }
  }

  summary.added = addedIds.size;
  summary.changed = changedIds.size;
  summary.removed = removedIds.size;
  summary.selectedOnly = selectedOnly;

  return {
    objects: nextObjects,
    selection: validSelection,
    summary,
    warnings
  };
}
