import React, { useRef, useState, useEffect } from 'react';
import { useEditorStore, editorStore, selectObject, updateObject, setObjects } from '../../store/editor';
import { ShapeRenderer } from './ShapeRenderer';
import { generateId } from '../../lib/utils';
import { VectorObject } from '../../lib/types';

type DragState =
  | { type: 'idle' }
  | { type: 'pan', startX: number, startY: number, startPanX: number, startPanY: number }
  | { type: 'draw', shapeId: string, startX: number, startY: number }
  | { type: 'move', startX: number, startY: number, startObjects: VectorObject[] }
  | { type: 'resize', handle: string, shapeId: string, startX: number, startY: number, startObj: VectorObject };

export default function Workspace() {
  const { objects, selection, activeTool, zoom, pan, artboard } = useEditorStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<DragState>({ type: 'idle' });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
        setIsSpacePressed(true);
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
  }, []);

  const getSvgPoint = (clientX: number, clientY: number) => {
    return {
      x: (clientX - pan.x) / zoom,
      y: (clientY - pan.y) / zoom
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return; // Only left and middle click
    e.currentTarget.setPointerCapture(e.pointerId);
    
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

    const target = e.target as SVGElement;
    const isBg = target.tagName === 'svg' || target.id === 'artboard-bg';
    
    const svgPoint = getSvgPoint(e.clientX, e.clientY);

    if (activeTool !== 'select' && isBg) {
      // Start drawing
      const newId = generateId();
      const newObj: VectorObject = {
        id: newId,
        type: activeTool === 'text' ? 'text' : activeTool === 'line' ? 'line' : activeTool,
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
      const dx = svgPoint.x - dragState.startX;
      const dy = svgPoint.y - dragState.startY;
      
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
    if (dragState.type !== 'idle' && dragState.type !== 'pan') {
      // Commit to history when finishing a drag that modified objects
      setObjects(editorStore.get().objects, true);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragState({ type: 'idle' });
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
    if (isSpacePressed) return;
    e.stopPropagation();
    
    if (activeTool === 'select') {
      const obj = objects.find(o => o.id === id);
      if (obj?.locked) return;
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
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent, handle: string, id: string) => {
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

  return (
    <div 
      className={`absolute inset-0 z-0 overflow-hidden ${isSpacePressed ? 'cursor-grab active:cursor-grabbing' : activeTool !== 'select' ? 'cursor-crosshair' : 'cursor-default'}`}
    >
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
              <ShapeRenderer object={obj} />
            </g>
          ))}

          {/* Selection outlines and handles */}
          {selection.map(id => {
            const obj = objects.find(o => o.id === id);
            if (!obj) return null;
            
            const handleSize = 8 / zoom;
            const h2 = handleSize / 2;
            
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
          })}
        </g>
      </svg>
    </div>
  );
}
