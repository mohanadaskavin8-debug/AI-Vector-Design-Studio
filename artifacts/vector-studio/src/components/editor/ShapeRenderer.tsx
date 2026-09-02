import React, { SVGProps } from 'react';
import { VectorObject } from '../../lib/types';
import { nodesToSVGPath } from '../../lib/pathUtils';
import { resolvePrivateObjectUrl } from '../../cloud/assets';

interface ShapeRendererProps extends SVGProps<SVGGElement> {
  object: VectorObject;
  objects?: VectorObject[];
}

function ShapeRendererComponent({ object, objects = [], ...props }: ShapeRendererProps) {
  if (!object.visible) return null;

  const commonProps = {
    fill: object.fill,
    stroke: object.stroke,
    strokeWidth: object.strokeWidth,
    opacity: object.opacity,
    transform: `rotate(${object.rotation} ${object.x + object.width / 2} ${object.y + object.height / 2})`,
    pointerEvents: 'visiblePainted' as const,
  };

  switch (object.type) {
    case 'rect':
      return (
        <g {...props}>
          <rect
            x={object.x}
            y={object.y}
            width={Math.max(0.1, object.width)}
            height={Math.max(0.1, object.height)}
            rx={object.rx || 0}
            {...commonProps}
          />
        </g>
      );
    case 'ellipse':
      return (
        <g {...props}>
          <ellipse
            cx={object.x + object.width / 2}
            cy={object.y + object.height / 2}
            rx={Math.max(0.1, object.width / 2)}
            ry={Math.max(0.1, object.height / 2)}
            {...commonProps}
          />
        </g>
      );
    case 'text': {
      const lines = (object.text || 'Text').split('\n');
      const textX = object.textAlign === 'center'
        ? object.x + object.width / 2
        : object.textAlign === 'right'
          ? object.x + object.width
          : object.x;
      let textContent = (
        <text
          x={textX}
          y={object.y + (object.fontSize || 16)}
          fontSize={object.fontSize || 16}
          fontFamily={object.fontFamily || 'Inter'}
          fontWeight={object.fontWeight || 'normal'}
          letterSpacing={object.letterSpacing || 0}
          textAnchor={object.textAlign === 'center' ? 'middle' : object.textAlign === 'right' ? 'end' : 'start'}
          fill={object.fill}
          opacity={object.opacity}
          pointerEvents="visiblePainted"
          style={{ userSelect: 'none' }}
        >
          {lines.map((line, index) => (
            <tspan key={index} x={textX} dy={index === 0 ? 0 : `${object.lineHeight || 1.2}em`}>{line || ' '}</tspan>
          ))}
        </text>
      );

      if (object.textPathId) {
        const pathObj = objects.find(o => o.id === object.textPathId);
        if (pathObj) {
          const pathData = pathObj.points || (pathObj.nodes ? nodesToSVGPath(pathObj.nodes, pathObj.closed) : '');
          if (pathData) {
          textContent = (
            <>
              <defs>
                <path id={`path-${object.id}`} d={pathData} />
              </defs>
              <text
                fontSize={object.fontSize || 16}
                fontFamily={object.fontFamily || 'Inter'}
                fontWeight={object.fontWeight || 'normal'}
                letterSpacing={object.letterSpacing || 0}
                fill={object.fill}
                opacity={object.opacity}
                pointerEvents="visiblePainted"
                style={{ userSelect: 'none' }}
              >
                <textPath href={`#path-${object.id}`} startOffset={object.textAlign === 'center' ? '50%' : object.textAlign === 'right' ? '100%' : '0%'} textAnchor={object.textAlign === 'center' ? 'middle' : object.textAlign === 'right' ? 'end' : 'start'}>
                  {object.text || 'Text'}
                </textPath>
              </text>
            </>
          );
          }
        }
      }

      return (
        <g {...props} transform={`rotate(${object.rotation} ${object.x + object.width / 2} ${object.y + object.height / 2})`}>
          {textContent}
        </g>
      );
    }
    case 'line':
      return (
        <g {...props}>
          <line
            x1={object.x}
            y1={object.y}
            x2={object.x + object.width}
            y2={object.y + object.height}
            stroke={object.stroke === 'none' ? '#000' : object.stroke}
            strokeWidth={object.strokeWidth || 2}
            opacity={object.opacity}
            transform={`rotate(${object.rotation} ${object.x + object.width / 2} ${object.y + object.height / 2})`}
            pointerEvents="visiblePainted"
          />
        </g>
      );
    case 'polygon': {
      const cx = object.x + object.width / 2;
      const cy = object.y + object.height / 2;
      const points = object.points || `${cx},${object.y} ${object.x + object.width},${cy} ${cx},${object.y + object.height} ${object.x},${cy}`;
      
      return (
        <g {...props}>
          <polygon
            points={points}
            {...commonProps}
          />
        </g>
      );
    }
    case 'star': {
      const cx = object.x + object.width / 2;
      const cy = object.y + object.height / 2;
      const outerRadius = Math.min(object.width, object.height) / 2;
      const innerRadius = outerRadius * 0.382;
      let points = '';
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (Math.PI * 2 * i) / 10 - Math.PI / 2;
        const px = cx + radius * Math.cos(angle);
        const py = cy + radius * Math.sin(angle);
        points += `${px},${py} `;
      }

      return (
        <g {...props}>
          <polygon
            points={points.trim()}
            {...commonProps}
          />
        </g>
      );
    }
    case 'path': {
      let d = object.points || '';
      if (!d && object.nodes && object.nodes.length > 0) {
         d = nodesToSVGPath(object.nodes, object.closed);
      }
      return (
        <g {...props}>
          <path
            d={d}
            fillRule="evenodd"
            {...commonProps}
          />
        </g>
      );
    }
    case 'image': {
      return (
        <g {...props}>
          <image
            x={object.x}
            y={object.y}
            width={Math.max(0.1, object.width)}
            height={Math.max(0.1, object.height)}
            href={resolvePrivateObjectUrl(object.imageSrc)}
            preserveAspectRatio="none"
            {...commonProps}
          />
        </g>
      );
    }
    default:
      return null;
  }
}

export const ShapeRenderer = React.memo(ShapeRendererComponent);
