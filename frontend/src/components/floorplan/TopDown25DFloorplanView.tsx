import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { Group, Layer, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import type { FloorplanData, FloorplanElement, FloorplanLayer } from '@/types/birdsEye';
import { renderTopDown25DElement } from './renderers/topDown25D/renderElement';
import { getLayer, getTopDown25DTheme } from './renderers/topDown25D/styles';

const LAYERS: FloorplanLayer[] = ['floor', 'room', 'object', 'wall', 'opening', 'label', 'selection'];

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
  readonly onHover: (id: string | null) => void;
  readonly onSelect: (element: FloorplanElement) => void;
}

const ElementLayer = memo(function ElementLayer({
  elements,
  offsetX,
  offsetY,
  scale,
  isDark,
  onHover,
  onSelect,
}: LayerProps) {
  return (
    <Layer>
      <Group x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
        {elements.map((element) => (
          <Group
            key={element.id}
            onMouseEnter={() => onHover(element.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(element)}
            onTap={() => onSelect(element)}
          >
            <Rect
              x={element.x - 3}
              y={element.y - 3}
              width={Math.max(8, element.width + 6)}
              height={Math.max(8, element.height + 6)}
              fill="#ffffff"
              opacity={0.001}
            />
            {renderTopDown25DElement(element, isDark)}
          </Group>
        ))}
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

function SelectionLayer({
  element,
  offsetX,
  offsetY,
  scale,
  hovered,
  isDark,
}: {
  readonly element: FloorplanElement | null;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
  readonly hovered: boolean;
  readonly isDark: boolean;
}) {
  if (!element) return <Layer listening={false} />;
  const theme = getTopDown25DTheme(isDark);
  return (
    <Layer listening={false}>
      <Group x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
        <Rect
          x={element.x - 5}
          y={element.y - 5}
          width={Math.max(10, element.width + 10)}
          height={Math.max(10, element.height + 10)}
          stroke={theme.selection}
          strokeWidth={hovered ? 1.5 : 2}
          dash={hovered ? [5, 4] : undefined}
          fill={hovered ? theme.selectionHoverFill : theme.selectionFill}
          cornerRadius={4}
        />
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
    const sorted = [...data.elements].sort((a, b) => LAYERS.indexOf(getLayer(a)) - LAYERS.indexOf(getLayer(b)));
    for (const element of sorted) grouped[getLayer(element)].push(element);
    return grouped;
  }, [data.elements]);

  const pad = 48;
  const fitScale = Math.min((width - pad * 2) / Math.max(1, data.width), (height - pad * 2) / Math.max(1, data.height));
  const scale = fitScale * zoom;
  const offsetX = (width - data.width * scale) / 2;
  const offsetY = (height - data.height * scale) / 2;
  const theme = getTopDown25DTheme(isDark);

  const handleHover = useCallback((id: string | null) => setHoveredId(id), []);
  const handleSelect = useCallback((element: FloorplanElement) => {
    if (element.locked) return;
    setSelectedId(element.id);
    onSelectElement?.(element);
  }, [onSelectElement]);

  const selected = useMemo(
    () => data.elements.find((element) => element.id === selectedId) ?? null,
    [data.elements, selectedId],
  );
  const hovered = useMemo(
    () => data.elements.find((element) => element.id === hoveredId) ?? null,
    [data.elements, hoveredId],
  );

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      draggable
      onClick={(event) => {
        if (event.target === event.target.getStage()) {
          setSelectedId(null);
          onSelectElement?.(null);
        }
      }}
      onWheel={(event) => {
        event.evt.preventDefault();
        onZoomDelta?.(event.evt.deltaY > 0 ? -0.08 : 0.08);
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
          onHover={handleHover}
          onSelect={handleSelect}
        />
      ))}
      <SelectionLayer
        element={selected ?? hovered}
        offsetX={offsetX}
        offsetY={offsetY}
        scale={scale}
        hovered={!selected && Boolean(hovered)}
        isDark={isDark}
      />
    </Stage>
  );
}
