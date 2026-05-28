import { Fragment } from 'react';
import { Layer, Line, Rect, Stage, Text } from 'react-konva';
import { FloorPlan, FloorPlanObject, LabelObject, RectangleObject, WallObject } from '@/types/floorplan';

interface Props {
  plan: FloorPlan;
  width?: number;
  height?: number;
  highlightLocationId?: string;
}

const RECT_FILL: Record<string, string> = {
  room: '#e5e7eb',
  rack: '#fef3c7',
  shelf: '#dbeafe',
};

function getBounds(objects: FloorPlanObject[], plan: FloorPlan) {
  if (!objects.length) return { minX: 0, minY: 0, maxX: plan.width, maxY: plan.height };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  objects.forEach((obj) => {
    if (obj.type === 'wall') {
      const wall = obj as WallObject;
      minX = Math.min(minX, wall.startX, wall.endX);
      minY = Math.min(minY, wall.startY, wall.endY);
      maxX = Math.max(maxX, wall.startX, wall.endX);
      maxY = Math.max(maxY, wall.startY, wall.endY);
      return;
    }

    if (obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf') {
      const rect = obj as RectangleObject;
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
      return;
    }

    if (obj.type === 'label') {
      const label = obj as LabelObject;
      minX = Math.min(minX, label.x);
      minY = Math.min(minY, label.y);
      maxX = Math.max(maxX, label.x + 160);
      maxY = Math.max(maxY, label.y + 24);
    }
  });

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: plan.width, maxY: plan.height };
  return { minX, minY, maxX, maxY };
}

export default function FloorPlanThumbnail({ plan, width = 280, height = 160, highlightLocationId }: Props) {
  const objects = plan.objects || [];
  const bounds = getBounds(objects, plan);
  const padding = 12;
  const contentW = bounds.maxX - bounds.minX || plan.width;
  const contentH = bounds.maxY - bounds.minY || plan.height;
  const scale = Math.min((width - padding * 2) / contentW, (height - padding * 2) / contentH, 1);
  const offsetX = padding - bounds.minX * scale + ((width - padding * 2) - contentW * scale) / 2;
  const offsetY = padding - bounds.minY * scale + ((height - padding * 2) - contentH * scale) / 2;
  const tx = (value: number) => value * scale + offsetX;
  const ty = (value: number) => value * scale + offsetY;

  return (
    <Stage width={width} height={height} className="w-full h-full rounded-t-lg overflow-hidden bg-slate-50">
      <Layer listening={false}>
        <Rect x={0} y={0} width={width} height={height} fill="#f8fafc" />
        {Array.from({ length: Math.ceil(width / 12) }).map((_, i) => (
          <Line key={`gx-${i}`} points={[i * 12, 0, i * 12, height]} stroke="#e2e8f0" strokeWidth={0.4} />
        ))}
        {Array.from({ length: Math.ceil(height / 12) }).map((_, i) => (
          <Line key={`gy-${i}`} points={[0, i * 12, width, i * 12]} stroke="#e2e8f0" strokeWidth={0.4} />
        ))}

        {objects.length === 0 ? (
          <Text x={0} y={height / 2 - 8} width={width} text="Empty floor plan" align="center" fontSize={11} fill="#cbd5e1" />
        ) : objects.map((obj) => {
          const isHighlighted = !!highlightLocationId && obj.linkedLocationId === highlightLocationId;

          if (obj.type === 'wall') {
            const wall = obj as WallObject;
            return (
              <Line
                key={obj.id}
                points={[tx(wall.startX), ty(wall.startY), tx(wall.endX), ty(wall.endY)]}
                stroke={isHighlighted ? '#2563eb' : (wall.color ?? '#1e293b')}
                strokeWidth={Math.max(1, wall.thickness * scale)}
                lineCap="round"
              />
            );
          }

          if (obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf') {
            const rect = obj as RectangleObject;
            const x = tx(rect.x);
            const y = ty(rect.y);
            const w = rect.width * scale;
            const h = rect.height * scale;
            const label = obj.label || '';
            return (
              <Fragment key={obj.id}>
                <Rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={isHighlighted ? '#dbeafe' : (rect.color ?? RECT_FILL[obj.type])}
                  opacity={isHighlighted ? 0.9 : 0.65}
                  stroke={isHighlighted ? '#2563eb' : (rect.color ?? '#64748b')}
                  strokeWidth={isHighlighted ? 1.5 : 0.8}
                />
                {w > 24 && h > 14 && label && (
                  <Text
                    x={x + 3}
                    y={y + h / 2 - 5}
                    width={Math.max(10, w - 6)}
                    text={label.length > 14 ? `${label.slice(0, 13)}...` : label}
                    align="center"
                    fontSize={Math.max(7, Math.min(10, h / 3))}
                    fill="#334155"
                  />
                )}
              </Fragment>
            );
          }

          if (obj.type === 'door' || obj.type === 'entrance' || obj.type === 'window') {
            const shape = obj as any;
            return (
              <Line
                key={obj.id}
                points={[tx(shape.x - shape.width / 2), ty(shape.y), tx(shape.x + shape.width / 2), ty(shape.y)]}
                stroke={obj.type === 'window' ? '#38bdf8' : '#16a34a'}
                strokeWidth={Math.max(2, 4 * scale)}
                rotation={(shape.angle || 0) * (180 / Math.PI)}
                x={tx(shape.x)}
                y={ty(shape.y)}
                offsetX={tx(shape.x)}
                offsetY={ty(shape.y)}
              />
            );
          }

          if (obj.type === 'label') {
            const label = obj as LabelObject;
            return (
              <Text
                key={obj.id}
                x={tx(label.x)}
                y={ty(label.y)}
                text={(label.text || obj.label || '').slice(0, 28)}
                fontSize={Math.max(7, label.fontSize * scale)}
                fill={label.color ?? '#475569'}
              />
            );
          }

          return null;
        })}

        <Rect x={width - 48} y={height - 21} width={44} height={17} fill="rgba(15,23,42,0.55)" cornerRadius={3} />
        <Text x={width - 48} y={height - 17} width={44} text={`${objects.length} objects`} align="center" fontSize={9} fill="#ffffff" />
      </Layer>
    </Stage>
  );
}
