import { useMemo } from 'react';
import { Stage, Layer, Rect, Line, Circle, Arc, Group, Text } from 'react-konva';
import type { FloorplanData, FloorplanElement } from '@/types/birdsEye';
import { DRAW_ORDER } from '@/types/birdsEye';

// ── Sketch offset helper ──────────────────────────────────────────────────────
const SKETCH_OFFSETS = [-1, 0.8, -0.6, 1.2, -1.1, 0.5];
function so(index: number, strength = 1.5): number {
  return SKETCH_OFFSETS[index % SKETCH_OFFSETS.length] * strength;
}

// ── Element renderers ─────────────────────────────────────────────────────────

function renderRoom(el: FloorplanElement, sketch: boolean): React.ReactNode {
  const fill = el.style?.fill ?? '#f0ebe0';
  const border = sketch ? '#b8b0a4' : '#c8c0b0';

  if (el.polygonPoints) {
    return (
      <Group key={el.id} listening={false}>
        <Line
          points={el.polygonPoints} closed
          fill={fill} opacity={0.55}
          stroke={border} strokeWidth={sketch ? 0.8 : 0.5}
        />
        {el.label && (
          <Text
            text={el.label.toUpperCase()}
            x={el.x} y={el.y + el.height / 2 - 7}
            width={el.width} align="center"
            fontSize={Math.min(13, Math.max(7, el.width / 8))}
            fill="#8a7d6f" opacity={0.7} letterSpacing={0.8}
          />
        )}
      </Group>
    );
  }

  return (
    <Group key={el.id} listening={false}>
      <Rect
        x={el.x} y={el.y} width={el.width} height={el.height}
        fill={fill} opacity={0.55}
        stroke={border} strokeWidth={sketch ? 0.8 : 0.5}
      />
      {sketch && (
        <Rect
          x={el.x + so(1)} y={el.y + so(2)}
          width={el.width} height={el.height}
          stroke={border} strokeWidth={0.4} opacity={0.18} fill="transparent"
        />
      )}
      {el.label && (
        <Text
          text={el.label.toUpperCase()}
          x={el.x + 4} y={el.y + el.height / 2 - 7}
          width={el.width - 8} align="center"
          fontSize={Math.min(13, Math.max(7, el.width / 8))}
          fill="#8a7d6f" opacity={0.7} letterSpacing={0.8}
        />
      )}
    </Group>
  );
}

function renderRug(el: FloorplanElement, _sketch: boolean): React.ReactNode {
  const colors = ['#d4a76a', '#9dc4b8', '#c4b0d0', '#d4c4a0', '#b8c4d4'];
  const color = colors[parseInt(el.id.replace(/\D/g, '').slice(-1) || '0') % colors.length];
  const bi = Math.min(el.width, el.height) * 0.1;
  return (
    <Group key={el.id} listening={false}>
      <Rect x={el.x} y={el.y} width={el.width} height={el.height}
        fill={color} opacity={0.32} cornerRadius={4}
      />
      <Rect
        x={el.x + bi} y={el.y + bi}
        width={el.width - bi * 2} height={el.height - bi * 2}
        stroke={color} strokeWidth={1.5} fill="transparent" cornerRadius={2}
      />
      {Array.from({ length: 5 }, (_, i) => {
        const t = (i + 1) / 6;
        return (
          <Line key={i}
            points={[el.x + el.width * t, el.y, el.x + el.width * t, el.y + 3]}
            stroke={color} strokeWidth={1} opacity={0.5}
          />
        );
      })}
    </Group>
  );
}

function renderBed(el: FloorplanElement, sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h } = el;
  const pw = w * 0.42;
  const ph = h * 0.22;
  const pg = w * 0.08;
  return (
    <Group key={el.id} listening={false}>
      <Rect x={x} y={y} width={w} height={h}
        fill="#e8ddd0" stroke="#b8afa4" strokeWidth={sketch ? 1.5 : 1} cornerRadius={3}
      />
      <Rect x={x} y={y} width={w} height={h * 0.1}
        fill="#c8bdb4" stroke="#b8afa4" strokeWidth={1}
      />
      <Rect x={x + 3} y={y + h * 0.13} width={w - 6} height={h * 0.6}
        fill="#f0ebe4" opacity={0.9} cornerRadius={2}
      />
      <Rect x={x + pg} y={y + h * 0.14} width={pw} height={ph}
        fill="white" stroke="#d8cfc8" strokeWidth={0.8} cornerRadius={4} opacity={0.95}
      />
      <Rect x={x + w / 2 + pg / 2} y={y + h * 0.14} width={pw} height={ph}
        fill="white" stroke="#d8cfc8" strokeWidth={0.8} cornerRadius={4} opacity={0.95}
      />
      {sketch && [0.52, 0.72].map((t, i) => (
        <Line key={i}
          points={[x + 3, y + h * t, x + w - 3, y + h * t]}
          stroke="#c8c0b8" strokeWidth={0.6} opacity={0.35}
        />
      ))}
      {sketch && (
        <Rect x={x + so(0)} y={y + so(1)} width={w} height={h}
          stroke="#a89f96" strokeWidth={0.4} fill="transparent" opacity={0.25} cornerRadius={3}
        />
      )}
    </Group>
  );
}

function renderSofa(el: FloorplanElement, sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h } = el;
  const backH = h * 0.3;
  const armW = w * 0.1;
  const seatH = h * 0.6;
  const seatW = (w - armW * 2) / 2 - 1;
  return (
    <Group key={el.id} listening={false}>
      <Rect x={x} y={y} width={w} height={backH}
        fill="#c8d0c0" stroke="#a8b0a0" strokeWidth={1} cornerRadius={[3, 3, 0, 0] as unknown as number}
      />
      <Rect x={x} y={y + backH} width={armW} height={seatH}
        fill="#b8c0b0" stroke="#a8b0a0" strokeWidth={1}
      />
      <Rect x={x + w - armW} y={y + backH} width={armW} height={seatH}
        fill="#b8c0b0" stroke="#a8b0a0" strokeWidth={1}
      />
      <Rect x={x + armW} y={y + backH} width={seatW} height={seatH}
        fill="#d4dcc8" stroke="#a8b0a0" strokeWidth={0.8}
      />
      <Rect x={x + armW + seatW + 2} y={y + backH} width={seatW} height={seatH}
        fill="#d4dcc8" stroke="#a8b0a0" strokeWidth={0.8}
      />
      {sketch && (
        <Rect x={x + so(2)} y={y + so(0)} width={w} height={h}
          stroke="#a0a898" strokeWidth={0.4} fill="transparent" opacity={0.25}
        />
      )}
    </Group>
  );
}

function renderTable(el: FloorplanElement, sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h } = el;
  const ins = Math.min(w, h) * 0.08;
  return (
    <Group key={el.id} listening={false}>
      <Rect x={x} y={y} width={w} height={h}
        fill="#e8dfc8" stroke="#c8b89a" strokeWidth={sketch ? 1.5 : 1} cornerRadius={3}
      />
      <Rect x={x + ins} y={y + ins} width={w - ins * 2} height={h - ins * 2}
        stroke="#c8b89a" strokeWidth={0.5} fill="transparent" cornerRadius={2}
      />
      {([
        [x + 4, y + 4], [x + w - 9, y + 4],
        [x + 4, y + h - 9], [x + w - 9, y + h - 9],
      ] as [number, number][]).map(([lx, ly], i) => (
        <Rect key={i} x={lx} y={ly} width={5} height={5} fill="#c8b89a" opacity={0.7} />
      ))}
      {sketch && (
        <Rect x={x + so(1)} y={y + so(2)} width={w} height={h}
          stroke="#b8a87a" strokeWidth={0.4} fill="transparent" opacity={0.25} cornerRadius={3}
        />
      )}
    </Group>
  );
}

function renderChair(el: FloorplanElement, _sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h } = el;
  const backH = h * 0.25;
  const seatW = w * 0.8;
  const seatOff = (w - seatW) / 2;
  return (
    <Group key={el.id} listening={false}>
      <Rect x={x} y={y} width={w} height={backH}
        fill="#c8c8b8" stroke="#a8a898" strokeWidth={1} cornerRadius={[4, 4, 0, 0] as unknown as number}
      />
      <Rect x={x + seatOff} y={y + backH} width={seatW} height={h - backH}
        fill="#d8d8c8" stroke="#a8a898" strokeWidth={1} cornerRadius={[0, 0, 3, 3] as unknown as number}
      />
    </Group>
  );
}

function renderDesk(el: FloorplanElement, sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h } = el;
  return (
    <Group key={el.id} listening={false}>
      <Rect x={x} y={y} width={w} height={h}
        fill="#d4cfc0" stroke="#b0a890" strokeWidth={sketch ? 1.5 : 1}
      />
      <Rect x={x + w * 0.1} y={y + h * 0.6} width={w * 0.5} height={h * 0.25}
        fill="#bab5a6" opacity={0.7} cornerRadius={1}
      />
      <Rect x={x + w * 0.35} y={y + h * 0.1} width={w * 0.3} height={h * 0.35}
        fill="#c8c0b0" stroke="#b0a890" strokeWidth={0.5} opacity={0.8}
      />
      {sketch && (
        <Rect x={x + so(3)} y={y + so(1)} width={w} height={h}
          stroke="#a0988a" strokeWidth={0.4} fill="transparent" opacity={0.25}
        />
      )}
    </Group>
  );
}

function renderKitchenCounter(el: FloorplanElement, sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h } = el;
  const divs = Math.max(1, Math.floor(w / 40));
  return (
    <Group key={el.id} listening={false}>
      <Rect x={x} y={y} width={w} height={h}
        fill="#d0c8b8" stroke="#a89878" strokeWidth={sketch ? 1.5 : 1}
      />
      {Array.from({ length: divs - 1 }, (_, i) => {
        const dx = x + (i + 1) * (w / divs);
        return (
          <Line key={i}
            points={[dx, y, dx, y + h]}
            stroke="#b8b0a0" strokeWidth={0.5} opacity={0.5}
          />
        );
      })}
      <Rect x={x} y={y} width={w} height={h * 0.12} fill="#e0d8c8" opacity={0.6} />
      {sketch && (
        <Rect x={x + so(0)} y={y + so(4)} width={w} height={h}
          stroke="#a89878" strokeWidth={0.4} fill="transparent" opacity={0.22}
        />
      )}
    </Group>
  );
}

function renderSink(el: FloorplanElement, _sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h } = el;
  const ins = 4;
  return (
    <Group key={el.id} listening={false}>
      <Rect x={x} y={y} width={w} height={h}
        fill="#d8e0e8" stroke="#a0b0c0" strokeWidth={1}
      />
      <Rect x={x + ins} y={y + ins} width={w - ins * 2} height={h - ins * 2}
        fill="#c0d0e0" stroke="#90a8b8" strokeWidth={1}
        cornerRadius={Math.min(w - ins * 2, h - ins * 2) * 0.3}
      />
      <Circle x={x + w / 2} y={y + h / 2} radius={Math.min(w, h) * 0.1} fill="#90a8b8" />
    </Group>
  );
}

function renderToilet(el: FloorplanElement, _sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h } = el;
  const tankH = h * 0.28;
  const bowlH = h * 0.65;
  return (
    <Group key={el.id} listening={false}>
      <Rect x={x} y={y} width={w} height={tankH}
        fill="#e0e4e8" stroke="#a0a8b0" strokeWidth={1} cornerRadius={2}
      />
      <Rect x={x + w * 0.1} y={y + tankH} width={w * 0.8} height={bowlH}
        fill="#e8ecf0" stroke="#a0a8b0" strokeWidth={1}
        cornerRadius={[0, 0, w * 0.4, w * 0.4] as unknown as number}
      />
      <Rect x={x + w * 0.2} y={y + tankH + h * 0.05} width={w * 0.6} height={bowlH - h * 0.1}
        fill="#d0d8e0" stroke="#a0a8b0" strokeWidth={0.5}
        cornerRadius={[0, 0, w * 0.3, w * 0.3] as unknown as number}
      />
    </Group>
  );
}

function renderBathtub(el: FloorplanElement, _sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h } = el;
  const ins = Math.min(w, h) * 0.08;
  const r = Math.min(w, h) * 0.12;
  return (
    <Group key={el.id} listening={false}>
      <Rect x={x} y={y} width={w} height={h}
        fill="#d8e8f0" stroke="#90b0c0" strokeWidth={1.5} cornerRadius={r * 1.2}
      />
      <Rect x={x + ins} y={y + ins} width={w - ins * 2} height={h - ins * 2}
        fill="#c0d8e8" stroke="#90b0c0" strokeWidth={0.8} cornerRadius={r}
      />
      <Circle x={x + w / 2} y={y + h * 0.12} radius={3} fill="#90b0c0" />
    </Group>
  );
}

function renderPlant(el: FloorplanElement, _sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;
  const lr = r * 0.52;
  return (
    <Group key={el.id} listening={false}>
      <Rect x={cx - r * 0.5} y={cy + r * 0.2} width={r} height={r * 0.6}
        fill="#b8a080" stroke="#906858" strokeWidth={1} cornerRadius={[0, 0, 3, 3] as unknown as number}
      />
      <Circle x={cx} y={cy} radius={lr} fill="#5a9048" opacity={0.8} />
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i * 60) * Math.PI / 180;
        return (
          <Circle key={i}
            x={cx + Math.cos(a) * lr * 0.6}
            y={cy + Math.sin(a) * lr * 0.6}
            radius={lr * 0.48}
            fill="#6aaa58" opacity={0.7}
          />
        );
      })}
      <Circle x={cx} y={cy} radius={lr * 0.24} fill="#4a7838" opacity={0.85} />
    </Group>
  );
}

function renderStorage(el: FloorplanElement, sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h } = el;
  return (
    <Group key={el.id} listening={false}>
      <Rect x={x} y={y} width={w} height={h}
        fill="#e4e0d4" stroke="#a8a090" strokeWidth={sketch ? 1.5 : 1}
      />
      <Line points={[x + 4, y + 4, x + w - 4, y + h - 4]} stroke="#c0b8a8" strokeWidth={1} opacity={0.55} />
      <Line points={[x + w - 4, y + 4, x + 4, y + h - 4]} stroke="#c0b8a8" strokeWidth={1} opacity={0.55} />
      {w > 40 && [0.33, 0.66].map((t, i) => (
        <Line key={i}
          points={[x + 2, y + h * t, x + w - 2, y + h * t]}
          stroke="#c0b8a8" strokeWidth={0.8} opacity={0.45}
        />
      ))}
      {sketch && (
        <Rect x={x + so(5)} y={y + so(3)} width={w} height={h}
          stroke="#908878" strokeWidth={0.4} fill="transparent" opacity={0.25}
        />
      )}
      {el.label && (
        <Text
          text={el.label} x={x + 2} y={y + 2}
          width={w - 4} fontSize={Math.max(6, Math.min(10, h / 3))}
          fill="#706858" opacity={0.7}
        />
      )}
    </Group>
  );
}

function renderDoor(el: FloorplanElement, _sketch: boolean): React.ReactNode {
  const { x, y, width: w, rotation } = el;
  return (
    <Group key={el.id} x={x} y={y} rotation={rotation ?? 0} listening={false}>
      <Line points={[0, 0, w, 0]} stroke="#16a34a" strokeWidth={2.5} lineCap="round" />
      <Arc
        x={0} y={0}
        innerRadius={0} outerRadius={w}
        angle={90} rotation={0}
        stroke="#16a34a" strokeWidth={0.8} fill="rgba(22,163,74,0.06)"
      />
    </Group>
  );
}

function renderWindow(el: FloorplanElement, _sketch: boolean): React.ReactNode {
  const { x, y, width: w, height: h, rotation } = el;
  const t = Math.min(h || 8, 8);
  return (
    <Group key={el.id} x={x} y={y} rotation={rotation ?? 0} listening={false}>
      <Rect x={0} y={0} width={w} height={t} fill="white" />
      <Line points={[0, 0, w, 0]} stroke="#38bdf8" strokeWidth={2} />
      <Line points={[0, t, w, t]} stroke="#38bdf8" strokeWidth={2} />
      <Line points={[w / 2, 0, w / 2, t]} stroke="#38bdf8" strokeWidth={0.8} opacity={0.6} />
    </Group>
  );
}

function renderWall(el: FloorplanElement, sketch: boolean): React.ReactNode {
  const outdoor = el.type === 'outdoor_wall';
  const fill = outdoor ? '#2c2c2c' : '#585858';

  if (el.linePoints) {
    const [x1, y1, x2, y2] = el.linePoints;
    const sw = el.style?.strokeWidth ?? (outdoor ? 8 : 3);
    return (
      <Group key={el.id} listening={false}>
        <Line points={[x1, y1, x2, y2]} stroke={fill} strokeWidth={sw} lineCap="square" />
        {sketch && (
          <Line
            points={[x1 + 1, y1 - 1, x2 + 1, y2 - 1]}
            stroke={outdoor ? '#1a1a1a' : '#3a3a3a'}
            strokeWidth={sw * 0.35} opacity={0.22} lineCap="square"
          />
        )}
      </Group>
    );
  }

  return (
    <Group key={el.id} listening={false}>
      <Rect x={el.x} y={el.y} width={el.width} height={el.height}
        fill={fill} strokeEnabled={false}
      />
      {sketch && (
        <Rect x={el.x + 1} y={el.y - 1} width={el.width} height={el.height}
          stroke={outdoor ? '#1a1a1a' : '#3a3a3a'}
          strokeWidth={1} fill="transparent" opacity={0.22}
        />
      )}
    </Group>
  );
}

function renderLabel(el: FloorplanElement, _sketch: boolean): React.ReactNode {
  return (
    <Text
      key={el.id}
      x={el.x} y={el.y}
      text={el.label ?? ''}
      fontSize={el.style?.strokeWidth ?? 12}
      fill={el.style?.stroke ?? '#334155'}
      listening={false}
    />
  );
}

function renderInventoryMarker(el: FloorplanElement, _sketch: boolean): React.ReactNode {
  return (
    <Group key={el.id} listening={false}>
      <Circle x={el.x} y={el.y} radius={10} fill="#3b82f6" opacity={0.8} />
      <Text x={el.x - 3} y={el.y - 5} text="I" fontSize={9} fill="white" />
    </Group>
  );
}

function renderFloorplanElement(el: FloorplanElement, sketch: boolean): React.ReactNode {
  switch (el.type) {
    case 'room':            return renderRoom(el, sketch);
    case 'rug':             return renderRug(el, sketch);
    case 'bed':             return renderBed(el, sketch);
    case 'sofa':            return renderSofa(el, sketch);
    case 'table':           return renderTable(el, sketch);
    case 'chair':           return renderChair(el, sketch);
    case 'desk':            return renderDesk(el, sketch);
    case 'kitchen_counter': return renderKitchenCounter(el, sketch);
    case 'sink':            return renderSink(el, sketch);
    case 'toilet':          return renderToilet(el, sketch);
    case 'bathtub':         return renderBathtub(el, sketch);
    case 'plant':           return renderPlant(el, sketch);
    case 'storage':         return renderStorage(el, sketch);
    case 'door':            return renderDoor(el, sketch);
    case 'window':          return renderWindow(el, sketch);
    case 'outdoor_wall':
    case 'indoor_wall':     return renderWall(el, sketch);
    case 'label':           return renderLabel(el, sketch);
    case 'inventory_marker':return renderInventoryMarker(el, sketch);
    default:
      return (
        <Rect key={el.id} x={el.x} y={el.y} width={el.width} height={el.height}
          fill={el.style?.fill ?? '#e8e8e8'}
          stroke={el.style?.stroke ?? '#b0b0b0'} strokeWidth={1}
          listening={false}
        />
      );
  }
}

// ── Floor background ──────────────────────────────────────────────────────────
function FloorBackground({ data, sketch }: { data: FloorplanData; sketch: boolean }) {
  const plankPx = 60;
  const lineColor = sketch ? '#ece5da' : '#e4e4e4';

  const lines = useMemo(() => {
    const result: React.ReactNode[] = [];
    for (let x = 0; x <= data.width; x += plankPx) {
      result.push(<Line key={`pv-${x}`} points={[x, 0, x, data.height]} stroke={lineColor} strokeWidth={0.5} opacity={0.55} listening={false} />);
    }
    for (let y = 0; y <= data.height; y += plankPx) {
      result.push(<Line key={`ph-${y}`} points={[0, y, data.width, y]} stroke={lineColor} strokeWidth={0.5} opacity={0.55} listening={false} />);
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.width, data.height, lineColor]);

  return (
    <>
      <Rect x={0} y={0} width={data.width} height={data.height}
        fill={sketch ? '#faf6f0' : '#f8f8f8'} listening={false}
      />
      {lines}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  data: FloorplanData;
  width?: number;
  height?: number;
  viewStyle?: 'technical' | 'sketch';
}

export default function BirdsEyeFloorplanRenderer({
  data,
  width = 800,
  height = 600,
  viewStyle = 'sketch',
}: Props) {
  const sketch = viewStyle === 'sketch';
  const pad = 24;
  const safeW = data.width || 1;
  const safeH = data.height || 1;
  const scale = Math.min((width - pad * 2) / safeW, (height - pad * 2) / safeH);
  const offsetX = (width - safeW * scale) / 2;
  const offsetY = (height - safeH * scale) / 2;

  const byLayer = useMemo(() => {
    const layers: Record<string, FloorplanElement[]> = {
      floor: [], room: [], object: [], wall: [], opening: [], label: [],
    };
    const sorted = [...data.elements].sort(
      (a, b) => (DRAW_ORDER[a.layer ?? 'object'] ?? 2) - (DRAW_ORDER[b.layer ?? 'object'] ?? 2),
    );
    for (const el of sorted) {
      const key = el.layer ?? 'object';
      (layers[key] ?? layers.object).push(el);
    }
    return layers;
  }, [data.elements]);

  const groupProps = { x: offsetX, y: offsetY, scaleX: scale, scaleY: scale, listening: false as const };

  return (
    <Stage width={width} height={height} listening={false}>
      {/* Floor background */}
      <Layer listening={false}>
        <Group {...groupProps}>
          <FloorBackground data={data} sketch={sketch} />
        </Group>
      </Layer>

      {/* Rooms */}
      <Layer listening={false}>
        <Group {...groupProps}>
          {byLayer.room.map(el => renderFloorplanElement(el, sketch))}
        </Group>
      </Layer>

      {/* Objects (furniture) */}
      <Layer listening={false}>
        <Group {...groupProps}>
          {byLayer.object.map(el => renderFloorplanElement(el, sketch))}
        </Group>
      </Layer>

      {/* Walls */}
      <Layer listening={false}>
        <Group {...groupProps}>
          {byLayer.wall.map(el => renderFloorplanElement(el, sketch))}
        </Group>
      </Layer>

      {/* Openings (doors / windows) */}
      <Layer listening={false}>
        <Group {...groupProps}>
          {byLayer.opening.map(el => renderFloorplanElement(el, sketch))}
        </Group>
      </Layer>

      {/* Labels */}
      <Layer listening={false}>
        <Group {...groupProps}>
          {byLayer.label.map(el => renderFloorplanElement(el, sketch))}
        </Group>
      </Layer>
    </Stage>
  );
}
