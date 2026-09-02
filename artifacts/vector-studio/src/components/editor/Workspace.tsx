import React, { useRef, useState, useEffect } from 'react';
import { useEditorStore, editorStore, selectObject, updateObject, setObjects } from '../../store/editor';
import { ShapeRenderer } from './ShapeRenderer';
import { generateId } from '../../lib/utils';
import { VectorObject, PathNode } from '../../lib/types';
import Rulers from './Rulers';
import { computeBoundingBox, smoothPathNodes } from '../../lib/pathUtils';
import { useCloudProject } from '../../cloud/CloudProjectProvider';

type DragState =
  | { type: 'idle' }
  | { type: 'pan', startX: number, startY: number, startPanX: number, startPanY: number }
  | { type: 'draw', shapeId: string, startX: number, startY: number }
  | { type: 'move', startX: number, startY: number, startObjects: VectorObject[] }
  | { type: 'resize', handle: string, shapeId: string, startX: number, startY: number, startObj: VectorObject }
  | { type: 'pencil', shapeId: string, nodes: PathNode[] }
  | { type: 'node-move', shapeId: string, nodeIndex: number, handle: 'main' | 'in' | 'out', startX: number, startY: number, startNodes: PathNode[] }
  | { type: 'guide', axis: 'x' | 'y', guideId: string };

export default function Workspace() {
  const { objects, selection, activeTool, zoom, pan, artboard, guides } = useEditorStore();
  const { isReadOnly } = useCloudProject();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<DragState>({ type: 'idle' });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [snapLines, setSnapLines] = useState<{x?: number, y?: number}>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
        setIsSpacePressed(true);
      }
       if (!isReadOnly && (e.code === 'Escape' || e.code === 'Enter')) {
        if (activeTool === 'pen' && selection.length === 1) {
          const obj = objects.find(o => o.id === selection[0]);
          if (obj && obj.type === 'path' && obj.nodes) {
             updateObject(obj.id, { closed: e.code === 'Enter' }, true);
             editorStore.set({ activeTool: 'select' });
          }
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
   }, [activeTool, selection, objects, isReadOnly]);

  const getSvgPoint = (clientX: number, clientY: number) => {
    return {
      x: (clientX - pan.x) / zoom,
      y: (clientY - pan.y) / zoom
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return; // Only left and middle click
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some synthetic and accessibility-driven pointer events do not own an active pointer.
    }
    
    // Middle click or Space + Left click = Pan
    if (e.button === 1 || isSpacePressed) {
      setDragState({
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y
      });
      return;
    }
    if (isReadOnly) return;

    const target = e.target as SVGElement;
    const isBg = target.tagName === 'svg' || target.id === 'artboard-bg';
    const svgPoint = getSvgPoint(e.clientX, e.clientY);

    if (activeTool === 'pencil' && isBg) {
      const newId = generateId();
      const newObj: VectorObject = {
        id: newId,
        type: 'path',
        name: `Pencil ${objects.length + 1}`,
        x: svgPoint.x, y: svgPoint.y, width: 1, height: 1,
        rotation: 0, fill: 'none', stroke: '#8B5CF6', strokeWidth: 2, opacity: 1,
        visible: true, locked: false, nodes: [{ x: svgPoint.x, y: svgPoint.y }]
      };
      setObjects([...objects, newObj], false);
      selectObject(newId);
      setDragState({ type: 'pencil', shapeId: newId, nodes: newObj.nodes! });
      return;
    }

    if (activeTool === 'pen' && isBg) {
      let currentObj = objects.find(o => o.id === selection[0]);
      if (!currentObj || currentObj.type !== 'path' || currentObj.closed) {
        const newId = generateId();
        currentObj = {
          id: newId,
          type: 'path',
          name: `Path ${objects.length + 1}`,
          x: svgPoint.x, y: svgPoint.y, width: 1, height: 1,
          rotation: 0, fill: 'none', stroke: '#8B5CF6', strokeWidth: 2, opacity: 1,
          visible: true, locked: false, nodes: [{ x: svgPoint.x, y: svgPoint.y }]
        };
        setObjects([...objects, currentObj], false);
        selectObject(newId);
        setDragState({ type: 'node-move', shapeId: newId, nodeIndex: 0, handle: 'out', startX: svgPoint.x, startY: svgPoint.y, startNodes: currentObj.nodes! });
      } else if (currentObj && currentObj.nodes) {
        const newNodes = [...currentObj.nodes, { x: svgPoint.x, y: svgPoint.y }];
        const bb = computeBoundingBox(newNodes);
        updateObject(currentObj.id, { nodes: newNodes, x: bb.x, y: bb.y, width: bb.width, height: bb.height }, false);
        setDragState({ type: 'node-move', shapeId: currentObj.id, nodeIndex: newNodes.length - 1, handle: 'out', startX: svgPoint.x, startY: svgPoint.y, startNodes: newNodes });
      }
      return;
    }

    if (activeTool !== 'select' && activeTool !== 'node' && activeTool !== 'pen' && activeTool !== 'pencil' && isBg) {
      // Start drawing standard shape
      const newId = generateId();
      const newObj: VectorObject = {
        id: newId,
        type: activeTool === 'text' ? 'text' : activeTool === 'line' ? 'line' : activeTool as any,
        name: `${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} ${objects.length + 1}`,
        x: svgPoint.x,
        y: svgPoint.y,
        width: 0,
        height: 0,
        rotation: 0,
        fill: activeTool === 'line' ? 'none' : '#D9D9D9',
        stroke: activeTool === 'line' ? '#D9D9D9' : 'none',
        strokeWidth: activeTool === 'line' ? 2 : 0,
        opacity: 1,
        visible: true,
        locked: false,
        text: activeTool === 'text' ? 'New Text' : undefined
      };
      setObjects([...objects, newObj], false);
      selectObject(newId);
      setDragState({ type: 'draw', shapeId: newId, startX: svgPoint.x, startY: svgPoint.y });
    } else if (isBg) {
      // Clicked background in select mode
      selectObject(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragState.type === 'pan') {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      editorStore.set({
        pan: { x: dragState.startPanX + dx, y: dragState.startPanY + dy }
      });
    } else if (dragState.type === 'pencil') {
      const svgPoint = getSvgPoint(e.clientX, e.clientY);
      const previous = dragState.nodes[dragState.nodes.length - 1];
      if (Math.hypot(svgPoint.x - previous.x, svgPoint.y - previous.y) >= 3 / zoom) {
        const nodes = [...dragState.nodes, svgPoint];
        updateObject(dragState.shapeId, { nodes }, false);
        setDragState({ ...dragState, nodes });
      }
    } else if (dragState.type === 'node-move') {
      const svgPoint = getSvgPoint(e.clientX, e.clientY);
      const dx = svgPoint.x - dragState.startX;
      const dy = svgPoint.y - dragState.startY;
      
      const newNodes = [...dragState.startNodes];
      const node = { ...newNodes[dragState.nodeIndex] };
      
      if (dragState.handle === 'main') {
        node.x += dx;
        node.y += dy;
        if (node.handleIn) { node.handleIn.x += dx; node.handleIn.y += dy; }
        if (node.handleOut) { node.handleOut.x += dx; node.handleOut.y += dy; }
      } else if (dragState.handle === 'out') {
        node.handleOut = { x: svgPoint.x, y: svgPoint.y };
        if (!e.altKey && node.handleIn) {
          // Mirror handleIn
          const hdx = node.x - node.handleOut.x;
          const hdy = node.y - node.handleOut.y;
          node.handleIn = { x: node.x + hdx, y: node.y + hdy };
        }
      } else if (dragState.handle === 'in') {
        node.handleIn = { x: svgPoint.x, y: svgPoint.y };
        if (!e.altKey && node.handleOut) {
          const hdx = node.x - node.handleIn.x;
          const hdy = node.y - node.handleIn.y;
          node.handleOut = { x: node.x + hdx, y: node.y + hdy };
        }
      }
      
      newNodes[dragState.nodeIndex] = node;
      const bb = computeBoundingBox(newNodes);
      updateObject(dragState.shapeId, { nodes: newNodes, x: bb.x, y: bb.y, width: bb.width, height: bb.height }, false);
    } else if (dragState.type === 'guide') {
      const svgPoint = getSvgPoint(e.clientX, e.clientY);
      const guides = [...editorStore.get().guides];
      const guideIndex = guides.findIndex(g => g.id === dragState.guideId);
      if (guideIndex > -1) {
         guides[guideIndex] = { ...guides[guideIndex], pos: dragState.axis === 'x' ? svgPoint.x : svgPoint.y };
         editorStore.set({ guides });
      }
    } else if (dragState.type === 'draw') {
      const svgPoint = getSvgPoint(e.clientX, e.clientY);
      const w = svgPoint.x - dragState.startX;
      const h = svgPoint.y - dragState.startY;
      
      updateObject(dragState.shapeId, {
        x: w < 0 ? svgPoint.x : dragState.startX,
        y: h < 0 ? svgPoint.y : dragState.startY,
        width: Math.abs(w),
        height: Math.abs(h)
      }, false);
    } else if (dragState.type === 'move') {
      const svgPoint = getSvgPoint(e.clientX, e.clientY);
      let dx = svgPoint.x - dragState.startX;
      let dy = svgPoint.y - dragState.startY;
      
       if (dragState.startObjects.length === 1) {
         const obj = dragState.startObjects[0];
         const targetX = obj.x + dx;
         const targetY = obj.y + dy;
         let snapX: number | undefined;
         let snapY: number | undefined;
         
         // Snap to guides first
         for (const guide of guides) {
            if (guide.axis === 'x') {
               if (Math.abs(targetX - guide.pos) < 5 / zoom) { dx = guide.pos - obj.x; snapX = guide.pos; }
               else if (Math.abs(targetX + obj.width - guide.pos) < 5 / zoom) { dx = guide.pos - obj.width - obj.x; snapX = guide.pos; }
            } else {
               if (Math.abs(targetY - guide.pos) < 5 / zoom) { dy = guide.pos - obj.y; snapY = guide.pos; }
               else if (Math.abs(targetY + obj.height - guide.pos) < 5 / zoom) { dy = guide.pos - obj.height - obj.y; snapY = guide.pos; }
            }
         }
         
          if (editorStore.get().snapToGrid) {
            const grid = editorStore.get().gridSize;
            const gridX = Math.round(targetX / grid) * grid;
            const gridY = Math.round(targetY / grid) * grid;
            if (Math.abs(targetX - gridX) < 5 / zoom) { dx = gridX - obj.x; snapX = gridX; }
            if (Math.abs(targetY - gridY) < 5 / zoom) { dy = gridY - obj.y; snapY = gridY; }
          }

          if (editorStore.get().snapToObjects) {
            const others = objects.filter(o => !selection.includes(o.id) && o.visible);
            const snapTargets = [...others, { x: 0, y: 0, width: artboard.width, height: artboard.height } as VectorObject];
            for (const other of snapTargets) {
              if (Math.abs(targetX - other.x) < 5 / zoom) { dx = other.x - obj.x; snapX = other.x; }
              else if (Math.abs(targetX + obj.width - (other.x + other.width)) < 5 / zoom) { dx = (other.x + other.width) - obj.width - obj.x; snapX = other.x + other.width; }
              if (Math.abs(targetY - other.y) < 5 / zoom) { dy = other.y - obj.y; snapY = other.y; }
              else if (Math.abs(targetY + obj.height - (other.y + other.height)) < 5 / zoom) { dy = (other.y + other.height) - obj.height - obj.y; snapY = other.y + other.height; }
            }
         }
         setSnapLines({x: snapX, y: snapY});
      }
      
      const newObjects = objects.map(obj => {
        const startObj = dragState.startObjects.find(o => o.id === obj.id);
        if (startObj && selection.includes(obj.id)) {
          return { ...obj, x: startObj.x + dx, y: startObj.y + dy };
        }
        return obj;
      });
      editorStore.set({ objects: newObjects });
    } else if (dragState.type === 'resize') {
      const svgPoint = getSvgPoint(e.clientX, e.clientY);
      const dx = svgPoint.x - dragState.startX;
      const dy = svgPoint.y - dragState.startY;
      
      const obj = dragState.startObj;
      let newX = obj.x;
      let newY = obj.y;
      let newW = obj.width;
      let newH = obj.height;

      // simplified resize without rotation handling for now
      if (dragState.handle.includes('e')) newW = Math.max(1, obj.width + dx);
      if (dragState.handle.includes('s')) newH = Math.max(1, obj.height + dy);
      if (dragState.handle.includes('w')) {
        newW = Math.max(1, obj.width - dx);
        if (newW > 1) newX = obj.x + dx;
      }
      if (dragState.handle.includes('n')) {
        newH = Math.max(1, obj.height - dy);
        if (newH > 1) newY = obj.y + dy;
      }
      
      updateObject(dragState.shapeId, {
        x: newX, y: newY, width: newW, height: newH
      }, false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState.type === 'pencil') {
      const smoothed = smoothPathNodes(dragState.nodes);
      const bounds = computeBoundingBox(smoothed);
      updateObject(dragState.shapeId, { nodes: smoothed, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, false);
    }
    if (dragState.type !== 'idle' && dragState.type !== 'pan' && dragState.type !== 'node-move') {
      // Commit to history when finishing a drag that modified objects
      setObjects(editorStore.get().objects, true);
    }
    if (dragState.type === 'node-move') {
      // For node move, we want to allow immediate continuation if pen tool.
      if (activeTool !== 'pen') {
         setObjects(editorStore.get().objects, true);
      }
    }
    setSnapLines({});
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (dragState.type === 'node-move' && activeTool === 'pen') {
       setDragState({ type: 'idle' });
       // We keep it in 'idle' so the next click adds a node.
    } else {
       setDragState({ type: 'idle' });
    }
  };

  const handleGuideStart = (e: React.PointerEvent, axis: 'x' | 'y') => {
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Guide dragging still works through the attached pointer listeners.
    }
    const point = getSvgPoint(e.clientX, e.clientY);
    const guideId = generateId();
    const pos = axis === 'x' ? point.x : point.y;
    editorStore.set({ guides: [...guides, { id: guideId, axis, pos }] });
    const move = (event: PointerEvent) => {
      const next = getSvgPoint(event.clientX, event.clientY);
      editorStore.set({
        guides: editorStore.get().guides.map(guide => guide.id === guideId
          ? { ...guide, pos: axis === 'x' ? next.x : next.y }
          : guide),
      });
    };
    const finish = (event: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const shouldZoom = e.ctrlKey || e.metaKey || e.deltaMode === WheelEvent.DOM_DELTA_LINE;
    if (shouldZoom) {
      e.preventDefault();
      const zoomSensitivity = e.ctrlKey || e.metaKey ? 0.005 : 0.035;
      const delta = -e.deltaY * zoomSensitivity;
      const newZoom = Math.min(Math.max(0.1, zoom + delta), 5);
      
      // Zoom centered on cursor
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      const svgXBefore = (mouseX - pan.x) / zoom;
      const svgYBefore = (mouseY - pan.y) / zoom;
      
      const newPanX = mouseX - svgXBefore * newZoom;
      const newPanY = mouseY - svgYBefore * newZoom;
      
      editorStore.set({ zoom: newZoom, pan: { x: newPanX, y: newPanY } });
    } else {
      editorStore.set({
        pan: { x: pan.x - e.deltaX, y: pan.y - e.deltaY }
      });
    }
  };

  const handleShapePointerDown = (e: React.PointerEvent, id: string) => {
    if (isReadOnly) return;
    if (isSpacePressed || activeTool === 'pen' || activeTool === 'pencil') return;
    e.stopPropagation();
    
    if (activeTool === 'select' || activeTool === 'node') {
      const obj = objects.find(o => o.id === id);
      if (obj?.locked) return;
      
      if (activeTool === 'select') {
        const groupedIds = obj?.groupId
          ? objects.filter(item => item.groupId === obj.groupId).map(item => item.id)
          : [id];
        let dragSelection = selection;
        if (e.shiftKey) {
          groupedIds.forEach(groupedId => selectObject(groupedId, true));
          dragSelection = Array.from(new Set([...selection, ...groupedIds]));
        } else if (!selection.includes(id)) {
          editorStore.set({ selection: groupedIds });
          dragSelection = groupedIds;
        }
        
        const svgPoint = getSvgPoint(e.clientX, e.clientY);
        setDragState({
          type: 'move',
          startX: svgPoint.x,
          startY: svgPoint.y,
          startObjects: objects.filter(o => dragSelection.includes(o.id))
        });
      } else if (activeTool === 'node') {
        selectObject(id);
      }
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent, handle: string, id: string) => {
    if (isReadOnly) return;
    if (activeTool !== 'select') return;
    e.stopPropagation();
    const svgPoint = getSvgPoint(e.clientX, e.clientY);
    const obj = objects.find(o => o.id === id);
    if (!obj) return;
    
    setDragState({
      type: 'resize',
      handle,
      shapeId: id,
      startX: svgPoint.x,
      startY: svgPoint.y,
      startObj: obj
    });
  };
  
  const handleNodePointerDown = (e: React.PointerEvent, id: string, nodeIndex: number, handle: 'main'|'in'|'out') => {
    if (isReadOnly) return;
    e.stopPropagation();
    const svgPoint = getSvgPoint(e.clientX, e.clientY);
    const obj = objects.find(o => o.id === id);
    if (!obj || !obj.nodes) return;
    
    setDragState({
      type: 'node-move',
      shapeId: id,
      nodeIndex,
      handle,
      startX: svgPoint.x,
      startY: svgPoint.y,
      startNodes: obj.nodes
    });
  };

  return (
    <div 
      className={`absolute inset-0 z-0 overflow-hidden ${isSpacePressed ? 'cursor-grab active:cursor-grabbing' : (activeTool === 'pen' || activeTool === 'pencil') ? 'cursor-crosshair' : activeTool !== 'select' && activeTool !== 'node' ? 'cursor-crosshair' : 'cursor-default'}`}
    >
      <Rulers onGuideStart={isReadOnly ? undefined : handleGuideStart} />
      <svg
        ref={svgRef}
        className="w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Artboard Shadow */}
          <rect 
            x={-10} y={-10} 
            width={artboard.width + 20} height={artboard.height + 20} 
            fill="rgba(0,0,0,0.2)" 
            filter="blur(10px)"
          />
          {/* Artboard */}
          <rect 
            id="artboard-bg"
            x={0} y={0} 
            width={artboard.width} height={artboard.height} 
            fill={artboard.fill} 
          />
          
          {objects.map(obj => (
            <g key={obj.id} onPointerDown={(e) => handleShapePointerDown(e, obj.id)}>
              <ShapeRenderer object={obj} objects={obj.type === 'text' && obj.textPathId ? objects : undefined} />
            </g>
          ))}
          
          {/* Guides */}
          {guides.map(guide => (
            <line 
              key={guide.id}
              x1={guide.axis === 'x' ? guide.pos : -10000}
              y1={guide.axis === 'y' ? guide.pos : -10000}
              x2={guide.axis === 'x' ? guide.pos : 10000}
              y2={guide.axis === 'y' ? guide.pos : 10000}
              stroke="#38bdf8"
              strokeWidth={1/zoom}
              pointerEvents="none"
            />
          ))}
          
          {/* Snapping guides */}
          {snapLines.x !== undefined && (
            <line x1={snapLines.x} y1={-10000} x2={snapLines.x} y2={10000} stroke="#ef4444" strokeWidth={1/zoom} strokeDasharray="4 4" pointerEvents="none" />
          )}
          {snapLines.y !== undefined && (
            <line x1={-10000} y1={snapLines.y} x2={10000} y2={snapLines.y} stroke="#ef4444" strokeWidth={1/zoom} strokeDasharray="4 4" pointerEvents="none" />
          )}

          {/* Selection outlines and handles */}
          {selection.map(id => {
            const obj = objects.find(o => o.id === id);
            if (!obj) return null;
            
            const handleSize = 8 / zoom;
            const h2 = handleSize / 2;
            
            // Standard selection box (hide in node mode for paths)
            if ((activeTool !== 'node' && activeTool !== 'pen') || obj.type !== 'path') {
              return (
                <g 
                  key={`sel-${id}`} 
                  transform={`rotate(${obj.rotation} ${obj.x + obj.width / 2} ${obj.y + obj.height / 2})`}
                >
                  <rect
                    x={obj.x} y={obj.y}
                    width={obj.width} height={obj.height}
                    fill="none"
                    stroke="#8B5CF6"
                    strokeWidth={2 / zoom}
                    pointerEvents="none"
                  />
                  {/* Handles */}
                  {['nw', 'ne', 'sw', 'se'].map(pos => (
                    <rect
                      key={pos}
                      x={pos.includes('w') ? obj.x - h2 : obj.x + obj.width - h2}
                      y={pos.includes('n') ? obj.y - h2 : obj.y + obj.height - h2}
                      width={handleSize}
                      height={handleSize}
                      fill="#fff"
                      stroke="#8B5CF6"
                      strokeWidth={2 / zoom}
                      cursor={`${pos}-resize`}
                      onPointerDown={(e) => handleResizePointerDown(e, pos, id)}
                    />
                  ))}
                </g>
              );
            }
            
            // Node editor handles
            if ((activeTool === 'node' || activeTool === 'pen') && obj.type === 'path' && obj.nodes) {
               return (
                 <g key={`nodes-${id}`}>
                   {obj.nodes.map((node, i) => (
                     <g key={i}>
                       {/* Control lines */}
                       {node.handleIn && (
                         <line x1={node.x} y1={node.y} x2={node.handleIn.x} y2={node.handleIn.y} stroke="#8B5CF6" strokeWidth={1/zoom} opacity={0.5} />
                       )}
                       {node.handleOut && (
                         <line x1={node.x} y1={node.y} x2={node.handleOut.x} y2={node.handleOut.y} stroke="#8B5CF6" strokeWidth={1/zoom} opacity={0.5} />
                       )}
                       
                       {/* Handle In */}
                       {node.handleIn && (
                         <circle cx={node.handleIn.x} cy={node.handleIn.y} r={3/zoom} fill="#fff" stroke="#8B5CF6" strokeWidth={1.5/zoom} cursor="pointer" onPointerDown={(e) => handleNodePointerDown(e, id, i, 'in')} />
                       )}
                       
                       {/* Handle Out */}
                       {node.handleOut && (
                         <circle cx={node.handleOut.x} cy={node.handleOut.y} r={3/zoom} fill="#fff" stroke="#8B5CF6" strokeWidth={1.5/zoom} cursor="pointer" onPointerDown={(e) => handleNodePointerDown(e, id, i, 'out')} />
                       )}
                       
                       {/* Main node */}
                       <rect x={node.x - 4/zoom} y={node.y - 4/zoom} width={8/zoom} height={8/zoom} fill="#fff" stroke="#8B5CF6" strokeWidth={2/zoom} cursor="pointer" onPointerDown={(e) => handleNodePointerDown(e, id, i, 'main')} />
                     </g>
                   ))}
                 </g>
               );
            }
            return null;
          })}
        </g>
      </svg>
    </div>
  );
}
