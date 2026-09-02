import { SVGProps } from 'react';
import { VectorObject } from '../../lib/types';

interface ShapeRendererProps extends SVGProps<SVGGElement> {
  object: VectorObject;
}

export function ShapeRenderer({ object, ...props }: ShapeRendererProps) {
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
    case 'text':
      return (
        <g {...props}>
          <text
            x={object.x}
            y={object.y + (object.fontSize || 16)}
            fontSize={object.fontSize || 16}
            fontFamily={object.fontFamily || 'Inter'}
            fill={object.fill}
            opacity={object.opacity}
            transform={`rotate(${object.rotation} ${object.x + object.width / 2} ${object.y + object.height / 2})`}
            pointerEvents="visiblePainted"
            style={{ userSelect: 'none' }}
          >
            {object.text || 'Text'}
          </text>
        </g>
      );
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
      // Draw a diamond that fills the bounding box
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
      // 5 point star inside bounding box
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
    default:
      return null;
  }
}
