import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stage, Layer, Rect, Line, Group, Text, Circle } from 'react-konva';
import Konva from 'konva';
import { floorPlansApi } from '@/services/api';
import type { FloorPlan } from '@/types/floorplan';
import { Lock, Building2, RefreshCw, ZoomIn, ZoomOut, Maximize2, Layers, Box } from 'lucide-react';

// ─── facade constants ─────────────────────────────────────────────────────────
const BUILDING_W      = 220;
const FLOOR_H         = 90;
const FLOOR_BORDER    = 6;
const WINDOW_W        = 36;
const WINDOW_H        = 50;
const WINDOW_GAP      = 14;
const WINDOWS_PER_FLOOR = 4;
const BUILDING_GAP    = 60;
const ROOF_H          = 22;
const GROUND_H        = 18;
const SHADOW_W        = 12;
const START_X         = 60;
const START_Y         = 40;

// ─── isometric constants ──────────────────────────────────────────────────────
const ISO_TW           = 2.8;
const ISO_TH           = 1.4;
const ISO_FLOOR_SEP    = 90;    // gap between floors in All mode
const ISO_BUILDING_SEP = 520;
const ISO_PLAN_SIZE    = 480;   // iso footprint side in screen px
const ISO_WALL_H       = 28;    // extruded wall face height in px

// ─── iso visual style constants ───────────────────────────────────────────────
const ISO_STYLE = {
  selectedFloorAlpha:  1.0,
  ghostFloorAlpha:     0.20,
  idleFloorAlpha:      0.38,    // all-mode, nothing hovered
  outdoorWallH:        42,
  indoorWallH:         13,
  frontWallH:          5,
  frontWallAlpha:      0.18,
  sideWallH:           24,
  sideWallAlpha:       0.7,
  backWallH:           42,
  backWallAlpha:       0.92,
} as const;

// ─── stable computed data ─────────────────────────────────────────────────────
const TOTAL_WIN_W = WINDOWS_PER_FLOOR * WINDOW_W + (WINDOWS_PER_FLOOR - 1) * WINDOW_GAP;
const WIN_OFFSETS = Array.from({ length: WINDOWS_PER_FLOOR }, (_, i) => i * (WINDOW_W + WINDOW_GAP));

const BG_BUILDINGS = [
  { id: 'bg-a', x: 20,  w: 40, h: 120 },
  { id: 'bg-b', x: 70,  w: 30, h: 90  },
  { id: 'bg-c', x: 110, w: 50, h: 150 },
  { id: 'bg-d', x: 170, w: 25, h: 80  },
];

const ROAD_DASHES = Array.from({ length: 12 }, (_, i) => i * 80 + 20);

// ─── outdoor-wall helpers ─────────────────────────────────────────────────────
interface ScaledWall { x1: number; y1: number; x2: number; y2: number; thickness: number; }

/** Extract walls that form the outdoor perimeter of a finalized plan. */
function getOutdoorWalls(plan: FloorPlan): ScaledWall[] {
  const objects = plan.objects ?? [];
  const walls = (objects.filter(o => o.type === 'wall') as import('@/types/floorplan').WallObject[])
    .filter(w =>
      w.wallType === 'floor_original_outdoor'
      || w.wallType === 'finalized_building_perimeter'
      || w.isFinalizedPerimeter === true
    );
  if (walls.length === 0) return [];

  // Bounding box of all outdoor wall endpoints
  const xs = walls.flatMap(w => [w.startX, w.endX]);
  const ys = walls.flatMap(w => [w.startY, w.endY]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  // Scale into the facade cell with padding
  const pad = 8;
  const scX = (BUILDING_W - pad * 2) / rangeX;
  const scY = (FLOOR_H - pad * 2) / rangeY;
  const sc  = Math.min(scX, scY);

  // Centre the scaled outline in the cell
  const scaledW = rangeX * sc;
  const scaledH = rangeY * sc;
  const offX = pad + (BUILDING_W - pad * 2 - scaledW) / 2;
  const offY = pad + (FLOOR_H   - pad * 2 - scaledH) / 2;

  return walls.map(w => ({
    x1: offX + (w.startX - minX) * sc,
    y1: offY + (w.startY - minY) * sc,
    x2: offX + (w.endX   - minX) * sc,
    y2: offY + (w.endY   - minY) * sc,
    thickness: Math.max(1, (w.thickness ?? 8) * sc * 0.35),
  }));
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function scoreColor(score?: number | null): string {
  if (!score) return '#64748b';
  if (score >= 95) return '#22c55e';
  if (score >= 80) return '#84cc16';
  if (score >= 70) return '#eab308';
  return '#f97316';
}
function scoreLabel(score?: number | null): string {
  if (!score) return '—';
  if (score >= 95) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  return 'Weak';
}

interface IsoRect  { x: number; y: number; w: number; h: number; }
interface PlanSize  { planW: number; planH: number; }
interface IsoOrigin { originX: number; originY: number; }

/** Map a plan coordinate (0..planW, 0..planH) to isometric screen offset from origin. */
function toIso(wx: number, wy: number, planW: number, planH: number): [number, number] {
  const nx = wx / planW - 0.5;
  const ny = wy / planH - 0.5;
  const halfW = ISO_PLAN_SIZE * ISO_TW / 2;
  const halfH = ISO_PLAN_SIZE * ISO_TH / 2;
  return [
    (nx - ny) * halfW,
    (nx + ny) * halfH,
  ];
}

/** Convert a rectangle's four corners to a flat iso point array offset to canvas position. */
function rectToIsoPts(rect: IsoRect, size: PlanSize, origin: IsoOrigin): number[] {
  const { x, y, w, h } = rect;
  const { planW, planH } = size;
  return [
    [x,     y    ],
    [x + w, y    ],
    [x + w, y + h],
    [x,     y + h],
  ].flatMap(([cx, cy]) => {
    const [ix, iy] = toIso(cx, cy, planW, planH);
    return [origin.originX + ix, origin.originY + iy];
  });
}

/** The four corners of the full plan footprint in iso screen coords. */
function planCorners(planW: number, planH: number, ox: number, oy: number): [number,number][] {
  return ([
    [0,     0    ],
    [planW, 0    ],
    [planW, planH],
    [0,     planH],
  ] as [number,number][]).map(([x, y]) => {
    const [ix, iy] = toIso(x, y, planW, planH);
    return [ox + ix, oy + iy] as [number, number];
  });
}

type Pt = [number, number];

/**
 * Given a set of wall segments (pairs of endpoints), chain them into an
 * ordered polygon by greedily connecting endpoints within `snap` px.
 * Returns a flat number array suitable for Konva Line points, or null if
 * fewer than 3 unique vertices are found.
 */
function chainWallsToPolygon(
  walls: import('@/types/floorplan').WallObject[],
  planW: number, planH: number,
  ox: number, oy: number,
  snap = 4,
): number[] | null {
  if (walls.length === 0) return null;

  // Project every segment endpoint into iso screen space
  const segs: [Pt, Pt][] = walls.map(w => {
    const [ax, ay] = toIso(w.startX, w.startY, planW, planH);
    const [bx, by] = toIso(w.endX,   w.endY,   planW, planH);
    return [[ox + ax, oy + ay], [ox + bx, oy + by]];
  });

  // Greedily chain segments into a single polyline
  const used = new Array(segs.length).fill(false);
  const chain: Pt[] = [...segs[0]];
  used[0] = true;

  for (let iter = 0; iter < segs.length; iter++) {
    const tail = chain[chain.length - 1];
    let found = false;
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      const [a, b] = segs[i];
      const distA = Math.hypot(a[0] - tail[0], a[1] - tail[1]);
      const distB = Math.hypot(b[0] - tail[0], b[1] - tail[1]);
      if (distA <= snap) { chain.push(b); used[i] = true; found = true; break; }
      if (distB <= snap) { chain.push(a); used[i] = true; found = true; break; }
    }
    if (!found) break;
  }

  if (chain.length < 3) return null;
  return chain.flatMap(([x, y]) => [x, y]);
}

// ─── window sub-components (keep nesting ≤ 4 levels) ─────────────────────────
interface FloorWindowProps {
  readonly planId: string; readonly winIndex: number;
  readonly bx: number; readonly floorTop: number;
  readonly frameFill: string; readonly glassOpacity: number;
}
function FloorWindow({ planId, winIndex, bx, floorTop, frameFill, glassOpacity }: FloorWindowProps) {
  const winStartX = bx + (BUILDING_W - TOTAL_WIN_W) / 2;
  const wx = winStartX + WIN_OFFSETS[winIndex];
  const wy = floorTop + (FLOOR_H - WINDOW_H) / 2;
  return (
    <Group key={`win-${planId}-${winIndex}`}>
      <Rect x={wx - 2} y={wy - 2} width={WINDOW_W + 4} height={WINDOW_H + 4}
        fill={frameFill} cornerRadius={1} />
      <Rect x={wx} y={wy} width={WINDOW_W} height={WINDOW_H}
        fill="#7dd3fc" opacity={glassOpacity} cornerRadius={1} />
      <Line points={[wx + 3, wy + 4, wx + 10, wy + 14]}
        stroke="white" strokeWidth={1.5} opacity={0.4} lineCap="round" />
      <Line points={[wx, wy + WINDOW_H / 2, wx + WINDOW_W, wy + WINDOW_H / 2]}
        stroke={frameFill} strokeWidth={1.5} opacity={0.6} />
    </Group>
  );
}

interface EmptyWindowProps {
  readonly buildingKey: string; readonly floor: number; readonly winIndex: number;
  readonly bx: number; readonly floorTop: number;
}
function EmptyWindow({ buildingKey, floor, winIndex, bx, floorTop }: EmptyWindowProps) {
  const winStartX = bx + (BUILDING_W - TOTAL_WIN_W) / 2;
  const wx = winStartX + WIN_OFFSETS[winIndex];
  const wy = floorTop + (FLOOR_H - WINDOW_H) / 2;
  return (
    <Group key={`ewin-${buildingKey}-${floor}-${winIndex}`}>
      <Rect x={wx - 2} y={wy - 2} width={WINDOW_W + 4} height={WINDOW_H + 4}
        fill="#374151" cornerRadius={1} />
      <Rect x={wx} y={wy} width={WINDOW_W} height={WINDOW_H}
        fill="#1e293b" opacity={0.5} cornerRadius={1} />
    </Group>
  );
}

// ─── elevation floor band ─────────────────────────────────────────────────────
interface ElevationFloorBandProps {
  readonly plan: FloorPlan;
  readonly bx: number; readonly floorTop: number;
  readonly isFinalized: boolean;
  readonly accentColor: string; readonly frameFill: string;
  readonly overlayFill: string; readonly overlayOpacity: number;
  readonly glassOpacity: number;
  readonly outdoorWalls: ScaledWall[];
  readonly onHover: (plan: FloorPlan, e: Konva.KonvaEventObject<MouseEvent>) => void;
  readonly onHoverEnd: () => void;
  readonly onNavigate: (id: string) => void;
}
function ElevationFloorBand({
  plan, bx, floorTop, isFinalized, accentColor, frameFill,
  overlayFill, overlayOpacity, glassOpacity, outdoorWalls,
  onHover, onHoverEnd, onNavigate,
}: ElevationFloorBandProps) {
  const fn = plan.floorNumber ?? 1;
  const score = plan.generationScore;
  const hasWalls = outdoorWalls.length > 0;

  return (
    <Group
      onMouseEnter={e => onHover(plan, e)}
      onMouseLeave={onHoverEnd}
      onClick={() => onNavigate(plan.id)}
    >
      {/* Floor cell background — darker for finalized-with-walls */}
      <Rect x={bx} y={floorTop} width={BUILDING_W} height={FLOOR_H}
        fill={isFinalized && hasWalls ? '#1a2035' : overlayFill}
        opacity={isFinalized && hasWalls ? 1 : overlayOpacity}
      />

      {isFinalized && hasWalls ? (
        /* ── Finalized: draw actual outdoor wall outline ─────────────────── */
        <Group
          clipX={bx} clipY={floorTop} clipWidth={BUILDING_W} clipHeight={FLOOR_H}
        >
          {/* Faint fill showing floor footprint */}
          {outdoorWalls.map((w, i) => (
            <Line key={`fw-${plan.id}-${i}`}
              points={[bx + w.x1, floorTop + w.y1, bx + w.x2, floorTop + w.y2]}
              stroke="#3b82f6"
              strokeWidth={w.thickness}
              lineCap="round"
              lineJoin="round"
              opacity={0.9}
            />
          ))}
          {/* Blue accent glow on the walls */}
          {outdoorWalls.map((w, i) => (
            <Line key={`fw-glow-${plan.id}-${i}`}
              points={[bx + w.x1, floorTop + w.y1, bx + w.x2, floorTop + w.y2]}
              stroke="#93c5fd"
              strokeWidth={w.thickness * 0.4}
              lineCap="round"
              opacity={0.5}
            />
          ))}
        </Group>
      ) : (
        /* ── Non-finalized: generic windows ──────────────────────────────── */
        <>
          <Rect x={bx + FLOOR_BORDER} y={floorTop}
            width={BUILDING_W - FLOOR_BORDER * 2} height={FLOOR_H}
            fill={overlayFill} opacity={overlayOpacity}
          />
          {WIN_OFFSETS.map((_, wi) => (
            <FloorWindow key={`win-${plan.id}-w${wi}`}
              planId={plan.id} winIndex={wi}
              bx={bx} floorTop={floorTop}
              frameFill={frameFill} glassOpacity={glassOpacity}
            />
          ))}
        </>
      )}

      {/* Left accent stripe */}
      <Rect x={bx} y={floorTop} width={5} height={FLOOR_H}
        fill={accentColor} opacity={0.85}
      />

      {/* Score bar at bottom */}
      {score != null && (
        <Rect x={bx + 5} y={floorTop + FLOOR_H - 3}
          width={(BUILDING_W - 5) * (score / 100)} height={3}
          fill={accentColor} opacity={0.55}
        />
      )}

      {/* Floor number badge */}
      <Rect x={bx + 6} y={floorTop + 6} width={20} height={14}
        fill="#0f172a" cornerRadius={2} opacity={0.9}
      />
      <Text x={bx + 6} y={floorTop + 9} width={20} align="center"
        text={`F${fn}`} fontSize={8} fontStyle="bold" fill="#94a3b8"
      />

      {/* Score badge */}
      {score != null && (
        <>
          <Rect x={bx + BUILDING_W - 32} y={floorTop + 6} width={26} height={14}
            fill="#0f172a" cornerRadius={2} opacity={0.9}
          />
          <Text x={bx + BUILDING_W - 32} y={floorTop + 9} width={26} align="center"
            text={`${score}%`} fontSize={8} fontStyle="bold" fill={accentColor}
          />
        </>
      )}

      {/* Finalized lock */}
      {isFinalized && (
        <Text x={bx + BUILDING_W - 18} y={floorTop + FLOOR_H - 20}
          text="🔒" fontSize={11}
        />
      )}
    </Group>
  );
}

// ─── iso open-floorplan renderer ─────────────────────────────────────────────
type HoverHandler = (plan: FloorPlan, e: Konva.KonvaEventObject<MouseEvent>) => void;
type NavHandler   = (id: string) => void;

interface IsoCtx {
  hoveredId:    string | null;   // hovered plan id
  hoveredFloor: number | null;   // hovered floor number (for All mode ghosting)
  isoMode:      'single' | 'all';
  onHover:      HoverHandler;
  onHoverEnd:   () => void;
  onNavigate:   NavHandler;
}

// ── Object visual config ──────────────────────────────────────────────────────
interface ObjStyle {
  topFill: string; topStroke: string;
  sideFill: string; sideAlt: string;   // left face / right face
  zH: number;                           // extruded height in screen px
}
const OBJ_STYLE: Record<string, ObjStyle> = {
  room:  { topFill:'#1e3a5f', topStroke:'#3b82f6', sideFill:'#0f2040', sideAlt:'#0a1830', zH: 0   },
  rack:  { topFill:'#14532d', topStroke:'#22c55e', sideFill:'#0a3018', sideAlt:'#071f10', zH: 44  },
  shelf: { topFill:'#3b1f0a', topStroke:'#f97316', sideFill:'#221108', sideAlt:'#180c06', zH: 28  },
};

// ── Depth key: sum of back-left corner coords (iso painter's sort) ────────────
function depthKey(x: number, y: number) { return x + y; }

// ── Build left/right extruded face pts for a rect object ─────────────────────
function extrudedFaces(
  rx: number, ry: number, rw: number, rh: number,
  planW: number, planH: number, ox: number, oy: number,
  zH: number,
): { left: number[]; right: number[] } {
  const isoCorner = ([cx, cy]: [number,number]): Pt => {
    const [ix, iy] = toIso(cx, cy, planW, planH);
    return [ox + ix, oy + iy];
  };
  const tr = isoCorner([rx + rw, ry     ]);
  const br = isoCorner([rx + rw, ry + rh]);
  const bl = isoCorner([rx,      ry + rh]);

  // Left face: bl → br (front-left edge) extruded down
  const left = [
    bl[0], bl[1],
    br[0], br[1],
    br[0], br[1] + zH,
    bl[0], bl[1] + zH,
  ];
  // Right face: br → tr (front-right edge) extruded down
  const right = [
    br[0], br[1],
    tr[0], tr[1],
    tr[0], tr[1] + zH,
    br[0], br[1] + zH,
  ];
  return { left, right };
}

// ── Cutaway height for a wall segment ─────────────────────────────────────────
function wallCutawayH(
  startX: number, startY: number, endX: number, endY: number,
  planH: number, isOuter: boolean,
): { h: number; alpha: number } {
  if (!isOuter) return { h: ISO_STYLE.indoorWallH, alpha: 0.55 };

  const isHorizontal = Math.abs(endX - startX) > Math.abs(endY - startY);
  const avgY = (startY + endY) / 2;
  const isFront = isHorizontal && avgY >= planH * 0.6;  // bottom 40% = front

  if (isFront)        return { h: ISO_STYLE.frontWallH, alpha: ISO_STYLE.frontWallAlpha };
  if (isHorizontal)   return { h: ISO_STYLE.backWallH,  alpha: ISO_STYLE.backWallAlpha  };
  return                     { h: ISO_STYLE.sideWallH,  alpha: ISO_STYLE.sideWallAlpha  };
}

function polygonBoundsHelper(pts: number[]) {
  const xs = pts.filter((_, i) => i % 2 === 0);
  const ys = pts.filter((_, i) => i % 2 !== 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

interface IsoFloorResult { visual: React.ReactNode; hit: React.ReactNode; }

function buildIsoFloorNodes(
  plan: FloorPlan,
  ox: number, oy: number,
  ctx: IsoCtx,
  floorAlpha: number,
  showObjects: boolean,
): IsoFloorResult {
  const fn          = plan.floorNumber ?? 1;
  const isFinalized = !!plan.isApproved;
  const isHovered   = ctx.hoveredId === plan.id;
  const accentColor = isFinalized ? '#3b82f6' : scoreColor(plan.generationScore);
  const planW = plan.width  || 800;
  const planH = plan.height || 600;

  const corners = planCorners(planW, planH, ox, oy);
  const [tl, tr] = corners;
  const footprintPts = corners.flatMap(([x, y]) => [x, y]);

  const size: PlanSize    = { planW, planH };
  const origin: IsoOrigin = { originX: ox, originY: oy };
  const objects = plan.objects ?? [];

  // ── Perimeter polygon for finalized plans ─────────────────────────────────
  const outerWalls = (objects.filter(o => o.type === 'wall') as import('@/types/floorplan').WallObject[])
    .filter(w => w.wallType === 'floor_original_outdoor'
             || w.wallType === 'finalized_building_perimeter'
             || w.isFinalizedPerimeter === true);
  const perimPts    = chainWallsToPolygon(outerWalls, planW, planH, ox, oy);
  const topFacePts  = (isFinalized && perimPts) ? perimPts : footprintPts;

  let floorFill: string;
  if (isFinalized) {
    floorFill = isHovered ? '#1a3566' : '#0e1e42';
  } else {
    floorFill = isHovered ? '#253347' : '#0d1520';
  }

  // ── Build depth-sorted render queue ──────────────────────────────────────
  type RQ = { depth: number; node: React.ReactNode };
  const queue: RQ[] = [];

  // Rooms (flat top-face only, used as floor zones)
  for (const obj of objects) {
    if (obj.type !== 'room') continue;
    const room = obj as import('@/types/floorplan').PolygonRoomObject;
    const b = polygonBoundsHelper(room.points);
    const pts  = rectToIsoPts({ x: b.x, y: b.y, w: b.width, h: b.height }, size, origin);
    const style = OBJ_STYLE.room;
    queue.push({
      depth: depthKey(b.x, b.y),
      node: (
        <Line key={`room-${plan.id}-${room.id}`} closed listening={false} points={pts}
          fill={style.topFill} stroke={style.topStroke} strokeWidth={0.8} opacity={0.75}
        />
      ),
    });
  }

  // Indoor walls — low cutaway
  for (const obj of objects) {
    if (obj.type !== 'wall') continue;
    const w = obj as import('@/types/floorplan').WallObject;
    const isOuter = w.wallType === 'floor_original_outdoor'
      || w.wallType === 'finalized_building_perimeter'
      || w.isFinalizedPerimeter === true;
    if (isOuter) continue; // handled separately

    const [x1, y1] = toIso(w.startX, w.startY, planW, planH);
    const [x2, y2] = toIso(w.endX,   w.endY,   planW, planH);
    const { h, alpha } = wallCutawayH(w.startX, w.startY, w.endX, w.endY, planH, false);
    const thick = Math.max(1, (w.thickness ?? 8) / planW * ISO_PLAN_SIZE * 0.3);

    // Extruded wall ribbon: quad from the two base points lifted by h
    const sx = ox + x1; const sy = oy + y1;
    const ex = ox + x2; const ey = oy + y2;
    queue.push({
      depth: depthKey(w.startX + w.endX, w.startY + w.endY) / 2,
      node: (
        <Group key={`iwall-${plan.id}-${w.id}`} listening={false}>
          <Line closed
            points={[sx, sy, ex, ey, ex, ey - h, sx, sy - h]}
            fill="#1e293b" stroke="#334155" strokeWidth={0.5} opacity={alpha}
          />
          <Line points={[sx, sy - h, ex, ey - h]}
            stroke="#475569" strokeWidth={thick * 0.6} opacity={alpha * 0.8} lineCap="round"
          />
        </Group>
      ),
    });
  }

  // Racks and shelves — extruded volumes
  for (const obj of objects) {
    if (obj.type !== 'rack' && obj.type !== 'shelf') continue;
    const rect  = obj as import('@/types/floorplan').RectangleObject;
    const style = OBJ_STYLE[rect.type];
    const topPts = rectToIsoPts({ x: rect.x, y: rect.y, w: rect.width, h: rect.height }, size, origin);
    const { left: leftFace, right: rightFace } = extrudedFaces(
      rect.x, rect.y, rect.width, rect.height, planW, planH, ox, oy, style.zH
    );
    // Lift top face by zH
    const liftedTop = [];
    for (let i = 0; i < topPts.length; i += 2) {
      liftedTop.push(topPts[i], topPts[i + 1] - style.zH);
    }

    queue.push({
      depth: depthKey(rect.x, rect.y) + rect.width + rect.height,
      node: (
        <Group key={`obj-${plan.id}-${rect.id}`} listening={false}>
          <Line closed points={leftFace}
            fill={style.sideFill} stroke={style.topStroke} strokeWidth={0.5} opacity={0.9}
          />
          <Line closed points={rightFace}
            fill={style.sideAlt} stroke={style.topStroke} strokeWidth={0.5} opacity={0.8}
          />
          <Line closed points={liftedTop}
            fill={style.topFill} stroke={style.topStroke} strokeWidth={0.8} opacity={0.95}
          />
        </Group>
      ),
    });
  }

  // Outdoor wall cutaway extrusion (per segment, direction-aware height)
  for (const w of outerWalls) {
    const [x1, y1] = toIso(w.startX, w.startY, planW, planH);
    const [x2, y2] = toIso(w.endX,   w.endY,   planW, planH);
    const sx = ox + x1; const sy = oy + y1;
    const ex = ox + x2; const ey = oy + y2;
    const { h, alpha } = wallCutawayH(w.startX, w.startY, w.endX, w.endY, planH, true);
    const wallColor = isFinalized ? '#1e3a8a' : '#1e293b';
    const edgeColor = isFinalized ? '#60a5fa' : '#94a3b8';

    queue.push({
      depth: depthKey(w.startX + w.endX, w.startY + w.endY) / 2 + 1,
      node: (
        <Group key={`owall-${plan.id}-${w.id}`} listening={false}>
          <Line closed
            points={[sx, sy, ex, ey, ex, ey - h, sx, sy - h]}
            fill={wallColor} stroke={edgeColor} strokeWidth={0.6} opacity={alpha}
          />
          <Line points={[sx, sy - h, ex, ey - h]}
            stroke={edgeColor} strokeWidth={1.2} opacity={alpha * 0.9} lineCap="round"
          />
        </Group>
      ),
    });
  }

  // Door / entrance markers (small gap cut in wall)
  for (const obj of objects) {
    if (obj.type !== 'door' && obj.type !== 'entrance') continue;
    const d = obj as import('@/types/floorplan').DoorObject;
    const [ix, iy] = toIso(d.x, d.y, planW, planH);
    const mx = ox + ix; const my = oy + iy;
    queue.push({
      depth: depthKey(d.x, d.y),
      node: (
        <Line key={`door-${plan.id}-${obj.id}`} closed listening={false}
          points={[mx - 5, my, mx, my - 4, mx + 5, my, mx, my + 4]}
          fill="#fbbf24" stroke="#d97706" strokeWidth={0.6} opacity={0.9}
        />
      ),
    });
  }

  // Sort by depth (back-to-front)
  queue.sort((a, b) => a.depth - b.depth);

  // ── Assemble visual + hit nodes separately ────────────────────────────────
  const labelColor = floorAlpha >= 0.7
    ? (isHovered ? '#f1f5f9' : '#94a3b8')
    : '#475569';

  const visual = (
    <Group key={`floor-visual-${plan.id}`} opacity={floorAlpha} listening={false}>
      {/* Foundation shadow */}
      <Line closed points={footprintPts}
        fill="#040810" stroke="#0f172a" strokeWidth={0.5} opacity={0.6}
      />
      {/* Floor slab */}
      <Line closed points={topFacePts}
        fill={floorFill} stroke={accentColor}
        strokeWidth={isHovered ? 2 : 1.2}
      />
      {/* Depth-sorted content */}
      {showObjects && queue.map(item => item.node)}
      {/* Label */}
      <Text
        x={tl[0] + (tr[0] - tl[0]) * 0.08}
        y={tl[1] + (tr[1] - tl[1]) * 0.08 - 16}
        text={`F${fn}${isFinalized ? ' 🔒' : ''}`}
        fontSize={floorAlpha >= 0.7 ? 12 : 10} fontStyle="bold"
        fill={labelColor}
      />
    </Group>
  );

  // Invisible hit polygon — full rectangular footprint, always same size per floor
  const hit = (
    <Line key={`floor-hit-${plan.id}`} closed
      points={footprintPts}
      fill="rgba(0,0,0,0.001)" stroke="transparent" strokeWidth={0}
      perfectDrawEnabled={false}
      onMouseEnter={e => ctx.onHover(plan, e)}
      onMouseLeave={ctx.onHoverEnd}
      onClick={() => ctx.onNavigate(plan.id)}
    />
  );

  return { visual, hit };
}

interface IsoBuildingNodes {
  visuals: React.ReactNode[];
  hits: React.ReactNode[];    // hit shapes — rendered in reverse order in hit layer
}

function buildIsoBuilding(
  bld: { key: string; label: string; floors: FloorPlan[] },
  bi: number,
  totalBuildings: number,
  centerX: number,
  baseY: number,
  ctx: IsoCtx,
  floorFilter: number | null = null,
): IsoBuildingNodes {
  const bOffX = centerX + (bi - totalBuildings / 2 + 0.5) * ISO_BUILDING_SEP;
  const isSingleMode = ctx.isoMode === 'single';

  const filtered = floorFilter === null
    ? bld.floors
    : bld.floors.filter(p => (p.floorNumber ?? 1) === floorFilter);
  const sorted = [...filtered].sort((a, b) => (a.floorNumber ?? 1) - (b.floorNumber ?? 1));

  const visuals: React.ReactNode[] = [];
  const hits: React.ReactNode[] = [];

  for (const plan of sorted) {
    const fn = plan.floorNumber ?? 1;
    const oy = isSingleMode ? baseY : baseY - (fn - 1) * ISO_FLOOR_SEP;

    let floorAlpha: number;
    let showObjects: boolean;

    if (isSingleMode) {
      floorAlpha  = ISO_STYLE.selectedFloorAlpha;
      showObjects = true;
    } else if (ctx.hoveredFloor !== null) {
      if (fn === ctx.hoveredFloor) {
        floorAlpha  = ISO_STYLE.selectedFloorAlpha;
        showObjects = true;
      } else {
        floorAlpha  = ISO_STYLE.ghostFloorAlpha;
        showObjects = false;
      }
    } else {
      floorAlpha  = ISO_STYLE.idleFloorAlpha;
      showObjects = false;
    }

    const { visual, hit } = buildIsoFloorNodes(plan, bOffX, oy, ctx, floorAlpha, showObjects);
    visuals.push(visual);
    hits.push(hit);
  }

  // Building label (visual only, non-interactive)
  visuals.push(
    <Text key={`ibl-${bld.key}`} listening={false}
      x={bOffX - 50} y={baseY + ISO_WALL_H + 14}
      width={100} align="center"
      text={bld.label} fontSize={11} fontStyle="bold" fill="#475569"
    />
  );

  return { visuals, hits };
}

// ─── types ────────────────────────────────────────────────────────────────────
interface BuildingGroup {
  key: string; label: string;
  floors: FloorPlan[]; maxFloor: number;
}
interface TooltipState { x: number; y: number; plan: FloorPlan; }

// ─── component ────────────────────────────────────────────────────────────────
export default function Building2D() {
  const navigate     = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef     = useRef<Konva.Stage>(null);

  const [allPlans, setAllPlans]       = useState<FloorPlan[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [viewMode, setViewMode]       = useState<'elevation' | 'isometric'>('elevation');
  const [tooltip, setTooltip]         = useState<TooltipState | null>(null);
  const [hoveredId, setHoveredId]     = useState<string | null>(null);
  const [hoveredFloor, setHoveredFloor] = useState<number | null>(null);
  const [scale, setScale]             = useState(1);
  const [stageSize, setStageSize]     = useState({ w: 800, h: 600 });
  const [isoFloorFilter, setIsoFloorFilter] = useState<number | null>(null); // null = all

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await floorPlansApi.getAll(false);
      setAllPlans(res.data as FloorPlan[]);
    } catch { setError('Failed to load floor plans.'); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setStageSize({ w: Math.max(400, width), h: Math.max(300, height) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const buildings = useMemo<BuildingGroup[]>(() => {
    const map = new Map<string, FloorPlan[]>();
    for (const p of allPlans) {
      if (!p.buildingKey) continue;
      const list = map.get(p.buildingKey) ?? [];
      list.push(p);
      map.set(p.buildingKey, list);
    }
    return Array.from(map.entries())
      .map(([key, floors]) => {
        const sorted = [...floors].sort((a, b) => (a.floorNumber ?? 0) - (b.floorNumber ?? 0));
        const num = key.replace(/^dept-[^-]+-building-/, '');
        return { key, label: `Building ${num}`, floors: sorted,
          maxFloor: Math.max(...sorted.map(f => f.floorNumber ?? 1)) };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [allPlans]);

  const zoom = (d: number) => setScale(s => Math.min(4, Math.max(0.2, s + d)));
  const resetZoom = () => { setScale(1); stageRef.current?.position({ x: 0, y: 0 }); };

  const handleHover = useCallback((plan: FloorPlan, e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (pos) setTooltip({ x: pos.x, y: pos.y, plan });
    setHoveredId(plan.id);
    setHoveredFloor(plan.floorNumber ?? null);
    document.body.style.cursor = 'pointer';
  }, []);

  const handleHoverEnd = useCallback(() => {
    setTooltip(null);
    setHoveredId(null);
    setHoveredFloor(null);
    document.body.style.cursor = 'default';
  }, []);

  const handleNavigate = useCallback((id: string) => {
    navigate(`/floor-plans/${id}/edit`);
  }, [navigate]);

  const maxFloors = buildings.length > 0 ? Math.max(...buildings.map(b => b.maxFloor)) : 0;

  const allFloorNumbers = useMemo(() => {
    const nums = new Set<number>();
    for (const b of buildings) for (const p of b.floors) nums.add(p.floorNumber ?? 1);
    return Array.from(nums).sort((a, b) => a - b);
  }, [buildings]);

  // ── elevation (front facade) renderer ────────────────────────────────────────
  const renderElevation = () => {
    const nodes: React.ReactNode[] = [];

    buildings.forEach((bld, bi) => {
      const bx = START_X + bi * (BUILDING_W + BUILDING_GAP);
      const totalFloors = bld.maxFloor;
      const facadeH = totalFloors * FLOOR_H;
      const facadeTop = START_Y;

      nodes.push(
        <Rect key={`facade-${bld.key}`}
          x={bx} y={facadeTop} width={BUILDING_W} height={facadeH}
          fill="#c8cdd6" stroke="#8c9099" strokeWidth={1.5}
        />,
        <Rect key={`shadow-r-${bld.key}`}
          x={bx + BUILDING_W} y={facadeTop + SHADOW_W}
          width={SHADOW_W} height={facadeH}
          fill="#8c9099" opacity={0.55}
        />,
        <Rect key={`shadow-b-${bld.key}`}
          x={bx + SHADOW_W} y={facadeTop + facadeH}
          width={BUILDING_W} height={SHADOW_W}
          fill="#8c9099" opacity={0.4}
        />,
        <Rect key={`ground-${bld.key}`}
          x={bx - 4} y={facadeTop + facadeH}
          width={BUILDING_W + 8} height={GROUND_H}
          fill="#6b7280" stroke="#4b5563" strokeWidth={1}
        />,
        <Rect key={`roof-${bld.key}`}
          x={bx - 2} y={facadeTop - ROOF_H}
          width={BUILDING_W + 4} height={ROOF_H + 2}
          fill="#374151" stroke="#1f2937" strokeWidth={1.5}
        />,
        <Rect key={`rooftop-${bld.key}`}
          x={bx + 4} y={facadeTop - ROOF_H - 5}
          width={BUILDING_W - 8} height={5}
          fill="#1f2937"
        />,
        <Text key={`blabel-${bld.key}`}
          x={bx} y={facadeTop + facadeH + GROUND_H + 10}
          width={BUILDING_W} align="center"
          text={bld.label} fontSize={11} fontStyle="bold" fill="#1e293b"
        />
      );

      // Floor dividers
      for (let f = 1; f < totalFloors; f++) {
        const lineY = facadeTop + facadeH - f * FLOOR_H;
        nodes.push(
          <Line key={`div-${bld.key}-f${f}`}
            points={[bx, lineY, bx + BUILDING_W, lineY]}
            stroke="#8c9099" strokeWidth={1} opacity={0.6}
          />
        );
      }

      // Active floor bands
      bld.floors.forEach(plan => {
        const fn = plan.floorNumber ?? 1;
        const floorTop = facadeTop + facadeH - fn * FLOOR_H;
        const isFinalized = !!plan.isApproved;
        const isHovered = hoveredId === plan.id;
        const score = plan.generationScore;
        const accentColor = isFinalized ? '#3b82f6' : scoreColor(score);
        const frameFill = isFinalized ? '#1e40af' : '#374151';

        let overlayOpacity: number;
        if (isHovered) {
          overlayOpacity = 0.18;
        } else if (isFinalized) {
          overlayOpacity = 0.1;
        } else {
          overlayOpacity = 0;
        }
        const overlayFill = isFinalized ? '#1d4ed8' : '#1e293b';
        const glassOpacity = isHovered ? 0.95 : 0.78;

        const outdoorWalls = isFinalized ? getOutdoorWalls(plan) : [];

        nodes.push(
          <ElevationFloorBand key={`floor-${plan.id}`}
            plan={plan} bx={bx} floorTop={floorTop}
            isFinalized={isFinalized}
            accentColor={accentColor} frameFill={frameFill}
            overlayFill={overlayFill} overlayOpacity={overlayOpacity}
            glassOpacity={glassOpacity}
            outdoorWalls={outdoorWalls}
            onHover={handleHover}
            onHoverEnd={handleHoverEnd}
            onNavigate={handleNavigate}
          />
        );
      });

      // Empty floor stubs
      for (let f = 1; f <= totalFloors; f++) {
        if (bld.floors.some(p => p.floorNumber === f)) continue;
        const floorTop = facadeTop + facadeH - f * FLOOR_H;
        nodes.push(
          <Group key={`empty-${bld.key}-f${f}`}>
            <Rect x={bx + FLOOR_BORDER} y={floorTop}
              width={BUILDING_W - FLOOR_BORDER * 2} height={FLOOR_H}
              fill="#111827" opacity={0.45}
            />
            {WIN_OFFSETS.map((_, wi) => (
              <EmptyWindow key={`ewin-${bld.key}-f${f}-w${wi}`}
                buildingKey={bld.key} floor={f} winIndex={wi}
                bx={bx} floorTop={floorTop}
              />
            ))}
            <Text x={bx + 8} y={floorTop + FLOOR_H / 2 - 6}
              text={`F${f} — no plan`} fontSize={9} fill="#374151" fontStyle="italic"
            />
          </Group>
        );
      }

      // Entrance door
      const entranceW = 44;
      const entranceH = 62;
      const entranceX = bx + BUILDING_W / 2 - entranceW / 2;
      const entranceY = facadeTop + facadeH - entranceH;
      nodes.push(
        <Group key={`entrance-${bld.key}`}>
          <Rect x={entranceX - 3} y={entranceY - 2}
            width={entranceW + 6} height={entranceH + 2} fill="#374151" />
          <Rect x={entranceX} y={entranceY}
            width={entranceW / 2 - 1} height={entranceH}
            fill="#7dd3fc" opacity={0.7} cornerRadius={[2, 0, 0, 0]}
          />
          <Rect x={entranceX + entranceW / 2 + 1} y={entranceY}
            width={entranceW / 2 - 1} height={entranceH}
            fill="#7dd3fc" opacity={0.7} cornerRadius={[0, 2, 0, 0]}
          />
          <Line
            points={[bx + BUILDING_W / 2, entranceY, bx + BUILDING_W / 2, entranceY + entranceH]}
            stroke="#374151" strokeWidth={2}
          />
          <Circle x={entranceX + entranceW / 2 - 4} y={entranceY + entranceH / 2}
            radius={2.5} fill="#9ca3af" />
          <Circle x={entranceX + entranceW / 2 + 4} y={entranceY + entranceH / 2}
            radius={2.5} fill="#9ca3af" />
          <Line points={[entranceX + 4, entranceY + 8, entranceX + 10, entranceY + 22]}
            stroke="white" strokeWidth={1.5} opacity={0.35} lineCap="round" />
        </Group>
      );
    });

    // Ground + road
    const groundY = START_Y + maxFloors * FLOOR_H;
    const groundW = buildings.length > 0
      ? (buildings.length - 1) * (BUILDING_W + BUILDING_GAP) + BUILDING_W + START_X * 2
      : BUILDING_W + START_X * 2;

    nodes.push(
      <Rect key="sidewalk"
        x={0} y={groundY + GROUND_H} width={groundW + 80} height={30} fill="#4b5563"
      />,
      <Rect key="road"
        x={0} y={groundY + GROUND_H + 30} width={groundW + 80} height={20} fill="#374151"
      />,
      ...ROAD_DASHES.map(dashX => (
        <Rect key={`dash-x${dashX}`}
          x={dashX} y={groundY + GROUND_H + 36}
          width={44} height={4} fill="#6b7280" opacity={0.6}
        />
      ))
    );

    return nodes;
  };

  // ── isometric renderer — returns [visualLayer, hitLayer] ─────────────────────
  const renderIsometric = () => {
    const centerX = stageSize.w / 2;
    const baseY   = stageSize.h * 0.72;
    const isoMode: 'single' | 'all' = isoFloorFilter !== null ? 'single' : 'all';
    const ctx: IsoCtx = {
      hoveredId, hoveredFloor, isoMode,
      onHover: handleHover, onHoverEnd: handleHoverEnd, onNavigate: handleNavigate,
    };

    const allVisuals: React.ReactNode[] = [];
    // Hits collected in paint order, then reversed so front floors are on top of hit stack
    const allHits: React.ReactNode[] = [];

    for (let bi = 0; bi < buildings.length; bi++) {
      const { visuals, hits } = buildIsoBuilding(
        buildings[bi], bi, buildings.length, centerX, baseY, ctx, isoFloorFilter
      );
      allVisuals.push(...visuals);
      allHits.push(...hits);
    }

    // Reverse hits: highest floor number (painted last = visually on top) should also
    // be on top in the hit layer so it wins pointer events first
    allHits.reverse();

    return (
      <>
        {/* Visual layer — listening disabled so it never intercepts mouse */}
        <Layer listening={false}>
          {allVisuals}
        </Layer>
        {/* Hit layer — invisible polygons only, always on top */}
        <Layer>
          {allHits}
        </Layer>
      </>
    );
  };

  // ── stats ─────────────────────────────────────────────────────────────────────
  const totalFinalized = allPlans.filter(p => p.isApproved).length;
  const trackedFloors  = allPlans.filter(p => p.buildingKey).length;
  const avgScore = useMemo(() => {
    const scored = allPlans.filter(p => p.generationScore != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((s, p) => s + (p.generationScore ?? 0), 0) / scored.length);
  }, [allPlans]);

  const canvasH = START_Y + maxFloors * FLOOR_H + ROOF_H + GROUND_H + 80;
  const canvasW = START_X + buildings.length * (BUILDING_W + BUILDING_GAP) + 80;
  const hasBuildings = buildings.length > 0;

  const bgStyle = viewMode === 'elevation'
    ? {
        fillLinearGradientStartPoint: { x: 0, y: 0 },
        fillLinearGradientEndPoint: { x: 0, y: canvasH },
        fillLinearGradientColorStops: [0, '#bfdbfe', 0.6, '#dbeafe', 1, '#e0f2fe'] as (string | number)[],
      }
    : undefined;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--surface)] text-[var(--text)]">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <Building2 size={20} className="text-[var(--primary)]" />
          <div>
            <h1 className="text-lg font-bold leading-tight">2D Building View</h1>
            <p className="text-xs text-[var(--text-muted)]">
              {viewMode === 'elevation'
                ? 'Front elevation — buildings side by side, floors stacked upward'
                : 'Isometric view — floor slabs stacked per building'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Floor filter — isometric only */}
          {viewMode === 'isometric' && allFloorNumbers.length > 1 && (
            <div className="flex border border-[var(--border)] rounded overflow-hidden text-xs">
              <button
                onClick={() => setIsoFloorFilter(null)}
                className={`px-2.5 py-1.5 font-medium ${isoFloorFilter === null ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
              >
                All
              </button>
              {allFloorNumbers.map(fn => (
                <button
                  key={fn}
                  onClick={() => setIsoFloorFilter(isoFloorFilter === fn ? null : fn)}
                  className={`px-2.5 py-1.5 font-medium border-l border-[var(--border)] ${isoFloorFilter === fn ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
                >
                  F{fn}
                </button>
              ))}
            </div>
          )}

          {/* View toggle */}
          <div className="flex border border-[var(--border)] rounded overflow-hidden text-xs">
            <button
              onClick={() => setViewMode('elevation')}
              className={`px-3 py-1.5 font-medium flex items-center gap-1.5 ${viewMode === 'elevation' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
            >
              <Layers size={12} /> Elevation
            </button>
            <button
              onClick={() => setViewMode('isometric')}
              className={`px-3 py-1.5 font-medium flex items-center gap-1.5 ${viewMode === 'isometric' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
            >
              <Box size={12} /> Isometric
            </button>
          </div>

          {/* Zoom */}
          <div className="flex border border-[var(--border)] rounded overflow-hidden">
            <button onClick={() => zoom(0.15)} className="px-2 py-1.5 hover:bg-[var(--surface-2)] text-[var(--text-muted)]"><ZoomIn size={13} /></button>
            <button onClick={() => zoom(-0.15)} className="px-2 py-1.5 hover:bg-[var(--surface-2)] text-[var(--text-muted)] border-x border-[var(--border)]"><ZoomOut size={13} /></button>
            <button onClick={resetZoom} className="px-2 py-1.5 hover:bg-[var(--surface-2)] text-[var(--text-muted)]"><Maximize2 size={13} /></button>
          </div>

          <button onClick={load} className="p-1.5 hover:bg-[var(--surface-2)] rounded border border-[var(--border)] text-[var(--text-muted)]">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <div className="flex gap-6 px-6 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] flex-shrink-0 text-xs items-center">
        <span className="text-[var(--text-muted)]">
          <span className="font-bold text-[var(--text)]">{buildings.length}</span> building{buildings.length === 1 ? '' : 's'}
        </span>
        <span className="text-[var(--text-muted)]">
          <span className="font-bold text-[var(--text)]">{trackedFloors}</span> floors
        </span>
        <span className="flex items-center gap-1 text-blue-400">
          <Lock size={10} />
          <span className="font-bold">{totalFinalized}</span> finalized
        </span>
        {avgScore !== null && (
          <span style={{ color: scoreColor(avgScore) }}>
            avg <span className="font-bold">{avgScore}%</span> — {scoreLabel(avgScore)}
          </span>
        )}
        <span className="ml-auto text-[var(--text-muted)]">Click any floor to open editor · Drag to pan · Scroll to zoom</span>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────── */}
      <div className="flex gap-4 px-6 py-1.5 border-b border-[var(--border)] flex-shrink-0 text-xs text-[var(--text-muted)]">
        {[
          { color: '#22c55e', label: '≥95 Excellent' },
          { color: '#84cc16', label: '≥80 Good' },
          { color: '#eab308', label: '≥70 Fair' },
          { color: '#f97316', label: '<70 Weak' },
          { color: '#3b82f6', label: 'Finalized' },
          { color: '#64748b', label: 'No score' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      {/* ── Canvas ─────────────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-[var(--surface)]/80">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
              <RefreshCw size={15} className="animate-spin" /> Loading buildings…
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        {hasBuildings ? (
          <Stage
            ref={stageRef}
            width={stageSize.w}
            height={stageSize.h}
            scaleX={scale}
            scaleY={scale}
            draggable
            onWheel={e => {
              e.evt.preventDefault();
              zoom(e.evt.deltaY > 0 ? -0.08 : 0.08);
            }}
            style={{ background: viewMode === 'elevation' ? '#b8d4f0' : '#060b14' }}
          >
              {viewMode === 'elevation' ? (
                <Layer>
                  {/* Sky gradient */}
                  <Rect x={0} y={0} width={canvasW + 200} height={canvasH + 200}
                    {...bgStyle}
                  />
                  {/* Background city silhouette */}
                  {BG_BUILDINGS.map(b => (
                    <Rect key={b.id}
                      x={b.x} y={START_Y + maxFloors * FLOOR_H - b.h + 10}
                      width={b.w} height={b.h}
                      fill="#93c5fd" opacity={0.25}
                    />
                  ))}
                  {renderElevation()}
                </Layer>
              ) : (
                renderIsometric()
              )}
          </Stage>
        ) : (
          !loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
              <Building2 size={36} className="opacity-20" />
              <p className="text-sm">No buildings found. Auto-generate floor plans with building mode to see them here.</p>
            </div>
          )
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none bg-gray-900 border border-gray-700 rounded-xl shadow-2xl px-3 py-2.5 text-xs min-w-[190px]"
            style={{
              left: Math.min(tooltip.x + 14, stageSize.w - 210),
              top:  Math.max(8, tooltip.y - 90),
            }}
          >
            <p className="font-bold text-white mb-1.5 leading-tight truncate max-w-[180px]">
              {tooltip.plan.name}
            </p>
            <div className="space-y-1 text-gray-400">
              <div className="flex justify-between gap-4">
                <span>Floor</span>
                <span className="text-white font-medium">F{tooltip.plan.floorNumber}</span>
              </div>
              {tooltip.plan.generationScore != null && (
                <div className="flex justify-between gap-4">
                  <span>Score</span>
                  <span className="font-bold" style={{ color: scoreColor(tooltip.plan.generationScore) }}>
                    {tooltip.plan.generationScore}% — {scoreLabel(tooltip.plan.generationScore)}
                  </span>
                </div>
              )}
              {tooltip.plan.isApproved && (
                <div className="flex items-center gap-1.5 text-blue-400 pt-0.5">
                  <Lock size={10} /> Finalized
                </div>
              )}
              <p className="text-gray-600 mt-1.5 pt-1.5 border-t border-gray-800 text-[10px]">
                Click to open editor
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
