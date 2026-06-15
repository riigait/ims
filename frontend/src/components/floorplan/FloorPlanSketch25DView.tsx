/**
 * FloorPlanSketch25DView
 *
 * Read-only 2.5D sketch renderer for IMS floor plans.
 * Accepts a raw FloorPlan (or just FloorPlanObject[]) and draws each object
 * with simulated depth — raised block walls, inset furniture tops, soft
 * drop-shadows — without changing any stored coordinates.
 */
import { memo, useMemo } from 'react';
import { Stage, Layer, Group, Rect, Line, Arc, Circle, Text } from 'react-konva';
import type { FloorPlanObject } from '@/types/floorplan';
import {
  planToSketch25DGroups,
  computeSketch25DBounds,
  PALETTE,
  WALL_RISE,
  WALL_RISE_INDOOR,
  FURNITURE_RISE,
  SHADOW_X,
  SHADOW_Y,
} from '@/utils/floorplanSketch25D';
import type {
  WallRenderItem,
  RoomRenderItem,
  FurnitureRenderItem,
  OpeningRenderItem,
  MarkerRenderItem,
} from '@/utils/floorplanSketch25D';

// ── Helpers ───────────────────────────────────────────────────────────────────

function wallAngle(w: WallRenderItem): number {
  return Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
}

function wallLength(w: WallRenderItem): number {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Static element renderers ─────────────────────────────────────────────────

function SketchRoom({ item }: { readonly item: RoomRenderItem }) {
  if (!item.points || item.points.length < 6) return null;
  // Find a rough centroid for the label
  let cx = 0, cy = 0;
  const n = item.points.length / 2;
  for (let i = 0; i < item.points.length; i += 2) { cx += item.points[i]; cy += item.points[i + 1]; }
  cx /= n; cy /= n;
  const fill = item.fill ?? PALETTE.roomFill;

  return (
    <Group key={item.id} listening={false}>
      {/* Floor fill */}
      <Line points={item.points} closed fill={fill} opacity={0.55} stroke={PALETTE.roomStroke} strokeWidth={0.8} />
      {/* Subtle double outline — hand-drawn feel */}
      <Line points={item.points} closed fill="transparent" stroke={PALETTE.roomStroke} strokeWidth={0.3} opacity={0.2} />
      {item.label && n > 0 && (
        <Text
          text={item.label.toUpperCase()}
          x={cx - 60} y={cy - 7}
          width={120} align="center"
          fontSize={Math.max(7, Math.min(11, 90 / n))}
          fill="#8a7d6f" opacity={0.65} letterSpacing={0.8}
          listening={false}
        />
      )}
    </Group>
  );
}

function SketchWall({ item }: { readonly item: WallRenderItem }) {
  const rise    = item.outdoor ? WALL_RISE : WALL_RISE_INDOOR;
  const topCol  = item.outdoor ? PALETTE.outdoorWallTop  : PALETTE.indoorWallTop;
  const faceCol = item.outdoor ? PALETTE.outdoorWallFace : PALETTE.indoorWallFace;
  const litCol  = item.outdoor ? PALETTE.outdoorWallLight : PALETTE.indoorWallLight;
  const sw      = item.thickness;
  const len     = wallLength(item);
  const ang     = wallAngle(item);
  const deg     = ang * (180 / Math.PI);

  return (
    <Group key={item.id} x={item.x1} y={item.y1} rotation={deg} listening={false}>
      {/* Drop shadow */}
      <Rect
        x={SHADOW_X} y={SHADOW_Y - sw / 2}
        width={len} height={sw}
        fill={PALETTE.shadow}
        cornerRadius={1}
      />
      {/* South face (depth illusion) */}
      <Rect
        x={0} y={-sw / 2 + rise / 2}
        width={len} height={rise}
        fill={faceCol} opacity={0.85}
      />
      {/* Top face */}
      <Rect
        x={0} y={-sw / 2}
        width={len} height={sw}
        fill={topCol}
        stroke={litCol} strokeWidth={0.6}
      />
      {/* Highlight line (top edge) */}
      <Line
        points={[0, -sw / 2, len, -sw / 2]}
        stroke={litCol} strokeWidth={item.outdoor ? 1.2 : 0.8} opacity={0.55}
      />
    </Group>
  );
}

function SketchFurnitureBlock({
  item,
  rise = FURNITURE_RISE,
  topFill,
  faceFill,
  topStroke,
}: {
  readonly item: FurnitureRenderItem;
  readonly rise?: number;
  readonly topFill: string;
  readonly faceFill: string;
  readonly topStroke: string;
}) {
  const { x, y, w, h } = item;
  return (
    <Group listening={false}>
      {/* Shadow */}
      <Rect x={x + SHADOW_X} y={y + SHADOW_Y} width={w} height={h + rise} fill={PALETTE.shadow} cornerRadius={2} />
      {/* South face */}
      <Rect x={x} y={y + h} width={w} height={rise} fill={faceFill} />
      {/* Top face */}
      <Rect x={x} y={y} width={w} height={h} fill={topFill} stroke={topStroke} strokeWidth={1} />
    </Group>
  );
}

function SketchRack({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const rows = Math.max(2, Math.floor(h / 22));
  return (
    <Group key={item.id} listening={false}>
      <SketchFurnitureBlock item={item} topFill="#e8e0c8" faceFill="#b8a878" topStroke="#c8b878" />
      {/* Shelf rows */}
      {Array.from({ length: rows - 1 }, (_, i) => {
        const yy = y + ((i + 1) / rows) * h;
        return <Line key={i} points={[x + 2, yy, x + w - 2, yy]} stroke={PALETTE.rackStripe} strokeWidth={0.9} opacity={0.75} listening={false} />;
      })}
      {/* Uprights */}
      {[0.2, 0.8].map((t) => (
        <Line key={t} points={[x + w * t, y, x + w * t, y + h]} stroke="#a09050" strokeWidth={1} opacity={0.5} listening={false} />
      ))}
      {item.label && w > 28 && h > 14 && (
        <Text text={item.label.length > 10 ? `${item.label.slice(0, 9)}…` : item.label}
          x={x + 2} y={y + h / 2 - 5} width={w - 4} align="center"
          fontSize={Math.max(6, Math.min(9, h / 4))} fill="#706040" opacity={0.8} listening={false}
        />
      )}
    </Group>
  );
}

function SketchShelf({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const rows = Math.max(2, Math.floor(h / 18));
  return (
    <Group key={item.id} listening={false}>
      <SketchFurnitureBlock item={item} rise={5} topFill="#dce8f4" faceFill="#8aaac8" topStroke={PALETTE.shelfStripe} />
      {Array.from({ length: rows - 1 }, (_, i) => {
        const yy = y + ((i + 1) / rows) * h;
        return <Line key={i} points={[x + 2, yy, x + w - 2, yy]} stroke={PALETTE.shelfStripe} strokeWidth={0.8} opacity={0.6} listening={false} />;
      })}
    </Group>
  );
}

function SketchStairs({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const steps = Math.max(3, Math.floor(h / 18));
  return (
    <Group key={item.id} listening={false}>
      <Rect x={x + SHADOW_X} y={y + SHADOW_Y} width={w} height={h} fill={PALETTE.shadow} cornerRadius={1} />
      <Rect x={x} y={y} width={w} height={h} fill="#f0e8d0" stroke={PALETTE.stairsStripe} strokeWidth={1.2} />
      {Array.from({ length: steps }, (_, i) => {
        const yy = y + (i / steps) * h;
        const riseH = h / steps;
        const shade = 0.05 + (i / steps) * 0.18;
        return (
          <Rect key={i} x={x} y={yy} width={w} height={riseH}
            fill={`rgba(80,50,10,${shade})`} strokeEnabled={false}
          />
        );
      })}
      {Array.from({ length: steps - 1 }, (_, i) => {
        const yy = y + ((i + 1) / steps) * h;
        return <Line key={i} points={[x + w * 0.12, yy, x + w * 0.88, yy]} stroke={PALETTE.stairsStripe} strokeWidth={1} listening={false} />;
      })}
      <Line points={[x + w * 0.5, y + 4, x + w * 0.5, y + h - 4]} stroke={PALETTE.stairsStripe} strokeWidth={0.7} opacity={0.4} listening={false} />
      {/* Arrow showing direction */}
      <Line points={[x + w * 0.5, y + h - 6, x + w * 0.5, y + 6]} stroke={PALETTE.stairsStripe} strokeWidth={1.2} opacity={0.6} listening={false} />
    </Group>
  );
}

function SketchElevator({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const cx = x + w / 2, cy = y + h / 2;
  return (
    <Group key={item.id} listening={false}>
      <SketchFurnitureBlock item={item} rise={12} topFill="#ede9fe" faceFill="#7e22ce" topStroke="#7e22ce" />
      <Rect x={x + w * 0.18} y={y + h * 0.15} width={w * 0.64} height={h * 0.6} stroke="#7e22ce" strokeWidth={1} fill="transparent" listening={false} />
      {/* Up/down arrows */}
      <Line points={[cx, cy - h * 0.1, cx - w * 0.14, cy + h * 0.06, cx + w * 0.14, cy + h * 0.06]} closed stroke="#7e22ce" strokeWidth={1} fill="rgba(126,34,206,0.18)" listening={false} />
      <Line points={[cx, cy + h * 0.1, cx - w * 0.14, cy - h * 0.06, cx + w * 0.14, cy - h * 0.06]} closed stroke="#7e22ce" strokeWidth={1} fill="rgba(126,34,206,0.18)" listening={false} />
    </Group>
  );
}

function SketchRestroom({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const cx = x + w / 2;
  const r = Math.min(w, h) * 0.22;
  return (
    <Group key={item.id} listening={false}>
      <SketchFurnitureBlock item={item} rise={6} topFill="#dbeafe" faceFill="#0369a1" topStroke="#0369a1" />
      <Circle x={cx} y={y + h * 0.33} radius={r} stroke="#0369a1" strokeWidth={1} fill="transparent" listening={false} />
      <Line points={[cx, y + h * 0.33 + r, cx, y + h * 0.7]} stroke="#0369a1" strokeWidth={1} listening={false} />
      <Line points={[cx - w * 0.18, y + h * 0.52, cx + w * 0.18, y + h * 0.52]} stroke="#0369a1" strokeWidth={1} listening={false} />
    </Group>
  );
}

function SketchStorage({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  return (
    <Group key={item.id} listening={false}>
      <SketchFurnitureBlock item={item} rise={7} topFill="#e8e4d8" faceFill="#a89c88" topStroke="#a89c88" />
      <Line points={[x + 4, y + 4, x + w - 4, y + h - 4]} stroke="#c0b8a8" strokeWidth={0.8} opacity={0.5} listening={false} />
      <Line points={[x + w - 4, y + 4, x + 4, y + h - 4]} stroke="#c0b8a8" strokeWidth={0.8} opacity={0.5} listening={false} />
      {item.label && w > 30 && h > 16 && (
        <Text text={item.label.length > 10 ? `${item.label.slice(0, 9)}…` : item.label}
          x={x + 2} y={y + h / 2 - 5} width={w - 4} align="center"
          fontSize={Math.max(6, Math.min(9, h / 4))} fill="#706858" opacity={0.7} listening={false}
        />
      )}
    </Group>
  );
}

function SketchGenericFurniture({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const fill = item.fill ?? PALETTE.furnitureTop;
  return (
    <Group key={item.id} listening={false}>
      <SketchFurnitureBlock item={item} topFill={fill} faceFill={PALETTE.furnitureFace} topStroke={PALETTE.furnitureStroke} />
      {item.label && w > 28 && h > 14 && (
        <Text text={item.label.length > 10 ? `${item.label.slice(0, 9)}…` : item.label}
          x={x + 2} y={y + h / 2 - 5} width={w - 4} align="center"
          fontSize={Math.max(6, Math.min(9, h / 4))} fill="#556070" opacity={0.75} listening={false}
        />
      )}
    </Group>
  );
}

function SketchFurniture({ item }: { readonly item: FurnitureRenderItem }) {
  switch (item.subtype) {
    case 'rack':          return <SketchRack item={item} />;
    case 'shelf':         return <SketchShelf item={item} />;
    case 'stairs':        return <SketchStairs item={item} />;
    case 'elevator':      return <SketchElevator item={item} />;
    case 'bathroom':      return <SketchRestroom item={item} />;
    case 'cabinet':
    case 'drawer':
    case 'locker':
    case 'storage-box':
    case 'bin':
    case 'pallet':        return <SketchStorage item={item} />;
    default:              return <SketchGenericFurniture item={item} />;
  }
}

function SketchOpening({ item }: { readonly item: OpeningRenderItem }) {
  if (item.subtype === 'window') {
    const hw = item.width / 2;
    const ht = Math.min(Math.max(6, item.height), 14) / 2;
    return (
      <Group key={item.id} x={item.x} y={item.y} rotation={item.rotation} listening={false}>
        {/* White gap in wall (covers wall) */}
        <Rect x={-hw} y={-ht - 2} width={item.width} height={(ht + 2) * 2} fill={PALETTE.floor} />
        {/* Glass pane */}
        <Rect x={-hw} y={-ht} width={item.width} height={ht * 2} fill={PALETTE.windowGlass} opacity={0.55} />
        {/* Frame lines */}
        <Line points={[-hw, -ht, hw, -ht]} stroke={PALETTE.windowFrame} strokeWidth={1.5} />
        <Line points={[-hw,  ht, hw,  ht]} stroke={PALETTE.windowFrame} strokeWidth={1.5} />
        <Line points={[0, -ht, 0, ht]}     stroke={PALETTE.windowFrame} strokeWidth={0.9} opacity={0.7} />
      </Group>
    );
  }

  // Door or entrance
  const hw = item.width / 2;
  const swingRight = item.swingDirection !== 'left';
  const arcRot = swingRight ? -135 : 180;
  return (
    <Group key={item.id} x={item.x} y={item.y} rotation={item.rotation} listening={false}>
      {/* Cover underlying wall */}
      <Rect x={-hw} y={-10} width={item.width} height={20} fill={PALETTE.floor} />
      {/* Door panel */}
      <Line points={[-hw, 0, hw, 0]} stroke={PALETTE.doorPanel} strokeWidth={3.5} lineCap="round" />
      {/* Swing arc */}
      <Arc
        x={0} y={0}
        innerRadius={0} outerRadius={hw}
        angle={135} rotation={arcRot}
        stroke={PALETTE.doorArc} strokeWidth={0.9}
        dash={[3, 2]} fill={PALETTE.doorFill}
      />
    </Group>
  );
}

function SketchMarker({ item }: { readonly item: MarkerRenderItem }) {
  return (
    <Group key={item.id} listening={false}>
      <Circle x={item.x} y={item.y} radius={14} fill={PALETTE.markerGlow} />
      <Circle x={item.x} y={item.y} radius={7}  fill={PALETTE.markerFill} opacity={0.9} />
      <Circle x={item.x} y={item.y} radius={3}  fill="white" opacity={0.9} />
    </Group>
  );
}

// ── Floor grid ────────────────────────────────────────────────────────────────
const FloorGrid = memo(function FloorGrid({ w, h }: { readonly w: number; readonly h: number }) {
  const lines = useMemo(() => {
    const out: React.ReactNode[] = [];
    const step = 60;
    for (let x = step; x < w; x += step) {
      out.push(<Line key={`v${x}`} points={[x, 0, x, h]} stroke={PALETTE.floorLine} strokeWidth={0.5} opacity={0.55} listening={false} />);
    }
    for (let y = step; y < h; y += step) {
      out.push(<Line key={`h${y}`} points={[0, y, w, y]} stroke={PALETTE.floorLine} strokeWidth={0.5} opacity={0.55} listening={false} />);
    }
    return out;
  }, [w, h]);

  return (
    <>
      <Rect x={0} y={0} width={w} height={h} fill={PALETTE.floor} listening={false} />
      {lines}
    </>
  );
});

// ── Furniture rotation wrapper ────────────────────────────────────────────────
function WithFurnitureRotation({ item, children }: {
  readonly item: FurnitureRenderItem;
  readonly children: React.ReactNode;
}) {
  if (!item.rotation) return <>{children}</>;
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  return (
    <Group x={cx} y={cy} rotation={item.rotation} listening={false}>
      <Group x={-cx} y={-cy} listening={false}>
        {children}
      </Group>
    </Group>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  readonly objects: FloorPlanObject[];
  readonly planWidth?: number;
  readonly planHeight?: number;
  readonly width?: number;
  readonly height?: number;
}

export default memo(function FloorPlanSketch25DView({
  objects,
  planWidth = 800,
  planHeight = 600,
  width = 900,
  height = 650,
}: Props) {
  const groups = useMemo(() => planToSketch25DGroups(objects), [objects]);

  const bounds = useMemo(
    () => computeSketch25DBounds(objects, planWidth, planHeight),
    [objects, planWidth, planHeight],
  );

  const pad = 52;
  const contentW = Math.max(1, bounds.maxX - bounds.minX);
  const contentH = Math.max(1, bounds.maxY - bounds.minY);
  const fitScale = Math.min((width - pad * 2) / contentW, (height - pad * 2) / contentH);
  const offsetX = (width - contentW * fitScale) / 2 - bounds.minX * fitScale;
  const offsetY = (height - contentH * fitScale) / 2 - bounds.minY * fitScale;

  const gProps = { x: offsetX, y: offsetY, scaleX: fitScale, scaleY: fitScale, listening: false as const };

  // Scaled canvas dims for the floor grid (rendered in plan-space coordinates)
  const gridW = planWidth;
  const gridH = planHeight;

  return (
    <Stage width={width} height={height} listening={false}>
      {/* ── Layer 0: Floor ── */}
      <Layer listening={false}>
        <Group {...gProps}>
          <FloorGrid w={gridW} h={gridH} />
        </Group>
      </Layer>

      {/* ── Layer 1: Room fills ── */}
      <Layer listening={false}>
        <Group {...gProps}>
          {groups.rooms.map((item) => <SketchRoom key={item.id} item={item} />)}
        </Group>
      </Layer>

      {/* ── Layer 2: Furniture (below walls so walls occlude) ── */}
      <Layer listening={false}>
        <Group {...gProps}>
          {groups.furniture.map((item) => (
            <WithFurnitureRotation key={item.id} item={item}>
              <SketchFurniture item={item} />
            </WithFurnitureRotation>
          ))}
        </Group>
      </Layer>

      {/* ── Layer 3: Indoor walls ── */}
      <Layer listening={false}>
        <Group {...gProps}>
          {groups.indoorWalls.map((item) => <SketchWall key={item.id} item={item} />)}
        </Group>
      </Layer>

      {/* ── Layer 4: Outdoor walls (on top of indoor walls) ── */}
      <Layer listening={false}>
        <Group {...gProps}>
          {groups.outdoorWalls.map((item) => <SketchWall key={item.id} item={item} />)}
        </Group>
      </Layer>

      {/* ── Layer 5: Openings (doors / windows cut through walls) ── */}
      <Layer listening={false}>
        <Group {...gProps}>
          {groups.openings.map((item) => <SketchOpening key={item.id} item={item} />)}
        </Group>
      </Layer>

      {/* ── Layer 6: Inventory markers ── */}
      <Layer listening={false}>
        <Group {...gProps}>
          {groups.markers.map((item) => <SketchMarker key={item.id} item={item} />)}
        </Group>
      </Layer>

      {/* ── Layer 7: Labels ── */}
      <Layer listening={false}>
        <Group {...gProps}>
          {groups.labels.map((item) => (
            <Text
              key={item.id}
              x={item.x} y={item.y}
              text={item.text}
              fontSize={item.fontSize}
              fill={item.color ?? '#334155'}
              listening={false}
            />
          ))}
        </Group>
      </Layer>
    </Stage>
  );
});
