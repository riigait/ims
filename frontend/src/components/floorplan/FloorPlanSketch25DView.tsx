/**
 * FloorPlanSketch25DView — 2.5D sketch renderer v2
 *
 * Read-only. Accepts raw FloorPlanObject[] and renders real furniture shapes
 * in a top-down 2.5D style. No coordinate changes — visual depth only.
 */
import { memo, useMemo } from 'react';
import { Stage, Layer, Group, Rect, Line, Arc, Circle, Text, Ellipse } from 'react-konva';
import type { FloorPlanObject } from '@/types/floorplan';
import {
  planToSketch25DGroups,
  computeSketch25DBounds,
  PALETTE,
  WALL_RISE,
  WALL_RISE_INDOOR,
  SHADOW_X,
  SHADOW_Y,
} from '@/utils/floorplanSketch25D';
import type {
  WallRenderItem,
  RoomRenderItem,
  FurnitureRenderItem,
  OpeningRenderItem,
  MarkerRenderItem,
  LabelRenderItem,
} from '@/utils/floorplanSketch25D';

// ─── Wall helpers ─────────────────────────────────────────────────────────────
function wallAngle(w: WallRenderItem) { return Math.atan2(w.y2 - w.y1, w.x2 - w.x1); }
function wallLength(w: WallRenderItem) { return Math.hypot(w.x2 - w.x1, w.y2 - w.y1); }

// ─── Shadow helper ────────────────────────────────────────────────────────────
function Shadow({ x, y, w, h, r = 2 }: { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly r?: number }) {
  return <Rect x={x + SHADOW_X} y={y + SHADOW_Y} width={w} height={h} fill={PALETTE.shadow} cornerRadius={r} listening={false} />;
}

// ─── Room ─────────────────────────────────────────────────────────────────────
function SketchRoom({ item }: { readonly item: RoomRenderItem }) {
  if (!item.points || item.points.length < 6) return null;
  let cx = 0, cy = 0;
  const n = item.points.length / 2;
  for (let i = 0; i < item.points.length; i += 2) { cx += item.points[i]; cy += item.points[i + 1]; }
  cx /= n; cy /= n;
  const fill = item.fill ?? PALETTE.roomFill;
  return (
    <Group listening={false}>
      <Line points={item.points} closed fill={fill} opacity={0.55} stroke={PALETTE.roomStroke} strokeWidth={0.8} />
      <Line points={item.points} closed fill="transparent" stroke={PALETTE.roomStroke} strokeWidth={0.3} opacity={0.18} />
      {item.label && (
        <Text text={item.label.toUpperCase()} x={cx - 60} y={cy - 7} width={120} align="center"
          fontSize={Math.max(7, Math.min(11, 90 / n))} fill="#8a7d6f" opacity={0.65} letterSpacing={0.8} listening={false} />
      )}
    </Group>
  );
}

// ─── Wall ─────────────────────────────────────────────────────────────────────
function SketchWall({ item }: { readonly item: WallRenderItem }) {
  const rise   = item.outdoor ? WALL_RISE : WALL_RISE_INDOOR;
  const topCol = item.outdoor ? PALETTE.outdoorWallTop   : PALETTE.indoorWallTop;
  const faceCol= item.outdoor ? PALETTE.outdoorWallFace  : PALETTE.indoorWallFace;
  const litCol = item.outdoor ? PALETTE.outdoorWallLight : PALETTE.indoorWallLight;
  const sw     = item.thickness;
  const len    = wallLength(item);
  const deg    = wallAngle(item) * (180 / Math.PI);
  return (
    <Group x={item.x1} y={item.y1} rotation={deg} listening={false}>
      <Rect x={SHADOW_X} y={SHADOW_Y - sw / 2} width={len} height={sw} fill={PALETTE.shadow} cornerRadius={1} />
      <Rect x={0} y={-sw / 2 + rise / 2} width={len} height={rise} fill={faceCol} opacity={0.85} />
      <Rect x={0} y={-sw / 2} width={len} height={sw} fill={topCol} stroke={litCol} strokeWidth={0.6} />
      <Line points={[0, -sw / 2, len, -sw / 2]} stroke={litCol} strokeWidth={item.outdoor ? 1.2 : 0.8} opacity={0.55} />
    </Group>
  );
}

// ─── Furniture primitives ─────────────────────────────────────────────────────

// Raised block: top face + south face + shadow
function Block({
  x, y, w, h, rise = 8,
  topFill, faceFill, topStroke,
  cornerRadius = 0,
}: {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rise?: number;
  readonly topFill: string; readonly faceFill: string; readonly topStroke: string; readonly cornerRadius?: number;
}) {
  return (
    <Group listening={false}>
      <Shadow x={x} y={y} w={w} h={h + rise} />
      <Rect x={x} y={y + h} width={w} height={rise} fill={faceFill} cornerRadius={[0,0,cornerRadius,cornerRadius]} />
      <Rect x={x} y={y} width={w} height={h} fill={topFill} stroke={topStroke} strokeWidth={1} cornerRadius={cornerRadius} />
    </Group>
  );
}

// ─── RACK — tall storage rack with uprights and horizontal bars ───────────────
function SketchRack({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const rows = Math.max(2, Math.floor(h / 20));
  const uprightW = Math.max(3, w * 0.06);
  return (
    <Group key={item.id} listening={false}>
      <Shadow x={x} y={y} w={w} h={h} />
      {/* Back panel */}
      <Rect x={x} y={y} width={w} height={h} fill="#d8cba0" stroke="#b0985c" strokeWidth={1} />
      {/* Upright posts */}
      {[x + 1, x + w - uprightW - 1].map((px, i) => (
        <Rect key={`up-${i}`} x={px} y={y} width={uprightW} height={h} fill="#8a7040" />
      ))}
      {/* Horizontal shelf bars */}
      {Array.from({ length: rows + 1 }, (_, i) => {
        const yy = y + (i / rows) * h;
        return <Rect key={i} x={x} y={yy - 1.5} width={w} height={3} fill="#c0a860" />;
      })}
      {/* Shelf boards between bars */}
      {Array.from({ length: rows }, (_, i) => {
        const yy = y + (i / rows) * h + 3;
        const bh = (h / rows) - 6;
        return <Rect key={`b${i}`} x={x + uprightW + 1} y={yy} width={w - uprightW * 2 - 2} height={Math.max(1, bh)}
          fill="#e8ddb8" opacity={0.7} />;
      })}
      {item.label && w > 30 && (
        <Text text={item.label.length > 10 ? `${item.label.slice(0,9)}…` : item.label}
          x={x + 2} y={y + 3} width={w - 4} align="center"
          fontSize={Math.max(5, Math.min(8, w / 6))} fill="#5a4020" opacity={0.85} listening={false} />
      )}
    </Group>
  );
}

// ─── SHELF — low open shelf unit with cubbies ─────────────────────────────────
function SketchShelf({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const cols = Math.max(1, Math.floor(w / 30));
  const rows = Math.max(1, Math.floor(h / 25));
  const cw = w / cols;
  const ch = h / rows;
  return (
    <Group key={item.id} listening={false}>
      <Block x={x} y={y} w={w} h={h} rise={5} topFill="#c8dcf0" faceFill="#6090c0" topStroke="#5080b0" />
      {/* Cubby grid */}
      {Array.from({ length: cols + 1 }, (_, i) => (
        <Line key={`cv${i}`} points={[x + i * cw, y, x + i * cw, y + h]} stroke="#5080b0" strokeWidth={1.2} listening={false} />
      ))}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <Line key={`ch${i}`} points={[x, y + i * ch, x + w, y + i * ch]} stroke="#5080b0" strokeWidth={1.2} listening={false} />
      ))}
      {/* Item silhouettes in cubbies */}
      {Array.from({ length: cols }, (_, ci) =>
        Array.from({ length: rows }, (__, ri) => (
          <Rect key={`item-${ci}-${ri}`}
            x={x + ci * cw + cw * 0.15} y={y + ri * ch + ch * 0.18}
            width={cw * 0.7} height={ch * 0.65}
            fill="#a8c8e8" opacity={0.5} cornerRadius={1}
          />
        ))
      )}
    </Group>
  );
}

// ─── WORK SURFACE / DESK — table with monitor + keyboard suggestion ───────────
function SketchWorkSurface({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const legS = Math.max(4, Math.min(8, w * 0.07));
  return (
    <Group key={item.id} listening={false}>
      <Shadow x={x} y={y} w={w} h={h} />
      {/* Legs at corners */}
      {([[0,0],[1,0],[0,1],[1,1]] as [number,number][]).map(([lx,ly]) => (
        <Rect key={`leg-${lx}-${ly}`} x={x + lx*(w-legS)} y={y + ly*(h-legS)} width={legS} height={legS} fill="#806848" />
      ))}
      {/* Desktop surface */}
      <Rect x={x} y={y} width={w} height={h} fill="#e8dccc" stroke="#b09870" strokeWidth={1} cornerRadius={1} />
      {/* Monitor (top half) */}
      {w > 40 && h > 30 && (
        <Group listening={false}>
          <Rect x={x + w*0.2} y={y + h*0.06} width={w*0.6} height={h*0.38} fill="#1a2535" stroke="#506070" strokeWidth={1} cornerRadius={2} />
          <Rect x={x + w*0.25} y={y + h*0.09} width={w*0.5} height={h*0.28} fill="#2a3f58" opacity={0.9} cornerRadius={1} />
          {/* Screen glow */}
          <Rect x={x + w*0.27} y={y + h*0.1} width={w*0.46} height={h*0.24} fill="#3a6090" opacity={0.35} cornerRadius={1} />
          {/* Monitor stand */}
          <Rect x={x + w*0.44} y={y + h*0.44} width={w*0.12} height={h*0.08} fill="#808080" />
          {/* Keyboard */}
          <Rect x={x + w*0.15} y={y + h*0.58} width={w*0.7} height={h*0.28} fill="#c8c0b8" stroke="#a8a098" strokeWidth={0.8} cornerRadius={2} />
          {/* Key rows */}
          {[0.2, 0.5, 0.8].map((t) => (
            <Line key={`krow-${t}`} points={[x + w*0.18, y + h*(0.58 + t*0.28), x + w*0.82, y + h*(0.58 + t*0.28)]}
              stroke="#a0988c" strokeWidth={0.6} opacity={0.6} listening={false} />
          ))}
        </Group>
      )}
      {/* Simple lines if too small for detail */}
      {(w <= 40 || h <= 30) && (
        <>
          <Rect x={x+3} y={y+2} width={w-6} height={h*0.4} fill="#1a2535" cornerRadius={1} />
          <Rect x={x+4} y={y+h*0.55} width={w-8} height={h*0.35} fill="#c8c0b8" cornerRadius={1} />
        </>
      )}
    </Group>
  );
}

// ─── CHAIR — top-down with seat, back rest and armrests ───────────────────────
function SketchChair({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const backH = h * 0.22;
  const seatH = h * 0.55;
  const seatY = y + backH + h * 0.04;
  const armW  = w * 0.12;
  return (
    <Group key={item.id} listening={false}>
      <Shadow x={x} y={y} w={w} h={h} r={3} />
      {/* Chair back */}
      <Rect x={x} y={y} width={w} height={backH} fill="#8090a0" stroke="#607080" strokeWidth={1} cornerRadius={[3,3,0,0]} />
      {/* Back cushion detail */}
      <Rect x={x+2} y={y+2} width={w-4} height={backH-4} fill="#a0b0c0" opacity={0.6} cornerRadius={2} />
      {/* Armrests */}
      <Rect x={x} y={seatY} width={armW} height={seatH} fill="#708090" stroke="#607080" strokeWidth={0.8} />
      <Rect x={x+w-armW} y={seatY} width={armW} height={seatH} fill="#708090" stroke="#607080" strokeWidth={0.8} />
      {/* Seat cushion */}
      <Rect x={x+armW} y={seatY} width={w-armW*2} height={seatH} fill="#b0c0d0" stroke="#8090a8" strokeWidth={1} cornerRadius={[0,0,2,2]} />
      {/* Seat seam */}
      <Line points={[x+armW, seatY+seatH*0.5, x+w-armW, seatY+seatH*0.5]} stroke="#8090a8" strokeWidth={0.7} opacity={0.5} listening={false} />
      {/* Legs (small squares at corners below seat) */}
      {([[0,1],[1,1]] as [number,number][]).map(([lx,ly]) => (
        <Circle key={`cleg-${lx}-${ly}`} x={x + lx*(w-4) + 2} y={seatY + ly*seatH - 2} radius={2.5} fill="#506070" />
      ))}
    </Group>
  );
}

// ─── CABINET — closed cabinet with double doors and handles ──────────────────
function SketchCabinet({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const mid = x + w / 2;
  return (
    <Group key={item.id} listening={false}>
      <Block x={x} y={y} w={w} h={h} rise={8} topFill="#d4cfc0" faceFill="#8a8070" topStroke="#a09880" />
      {/* Door split line */}
      <Line points={[mid, y+2, mid, y+h-2]} stroke="#a09880" strokeWidth={1} listening={false} />
      {/* Left door panel */}
      <Rect x={x+3} y={y+3} width={w/2-5} height={h-6} stroke="#a09880" strokeWidth={0.8} fill="transparent" cornerRadius={1} />
      {/* Right door panel */}
      <Rect x={mid+2} y={y+3} width={w/2-5} height={h-6} stroke="#a09880" strokeWidth={0.8} fill="transparent" cornerRadius={1} />
      {/* Handles */}
      <Rect x={mid-5} y={y+h/2-4} width={3} height={8} fill="#707060" cornerRadius={1} />
      <Rect x={mid+2} y={y+h/2-4} width={3} height={8} fill="#707060" cornerRadius={1} />
    </Group>
  );
}

// ─── DRAWER — chest with 3 drawers and handles ────────────────────────────────
function SketchDrawer({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const drawerCount = Math.max(2, Math.min(5, Math.floor(h / 20)));
  const dh = h / drawerCount;
  return (
    <Group key={item.id} listening={false}>
      <Block x={x} y={y} w={w} h={h} rise={6} topFill="#d8d0c4" faceFill="#908878" topStroke="#b0a898" />
      {/* Drawer faces */}
      {Array.from({ length: drawerCount }, (_, i) => (
        <Group key={i} listening={false}>
          <Rect x={x+2} y={y + i*dh + 2} width={w-4} height={dh-4} fill="#c8c0b4" stroke="#a09888" strokeWidth={0.8} cornerRadius={1} />
          {/* Drawer handle */}
          <Rect x={x+w/2-6} y={y + i*dh + dh/2 - 2} width={12} height={4} fill="#808070" cornerRadius={1} />
        </Group>
      ))}
    </Group>
  );
}

// ─── LOCKER — tall narrow locker with vents ───────────────────────────────────
function SketchLocker({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const cols = Math.max(1, Math.floor(w / 22));
  const cw = w / cols;
  return (
    <Group key={item.id} listening={false}>
      <Block x={x} y={y} w={w} h={h} rise={7} topFill="#c8d4c0" faceFill="#789068" topStroke="#90a880" />
      {/* Locker columns */}
      {Array.from({ length: cols }, (_, ci) => (
        <Group key={ci} listening={false}>
          <Rect x={x+ci*cw+1} y={y+1} width={cw-2} height={h-2} stroke="#90a880" strokeWidth={0.8} fill="transparent" cornerRadius={1} />
          {/* Vent slats */}
          {Array.from({ length: 4 }, (__, si) => (
            <Rect key={si} x={x+ci*cw+3} y={y + h*0.12 + si*6} width={cw-6} height={2} fill="#90a880" opacity={0.6} />
          ))}
          {/* Handle */}
          <Rect x={x+ci*cw+cw/2-3} y={y+h*0.45} width={6} height={10} fill="#607050" cornerRadius={1} />
        </Group>
      ))}
    </Group>
  );
}

// ─── STORAGE BOX / BIN — open-top crate with handles ─────────────────────────
function SketchStorageBox({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const ins = Math.min(w, h) * 0.12;
  return (
    <Group key={item.id} listening={false}>
      <Shadow x={x} y={y} w={w} h={h} />
      {/* Outer box */}
      <Rect x={x} y={y} width={w} height={h} fill="#c0b8a8" stroke="#906858" strokeWidth={1.5} cornerRadius={2} />
      {/* Inner open top (darker = depth) */}
      <Rect x={x+ins} y={y+ins} width={w-ins*2} height={h-ins*2} fill="#a09080" cornerRadius={1} />
      {/* Handle cutouts on sides */}
      {w > 30 && (
        <>
          <Rect x={x+3} y={y+h*0.38} width={6} height={h*0.24} fill="#8a7868" cornerRadius={1} />
          <Rect x={x+w-9} y={y+h*0.38} width={6} height={h*0.24} fill="#8a7868" cornerRadius={1} />
        </>
      )}
    </Group>
  );
}

// ─── BIN — round waste bin with rim ──────────────────────────────────────────
function SketchBin({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const cx = x + w / 2, cy = y + h / 2;
  const rx = w / 2, ry = h / 2;
  return (
    <Group key={item.id} listening={false}>
      <Shadow x={x} y={y} w={w} h={h} r={rx} />
      {/* Body */}
      <Ellipse x={cx} y={cy} radiusX={rx} radiusY={ry} fill="#b8c4c8" stroke="#809098" strokeWidth={1.5} />
      {/* Inner (open top) */}
      <Ellipse x={cx} y={cy} radiusX={rx*0.72} radiusY={ry*0.72} fill="#98aab0" />
      {/* Rim highlight */}
      <Ellipse x={cx} y={cy} radiusX={rx} radiusY={ry} fill="transparent" stroke="#c8d4d8" strokeWidth={2} opacity={0.5} />
      {/* Bag/liner fold lines */}
      {[-0.25, 0, 0.25].map((off) => (
        <Line key={`fold-${off}`} points={[cx + off*rx*0.5, cy - ry*0.55, cx + off*rx*0.5, cy + ry*0.55]}
          stroke="#809098" strokeWidth={0.7} opacity={0.4} listening={false} />
      ))}
    </Group>
  );
}

// ─── PALLET — wooden pallet with boards and runners ──────────────────────────
function SketchPallet({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const boardCount = Math.max(2, Math.floor(w / 16));
  const bw = w / boardCount;
  const runnerH = Math.max(4, h * 0.22);
  return (
    <Group key={item.id} listening={false}>
      <Shadow x={x} y={y} w={w} h={h} />
      {/* Boards (top surface) */}
      {Array.from({ length: boardCount }, (_, i) => (
        <Rect key={i}
          x={x + i*bw + 1} y={y+runnerH}
          width={bw-2} height={h - runnerH*2}
          fill={i % 2 === 0 ? '#c8a870' : '#b89860'}
          stroke="#906840" strokeWidth={0.6}
        />
      ))}
      {/* Runners (top and bottom horizontal supports) */}
      <Rect x={x} y={y} width={w} height={runnerH} fill="#8a6030" />
      <Rect x={x} y={y+h-runnerH} width={w} height={runnerH} fill="#8a6030" />
      {/* Center runner */}
      <Rect x={x} y={y+h/2-runnerH/2} width={w} height={runnerH} fill="#8a6030" />
    </Group>
  );
}

// ─── HUMAN — person silhouette (top-down) ────────────────────────────────────
function SketchHuman({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const cx = x + w / 2, cy = y + h / 2;
  const headR = Math.min(w, h) * 0.2;
  const bodyW = w * 0.45;
  const bodyH = h * 0.5;
  return (
    <Group key={item.id} listening={false}>
      <Shadow x={x} y={y} w={w} h={h} r={headR} />
      {/* Shadow circle */}
      <Ellipse x={cx + SHADOW_X/2} y={cy + h*0.1 + SHADOW_Y/2}
        radiusX={w*0.42} radiusY={h*0.38} fill={PALETTE.shadow} opacity={0.5} />
      {/* Body */}
      <Ellipse x={cx} y={cy + h*0.1} radiusX={bodyW/2} radiusY={bodyH/2} fill="#d8c8b8" stroke="#b0a090" strokeWidth={1} />
      {/* Shoulders */}
      <Ellipse x={cx - w*0.28} y={cy} radiusX={w*0.15} radiusY={h*0.12} fill="#c8b8a8" stroke="#b0a090" strokeWidth={0.8} />
      <Ellipse x={cx + w*0.28} y={cy} radiusX={w*0.15} radiusY={h*0.12} fill="#c8b8a8" stroke="#b0a090" strokeWidth={0.8} />
      {/* Head */}
      <Circle x={cx} y={cy - h*0.22} radius={headR} fill="#e8d8c8" stroke="#b0a090" strokeWidth={1} />
      {/* Face dots */}
      <Circle x={cx - headR*0.3} y={cy - h*0.24} radius={headR*0.12} fill="#906858" />
      <Circle x={cx + headR*0.3} y={cy - h*0.24} radius={headR*0.12} fill="#906858" />
      <Arc x={cx} y={cy - h*0.19} innerRadius={headR*0.22} outerRadius={headR*0.22}
        angle={130} rotation={25} stroke="#906858" strokeWidth={1} />
    </Group>
  );
}

// ─── STAIRS — progressive step bands with arrow ───────────────────────────────
function SketchStairs({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const steps = Math.max(3, Math.min(8, Math.floor(h / 14)));
  return (
    <Group key={item.id} listening={false}>
      <Shadow x={x} y={y} w={w} h={h} />
      {/* Step bands (lighter at top = higher) */}
      {Array.from({ length: steps }, (_, i) => {
        const yy = y + (i / steps) * h;
        const bh = h / steps;
        const bright = 1 - (i / (steps - 1)) * 0.35;
        const r = Math.round(240 * bright), g = Math.round(220 * bright), b = Math.round(190 * bright);
        return (
          <Rect key={i} x={x} y={yy} width={w} height={bh}
            fill={`rgb(${r},${g},${b})`} strokeEnabled={false} />
        );
      })}
      {/* Step edge lines */}
      {Array.from({ length: steps - 1 }, (_, i) => {
        const yy = y + ((i+1)/steps)*h;
        return <Line key={i} points={[x, yy, x+w, yy]} stroke="#a07830" strokeWidth={1.2} listening={false} />;
      })}
      {/* Outer border */}
      <Rect x={x} y={y} width={w} height={h} fill="transparent" stroke="#a07830" strokeWidth={1.5} />
      {/* Direction arrow — points toward the high/up end (top edge of stair) */}
      {(() => {
        const cx = x + w / 2;
        const arrowLen = Math.min(h * 0.38, w * 0.38, 22);
        const headSize = Math.max(3, arrowLen * 0.32);
        const tipY  = y + h * 0.18;
        const tailY = tipY + arrowLen;
        return <>
          <Line points={[cx, tailY, cx, tipY]} stroke="#92400e" strokeWidth={2} lineCap="round" opacity={0.85} listening={false} />
          <Line points={[cx - headSize, tipY + headSize, cx, tipY, cx + headSize, tipY + headSize]}
            stroke="#92400e" strokeWidth={2} lineCap="round" lineJoin="round" opacity={0.85} listening={false} />
        </>;
      })()}
    </Group>
  );
}

// ─── ELEVATOR — shaft with doors ─────────────────────────────────────────────
function SketchElevator({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const cx = x + w/2, cy = y + h/2;
  const doorGap = 2;
  const doorW = (w * 0.56) / 2 - doorGap / 2;
  const doorH = h * 0.62;
  const doorY = y + h * 0.18;
  return (
    <Group key={item.id} listening={false}>
      <Block x={x} y={y} w={w} h={h} rise={12} topFill="#ede9fe" faceFill="#7e22ce" topStroke="#7e22ce" />
      {/* Shaft surround */}
      <Rect x={x+w*0.12} y={doorY-3} width={w*0.76} height={doorH+6} fill="#c8b8e8" stroke="#7e22ce" strokeWidth={1} cornerRadius={1} />
      {/* Left door */}
      <Rect x={x+w*0.12} y={doorY} width={doorW} height={doorH} fill="#d8ccf0" stroke="#9060d0" strokeWidth={0.8} />
      {/* Right door */}
      <Rect x={cx+doorGap/2} y={doorY} width={doorW} height={doorH} fill="#d8ccf0" stroke="#9060d0" strokeWidth={0.8} />
      {/* Door gap line */}
      <Line points={[cx, doorY, cx, doorY+doorH]} stroke="#7e22ce" strokeWidth={1.5} listening={false} />
      {/* Up/down arrow indicator */}
      <Line points={[cx, cy-h*0.08, cx-w*0.12, cy+h*0.04, cx+w*0.12, cy+h*0.04]} closed
        stroke="#7e22ce" strokeWidth={1} fill="rgba(126,34,206,0.2)" listening={false} />
      <Line points={[cx, cy+h*0.08, cx-w*0.12, cy-h*0.04, cx+w*0.12, cy-h*0.04]} closed
        stroke="#7e22ce" strokeWidth={1} fill="rgba(126,34,206,0.2)" listening={false} />
    </Group>
  );
}

// ─── BATHROOM — tiled floor + toilet + sink suggestion ────────────────────────
function SketchBathroom({ item }: { readonly item: FurnitureRenderItem }) {
  const { x, y, w, h } = item;
  const tileSize = Math.max(8, Math.min(14, Math.min(w,h) / 6));
  return (
    <Group key={item.id} listening={false}>
      <Shadow x={x} y={y} w={w} h={h} />
      {/* Tiled floor */}
      <Rect x={x} y={y} width={w} height={h} fill="#e8f0f4" stroke="#0369a1" strokeWidth={1.5} />
      {Array.from({ length: Math.ceil(w / tileSize) + 1 }, (_, i) => (
        <Line key={`tv${i}`} points={[x+i*tileSize, y, x+i*tileSize, y+h]} stroke="#c0d0dc" strokeWidth={0.6} opacity={0.6} listening={false} />
      ))}
      {Array.from({ length: Math.ceil(h / tileSize) + 1 }, (_, i) => (
        <Line key={`th${i}`} points={[x, y+i*tileSize, x+w, y+i*tileSize]} stroke="#c0d0dc" strokeWidth={0.6} opacity={0.6} listening={false} />
      ))}
      {/* Toilet (top) */}
      {h > 40 && (
        <Group listening={false}>
          <Rect x={x+w*0.15} y={y+4} width={w*0.7} height={h*0.28} fill="#e0e8f0" stroke="#0369a1" strokeWidth={1} cornerRadius={2} />
          <Rect x={x+w*0.2} y={y+h*0.28+2} width={w*0.6} height={h*0.38}
            fill="#eef4f8" stroke="#0369a1" strokeWidth={1} cornerRadius={[0,0,w*0.25,w*0.25]} />
        </Group>
      )}
      {/* Sink (bottom) */}
      {h > 50 && (
        <Group listening={false}>
          <Rect x={x+w*0.2} y={y+h*0.72} width={w*0.6} height={h*0.22}
            fill="#d8e8f0" stroke="#0369a1" strokeWidth={1}
            cornerRadius={Math.min(w*0.25, h*0.1)} />
          <Circle x={x+w*0.5} y={y+h*0.83} radius={Math.max(2, w*0.06)} fill="#0369a1" opacity={0.6} />
        </Group>
      )}
    </Group>
  );
}

// ─── OPENING: Door / Window / Entrance ───────────────────────────────────────
function SketchOpening({ item }: { readonly item: OpeningRenderItem }) {
  if (item.subtype === 'window') {
    const hw = item.width / 2;
    const ht = Math.min(Math.max(6, item.height), 14) / 2;
    return (
      <Group key={item.id} x={item.x} y={item.y} rotation={item.rotation} listening={false}>
        <Rect x={-hw} y={-ht-2} width={item.width} height={(ht+2)*2} fill={PALETTE.floor} />
        <Rect x={-hw} y={-ht} width={item.width} height={ht*2} fill={PALETTE.windowGlass} opacity={0.55} />
        <Line points={[-hw,-ht, hw,-ht]} stroke={PALETTE.windowFrame} strokeWidth={1.5} />
        <Line points={[-hw, ht, hw, ht]} stroke={PALETTE.windowFrame} strokeWidth={1.5} />
        <Line points={[0,-ht, 0,ht]} stroke={PALETTE.windowFrame} strokeWidth={0.9} opacity={0.7} />
      </Group>
    );
  }
  const hw = item.width / 2;
  const swingRight = item.swingDirection !== 'left';
  const arcRot = swingRight ? -135 : 180;
  return (
    <Group key={item.id} x={item.x} y={item.y} rotation={item.rotation} listening={false}>
      <Rect x={-hw} y={-10} width={item.width} height={20} fill={PALETTE.floor} />
      <Line points={[-hw,0, hw,0]} stroke={PALETTE.doorPanel} strokeWidth={3.5} lineCap="round" />
      <Arc x={0} y={0} innerRadius={0} outerRadius={hw}
        angle={135} rotation={arcRot}
        stroke={PALETTE.doorArc} strokeWidth={0.9} dash={[3,2]} fill={PALETTE.doorFill} />
    </Group>
  );
}

// ─── MARKER ───────────────────────────────────────────────────────────────────
function SketchMarker({ item }: { readonly item: MarkerRenderItem }) {
  return (
    <Group key={item.id} listening={false}>
      <Circle x={item.x} y={item.y} radius={14} fill={PALETTE.markerGlow} />
      <Circle x={item.x} y={item.y} radius={7}  fill={PALETTE.markerFill} opacity={0.9} />
      <Circle x={item.x} y={item.y} radius={3}  fill="white" opacity={0.9} />
    </Group>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
function SketchFurniture({ item }: { readonly item: FurnitureRenderItem }) {
  switch (item.subtype) {
    case 'rack':         return <SketchRack item={item} />;
    case 'shelf':        return <SketchShelf item={item} />;
    case 'work-surface': return <SketchWorkSurface item={item} />;
    case 'chair':        return <SketchChair item={item} />;
    case 'cabinet':      return <SketchCabinet item={item} />;
    case 'drawer':       return <SketchDrawer item={item} />;
    case 'locker':       return <SketchLocker item={item} />;
    case 'storage-box':  return <SketchStorageBox item={item} />;
    case 'bin':          return <SketchBin item={item} />;
    case 'pallet':       return <SketchPallet item={item} />;
    case 'human':        return <SketchHuman item={item} />;
    case 'stairs':       return <SketchStairs item={item} />;
    case 'elevator':     return <SketchElevator item={item} />;
    case 'bathroom':     return <SketchBathroom item={item} />;
    // Generic block for unlisted types
    default: return (
      <Group key={item.id} listening={false}>
        <Block x={item.x} y={item.y} w={item.w} h={item.h}
          topFill={item.fill ?? PALETTE.furnitureTop}
          faceFill={PALETTE.furnitureFace}
          topStroke={PALETTE.furnitureStroke}
        />
        {item.label && item.w > 28 && item.h > 14 && (
          <Text text={item.label.length > 10 ? `${item.label.slice(0,9)}…` : item.label}
            x={item.x+2} y={item.y + item.h/2 - 5} width={item.w-4} align="center"
            fontSize={Math.max(6, Math.min(9, item.h/4))} fill="#556070" opacity={0.75} listening={false} />
        )}
      </Group>
    );
  }
}

// ─── Floor grid ───────────────────────────────────────────────────────────────
const FloorGrid = memo(function FloorGrid({ w, h }: { readonly w: number; readonly h: number }) {
  const lines = useMemo(() => {
    const out: React.ReactNode[] = [];
    const step = 60;
    for (let x = step; x < w; x += step)
      out.push(<Line key={`v${x}`} points={[x,0,x,h]} stroke={PALETTE.floorLine} strokeWidth={0.5} opacity={0.55} listening={false} />);
    for (let y = step; y < h; y += step)
      out.push(<Line key={`h${y}`} points={[0,y,w,y]} stroke={PALETTE.floorLine} strokeWidth={0.5} opacity={0.55} listening={false} />);
    return out;
  }, [w, h]);
  return (
    <>
      <Rect x={0} y={0} width={w} height={h} fill={PALETTE.floor} listening={false} />
      {lines}
    </>
  );
});

// ─── Rotation wrapper (furniture only) ───────────────────────────────────────
function WithRotation({ item, children }: { readonly item: FurnitureRenderItem; readonly children: React.ReactNode }) {
  if (!item.rotation) return <>{children}</>;
  const cx = item.x + item.w / 2, cy = item.y + item.h / 2;
  return (
    <Group x={cx} y={cy} rotation={item.rotation} listening={false}>
      <Group x={-cx} y={-cy} listening={false}>{children}</Group>
    </Group>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  readonly objects: FloorPlanObject[];
  readonly planWidth?: number;
  readonly planHeight?: number;
  readonly width?: number;
  readonly height?: number;
}

export default memo(function FloorPlanSketch25DView({
  objects, planWidth = 800, planHeight = 600, width = 900, height = 650,
}: Props) {
  const groups = useMemo(() => planToSketch25DGroups(objects), [objects]);
  const bounds = useMemo(() => computeSketch25DBounds(objects, planWidth, planHeight), [objects, planWidth, planHeight]);

  const pad = 52;
  const contentW = Math.max(1, bounds.maxX - bounds.minX);
  const contentH = Math.max(1, bounds.maxY - bounds.minY);
  const fitScale = Math.min((width - pad*2) / contentW, (height - pad*2) / contentH);
  const offsetX = (width - contentW * fitScale) / 2 - bounds.minX * fitScale;
  const offsetY = (height - contentH * fitScale) / 2 - bounds.minY * fitScale;
  const gProps = { x: offsetX, y: offsetY, scaleX: fitScale, scaleY: fitScale, listening: false as const };

  return (
    <Stage width={width} height={height} listening={false}>
      <Layer listening={false}>
        <Group {...gProps}><FloorGrid w={planWidth} h={planHeight} /></Group>
      </Layer>
      <Layer listening={false}>
        <Group {...gProps}>{groups.rooms.map(item => <SketchRoom key={item.id} item={item} />)}</Group>
      </Layer>
      <Layer listening={false}>
        <Group {...gProps}>
          {groups.furniture.map(item => (
            <WithRotation key={item.id} item={item}><SketchFurniture item={item} /></WithRotation>
          ))}
        </Group>
      </Layer>
      <Layer listening={false}>
        <Group {...gProps}>{groups.indoorWalls.map(item => <SketchWall key={item.id} item={item} />)}</Group>
      </Layer>
      <Layer listening={false}>
        <Group {...gProps}>{groups.outdoorWalls.map(item => <SketchWall key={item.id} item={item} />)}</Group>
      </Layer>
      <Layer listening={false}>
        <Group {...gProps}>{groups.openings.map(item => <SketchOpening key={item.id} item={item} />)}</Group>
      </Layer>
      <Layer listening={false}>
        <Group {...gProps}>{groups.markers.map(item => <SketchMarker key={item.id} item={item} />)}</Group>
      </Layer>
      <Layer listening={false}>
        <Group {...gProps}>
          {groups.labels.map((item: LabelRenderItem) => (
            <Text key={item.id} x={item.x} y={item.y} text={item.text}
              fontSize={item.fontSize} fill={item.color ?? '#334155'} listening={false} />
          ))}
        </Group>
      </Layer>
    </Stage>
  );
});
