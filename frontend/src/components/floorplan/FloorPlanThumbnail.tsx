import { Fragment, memo, useEffect, useRef, useState } from 'react';
import { Circle, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { FloorPlan, FloorPlanObject, RectangleObject } from '@/types/floorplan';
import { polygonBounds } from '@/utils/floorplanGrid';

interface Props {
  readonly plan: FloorPlan;
  readonly width?: number;
  readonly height?: number;
  readonly highlightLocationId?: string;
  readonly onVisible?: () => void;
}

const RECT_FILL: Record<string, string> = {
  room: '#e5e7eb',
  rack: '#fef3c7',
  shelf: '#dbeafe',
};

const CSS_GRID_BG: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)',
  backgroundSize: '12px 12px',
  backgroundPosition: '-0.5px -0.5px',
  backgroundColor: '#f8fafc',
};

function getServiceRoomKind(label?: string): 'stairs' | 'elevator' | 'bathroom' | null {
  const normalized = label?.toLowerCase() ?? '';
  if (normalized.startsWith('stairs')) return 'stairs';
  if (normalized.startsWith('elevator')) return 'elevator';
  if (normalized.includes('bathroom') || normalized.includes('restroom')) return 'bathroom';
  return null;
}

function getBounds(objects: FloorPlanObject[], plan: FloorPlan) {
  if (!objects.length) return { minX: 0, minY: 0, maxX: plan.width, maxY: plan.height };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const obj of objects) {
    if (obj.type === 'wall') {
      minX = Math.min(minX, obj.startX, obj.endX);
      minY = Math.min(minY, obj.startY, obj.endY);
      maxX = Math.max(maxX, obj.startX, obj.endX);
      maxY = Math.max(maxY, obj.startY, obj.endY);
    } else if (obj.type === 'room') {
      const b = polygonBounds(obj.points);
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
    } else if (obj.type === 'rack' || obj.type === 'shelf') {
      minX = Math.min(minX, obj.x); minY = Math.min(minY, obj.y);
      maxX = Math.max(maxX, obj.x + obj.width); maxY = Math.max(maxY, obj.y + obj.height);
    } else if ((obj as { type: string }).type === 'stairs' || (obj as { type: string }).type === 'elevator' || (obj as { type: string }).type === 'bathroom') {
      const r = obj as unknown as RectangleObject;
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
    } else if (obj.type === 'label') {
      minX = Math.min(minX, obj.x);
      minY = Math.min(minY, obj.y);
      maxX = Math.max(maxX, obj.x + 160);
      maxY = Math.max(maxY, obj.y + 24);
    }
  }

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: plan.width, maxY: plan.height };
  return { minX, minY, maxX, maxY };
}

function renderRoom(
  obj: Extract<FloorPlanObject, { type: 'rack' | 'shelf' | 'stairs' | 'elevator' }>,
  x: number, y: number, w: number, h: number,
  isHighlighted: boolean,
  scale: number,
) {
  const label = obj.label ?? '';
  const kind = getServiceRoomKind(label);
  return (
    <Fragment key={obj.id}>
      <Rect
        x={x} y={y} width={w} height={h}
        fill={isHighlighted ? '#dbeafe' : (obj.color ?? RECT_FILL[obj.type])}
        opacity={isHighlighted ? 0.9 : 0.65}
        stroke={isHighlighted ? '#2563eb' : (obj.color ?? '#64748b')}
        strokeWidth={isHighlighted ? 1.5 : 0.8}
      />
      {kind === 'stairs' && [0, 1, 2, 3].map((i) => (
        <Line key={`stair-${obj.id}-${i}`} points={[x + w * 0.2, y + h * (i + 1) / 6, x + w * 0.8, y + h * (i + 1) / 6]} stroke="#b45309" strokeWidth={Math.max(0.8, scale * 2)} />
      ))}
      {kind === 'elevator' && (
        <Rect x={x + w * 0.25} y={y + h * 0.18} width={w * 0.5} height={h * 0.5} stroke="#7e22ce" strokeWidth={Math.max(0.8, scale * 2)} />
      )}
      {kind === 'bathroom' && (
        <Circle x={x + w / 2} y={y + h * 0.34} radius={Math.min(w, h) * 0.12} stroke="#0369a1" strokeWidth={Math.max(0.8, scale * 2)} />
      )}
      {w > 24 && h > 14 && label && (
        <Text
          x={x + 3} y={y + h / 2 - 5}
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

function renderWall(
  obj: Extract<FloorPlanObject, { type: 'wall' }>,
  isHighlighted: boolean,
  scale: number,
  tx: (v: number) => number,
  ty: (v: number) => number,
) {
  return (
    <Line
      key={obj.id}
      points={[tx(obj.startX), ty(obj.startY), tx(obj.endX), ty(obj.endY)]}
      stroke={isHighlighted ? '#2563eb' : (obj.color ?? '#1e293b')}
      strokeWidth={Math.max(1, obj.thickness * scale)}
      lineCap="round"
    />
  );
}

function renderPolygonRoom(
  obj: Extract<FloorPlanObject, { type: 'room' }>,
  isHighlighted: boolean,
  tx: (v: number) => number,
  ty: (v: number) => number,
) {
  const pts = obj.points;
  if (!Array.isArray(pts) || pts.length < 6) return null;
  const scaledPts: number[] = [];
  for (let i = 0; i < pts.length; i += 2) scaledPts.push(tx(pts[i]), ty(pts[i + 1]));
  return (
    <Line key={obj.id} points={scaledPts} closed
      fill={isHighlighted ? '#dbeafe' : (obj.color ?? '#e0e0e0')}
      opacity={isHighlighted ? 0.9 : 0.65}
      stroke={isHighlighted ? '#2563eb' : '#64748b'}
      strokeWidth={isHighlighted ? 1.5 : 0.8}
    />
  );
}

function renderOpening(
  obj: Extract<FloorPlanObject, { type: 'door' | 'entrance' | 'window' }>,
  scale: number,
  tx: (v: number) => number,
  ty: (v: number) => number,
) {
  const shape = obj as { x: number; y: number; width: number; angle?: number };
  if (!Number.isFinite(shape.x) || !Number.isFinite(shape.y) || !Number.isFinite(shape.width)) return null;
  return (
    <Line
      key={obj.id}
      points={[tx(shape.x - shape.width / 2), ty(shape.y), tx(shape.x + shape.width / 2), ty(shape.y)]}
      stroke={obj.type === 'window' ? '#38bdf8' : '#16a34a'}
      strokeWidth={Math.max(2, 4 * scale)}
      rotation={(shape.angle ?? 0) * (180 / Math.PI)}
      x={tx(shape.x)} y={ty(shape.y)}
      offsetX={tx(shape.x)} offsetY={ty(shape.y)}
    />
  );
}

function renderObject(
  obj: FloorPlanObject,
  isHighlighted: boolean,
  scale: number,
  tx: (v: number) => number,
  ty: (v: number) => number,
) {
  if (obj.type === 'wall') return renderWall(obj, isHighlighted, scale, tx, ty);
  if (obj.type === 'room') return renderPolygonRoom(obj, isHighlighted, tx, ty);

  if (obj.type === 'rack' || obj.type === 'shelf' || obj.type === 'stairs' || obj.type === 'elevator') {
    return renderRoom(obj, tx(obj.x), ty(obj.y), obj.width * scale, obj.height * scale, isHighlighted, scale);
  }

  const objType = (obj as { type: string }).type;
  if (objType === 'bathroom') {
    const r = obj as unknown as RectangleObject;
    return renderRoom(r, tx(r.x), ty(r.y), r.width * scale, r.height * scale, isHighlighted, scale);
  }

  if (obj.type === 'door' || obj.type === 'entrance' || obj.type === 'window') {
    return renderOpening(obj, scale, tx, ty);
  }

  if (obj.type === 'label') {
    return (
      <Text
        key={obj.id}
        x={tx(obj.x)} y={ty(obj.y)}
        text={(obj.text || obj.label || '').slice(0, 28)}
        fontSize={Math.max(7, obj.fontSize * scale)}
        fill={obj.color ?? '#475569'}
      />
    );
  }

  return null;
}

function FloorPlanThumbnailBase({ plan, width = 200, height = 200, highlightLocationId, onVisible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShowCanvas(true);
          if (!plan.objects) onVisibleRef.current?.();
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const objects = plan.objects ?? [];
  const bounds = getBounds(objects, plan);
  const padding = 12;
  const contentW = bounds.maxX - bounds.minX || plan.width;
  const contentH = bounds.maxY - bounds.minY || plan.height;
  const scale = Math.min((width - padding * 2) / contentW, (height - padding * 2) / contentH, 1);
  const offsetX = padding - bounds.minX * scale + ((width - padding * 2) - contentW * scale) / 2;
  const offsetY = padding - bounds.minY * scale + ((height - padding * 2) - contentH * scale) / 2;
  const tx = (v: number) => v * scale + offsetX;
  const ty = (v: number) => v * scale + offsetY;

  let thumbnailContent: React.ReactNode = null;
  if (showCanvas) {
    if (plan.objects) {
      thumbnailContent = (
        <Stage width={width} height={height} className="w-full h-full" listening={false}>
          <Layer listening={false}>
            {objects.length === 0 ? (
              <Text x={0} y={height / 2 - 8} width={width} text="Empty floor plan" align="center" fontSize={11} fill="#cbd5e1" />
            ) : (
              objects.map((obj) => renderObject(obj, !!highlightLocationId && obj.linkedLocationId === highlightLocationId, scale, tx, ty))
            )}
            <Rect x={width - 48} y={height - 21} width={44} height={17} fill="rgba(15,23,42,0.55)" cornerRadius={3} />
            <Text x={width - 48} y={height - 17} width={44} text={`${objects.length} objects`} align="center" fontSize={9} fill="#ffffff" />
          </Layer>
        </Stage>
      );
    } else {
      thumbnailContent = (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
        </div>
      );
    }
  }

  return (
    <div ref={containerRef} className="w-full h-full rounded-t-lg overflow-hidden relative" style={CSS_GRID_BG}>
      {thumbnailContent}
    </div>
  );
}

export default memo(FloorPlanThumbnailBase);
