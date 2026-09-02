import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useEditorStore, editorStore } from '../../store/editor';
import { ShapeRenderer } from './ShapeRenderer';
import { PreviewState } from '../../lib/types';
import { useCloudProject } from '../../cloud/CloudProjectProvider';

// Memoized artwork container that doesn't re-render on every drag tick unless scale/rotation changes
const ArtworkLayer = React.memo(({ artboard, objects, state, x, y, width, height }: { artboard: any, objects: any[], state: PreviewState, x: number | string, y: number | string, width: number | string, height: number | string }) => {
  return (
    <svg 
      x={x} y={y} width={width} height={height}
      viewBox={`0 0 ${artboard.width} ${artboard.height}`} 
      style={{ overflow: 'visible' }}
    >
      <g style={{
        mixBlendMode: state.blendMode as any,
        opacity: state.opacity,
        transformOrigin: 'center',
        transform: `translate(${(state.position.x - 0.5) * 100}%, ${(state.position.y - 0.5) * 100}%) scale(${state.scale}) rotate(${state.rotation}deg)`,
      }}>
        {/* Draw the artwork */}
        {objects.map(obj => <ShapeRenderer key={obj.id} object={obj} objects={obj.type === 'text' && obj.textPathId ? objects : undefined} />)}
      </g>
    </svg>
  );
}, (prev, next) => {
  return prev.objects === next.objects 
      && prev.state.blendMode === next.state.blendMode
      && prev.state.opacity === next.state.opacity
      && prev.state.scale === next.state.scale
      && prev.state.rotation === next.state.rotation
      && prev.state.position.x === next.state.position.x
      && prev.state.position.y === next.state.position.y;
});

export default function PreviewWorkspace() {
  const { previewState, objects, artboard } = useEditorStore();
  const { isReadOnly } = useCloudProject();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const startPreviewPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isReadOnly) return;
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    startPreviewPos.current = { ...previewState.position };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    
    // We scale the drag by the container size to get a normalized 0-1 offset
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const nx = startPreviewPos.current.x + dx / rect.width;
    const ny = startPreviewPos.current.y + dy / rect.height;
    
    editorStore.set({ 
      previewState: { 
        ...previewState, 
        position: { x: nx, y: ny } 
      } 
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Generate procedural scenes
  const renderScene = () => {
    const { scene, preset, surfaceColor, shadowStrength, textureStrength } = previewState;
    const isDark = (color: string) => {
      // Rough heuristic for text color on surface
      const hex = color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
    };
    const shade = isDark(surfaceColor) ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const deepShade = isDark(surfaceColor) ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)';

    let sceneSvg = null;
    let clipPathId = `clip-${scene}-${preset}`;

    if (scene === 'apparel' && preset === 't-shirt') {
      sceneSvg = (
        <svg viewBox="0 0 800 1000" className="w-full h-full max-w-2xl max-h-[80vh] mx-auto filter drop-shadow-2xl">
          <defs>
            <clipPath id={clipPathId}>
              {/* T-Shirt shape */}
              <path d="M 250,50 C 300,50 350,100 400,100 C 450,100 500,50 550,50 L 750,150 L 700,350 L 600,280 L 600,950 L 200,950 L 200,280 L 100,350 L 50,150 Z" />
            </clipPath>
            <filter id="fabric-texture" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" result="noise" />
              <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.15 0" in="noise" result="coloredNoise" />
              <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" />
            </filter>
            <linearGradient id="tshirt-folds" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={deepShade} stopOpacity={shadowStrength} />
              <stop offset="15%" stopColor={shade} stopOpacity={shadowStrength * 0.5} />
              <stop offset="30%" stopColor="transparent" />
              <stop offset="50%" stopColor={shade} stopOpacity={shadowStrength * 0.2} />
              <stop offset="70%" stopColor="transparent" />
              <stop offset="85%" stopColor={shade} stopOpacity={shadowStrength * 0.5} />
              <stop offset="100%" stopColor={deepShade} stopOpacity={shadowStrength} />
            </linearGradient>
            <radialGradient id="tshirt-light" cx="50%" cy="30%" r="70%">
               <stop offset="0%" stopColor="#ffffff" stopOpacity={shadowStrength * 0.3} />
               <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          
          <g style={{ filter: `drop-shadow(0 20px 30px rgba(0,0,0,${shadowStrength * 0.4}))` }}>
            {/* Base Color */}
            <path d="M 250,50 C 300,50 350,100 400,100 C 450,100 500,50 550,50 L 750,150 L 700,350 L 600,280 L 600,950 L 200,950 L 200,280 L 100,350 L 50,150 Z" fill={surfaceColor} />
            
            {/* Texture */}
            <path d="M 250,50 C 300,50 350,100 400,100 C 450,100 500,50 550,50 L 750,150 L 700,350 L 600,280 L 600,950 L 200,950 L 200,280 L 100,350 L 50,150 Z" fill="transparent" style={{ filter: `url(#fabric-texture)`, opacity: textureStrength }} pointerEvents="none" />
            
            {/* Artwork bounded by clip-path */}
            <g clipPath={`url(#${clipPathId})`}>
               <ArtworkLayer x="250" y="200" width="300" height="500" artboard={artboard} objects={objects} state={previewState} />
            </g>
            
            {/* Folds and Highlights */}
            <path d="M 250,50 C 300,50 350,100 400,100 C 450,100 500,50 550,50 L 750,150 L 700,350 L 600,280 L 600,950 L 200,950 L 200,280 L 100,350 L 50,150 Z" fill="url(#tshirt-folds)" pointerEvents="none" />
            <path d="M 250,50 C 300,50 350,100 400,100 C 450,100 500,50 550,50 L 750,150 L 700,350 L 600,280 L 600,950 L 200,950 L 200,280 L 100,350 L 50,150 Z" fill="url(#tshirt-light)" pointerEvents="none" />
            
            {/* Collar line */}
            <path d="M 300,55 C 350,110 450,110 500,55" fill="none" stroke={deepShade} strokeWidth="6" opacity={shadowStrength} pointerEvents="none" />
            {/* Seams */}
            <path d="M 250,50 L 200,280 M 550,50 L 600,280" fill="none" stroke={deepShade} strokeWidth="3" opacity={shadowStrength * 0.5} pointerEvents="none" strokeDasharray="5,5" />
          </g>
        </svg>
      );
    } else if (scene === 'apparel' && preset === 'hoodie') {
      sceneSvg = (
        <svg viewBox="0 0 800 1000" className="w-full h-full max-w-2xl max-h-[80vh] mx-auto filter drop-shadow-2xl">
          <defs>
            <clipPath id={clipPathId}>
              {/* Hoodie shape */}
              <path d="M 220,100 C 300,-10 500,-10 580,100 C 620,100 750,200 780,250 L 720,400 L 620,320 L 620,950 L 180,950 L 180,320 L 80,400 L 20,250 C 50,200 180,100 220,100 Z" />
            </clipPath>
            <filter id="fabric-texture" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
              <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.15 0" in="noise" result="coloredNoise" />
              <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" />
            </filter>
            <linearGradient id="tshirt-folds" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={deepShade} stopOpacity={shadowStrength} />
              <stop offset="15%" stopColor={shade} stopOpacity={shadowStrength * 0.5} />
              <stop offset="30%" stopColor="transparent" />
              <stop offset="50%" stopColor={shade} stopOpacity={shadowStrength * 0.2} />
              <stop offset="70%" stopColor="transparent" />
              <stop offset="85%" stopColor={shade} stopOpacity={shadowStrength * 0.5} />
              <stop offset="100%" stopColor={deepShade} stopOpacity={shadowStrength} />
            </linearGradient>
            <radialGradient id="tshirt-light" cx="50%" cy="40%" r="70%">
               <stop offset="0%" stopColor="#ffffff" stopOpacity={shadowStrength * 0.3} />
               <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          
          <g style={{ filter: `drop-shadow(0 20px 30px rgba(0,0,0,${shadowStrength * 0.4}))` }}>
            {/* Base Color */}
            <path d="M 220,100 C 300,-10 500,-10 580,100 C 620,100 750,200 780,250 L 720,400 L 620,320 L 620,950 L 180,950 L 180,320 L 80,400 L 20,250 C 50,200 180,100 220,100 Z" fill={surfaceColor} />
            
            {/* Texture */}
            <path d="M 220,100 C 300,-10 500,-10 580,100 C 620,100 750,200 780,250 L 720,400 L 620,320 L 620,950 L 180,950 L 180,320 L 80,400 L 20,250 C 50,200 180,100 220,100 Z" fill="transparent" style={{ filter: `url(#fabric-texture)`, opacity: textureStrength }} pointerEvents="none" />
            
            {/* Artwork bounded by clip-path */}
            <g clipPath={`url(#${clipPathId})`}>
               <ArtworkLayer x="250" y="250" width="300" height="500" artboard={artboard} objects={objects} state={previewState} />
            </g>
            
            {/* Folds and Highlights */}
            <path d="M 220,100 C 300,-10 500,-10 580,100 C 620,100 750,200 780,250 L 720,400 L 620,320 L 620,950 L 180,950 L 180,320 L 80,400 L 20,250 C 50,200 180,100 220,100 Z" fill="url(#tshirt-folds)" pointerEvents="none" />
            <path d="M 220,100 C 300,-10 500,-10 580,100 C 620,100 750,200 780,250 L 720,400 L 620,320 L 620,950 L 180,950 L 180,320 L 80,400 L 20,250 C 50,200 180,100 220,100 Z" fill="url(#tshirt-light)" pointerEvents="none" />
            
            {/* Pocket */}
            <path d="M 250,700 C 250,700 400,650 550,700 L 580,850 C 450,900 350,900 220,850 Z" fill="none" stroke={deepShade} strokeWidth="4" opacity={shadowStrength * 0.7} pointerEvents="none" />
            
            {/* Collar line / Hood */}
            <path d="M 300,100 C 350,150 450,150 500,100" fill="none" stroke={deepShade} strokeWidth="6" opacity={shadowStrength} pointerEvents="none" />
            
            {/* Drawstrings */}
            <path d="M 360,140 Q 350,250 350,300 M 440,140 Q 450,250 450,300" fill="none" stroke="#fff" strokeWidth="8" filter={`drop-shadow(2px 5px 3px rgba(0,0,0,0.5))`}/>
            <path d="M 360,140 Q 350,250 350,300 M 440,140 Q 450,250 450,300" fill="none" stroke="#e0e0e0" strokeWidth="6" />

            {/* Seams */}
            <path d="M 220,100 L 180,320 M 580,100 L 620,320" fill="none" stroke={deepShade} strokeWidth="3" opacity={shadowStrength * 0.5} pointerEvents="none" strokeDasharray="5,5" />
          </g>
        </svg>
      );
    } else if (scene === 'accessories' && preset === 'tote-bag') {
      sceneSvg = (
        <svg viewBox="0 0 800 1000" className="w-full h-full max-w-2xl max-h-[80vh] mx-auto filter drop-shadow-2xl">
          <defs>
            <clipPath id={clipPathId}>
               <rect x="200" y="300" width="400" height="500" rx="10" />
            </clipPath>
            <filter id="canvas-texture" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" result="noise" />
              <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.1 0" in="noise" result="coloredNoise" />
              <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" />
            </filter>
             <linearGradient id="tote-folds" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={deepShade} stopOpacity={shadowStrength * 0.8} />
              <stop offset="5%" stopColor="transparent" />
              <stop offset="95%" stopColor="transparent" />
              <stop offset="100%" stopColor={deepShade} stopOpacity={shadowStrength * 0.8} />
            </linearGradient>
          </defs>
          
          <g style={{ filter: `drop-shadow(0 20px 30px rgba(0,0,0,${shadowStrength * 0.4}))` }}>
            {/* Straps */}
            <path d="M 280,300 C 280,50 350,50 350,300" fill="none" stroke={surfaceColor} strokeWidth="20" style={{ filter: `url(#canvas-texture)`, opacity: Math.max(0.5, textureStrength) }} />
            <path d="M 450,300 C 450,50 520,50 520,300" fill="none" stroke={surfaceColor} strokeWidth="20" style={{ filter: `url(#canvas-texture)`, opacity: Math.max(0.5, textureStrength) }} />
            
            {/* Base */}
            <rect x="200" y="300" width="400" height="500" rx="10" fill={surfaceColor} />
            <rect x="200" y="300" width="400" height="500" rx="10" fill="transparent" style={{ filter: `url(#canvas-texture)`, opacity: textureStrength }} pointerEvents="none" />
            
            <g clipPath={`url(#${clipPathId})`}>
               <ArtworkLayer x="250" y="350" width="300" height="400" artboard={artboard} objects={objects} state={previewState} />
            </g>
            
            <rect x="200" y="300" width="400" height="500" rx="10" fill="url(#tote-folds)" pointerEvents="none" />
            
            {/* Seams */}
            <rect x="205" y="305" width="390" height="490" rx="5" fill="none" stroke={deepShade} strokeWidth="2" strokeDasharray="4,4" opacity={shadowStrength * 0.5} pointerEvents="none" />
          </g>
        </svg>
      );
    } else if (scene === 'accessories' && preset === 'mug') {
      sceneSvg = (
        <svg viewBox="0 0 800 800" className="w-full h-full max-w-2xl max-h-[80vh] mx-auto filter drop-shadow-2xl">
          <defs>
            <clipPath id={clipPathId}>
               <path d="M 250,200 C 250,200 400,250 550,200 L 550,600 C 550,600 400,650 250,600 Z" />
            </clipPath>
             <linearGradient id="mug-shading" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={deepShade} stopOpacity={shadowStrength} />
              <stop offset="15%" stopColor="transparent" />
              <stop offset="70%" stopColor="transparent" />
              <stop offset="85%" stopColor="#ffffff" stopOpacity={shadowStrength * 0.6} />
              <stop offset="100%" stopColor={deepShade} stopOpacity={shadowStrength} />
            </linearGradient>
            <filter id="ceramic-texture" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" result="noise" />
              <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.05 0" in="noise" result="coloredNoise" />
              <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" />
            </filter>
          </defs>
          
          <g style={{ filter: `drop-shadow(0 20px 30px rgba(0,0,0,${shadowStrength * 0.4}))` }}>
            {/* Handle */}
            <path d="M 540,250 C 700,250 700,500 540,500" fill="none" stroke={surfaceColor} strokeWidth="40" strokeLinecap="round" />
            <path d="M 540,250 C 700,250 700,500 540,500" fill="none" stroke={deepShade} strokeWidth="40" strokeLinecap="round" opacity={shadowStrength * 0.4} />
            <path d="M 540,250 C 700,250 700,500 540,500" fill="none" stroke="#ffffff" strokeWidth="40" strokeLinecap="round" opacity={shadowStrength * 0.2} strokeDasharray="10, 200" strokeDashoffset="10" />
            
            {/* Body */}
            <path d="M 250,200 C 250,200 400,250 550,200 L 550,600 C 550,600 400,650 250,600 Z" fill={surfaceColor} style={{ filter: `url(#ceramic-texture)`, opacity: Math.max(0.5, textureStrength) }} />
            
            {/* Inner rim */}
            <ellipse cx="400" cy="200" rx="150" ry="30" fill="#e0e0e0" />
            <ellipse cx="400" cy="202" rx="140" ry="25" fill="#cfcfcf" />

            <g clipPath={`url(#${clipPathId})`}>
               {/* 
                  Applying a scale/rotate/warp to simulate cylinder mapping could be done with complex SVG filters or clip paths.
                  We'll just map it directly into the clip path.
               */}
               <ArtworkLayer x="250" y="250" width="300" height="350" artboard={artboard} objects={objects} state={previewState} />
            </g>
            
            {/* Shading */}
            <path d="M 250,200 C 250,200 400,250 550,200 L 550,600 C 550,600 400,650 250,600 Z" fill="url(#mug-shading)" pointerEvents="none" />
          </g>
        </svg>
      );
    } else if (scene === 'packaging' && preset === 'box') {
      sceneSvg = (
         <svg viewBox="0 0 1000 800" className="w-full h-full max-w-3xl max-h-[80vh] mx-auto filter drop-shadow-2xl">
            <defs>
               <clipPath id={clipPathId}>
                  <polygon points="300,200 700,300 700,600 300,500" />
               </clipPath>
               <filter id="cardboard-texture" x="0" y="0" width="100%" height="100%">
                 <feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="2" result="noise" />
                 <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.05 0" in="noise" result="coloredNoise" />
                 <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" />
               </filter>
            </defs>

            {/* Left face */}
            <polygon points="100,300 300,200 300,500 100,600" fill={surfaceColor} style={{ filter: `url(#cardboard-texture)`, opacity: Math.max(0.5, textureStrength) }} />
            <polygon points="100,300 300,200 300,500 100,600" fill="black" opacity={shadowStrength * 0.4} pointerEvents="none" />
            
            {/* Top face */}
            <polygon points="300,200 500,100 700,300 500,400" fill={surfaceColor} style={{ filter: `url(#cardboard-texture)`, opacity: Math.max(0.5, textureStrength) }} />
            <polygon points="300,200 500,100 700,300 500,400" fill="white" opacity={shadowStrength * 0.2} pointerEvents="none" />
            
            {/* Front face (artwork face) */}
            <polygon points="300,200 700,300 700,600 300,500" fill={surfaceColor} style={{ filter: `url(#cardboard-texture)`, opacity: Math.max(0.5, textureStrength) }} />
            
            <g clipPath={`url(#${clipPathId})`}>
               {/* 
                  Applying a skew/rotate to simulate perspective on the front face. 
                  We'll use foreignObject positioned over the face.
               */}
               <g transform="matrix(1, 0.25, 0, 1, 0, -75)">
                  <ArtworkLayer x="300" y="200" width="400" height="300" artboard={artboard} objects={objects} state={previewState} />
               </g>
            </g>

            {/* Creases / Shadows */}
            <line x1="300" y1="200" x2="300" y2="500" stroke="black" strokeWidth="2" opacity={shadowStrength * 0.5} />
            <line x1="300" y1="200" x2="700" y2="300" stroke="white" strokeWidth="2" opacity={shadowStrength * 0.3} />
         </svg>
      );
    } else if (scene === 'packaging' && preset === 'mailer') {
      sceneSvg = (
         <svg viewBox="0 0 800 1000" className="w-full h-full max-w-2xl max-h-[80vh] mx-auto filter drop-shadow-2xl">
            <defs>
               <clipPath id={clipPathId}>
                  <rect x="200" y="200" width="400" height="600" rx="20" />
               </clipPath>
               <filter id="poly-texture" x="0" y="0" width="100%" height="100%">
                 <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise" />
                 <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.1 0" in="noise" result="coloredNoise" />
                 <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" />
               </filter>
               <linearGradient id="mailer-folds" x1="0" y1="0" x2="1" y2="1">
                 <stop offset="0%" stopColor="#ffffff" stopOpacity={shadowStrength * 0.5} />
                 <stop offset="30%" stopColor="transparent" />
                 <stop offset="70%" stopColor={deepShade} stopOpacity={shadowStrength * 0.2} />
                 <stop offset="100%" stopColor={deepShade} stopOpacity={shadowStrength * 0.7} />
               </linearGradient>
            </defs>

            <g style={{ filter: `drop-shadow(0 10px 20px rgba(0,0,0,${shadowStrength * 0.3}))` }}>
               <rect x="200" y="200" width="400" height="600" rx="20" fill={surfaceColor} />
               <rect x="200" y="200" width="400" height="600" rx="20" fill="transparent" style={{ filter: `url(#poly-texture)`, opacity: textureStrength }} pointerEvents="none" />
               
               {/* Flap */}
               <path d="M 200,300 C 400,350 600,300 600,300 L 600,200 C 600,180 580,180 580,180 L 220,180 C 200,180 200,200 200,200 Z" fill={surfaceColor} filter="brightness(0.95)" />
               <path d="M 200,300 C 400,350 600,300 600,300 L 600,200 C 600,180 580,180 580,180 L 220,180 C 200,180 200,200 200,200 Z" fill="transparent" style={{ filter: `url(#poly-texture)`, opacity: textureStrength }} pointerEvents="none" />
               
               {/* Flap shadow */}
               <path d="M 200,300 C 400,350 600,300 600,300" fill="none" stroke={deepShade} strokeWidth="6" opacity={shadowStrength * 0.6} style={{ filter: 'blur(3px)' }} pointerEvents="none" />

               <g clipPath={`url(#${clipPathId})`}>
                  <ArtworkLayer x="250" y="350" width="300" height="400" artboard={artboard} objects={objects} state={previewState} />
               </g>

               {/* Overlays for plastic sheen */}
               <rect x="200" y="200" width="400" height="600" rx="20" fill="url(#mailer-folds)" pointerEvents="none" />
               
               {/* Wrinkles */}
               <path d="M 220,400 Q 300,420 350,380 M 550,700 Q 450,750 400,680" fill="none" stroke="#fff" strokeWidth="4" opacity={shadowStrength * 0.4} style={{ filter: 'blur(2px)' }} pointerEvents="none" />
            </g>
         </svg>
      );
    } else if (scene === 'stickers' && preset === 'die-cut') {
      // For die-cut sticker, we draw an offset path or a simple blob
      sceneSvg = (
         <svg viewBox="0 0 800 800" className="w-full h-full max-w-xl max-h-[80vh] mx-auto filter drop-shadow-2xl">
            <defs>
               <clipPath id={clipPathId}>
                  <path d="M 200,400 C 200,200 600,200 600,400 C 600,600 200,600 200,400 Z" />
               </clipPath>
               <filter id="glossy-finish">
                  <feSpecularLighting result="specOut" specularExponent="20" lightingColor="#fff">
                     <fePointLight x="200" y="200" z="200" />
                  </feSpecularLighting>
                  <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
               </filter>
               <filter id="holographic-finish">
                 <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" result="noise" />
                 <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 2 0 0  0 0 0 1 0" in="noise" result="coloredNoise" />
                 <feBlend in="SourceGraphic" in2="coloredNoise" mode="color-dodge" />
               </filter>
            </defs>

            <g style={{ filter: `drop-shadow(0 5px 15px rgba(0,0,0,${shadowStrength * 0.6}))` }}>
               {/* Sticker Base */}
               <path d="M 180,400 C 180,180 620,180 620,400 C 620,620 180,620 180,400 Z" fill="white" />
               <path d="M 200,400 C 200,200 600,200 600,400 C 600,600 200,600 200,400 Z" fill={surfaceColor} />
               
               <g clipPath={`url(#${clipPathId})`}>
                  <ArtworkLayer x="200" y="200" width="400" height="400" artboard={artboard} objects={objects} state={previewState} />
               </g>

               {/* Print Finish Overlay */}
               {previewState.printFinish === 'glossy' && (
                  <path d="M 200,400 C 200,200 600,200 600,400 C 600,600 200,600 200,400 Z" fill="transparent" style={{ filter: 'url(#glossy-finish)' }} pointerEvents="none" opacity={textureStrength} />
               )}
               {previewState.printFinish === 'metallic' && (
                  <path d="M 200,400 C 200,200 600,200 600,400 C 600,600 200,600 200,400 Z" fill="transparent" style={{ filter: 'url(#holographic-finish)' }} pointerEvents="none" opacity={textureStrength * 0.5} />
               )}
               {/* Shine */}
               <path d="M 220,300 C 300,220 500,220 580,300" fill="none" stroke="white" strokeWidth="15" opacity={shadowStrength * 0.5} style={{ filter: 'blur(10px)' }} pointerEvents="none" />
            </g>
         </svg>
      );
    } else if (scene === 'stickers' && preset === 'bumper') {
      sceneSvg = (
         <svg viewBox="0 0 1000 600" className="w-full h-full max-w-4xl max-h-[60vh] mx-auto filter drop-shadow-2xl">
            <defs>
               <clipPath id={clipPathId}>
                  <rect x="150" y="200" width="700" height="200" rx="15" />
               </clipPath>
               <filter id="glossy-finish">
                  <feSpecularLighting result="specOut" specularExponent="20" lightingColor="#fff">
                     <fePointLight x="200" y="200" z="200" />
                  </feSpecularLighting>
                  <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
               </filter>
               <filter id="holographic-finish">
                 <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" result="noise" />
                 <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 2 0 0  0 0 0 1 0" in="noise" result="coloredNoise" />
                 <feBlend in="SourceGraphic" in2="coloredNoise" mode="color-dodge" />
               </filter>
            </defs>

            <g style={{ filter: `drop-shadow(0 5px 15px rgba(0,0,0,${shadowStrength * 0.6}))` }}>
               {/* Sticker Backing Peeking Out */}
               <rect x="145" y="195" width="710" height="210" rx="18" fill="white" />
               <rect x="150" y="200" width="700" height="200" rx="15" fill={surfaceColor} />
               
               <g clipPath={`url(#${clipPathId})`}>
                  <ArtworkLayer x="150" y="200" width="700" height="200" artboard={artboard} objects={objects} state={previewState} />
               </g>

               {/* Print Finish Overlay */}
               {previewState.printFinish === 'glossy' && (
                  <rect x="150" y="200" width="700" height="200" rx="15" fill="transparent" style={{ filter: 'url(#glossy-finish)' }} pointerEvents="none" opacity={textureStrength} />
               )}
               {previewState.printFinish === 'metallic' && (
                  <rect x="150" y="200" width="700" height="200" rx="15" fill="transparent" style={{ filter: 'url(#holographic-finish)' }} pointerEvents="none" opacity={textureStrength * 0.5} />
               )}
               {/* Shine */}
               <path d="M 150,250 C 400,180 850,250 850,250" fill="none" stroke="white" strokeWidth="15" opacity={shadowStrength * 0.4} style={{ filter: 'blur(8px)' }} pointerEvents="none" />
            </g>
         </svg>
      );
    } else {
      // Generic fallback for others
      sceneSvg = (
         <svg viewBox="0 0 800 800" className="w-full h-full max-w-2xl max-h-[80vh] mx-auto filter drop-shadow-2xl">
            <rect x="200" y="200" width="400" height="400" rx="20" fill={surfaceColor} />
            <ArtworkLayer x="200" y="200" width="400" height="400" artboard={artboard} objects={objects} state={previewState} />
         </svg>
      );
    }

    return sceneSvg;
  };

  return (
    <div 
      className="absolute inset-0 bg-background/50 overflow-hidden flex items-center justify-center cursor-move"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      ref={containerRef}
    >
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
      
      {/* Scene Render */}
      <div className="relative z-10 w-full h-full flex items-center justify-center p-12 transition-transform duration-300">
         {renderScene()}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-card/80 backdrop-blur border border-white/10 rounded-full text-xs text-muted-foreground shadow-lg flex items-center gap-2 pointer-events-none">
         <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
         Live Preview — Drag to position artwork
      </div>
    </div>
  );
}
