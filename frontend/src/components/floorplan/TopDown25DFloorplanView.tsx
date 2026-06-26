import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { Group, Layer, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import type { FloorplanData, FloorplanElement, FloorplanLayer } from '@/types/birdsEye';
import { renderTopDown25DElement } from './renderers/topDown25D/renderElement';
import { getElementHitBox, getLayer, getTopDown25DTheme } from './renderers/topDown25D/styles';

// Order doubles as Konva z-order: each category renders as its own Layer,
// and later Layers sit on top for BOTH drawing and hit-testing. Furniture
// must render after wall/opening so it doesn't lose hover/click priority to
// a wall or door it happens to be touching/adjacent to — extremely common
// in real floor plans (furniture placed against walls).
const LAYERS: FloorplanLayer[] = ['floor', 'room', 'wall', 'opening', 'object', 'label', 'selection'];
const HOVER_HITBOX_STROKE = '#38bdf8';
const HOVER_HITBOX_FILL = 'rgba(14, 165, 233, 0.10)';

interface Props {
  readonly data: FloorplanData;
  readonly width?: number;
  readonly height?: number;
  readonly zoom?: number;
  readonly isDark?: boolean;
  readonly stageRef?: RefObject<Konva.Stage>;
  readonly onZoomDelta?: (delta: number) => void;
  readonly onSelectElement?: (element: FloorplanElement | null) => void;
}

interface LayerProps {
  readonly elements: FloorplanElement[];
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
  readonly isDark: boolean;
}

const ElementLayer = memo(function ElementLayer({
  elements,
  offsetX,
  offsetY,
  scale,
  isDark,
}: LayerProps) {
  return (
    <Layer listening={false}>
      <Group x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
        {elements.map((element) => {
          return (
            <Group
              key={element.id}
            >
              {renderTopDown25DElement(element, isDark)}
            </Group>
          );
        })}
      </Group>
    </Layer>
  );
});

const FloorLayer = memo(function FloorLayer({
  data,
  offsetX,
  offsetY,
  scale,
  isDark,
}: {
  readonly data: FloorplanData;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
  readonly isDark: boolean;
}) {
  const theme = getTopDown25DTheme(isDark);
  return (
    <Layer listening={false}>
      <Group x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
        <Rect
          x={0}
          y={0}
          width={data.width}
          height={data.height}
          fill={theme.floor}
          shadowColor={theme.shadowColor}
          shadowBlur={28}
          shadowOffsetX={10}
          shadowOffsetY={14}
          shadowOpacity={0.12}
        />
      </Group>
    </Layer>
  );
});

type Extents = { minX: number; minY: number; maxX: number; maxY: number };

function expandByPoints(ext: Extents, pts: number[]): void {
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i]     < ext.minX) ext.minX = pts[i];
    if (pts[i + 1] < ext.minY) ext.minY = pts[i + 1];
    if (pts[i]     > ext.maxX) ext.maxX = pts[i];
    if (pts[i + 1] > ext.maxY) ext.maxY = pts[i + 1];
  }
}

function expandByRect(ext: Extents, el: FloorplanElement): void {
  const x = (el as { x?: number }).x ?? 0;
  const y = (el as { y?: number }).y ?? 0;
  const w = (el as { width?: number }).width ?? 0;
  const h = (el as { height?: number }).height ?? 0;
  if (x     < ext.minX) ext.minX = x;
  if (y     < ext.minY) ext.minY = y;
  if (x + w > ext.maxX) ext.maxX = x + w;
  if (y + h > ext.maxY) ext.maxY = y + h;
}

function computeContentBounds(
  elements: FloorplanElement[],
  fallbackW: number,
  fallbackH: number,
): { x: number; y: number; w: number; h: number } {
  const ext: Extents = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const el of elements) {
    const pts = (el as { points?: number[] }).points;
    if (pts && pts.length >= 2) expandByPoints(ext, pts);
    else expandByRect(ext, el);
  }
  if (!Number.isFinite(ext.minX)) return { x: 0, y: 0, w: fallbackW, h: fallbackH };
  return { x: ext.minX, y: ext.minY, w: Math.max(1, ext.maxX - ext.minX), h: Math.max(1, ext.maxY - ext.minY) };
}

function pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const lengthSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lengthSq));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function pointInPolygon(px: number, py: number, points: number[]) {
  let inside = false;
  const count = points.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = points[i * 2], yi = points[i * 2 + 1];
    const xj = points[j * 2], yj = points[j * 2 + 1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInElementHitBox(x: number, y: number, element: FloorplanElement) {
  if (element.linePoints) {
    const [x1, y1, x2, y2] = element.linePoints;
    const strokeWidth = element.style?.strokeWidth ?? (element.type === 'outdoor_wall' ? 24 : 14);
    return pointToLineDistance(x, y, x1, y1, x2, y2) <= strokeWidth / 2 + 5;
  }

  if (element.type === 'room' && element.polygonPoints && element.polygonPoints.length >= 6) {
    return pointInPolygon(x, y, element.polygonPoints);
  }

  if (element.type === 'door' || element.type === 'window') {
    return Math.hypot(x - element.x, y - element.y) <= Math.max(20, element.width / 2 + 10);
  }

  const hitBox = getElementHitBox(element);
  const radians = -(hitBox.rotation ?? 0) * Math.PI / 180;
  const dx = x - hitBox.centerX;
  const dy = y - hitBox.centerY;
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians);
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians);
  return Math.abs(localX) <= hitBox.halfWidth && Math.abs(localY) <= hitBox.halfHeight;
}

function HitboxOverlayLayer({
  element,
  offsetX,
  offsetY,
  scale,
  variant,
  isDark,
}: {
  readonly element: FloorplanElement | null;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
  readonly variant: 'hover' | 'selected';
  readonly isDark: boolean;
}) {
  if (!element) return <Layer listening={false} />;
  const theme = getTopDown25DTheme(isDark);
  const hovered = variant === 'hover';
  // Same hit box convention as the manual hover/click scanner, including
  // doors/windows (center-anchored), wall lines, and rotated objects.
  const hitBox = getElementHitBox(element);
  const stroke = hovered ? HOVER_HITBOX_STROKE : theme.selection;
  const fill = hovered ? HOVER_HITBOX_FILL : theme.selectionFill;
  return (
    <Layer listening={false}>
      <Group x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
        <Group x={hitBox.centerX} y={hitBox.centerY} rotation={hitBox.rotation}>
          <Rect
            x={-hitBox.halfWidth - 2}
            y={-hitBox.halfHeight - 2}
            width={(hitBox.halfWidth + 2) * 2}
            height={(hitBox.halfHeight + 2) * 2}
            stroke={stroke}
            strokeWidth={hovered ? 2 : 2.2}
            dash={hovered ? [6, 4] : undefined}
            fill={fill}
            cornerRadius={4}
            shadowColor={stroke}
            shadowBlur={hovered ? 8 : 5}
            shadowOpacity={hovered ? 0.28 : 0.18}
          />
        </Group>
      </Group>
    </Layer>
  );
}

export default function TopDown25DFloorplanView({
  data,
  width = 1000,
  height = 720,
  zoom = 1,
  isDark = false,
  stageRef,
  onZoomDelta,
  onSelectElement,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => data.elements.find((element) => element.selected)?.id ?? null,
  );

  useEffect(() => {
    setHoveredId(null);
    setSelectedId(data.elements.find((element) => element.selected)?.id ?? null);
  }, [data]);

  const sortedElements = useMemo(
    () => [...data.elements].sort((a, b) => LAYERS.indexOf(getLayer(a)) - LAYERS.indexOf(getLayer(b))),
    [data.elements],
  );

  const byLayer = useMemo(() => {
    const grouped: Record<FloorplanLayer, FloorplanElement[]> = {
      floor: [],
      room: [],
      object: [],
      wall: [],
      opening: [],
      label: [],
      selection: [],
    };
    for (const element of sortedElements) grouped[getLayer(element)].push(element);
    return grouped;
  }, [sortedElements]);

  const hitElements = useMemo(
    () => [...sortedElements].filter((element) => !['floor', 'selection'].includes(getLayer(element))).reverse(),
    [sortedElements],
  );

  const pad = 48;
  const contentBounds = useMemo(
    () => computeContentBounds(data.elements, data.width, data.height),
    [data.elements, data.width, data.height],
  );

  const fitScale = Math.min((width - pad * 2) / contentBounds.w, (height - pad * 2) / contentBounds.h);
  const scale = fitScale * zoom;
  const offsetX = (width - contentBounds.w * scale) / 2 - contentBounds.x * scale;
  const offsetY = (height - contentBounds.h * scale) / 2 - contentBounds.y * scale;
  const theme = getTopDown25DTheme(isDark);

  const getPlanPoint = useCallback((stage: Konva.Stage | null) => {
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer || scale === 0) return null;
    const stagePoint = stage.getAbsoluteTransform().copy().invert().point(pointer);
    return {
      x: (stagePoint.x - offsetX) / scale,
      y: (stagePoint.y - offsetY) / scale,
    };
  }, [offsetX, offsetY, scale]);

  const getElementAtPoint = useCallback((x: number, y: number) => {
    for (const element of hitElements) {
      if (pointInElementHitBox(x, y, element)) return element;
    }
    return null;
  }, [hitElements]);

  const setStageCursor = useCallback((stage: Konva.Stage | null, cursor: string) => {
    if (stage) stage.container().style.cursor = cursor;
  }, []);

  const handleSelect = useCallback((element: FloorplanElement) => {
    if (element.locked) return;
    setSelectedId(element.id);
    onSelectElement?.(element);
  }, [onSelectElement]);

  const handleStageMouseMove = useCallback((event: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = event.target.getStage();
    if (stage?.isDragging()) return;
    const point = getPlanPoint(stage);
    const element = point ? getElementAtPoint(point.x, point.y) : null;
    setHoveredId(current => current === (element?.id ?? null) ? current : element?.id ?? null);
    setStageCursor(stage, element && !element.locked ? 'pointer' : 'default');
  }, [getElementAtPoint, getPlanPoint, setStageCursor]);

  const handleStageSelect = useCallback((event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = event.target.getStage();
    const point = getPlanPoint(stage);
    const element = point ? getElementAtPoint(point.x, point.y) : null;
    if (element && !element.locked) {
      handleSelect(element);
    } else {
      setSelectedId(null);
      onSelectElement?.(null);
    }
  }, [getElementAtPoint, getPlanPoint, handleSelect, onSelectElement]);

  const selected = useMemo(
    () => data.elements.find((element) => element.id === selectedId) ?? null,
    [data.elements, selectedId],
  );
  const hovered = useMemo(
    () => data.elements.find((element) => element.id === hoveredId) ?? null,
    [data.elements, hoveredId],
  );
  const hoverOverlay = hovered && hovered.id !== selected?.id ? hovered : null;

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      draggable
      onClick={handleStageSelect}
      onTap={handleStageSelect}
      onMouseMove={handleStageMouseMove}
      onWheel={(event) => {
        event.evt.preventDefault();
        onZoomDelta?.(event.evt.deltaY > 0 ? -0.08 : 0.08);
      }}
      onMouseLeave={(event) => {
        setHoveredId(null);
        setStageCursor(event.target.getStage(), 'default');
      }}
      onDragStart={(event) => {
        setHoveredId(null);
        setStageCursor(event.target.getStage(), 'grabbing');
      }}
      onDragEnd={(event) => {
        setStageCursor(event.target.getStage(), 'default');
      }}
      style={{ background: theme.background }}
    >
      <FloorLayer data={data} offsetX={offsetX} offsetY={offsetY} scale={scale} isDark={isDark} />
      {LAYERS.filter((layer) => layer !== 'floor' && layer !== 'selection').map((layer) => (
        <ElementLayer
          key={layer}
          elements={byLayer[layer]}
          offsetX={offsetX}
          offsetY={offsetY}
          scale={scale}
          isDark={isDark}
        />
      ))}
      <HitboxOverlayLayer
        element={hoverOverlay}
        offsetX={offsetX}
        offsetY={offsetY}
        scale={scale}
        variant="hover"
        isDark={isDark}
      />
      <HitboxOverlayLayer
        element={selected}
        offsetX={offsetX}
        offsetY={offsetY}
        scale={scale}
        variant="selected"
        isDark={isDark}
      />
    </Stage>
  );
}
