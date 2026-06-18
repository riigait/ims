import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stage, Layer, Rect, Line, Group, Text, Circle } from 'react-konva';
import Konva from 'konva';
import { floorPlansApi } from '@/services/api';
import type {
  DoorObject,
  EntranceObject,
  FloorPlan,
  FloorPlanObject,
  InventoryMarkerObject,
  LabelObject,
  PolygonRoomObject,
  RectangleObject,
  WallObject,
  WindowObject,
} from '@/types/floorplan';
import { Lock, Building2, RefreshCw, ZoomIn, ZoomOut, Maximize2, Layers, Box, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { extractOutdoorWall } from '@/utils/floorplanGeometry';
import { useTheme } from '@/contexts/ThemeContext';
import TopDown25DFloorplanView from '@/components/floorplan/TopDown25DFloorplanView';
import { floorPlanToBevData } from '@/utils/floorplanBevAdapter';
import { moveObjectWithGrid } from '@/utils/floorplanGrid';
import { IsoHumanFigure, HUMAN_WIDTH_U, HUMAN_DEPTH_U, HUMAN_HEIGHT_U } from '@/components/floorplan/iso/IsoHumanFigure';

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
// ISO_TH/ISO_TW ratio controls camera elevation angle.
// Lower ratio = flatter footprint = lower eye position = more side faces visible.
const ISO_TW           = 2.8;
const ISO_TH           = 1.4;
const ISO_Z_SCALE      = 1.6;
const ISO_FLOOR_SEP    = 90;    // gap between floors in All mode
const ISO_BUILDING_SEP = 520;
const ISO_PLAN_SIZE    = 480;   // iso footprint side in screen px
// Screen px produced by one full plan-dimension along an iso footprint edge.
const ISO_EDGE_SCALE   = Math.hypot(ISO_PLAN_SIZE * ISO_TW / 2, ISO_PLAN_SIZE * ISO_TH / 2);
const MIN_OBJ_EDGE_PX  = 16;    // minimum projected edge for racks/shelves
const ISO_WALL_H       = 28;

// ─── iso visual style constants ───────────────────────────────────────────────
const ISO_STYLE = {
  selectedFloorAlpha:  1.0,
  ghostFloorAlpha:     0.20,
  idleFloorAlpha:      0.45,    // all-mode, nothing hovered
  outdoorWallH:        42,
  indoorWallH:         36,
  indoorWallAlpha:     0.50,
  frontWallH:          52,
  frontWallAlpha:      0.72,
  sideWallH:           52,
  sideWallAlpha:       0.82,
  backWallH:           52,
  backWallAlpha:       0.95,
} as const;

const ISO_SLAB_H = 7;
const ISO_HOVER_LIFT = 6;      // hovered floor raises by this many px

function isoZ(value: number): number {
  return value * ISO_Z_SCALE;
}

// ── Material model: one light from the upper-left ─────────────────────────────
// Faces are derived from each object's own editor color so the iso view
// reflects the real plan data: top = lightened, left = mid, right = darkest.
function clamp255(v: number) { return Math.max(0, Math.min(255, Math.round(v))); }

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix a hex color toward white by t (0..1). Returns input when unparseable. */
function tint(hex: string, t: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map(c => clamp255(c + (255 - c) * t));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Mix a hex color toward black by t (0..1). Returns input when unparseable. */
function shade(hex: string, t: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map(c => clamp255(c * (1 - t)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/**
 * Visible side quads for a polygon slab extruded downward by h screen px.
 * An edge face shows only when its outward normal points down-screen
 * (toward the viewer). Outward direction is resolved against the centroid,
 * so any winding order works. Each quad carries a shading hint: edges that
 * also face right read as the dark side of the light model.
 */
// pts = projected screen coords of the footprint polygon (already at base height).
// h   = pixel height to extrude UPWARD (screen -Y direction).
// Returns only viewer-facing quads, determined by centroid normal culling.
// Each quad: [x1,y1, x2,y2, x2,y2-h, x1,y1-h] — base edge at bottom, top edge raised by h.
function slabSideQuads(pts: number[], h: number): Array<{ quad: number[]; dark: boolean }> {
  const screenH = isoZ(h);
  const n = pts.length / 2;
  if (n < 3) return [];
  let cx = 0; let cy = 0;
  for (let i = 0; i < n; i++) { cx += pts[2 * i]; cy += pts[2 * i + 1]; }
  cx /= n; cy /= n;

  const quads: Array<{ quad: number[]; dark: boolean }> = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = pts[2 * i]; const y1 = pts[2 * i + 1];
    const x2 = pts[2 * j]; const y2 = pts[2 * j + 1];
    // Outward normal of this edge in screen space
    let nx = y2 - y1;
    let ny = -(x2 - x1);
    const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
    if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
    // Only keep edges whose outward normal points downward in screen space
    // (i.e. visible to the isometric viewer from above-left)
    if (ny <= 0.05) continue;
    quads.push({
      // Extrude upward: top edge is y - h
      quad: [x1, y1, x2, y2, x2, y2 - screenH, x1, y1 - screenH],
      dark: nx >= 0,
    });
  }
  return quads;
}

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
interface WallBounds { minX: number; minY: number; maxX: number; maxY: number; }

/**
 * Compute the shared bounding box across ALL finalized floors in a building.
 * Pass this to `getOutdoorWalls` so every floor uses the same scale/offset,
 * ensuring the merged-perimeter shape looks identical on each floor band.
 */
function buildingPerimeterBounds(floors: FloorPlan[]): WallBounds | null {
  const allWalls = floors.flatMap(plan =>
    (plan.objects ?? [])
      .filter(o => o.type === 'wall')
      .map(o => o as import('@/types/floorplan').WallObject)
      .filter(w => w.wallType === 'finalized_building_perimeter' || w.isFinalizedPerimeter === true)
  );
  if (allWalls.length === 0) return null;
  const xs = allWalls.flatMap(w => [w.startX, w.endX]);
  const ys = allWalls.flatMap(w => [w.startY, w.endY]);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };
}

/**
 * Scale a plan's finalized perimeter walls into the facade cell.
 * `sharedBounds` must be the building-level merged bounds so all floors
 * share the same coordinate system and the shape is consistent per band.
 */
function getOutdoorWalls(plan: FloorPlan, sharedBounds?: WallBounds | null): ScaledWall[] {
  const walls = (plan.objects ?? [])
    .filter(o => o.type === 'wall') as import('@/types/floorplan').WallObject[];
  const perim = walls.filter(w =>
    w.wallType === 'finalized_building_perimeter' || w.isFinalizedPerimeter === true
  );
  // Fall back to floor_original_outdoor only when no finalized perimeter exists yet
  const source = perim.length > 0 ? perim : walls.filter(w => w.wallType === 'floor_original_outdoor');
  if (source.length === 0) return [];

  // Use the building-level shared bounds when available so every floor
  // is scaled identically; otherwise fall back to this floor's own bounds.
  const bounds: WallBounds = sharedBounds ?? (() => {
    const xs = source.flatMap(w => [w.startX, w.endX]);
    const ys = source.flatMap(w => [w.startY, w.endY]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  })();

  const rangeX = bounds.maxX - bounds.minX || 1;
  const rangeY = bounds.maxY - bounds.minY || 1;

  // Scale into the facade cell with padding
  const pad = 8;
  const scX = (BUILDING_W - pad * 2) / rangeX;
  const scY = (FLOOR_H   - pad * 2) / rangeY;
  const sc  = Math.min(scX, scY);

  // Centre the scaled outline in the cell
  const scaledW = rangeX * sc;
  const scaledH = rangeY * sc;
  const offX = pad + (BUILDING_W - pad * 2 - scaledW) / 2;
  const offY = pad + (FLOOR_H   - pad * 2 - scaledH) / 2;

  return source.map(w => ({
    x1: offX + (w.startX - bounds.minX) * sc,
    y1: offY + (w.startY - bounds.minY) * sc,
    x2: offX + (w.endX   - bounds.minX) * sc,
    y2: offY + (w.endY   - bounds.minY) * sc,
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
  const safeW = planW > 0 ? planW : 800;
  const safeH = planH > 0 ? planH : 600;
  const nx = wx / safeW - 0.5;
  const ny = wy / safeH - 0.5;
  const halfW = ISO_PLAN_SIZE * ISO_TW / 2;
  const halfH = ISO_PLAN_SIZE * ISO_TH / 2;
  return [
    (nx - ny) * halfW,
    (nx + ny) * halfH,
  ];
}

/**
 * Inverse of toIso: given an iso screen offset (already relative to the
 * floor's own origin), solve for the plan-space point on the floor plane
 * (z=0) that projects there. Used to convert a drag cursor position back
 * into plan units; unambiguous since dragging never changes height.
 */
function fromIso(screenX: number, screenY: number, planW: number, planH: number): [number, number] {
  const safeW = planW > 0 ? planW : 800;
  const safeH = planH > 0 ? planH : 600;
  const halfW = ISO_PLAN_SIZE * ISO_TW / 2;
  const halfH = ISO_PLAN_SIZE * ISO_TH / 2;
  const nx = (screenX / halfW + screenY / halfH) / 2;
  const ny = (screenY / halfH - screenX / halfW) / 2;
  return [(nx + 0.5) * safeW, (ny + 0.5) * safeH];
}

/** Convert a rectangle's four corners to iso screen points.
 *  rotationRad rotates corners around (pivotX, pivotY) — use the parent object
 *  center so sub-rects stay attached to the rotated parent footprint. */
function rectToIsoPts(
  rect: IsoRect, size: PlanSize, origin: IsoOrigin,
  rotationRad = 0, pivotX?: number, pivotY?: number,
): number[] {
  const { x, y, w, h } = rect;
  const { planW, planH } = size;
  const pcx = pivotX ?? x + w / 2;
  const pcy = pivotY ?? y + h / 2;
  const corners: [number, number][] = [
    [x,     y    ],
    [x + w, y    ],
    [x + w, y + h],
    [x,     y + h],
  ];
  return corners.flatMap(([px, py]) => {
    let rx = px, ry = py;
    if (rotationRad) {
      const cos = Math.cos(rotationRad), sin = Math.sin(rotationRad);
      const dx = px - pcx, dy = py - pcy;
      rx = pcx + dx * cos - dy * sin;
      ry = pcy + dx * sin + dy * cos;
    }
    const [ix, iy] = toIso(rx, ry, planW, planH);
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

function chainWallsToPolygon(
  walls: WallObject[],
  planW: number, planH: number,
  ox: number, oy: number,
): number[] | null {
  const { outerPoints } = extractOutdoorWall({
    walls: walls.map(wall => ({
      id: wall.id,
      x1: wall.startX,
      y1: wall.startY,
      x2: wall.endX,
      y2: wall.endY,
    })),
  });
  if (outerPoints.length < 3) return null;
  return outerPoints.flatMap(point => {
    const [x, y] = toIso(point.x, point.y, planW, planH);
    return [ox + x, oy + y];
  });
}

interface IsoBounds { minX: number; minY: number; maxX: number; maxY: number; }
interface IsoFrame { size: PlanSize; boundsByPlanId: Map<string, IsoBounds>; }

const ISO_FRAME_MARGIN = 40;

function isoDelta(dx: number, dy: number, planW: number, planH: number): Pt {
  const safeW = planW > 0 ? planW : 800;
  const safeH = planH > 0 ? planH : 600;
  const halfW = ISO_PLAN_SIZE * ISO_TW / 2;
  const halfH = ISO_PLAN_SIZE * ISO_TH / 2;
  return [
    (dx / safeW - dy / safeH) * halfW,
    (dx / safeW + dy / safeH) * halfH,
  ];
}

function expandIsoBounds(bounds: IsoBounds, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function newIsoBounds(): IsoBounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function finishIsoBounds(bounds: IsoBounds): IsoBounds | null {
  return bounds.minX < Infinity ? bounds : null;
}

function boundsFromWalls(walls: WallObject[]): IsoBounds | null {
  if (walls.length === 0) return null;
  const bounds = newIsoBounds();
  for (const wall of walls) {
    expandIsoBounds(bounds, wall.startX, wall.startY);
    expandIsoBounds(bounds, wall.endX, wall.endY);
  }
  return finishIsoBounds(bounds);
}

function boundsFromObjects(objects: FloorPlanObject[]): IsoBounds | null {
  const bounds = newIsoBounds();
  for (const object of objects) {
    if (object.type === 'wall') {
      expandIsoBounds(bounds, object.startX, object.startY);
      expandIsoBounds(bounds, object.endX, object.endY);
    } else if (object.type === 'room') {
      const room = object as PolygonRoomObject;
      for (let i = 0; i < room.points.length; i += 2) expandIsoBounds(bounds, room.points[i], room.points[i + 1]);
    } else if ('x' in object && 'y' in object && 'width' in object
      && typeof object.x === 'number' && typeof object.y === 'number' && typeof object.width === 'number') {
      const height = 'height' in object && typeof object.height === 'number' ? object.height : 30;
      expandIsoBounds(bounds, object.x, object.y);
      expandIsoBounds(bounds, object.x + object.width, object.y + height);
    }
  }
  return finishIsoBounds(bounds);
}

function isoAnchorBounds(plan: FloorPlan): IsoBounds | null {
  const objects = plan.objects ?? [];
  const walls = objects.filter((object): object is WallObject => object.type === 'wall');
  const finalPerim = walls.filter(wall =>
    wall.wallType === 'finalized_building_perimeter' || wall.isFinalizedPerimeter === true
  );
  const ownOutdoor = walls.filter(wall => wall.wallType === 'floor_original_outdoor');
  return boundsFromWalls(finalPerim)
    ?? boundsFromWalls(ownOutdoor)
    ?? boundsFromObjects(objects);
}

function buildIsoFrame(floors: FloorPlan[]): IsoFrame {
  const boundsByPlanId = new Map<string, IsoBounds>();
  let maxWidth = 800;
  let maxHeight = 600;

  for (const plan of floors) {
    maxWidth = Math.max(maxWidth, (plan.width ?? 0) > 0 ? plan.width : 800);
    maxHeight = Math.max(maxHeight, (plan.height ?? 0) > 0 ? plan.height : 600);

    const bounds = isoAnchorBounds(plan);
    if (!bounds) continue;
    boundsByPlanId.set(plan.id, bounds);
    maxWidth = Math.max(maxWidth, bounds.maxX - bounds.minX + ISO_FRAME_MARGIN * 2);
    maxHeight = Math.max(maxHeight, bounds.maxY - bounds.minY + ISO_FRAME_MARGIN * 2);
  }

  return { size: { planW: maxWidth, planH: maxHeight }, boundsByPlanId };
}

function isoFloorOrigin(plan: FloorPlan, ox: number, oy: number, frame: IsoFrame): IsoOrigin {
  const bounds = frame.boundsByPlanId.get(plan.id);
  if (!bounds) return { originX: ox, originY: oy };

  const boundsCenterX = (bounds.minX + bounds.maxX) / 2;
  const boundsCenterY = (bounds.minY + bounds.maxY) / 2;
  const [shiftX, shiftY] = isoDelta(
    frame.size.planW / 2 - boundsCenterX,
    frame.size.planH / 2 - boundsCenterY,
    frame.size.planW,
    frame.size.planH,
  );
  return { originX: ox + shiftX, originY: oy + shiftY };
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
  hoveredObjectId: string | null;
  isoMode:      'single' | 'all';
  isDark:       boolean;
  labelFontSize: number;
  onHover:      HoverHandler;
  onHoverEnd:   () => void;
  onObjectHover: (id: string) => void;
  onObjectHoverEnd: () => void;
  onNavigate:   NavHandler;
  // Dragging: starts a drag candidate for an inventory object. floorOx/floorOy
  // are the floor's iso origin (already known at the call site), needed to
  // convert pointer screen coords back into this floor's plan space.
  onObjectPointerDown: (
    plan: FloorPlan, rect: RectangleObject, floorOx: number, floorOy: number,
    e: Konva.KonvaEventObject<MouseEvent>,
  ) => void;
}

// ── Object visual config ──────────────────────────────────────────────────────
interface ObjStyle {
  topFill: string; topStroke: string;
  sideFill: string; sideAlt: string;   // left face / right face
  zUnits: number;                       // extruded height in real-world plan units (100u = 1m)
}
const OBJ_STYLE: Record<string, ObjStyle> = {
  room:           { topFill:'#1e3a5f', topStroke:'#3b82f6', sideFill:'#0f2040', sideAlt:'#0a1830', zUnits: 0   },
  rack:           { topFill:'#14532d', topStroke:'#22c55e', sideFill:'#0a3018', sideAlt:'#071f10', zUnits: 200 },
  shelf:          { topFill:'#3b1f0a', topStroke:'#f97316', sideFill:'#221108', sideAlt:'#180c06', zUnits: 180 },
  stairs:         { topFill:'#2d2006', topStroke:'#d97706', sideFill:'#1a1204', sideAlt:'#100c02', zUnits: 150 },
  elevator:       { topFill:'#1a0d2e', topStroke:'#a78bfa', sideFill:'#0f0820', sideAlt:'#080412', zUnits: 270 },
  'work-surface': { topFill:'#2c1a08', topStroke:'#b09870', sideFill:'#1a1006', sideAlt:'#100a04', zUnits: 76  },
  chair:          { topFill:'#0e2030', topStroke:'#7090b0', sideFill:'#081420', sideAlt:'#040c14', zUnits: 90  },
  cabinet:        { topFill:'#1c1a12', topStroke:'#a09880', sideFill:'#100e08', sideAlt:'#080604', zUnits: 90  },
  drawer:         { topFill:'#1e1a10', topStroke:'#b0a890', sideFill:'#121008', sideAlt:'#080604', zUnits: 75  },
  locker:         { topFill:'#0e1c10', topStroke:'#70a880', sideFill:'#081008', sideAlt:'#040804', zUnits: 180 },
  'storage-box':  { topFill:'#1c1410', topStroke:'#906858', sideFill:'#100c08', sideAlt:'#080604', zUnits: 50  },
  bin:            { topFill:'#121a1c', topStroke:'#809098', sideFill:'#0a1010', sideAlt:'#040808', zUnits: 65  },
  pallet:         { topFill:'#1e1408', topStroke:'#906840', sideFill:'#100c04', sideAlt:'#080602', zUnits: 15  },
  bathroom:       { topFill:'#0a1820', topStroke:'#38bdf8', sideFill:'#061014', sideAlt:'#040c10', zUnits: 220 },
  restroom:       { topFill:'#0a1820', topStroke:'#38bdf8', sideFill:'#061014', sideAlt:'#040c10', zUnits: 220 },
  human:          { topFill:'#2c1e14', topStroke:'#c09070', sideFill:'#1a1208', sideAlt:'#100c06', zUnits: 170 },
};

// ── Depth keys for iso painter's sort ────────────────────────────────────────
function depthKey(x: number, y: number) { return x + y; }
const OBJECT_DEPTH_BASE = 1_000_000;
const INDOOR_WALL_DEPTH = Number.MAX_SAFE_INTEGER - 2;
const CEILING_SHELF_H = 12;
const CEILING_SHELF_CLEARANCE_PX = 5;
const CEILING_SHELF_LIFT = ISO_STYLE.backWallH - CEILING_SHELF_H - (CEILING_SHELF_CLEARANCE_PX / ISO_Z_SCALE);

function pointToWallDistance(
  x: number,
  y: number,
  wall: import('@/types/floorplan').WallObject,
): number {
  const dx = wall.endX - wall.startX;
  const dy = wall.endY - wall.startY;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(x - wall.startX, y - wall.startY);
  const t = Math.max(0, Math.min(1, ((x - wall.startX) * dx + (y - wall.startY) * dy) / lengthSq));
  return Math.hypot(x - (wall.startX + t * dx), y - (wall.startY + t * dy));
}

function openingIsAttachedToWall(
  opening: DoorObject | WindowObject | EntranceObject,
  walls: import('@/types/floorplan').WallObject[],
): boolean {
  return walls.some(wall =>
    pointToWallDistance(opening.x, opening.y, wall) <= Math.max(20, (wall.thickness ?? 8) * 2)
  );
}

// ── Build all four extruded side faces for a rect object ─────────────────────
function extrudedFaces(
  rx: number, ry: number, rw: number, rh: number,
  planW: number, planH: number, ox: number, oy: number,
  zH: number,
  rotationRad = 0,
  pivotX?: number, pivotY?: number,
): { left: number[]; right: number[]; backLeft: number[]; backRight: number[] } {
  const ccx = pivotX ?? rx + rw / 2, ccy = pivotY ?? ry + rh / 2;
  const rotPt = (px: number, py: number): [number, number] => {
    if (!rotationRad) return [px, py];
    const cos = Math.cos(rotationRad), sin = Math.sin(rotationRad);
    const dx = px - ccx, dy = py - ccy;
    return [ccx + dx * cos - dy * sin, ccy + dx * sin + dy * cos];
  };
  const isoCorner = ([cx, cy]: [number,number]): Pt => {
    const [ix, iy] = toIso(cx, cy, planW, planH);
    return [ox + ix, oy + iy];
  };
  const tl = isoCorner(rotPt(rx,      ry     ));
  const tr = isoCorner(rotPt(rx + rw, ry     ));
  const br = isoCorner(rotPt(rx + rw, ry + rh));
  const bl = isoCorner(rotPt(rx,      ry + rh));

  const face = (a: Pt, b: Pt): number[] => [
    a[0], a[1], b[0], b[1], b[0], b[1] - isoZ(zH), a[0], a[1] - isoZ(zH),
  ];
  return {
    left:      face(bl, br),   // front-left  (viewer-facing, lighter)
    right:     face(br, tr),   // front-right (viewer-facing, darker)
    backLeft:  face(tl, bl),   // back-left   (normally hidden)
    backRight: face(tr, tl),   // back-right  (normally hidden)
  };
}

type IsoPresetKind =
  | 'rack' | 'shelf' | 'work-surface' | 'chair' | 'cabinet' | 'drawer'
  | 'locker' | 'storage-box' | 'bin' | 'pallet' | 'stairs' | 'elevator' | 'restroom'
  | 'human';

function isoPresetKind(rect: RectangleObject): IsoPresetKind {
  const name = `${rect.label ?? ''} ${rect.id}`.toLowerCase();
  if (/work surface|table/.test(name)) return 'work-surface';
  if (/chair/.test(name)) return 'chair';
  if (/cabinet/.test(name)) return 'cabinet';
  if (/drawer/.test(name)) return 'drawer';
  if (/locker/.test(name)) return 'locker';
  if (/storage box/.test(name)) return 'storage-box';
  if (/\bbin\b|container/.test(name)) return 'bin';
  if (/pallet/.test(name)) return 'pallet';
  if (/stair/.test(name)) return 'stairs';
  if (/elevator|lift/.test(name)) return 'elevator';
  if (/restroom|bathroom|toilet/.test(name)) return 'restroom';
  if (/human|person|staff|figure/.test(name) || (rect.type as string) === 'human') return 'human';
  return rect.type as IsoPresetKind;
}

function isInventoryIsoObject(rect: RectangleObject): boolean {
  return !['chair', 'stairs', 'elevator', 'restroom', 'human'].includes(isoPresetKind(rect));
}

const ISO_RENDERABLE_OBJECT_TYPES = new Set([
  'rack', 'shelf', 'stairs', 'elevator',
  'work-surface', 'chair', 'cabinet', 'drawer', 'locker',
  'storage-box', 'bin', 'pallet', 'bathroom', 'restroom', 'human',
]);

// Type-tier used to resolve which object draws in front when two visually
// overlap on screen. Restrooms sit behind other objects; wall entries still
// paint later and can occlude them.
function isoRenderPriority(kind: IsoPresetKind): number {
  switch (kind) {
    case 'restroom':
      return 20;
    case 'stairs':
    case 'elevator':
      return 30;
    case 'human':
      return 90;
    default: // rack, shelf, work-surface, chair, cabinet, drawer, locker, storage-box, bin, pallet
      return 40;
  }
}

function isoPresetHeight(kind: IsoPresetKind, planSize?: PlanSize): number {
  // Heights in real-world plan units (100u = 1m), matching HUMAN_HEIGHT_U = 170u = 1.70m.
  // shelf uses a fixed pixel height (ceiling-mounted, not floor-to-ceiling).
  const vScale = planSize
    ? (ISO_PLAN_SIZE / Math.max(planSize.planW, planSize.planH)) * ISO_TH
    : 1;
  if (kind === 'shelf') return CEILING_SHELF_H;  // ceiling shelf: fixed visual height
  if (kind === 'human') return 0;
  const units: Partial<Record<IsoPresetKind, number>> = {
    elevator:         270,
    rack:             200,
    locker:           180,
    cabinet:          90,
    stairs:           150,
    restroom:         220,
    'work-surface':   76,
    chair:            90,
    drawer:           75,
    'storage-box':    50,
    bin:              65,
    pallet:           15,
  };
  return (units[kind] ?? 90) * vScale;
}

function subIsoRect(rect: IsoRect, x: number, y: number, w: number, h: number): IsoRect {
  return {
    x: rect.x + rect.w * x,
    y: rect.y + rect.h * y,
    w: rect.w * w,
    h: rect.h * h,
  };
}

function liftIsoPoints(points: number[], height: number): number[] {
  return points.map((value, index) => index % 2 === 1 ? value - isoZ(height) : value);
}

function isoPresetBaseLift(kind: IsoPresetKind): number {
  return kind === 'shelf' ? CEILING_SHELF_LIFT : 0;
}

function isoPrismSilhouette(footprint: number[], height: number): number[] {
  const points: Pt[] = [];
  for (let index = 0; index < footprint.length; index += 2) {
    points.push([footprint[index], footprint[index + 1]]);
    points.push([footprint[index], footprint[index + 1] - isoZ(height)]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Pt, b: Pt, c: Pt) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half: Pt[] = [];
  const append = (point: Pt) => {
    while (half.length >= 2 && cross(half.at(-2)!, half.at(-1)!, point) <= 0) half.pop();
    half.push(point);
  };
  points.forEach(append);
  half.pop();
  const lower = [...half];
  half.length = 0;
  points.reverse().forEach(append);
  half.pop();
  return [...lower, ...half].flatMap(point => point);
}

function pointInIsoPolygon(px: number, py: number, points: number[]): boolean {
  let inside = false;
  const count = points.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = points[i * 2], yi = points[i * 2 + 1];
    const xj = points[j * 2], yj = points[j * 2 + 1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface IsoPrismProps {
  readonly rect: IsoRect;
  readonly size: PlanSize;
  readonly origin: IsoOrigin;
  readonly base: string;
  readonly height: number;
  readonly baseLift?: number;
  readonly opacity?: number;
  readonly rotation?: number;
  readonly pivotX?: number;
  readonly pivotY?: number;
}

function IsoPrism({ rect, size, origin, base, height, baseLift = 0, opacity = 1, rotation = 0, pivotX, pivotY }: IsoPrismProps) {
  const floor = rectToIsoPts(rect, size, origin, rotation, pivotX, pivotY);
  const liftedBase = liftIsoPoints(floor, baseLift);
  const top = liftIsoPoints(floor, baseLift + height);
  // Use the baseLift-raised footprint as the base of the side extrusion.
  // slabSideQuads culls by centroid normal so it always returns only the
  // viewer-facing sides, regardless of the object's rotation.
  const sides = slabSideQuads(liftedBase, height);
  return (
    <Group opacity={opacity} listening={false}>
      {baseLift > 0 && (
        <Line closed points={liftedBase} fill={shade(base, 0.7)} stroke={shade(base, 0.75)} strokeWidth={0.3} />
      )}
      {sides.map(({ quad, dark }, i) => (
        <Line key={i} closed points={quad}
          fill={dark ? shade(base, 0.56) : shade(base, 0.38)}
          stroke={dark ? shade(base, 0.72) : shade(base, 0.68)}
          strokeWidth={0.45} listening={false} />
      ))}
      <Line closed points={top} fill={tint(base, 0.22)} stroke={tint(base, 0.42)} strokeWidth={0.7} />
    </Group>
  );
}

function isoFrontEdge(rect: IsoRect, size: PlanSize, origin: IsoOrigin, lift: number, rotation = 0, pivotX?: number, pivotY?: number): number[] {
  const pts = rectToIsoPts(rect, size, origin, rotation, pivotX, pivotY);
  return [pts[6], pts[7] - isoZ(lift), pts[4], pts[5] - isoZ(lift), pts[2], pts[3] - isoZ(lift)];
}

function isoFaceCenter(rect: IsoRect, size: PlanSize, origin: IsoOrigin, lift: number, rotation = 0, pivotX?: number, pivotY?: number): Pt {
  const pts = rectToIsoPts(rect, size, origin, rotation, pivotX, pivotY);
  return [(pts[6] + pts[4]) / 2, (pts[7] + pts[5]) / 2 - isoZ(lift)];
}

interface IsoObjectShapeProps {
  readonly planId: string;
  readonly object: RectangleObject;
  readonly rect: IsoRect;
  readonly size: PlanSize;
  readonly origin: IsoOrigin;
  readonly base: string;
  readonly hovered: boolean;
  // True when this object's footprint visually overlaps another's. Real
  // positions are never adjusted for this — it only strengthens the contact
  // shadow/outline so an intentional-looking overlap doesn't read as a
  // rendering glitch.
  readonly colliding?: boolean;
}

function IsoObjectShape({ planId, object, rect, size, origin, base, hovered, colliding }: IsoObjectShapeProps) {
  const kind = isoPresetKind(object);
  const rot = object.rotation ?? 0;
  // All sub-rects rotate around the parent object center, not their own center.
  const pvX = rect.x + rect.w / 2;
  const pvY = rect.y + rect.h / 2;
  const footprint = rectToIsoPts(rect, size, origin, rot, pvX, pvY);
  const contact = [footprint[6], footprint[7], footprint[4], footprint[5], footprint[2], footprint[3]];
  const hoverFootprint = liftIsoPoints(footprint, isoPresetBaseLift(kind));
  const hoverOutline = isoPrismSilhouette(hoverFootprint, isoPresetHeight(kind, size));
  const details = tint(base, 0.55);
  const darkDetails = shade(base, 0.72);
  // Convert plan units (100u = 1m) to screen pixels for vertical heights.
  const vScale = (ISO_PLAN_SIZE / Math.max(size.planW, size.planH)) * ISO_TH;
  const u = (units: number) => units * vScale;

  const solid = (height: number, bands = 0, split = false) => (
    <>
      <IsoPrism rect={rect} size={size} origin={origin} base={base} height={height} rotation={rot} pivotX={pvX} pivotY={pvY} />
      {Array.from({ length: bands }, (_, index) => (
        <Line key={`band-${index}`} points={isoFrontEdge(rect, size, origin, height * ((index + 1) / (bands + 1)), rot, pvX, pvY)}
          stroke={details} strokeWidth={0.55} opacity={0.75} />
      ))}
      {split && (() => {
        const front = isoFrontEdge(rect, size, origin, height * 0.5, rot, pvX, pvY);
        const x = (front[0] + front[2]) / 2;
        const y = (front[1] + front[3]) / 2;
        return <Line points={[x, y + isoZ(height * 0.45), x, y - isoZ(height * 0.45)]} stroke={details} strokeWidth={0.6} opacity={0.8} />;
      })()}
    </>
  );

  let shape: React.ReactNode;
  if (kind === 'rack') {
    const rackH = u(200);  // 2.00m heavy shelving unit
    const postColor = '#4c79b8';
    const beamColor = '#5b86c3';
    const deckColor = '#d9dde2';
    const braceColor = '#3f69a6';
    const posts = [
      subIsoRect(rect, 0.02, 0.02, 0.08, 0.12), subIsoRect(rect, 0.90, 0.02, 0.08, 0.12),
      subIsoRect(rect, 0.02, 0.86, 0.08, 0.12), subIsoRect(rect, 0.90, 0.86, 0.08, 0.12),
    ];
    // 4 shelf levels evenly distributed across full rack height
    const L0 = rackH * 0.02, L1 = rackH * 0.27, L2 = rackH * 0.52, L3 = rackH * 0.77;
    const shelfLevels = [L0, L1, L2, L3];
    const rackParts: Array<{ key: string; rect: IsoRect; base: string; height: number; baseLift: number }> = [];
    posts.forEach((post, index) => {
      rackParts.push({ key: `rack-post-${index}`, rect: post, base: postColor, height: rackH, baseLift: 0 });
    });
    const beamH = u(3);  // beam/deck thickness ~3cm visual
    shelfLevels.forEach((level, index) => {
      rackParts.push(
        { key: `rack-deck-${index}`, rect: subIsoRect(rect, 0.09, 0.13, 0.82, 0.72), base: deckColor, height: beamH, baseLift: level },
        { key: `rack-front-beam-${index}`, rect: subIsoRect(rect, 0.02, 0.84, 0.96, 0.10), base: beamColor, height: beamH, baseLift: level + beamH },
        { key: `rack-back-beam-${index}`, rect: subIsoRect(rect, 0.02, 0.06, 0.96, 0.10), base: beamColor, height: beamH, baseLift: level + beamH },
        { key: `rack-left-beam-${index}`, rect: subIsoRect(rect, 0.02, 0.06, 0.08, 0.88), base: beamColor, height: beamH, baseLift: level + beamH },
        { key: `rack-right-beam-${index}`, rect: subIsoRect(rect, 0.90, 0.06, 0.08, 0.88), base: beamColor, height: beamH, baseLift: level + beamH },
      );
    });
    const rackPoint = (x: number, y: number, lift: number): Pt => {
      const worldX = rect.x + rect.w * x;
      const worldY = rect.y + rect.h * y;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const dx = worldX - pvX;
      const dy = worldY - pvY;
      const point = isoPoint(pvX + dx * cos - dy * sin, pvY + dx * sin + dy * cos, size, origin);
      return [point[0], point[1] - isoZ(lift)];
    };
    const brH0 = rackH * 0.16, brH1 = rackH * 0.64;
    const braces = [0.06, 0.94].flatMap((x, sideIndex) => {
      const lowFront = rackPoint(x, 0.84, brH0);
      const highBack = rackPoint(x, 0.16, brH1);
      const lowBack = rackPoint(x, 0.16, brH0);
      const highFront = rackPoint(x, 0.84, brH1);
      return [
        { key: `rack-brace-${sideIndex}-a`, points: [...lowFront, ...highBack] },
        { key: `rack-brace-${sideIndex}-b`, points: [...lowBack, ...highFront] },
      ];
    });
    const rackShapes = [
      ...rackParts.map(part => {
        const points = rectToIsoPts(part.rect, size, origin, rot, pvX, pvY);
        return {
          key: part.key,
          depth: (points[1] + points[3] + points[5] + points[7]) / 4 - isoZ(part.baseLift),
          node: <IsoPrism rect={part.rect} size={size} origin={origin}
            base={part.base} height={part.height} baseLift={part.baseLift}
            rotation={rot} pivotX={pvX} pivotY={pvY} />,
        };
      }),
      ...braces.map(brace => ({
        key: brace.key,
        depth: (brace.points[1] + brace.points[3]) / 2,
        node: <Line points={brace.points} stroke={braceColor} strokeWidth={2.5}
          lineCap="round" listening={false} />,
      })),
    ].sort((a, b) => a.depth - b.depth);
    shape = <>
      {rackShapes.map(part => (
        <Group key={part.key} listening={false}>{part.node}</Group>
      ))}
    </>;
  } else if (kind === 'shelf') {
    const shelfLift = isoPresetBaseLift(kind);
    const supportH = 8;
    const boardH = CEILING_SHELF_H - supportH;
    shape = <>
      {[0.16, 0.76].map((x, index) => (
        <IsoPrism key={`shelf-support-${index}`} rect={subIsoRect(rect, x, 0.16, 0.08, 0.56)}
          size={size} origin={origin} base={shade(base, 0.30)}
          height={supportH} baseLift={shelfLift} rotation={rot} pivotX={pvX} pivotY={pvY} />
      ))}
      <IsoPrism rect={subIsoRect(rect, 0.02, 0.08, 0.96, 0.72)}
        size={size} origin={origin} base={tint(base, 0.10)} height={boardH} baseLift={shelfLift + supportH}
        rotation={rot} pivotX={pvX} pivotY={pvY} />
    </>;
  } else if (kind === 'work-surface') {
    const legs = [
      subIsoRect(rect, 0.05, 0.05, 0.09, 0.12), subIsoRect(rect, 0.86, 0.05, 0.09, 0.12),
      subIsoRect(rect, 0.05, 0.83, 0.09, 0.12), subIsoRect(rect, 0.86, 0.83, 0.09, 0.12),
    ];
    shape = <>
      {legs.map((leg, index) => <IsoPrism key={`leg-${index}`} rect={leg} size={size} origin={origin} base={shade(base, 0.25)} height={u(72)} rotation={rot} pivotX={pvX} pivotY={pvY} />)}
      <IsoPrism rect={rect} size={size} origin={origin} base={base} height={u(4)} baseLift={u(72)} rotation={rot} pivotX={pvX} pivotY={pvY} />
    </>;
  } else if (kind === 'chair') {
    const legs = [
      subIsoRect(rect, 0.12, 0.12, 0.11, 0.11), subIsoRect(rect, 0.77, 0.12, 0.11, 0.11),
      subIsoRect(rect, 0.12, 0.77, 0.11, 0.11), subIsoRect(rect, 0.77, 0.77, 0.11, 0.11),
    ];
    shape = <>
      {legs.map((leg, index) => <IsoPrism key={`chair-leg-${index}`} rect={leg} size={size} origin={origin} base={shade(base, 0.28)} height={u(43)} rotation={rot} pivotX={pvX} pivotY={pvY} />)}
      <IsoPrism rect={subIsoRect(rect, 0.08, 0.08, 0.84, 0.84)} size={size} origin={origin} base={base} height={u(4)} baseLift={u(43)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <IsoPrism rect={subIsoRect(rect, 0.08, 0.05, 0.84, 0.14)} size={size} origin={origin} base={shade(base, 0.08)} height={u(43)} baseLift={u(47)} rotation={rot} pivotX={pvX} pivotY={pvY} />
    </>;
  } else if (kind === 'pallet') {
    shape = <>
      {[0.02, 0.26, 0.5, 0.74].map((x, index) => (
        <IsoPrism key={`pallet-${index}`} rect={subIsoRect(rect, x, 0.03, 0.2, 0.94)}
          size={size} origin={origin} base={base} height={u(15)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      ))}
    </>;
  } else if (kind === 'stairs') {
    // 2.5D isometric stair symbol.
    // Geometry: base slab + per-step tread top face + short riser face (prev→current height).
    // All points are rotated in 2D plan space first, then projected to iso.
    // Riser bottomZ = previousStepZ, riser topZ = currentStepZ — never down to floorZ.
    const BASE_H      = u(15);  // 0.15m base slab
    const TOTAL_RISE  = u(135); // 1.35m total rise (150u total - 15u base)
    const STEPS       = 8;
    const RAIL_H      = u(100); // 1.00m railing above top step
    const stepRise    = TOTAL_RISE / STEPS;
    const riserColor  = shade(base, 0.30);
    const sideColor   = shade(base, 0.42);
    const railColor   = tint(base, 0.72);
    const railDark    = shade(railColor, 0.22);
    const { planW, planH } = size;
    const { originX, originY } = origin;

    // Rotate a plan-space world point around stair center, project to iso screen at height z.
    // z is subtracted from screen Y (higher z = higher on screen).
    const rp = (wx: number, wy: number, z = 0): [number, number] => {
      let rx = wx, ry = wy;
      if (rot) {
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const dx = wx - pvX, dy = wy - pvY;
        rx = pvX + dx * cos - dy * sin;
        ry = pvY + dx * sin + dy * cos;
      }
      const [ix, iy] = toIso(rx, ry, planW, planH);
      return [originX + ix, originY + iy - isoZ(z)];
    };

    // The stair "up" direction is always the top edge of the rect in plan space (rect.y).
    // Arrow in the editor points up = toward rect.y = high end of stair.
    // Steps ascend from bottom (rect.y+rect.h, step 0 = lowest) to top (rect.y, step N = highest).
    // Slices go along plan-Y: slice i spans [i/STEPS .. (i+1)/STEPS] of rect.h from the top.
    // Step height: slice 0 (near rect.y, the top/high end) gets the tallest z,
    //              slice STEPS-1 (near rect.y+rect.h, the bottom/low end) gets the shortest z.
    // rp() rotates the point in plan space before iso projection, so rotation is handled there.

    const stairNodes: React.ReactNode[] = [];

    // ── base slab side faces ──────────────────────────────────────────────────
    const basePts = [
      rp(rect.x,          rect.y         ),
      rp(rect.x + rect.w, rect.y         ),
      rp(rect.x + rect.w, rect.y + rect.h),
      rp(rect.x,          rect.y + rect.h),
    ];
    const flatBasePoly = basePts.flatMap(([x, y]) => [x, y]);
    slabSideQuads(flatBasePoly, BASE_H).forEach(({ quad, dark }, qi) => {
      stairNodes.push(
        <Line key={`base-side-${qi}`} closed points={quad}
          fill={dark ? shade(sideColor, 0.15) : sideColor}
          stroke={shade(base, 0.65)} strokeWidth={0.4} listening={false} />
      );
    });

    // ── side cheek panels (stepped stringer profile) ─────────────────────────
    // Each side panel traces the stepped top profile from high end → low end,
    // then closes straight down to the floor and back. This fills the hollow side.
    // Left side at rect.x, right side at rect.x+rect.w.
    const buildSideCheek = (wx: number): number[] => {
      const pts: number[] = [];
      // Start at high end (rect.y), base level
      pts.push(...rp(wx, rect.y, BASE_H));
      // Walk down the stepped profile from high to low
      for (let i = 0; i < STEPS; i++) {
        const currZ = BASE_H + (STEPS - i) * stepRise;
        const prevZ = BASE_H + (STEPS - i - 1) * stepRise;
        const wy0 = rect.y + rect.h * (i / STEPS);
        const wy1 = rect.y + rect.h * ((i + 1) / STEPS);
        // Top of this step tread at the near edge (wy0)
        pts.push(...rp(wx, wy0, currZ));
        // Bottom of this step tread = top of riser at wy1 (still at currZ)
        pts.push(...rp(wx, wy1, currZ));
        // Drop to prevZ at wy1 (riser face)
        if (i < STEPS - 1) pts.push(...rp(wx, wy1, prevZ));
      }
      // Close down to floor at low end then back along floor to high end
      pts.push(...rp(wx, rect.y + rect.h, 0));
      pts.push(...rp(wx, rect.y, 0));
      return pts;
    };

    const leftCheek  = buildSideCheek(rect.x);
    const rightCheek = buildSideCheek(rect.x + rect.w);

    // Bottom end cap: vertical face at the low entry end (rect.y+rect.h), floor to BASE_H
    const [bcL0, bcL1] = rp(rect.x,          rect.y + rect.h, 0);
    const [bcR0, bcR1] = rp(rect.x + rect.w, rect.y + rect.h, 0);
    const [bcLt0, bcLt1] = rp(rect.x,          rect.y + rect.h, BASE_H);
    const [bcRt0, bcRt1] = rp(rect.x + rect.w, rect.y + rect.h, BASE_H);
    stairNodes.push(
      <Line key="end-cap" closed
        points={[bcL0, bcL1, bcR0, bcR1, bcRt0, bcRt1, bcLt0, bcLt1]}
        fill={shade(sideColor, 0.20)} stroke={shade(base, 0.65)} strokeWidth={0.5} listening={false} />
    );

    // Back end cap: vertical face at the high end (rect.y), floor to full stair height
    const topZ = BASE_H + TOTAL_RISE;
    const [bkL0, bkL1] = rp(rect.x,          rect.y, 0);
    const [bkR0, bkR1] = rp(rect.x + rect.w, rect.y, 0);
    const [bkLt0, bkLt1] = rp(rect.x,          rect.y, topZ);
    const [bkRt0, bkRt1] = rp(rect.x + rect.w, rect.y, topZ);
    stairNodes.push(
      <Line key="back-cap" closed
        points={[bkL0, bkL1, bkR0, bkR1, bkRt0, bkRt1, bkLt0, bkLt1]}
        fill={shade(sideColor, 0.30)} stroke={shade(base, 0.65)} strokeWidth={0.5} listening={false} />
    );

    stairNodes.push(
      <Line key="cheek-left" closed points={leftCheek}
        fill={sideColor} stroke={shade(base, 0.65)} strokeWidth={0.5} listening={false} />,
      <Line key="cheek-right" closed points={rightCheek}
        fill={shade(sideColor, 0.18)} stroke={shade(base, 0.65)} strokeWidth={0.5} listening={false} />,
    );

    // ── per-step tread + riser ────────────────────────────────────────────────
    // Slice i is at plan-Y fraction i/STEPS from the top (rect.y).
    // Step index 0 = topmost slice = highest z (high end of stair, where arrow points).
    // Step index STEPS-1 = bottommost slice = lowest z (entry/low end).
    for (let i = 0; i < STEPS; i++) {
      const tFrac0 = i / STEPS;           // top of this slice (closer to rect.y)
      const tFrac1 = (i + 1) / STEPS;     // bottom of this slice

      // z: slice 0 = tallest (TOTAL_RISE), slice STEPS-1 = shortest (one stepRise)
      const currZ = BASE_H + (STEPS - i) * stepRise;
      const prevZ = BASE_H + (STEPS - i - 1) * stepRise;

      const wy0 = rect.y + rect.h * tFrac0;
      const wy1 = rect.y + rect.h * tFrac1;
      const lx0 = rect.x, lx1 = rect.x + rect.w;

      // Tread top face at currZ
      const [TL0, TL1] = rp(lx0, wy0, currZ);
      const [TR0, TR1] = rp(lx1, wy0, currZ);
      const [BR0, BR1] = rp(lx1, wy1, currZ);
      const [BL0, BL1] = rp(lx0, wy1, currZ);
      stairNodes.push(
        <Line key={`tread-${i}`} closed
          points={[TL0, TL1, TR0, TR1, BR0, BR1, BL0, BL1]}
          fill={tint(base, 0.18)} stroke={tint(base, 0.36)} strokeWidth={0.6} listening={false} />
      );

      // Short riser at the bottom edge of this tread (wy1), from prevZ to currZ.
      const [RL0, RL1]   = rp(lx0, wy1, prevZ);
      const [RR0, RR1]   = rp(lx1, wy1, prevZ);
      const [RR0t, RR1t] = rp(lx1, wy1, currZ);
      const [RL0t, RL1t] = rp(lx0, wy1, currZ);
      if (RL1 > RL1t || RR1 > RR1t) {
        stairNodes.push(
          <Line key={`riser-${i}`} closed
            points={[RL0, RL1, RR0, RR1, RR0t, RR1t, RL0t, RL1t]}
            fill={riserColor} stroke={shade(base, 0.65)} strokeWidth={0.4} listening={false} />
        );
      }
    }

    // ── railings: slope from low end (rect.y+rect.h) up to high end (rect.y) ──
    // t=0 → rect.y+rect.h (entry, lowest), t=1 → rect.y (top, highest).
    // stepZAt maps t to the z height at that position along the run.
    const stepZAt = (t: number): number => BASE_H + t * TOTAL_RISE;

    const railL: number[] = [];
    const railR: number[] = [];
    const postNodes: React.ReactNode[] = [];
    [0, 0.25, 0.5, 0.75, 1].forEach((t, idx) => {
      // t=0 = bottom/low (rect.y+rect.h), t=1 = top/high (rect.y)
      const wy    = rect.y + rect.h * (1 - t);
      const stepZ = stepZAt(t);
      const [lx, ly] = rp(rect.x,          wy, stepZ);
      const [rx, ry] = rp(rect.x + rect.w,  wy, stepZ);
      railL.push(lx, ly - isoZ(RAIL_H));
      railR.push(rx, ry - isoZ(RAIL_H));
      postNodes.push(
        <Group key={`post-${idx}`} listening={false}>
          <Line points={[lx, ly, lx, ly - isoZ(RAIL_H)]} stroke={railColor} strokeWidth={1} opacity={0.8} />
          <Line points={[rx, ry, rx, ry - isoZ(RAIL_H)]} stroke={railDark}  strokeWidth={1} opacity={0.8} />
        </Group>
      );
    });

    shape = <>
      {stairNodes}
      <Line points={railL} stroke={railColor} strokeWidth={2} lineCap="round" lineJoin="round" opacity={0.92} listening={false} />
      <Line points={railR} stroke={railDark}  strokeWidth={2} lineCap="round" lineJoin="round" opacity={0.92} listening={false} />
      {postNodes}
    </>;
  } else if (kind === 'storage-box') {
    shape = <>
      <IsoPrism rect={rect} size={size} origin={origin} base={base} height={u(46)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <IsoPrism rect={subIsoRect(rect, -0.03, -0.03, 1.06, 1.06)} size={size} origin={origin} base={tint(base, 0.08)} height={u(4)} baseLift={u(46)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <Line points={isoFrontEdge(subIsoRect(rect, 0.18, 0.18, 0.64, 0.64), size, origin, u(50), rot, pvX, pvY)}
        stroke={details} strokeWidth={0.7} opacity={0.65} />
    </>;
  } else if (kind === 'bin') {
    shape = <>
      <IsoPrism rect={subIsoRect(rect, 0.08, 0.08, 0.84, 0.84)} size={size} origin={origin} base={base} height={u(62)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <IsoPrism rect={rect} size={size} origin={origin} base={tint(base, 0.1)} height={u(3)} baseLift={u(62)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <Line closed points={liftIsoPoints(rectToIsoPts(subIsoRect(rect, 0.2, 0.2, 0.6, 0.6), size, origin, rot, pvX, pvY), u(65))}
        fill={shade(base, 0.75)} stroke={details} strokeWidth={0.5} />
    </>;
  } else if (kind === 'drawer') {
    shape = solid(u(75), 4);
  } else if (kind === 'locker') {
    shape = solid(u(180), 2, true);
  } else if (kind === 'cabinet') {
    const CAB_H = u(90);  // 0.90m base cabinet
    const KICK_H = u(8);  // 0.08m toe-kick
    const cabinetTop = liftIsoPoints(footprint, CAB_H);
    const corners = Array.from({ length: 4 }, (_, index): Pt => [
      footprint[index * 2],
      footprint[index * 2 + 1],
    ]);
    const sideFills = [
      shade(base, 0.30),
      shade(base, 0.42),
      tint(base, 0.10),
      shade(base, 0.20),
    ];
    const cabinetSides = corners.map((from, index) => {
      const to = corners[(index + 1) % corners.length];
      return {
        depth: (from[1] + to[1]) / 2,
        fill: sideFills[index],
        points: [
          from[0], from[1],
          to[0], to[1],
          to[0], to[1] - isoZ(CAB_H),
          from[0], from[1] - isoZ(CAB_H),
        ],
      };
    }).sort((a, b) => a.depth - b.depth);

    // Project details from the local +Y cabinet front after rotating in plan space.
    const frontPoint = (xFraction: number, z: number): Pt => {
      const wx = rect.x + rect.w * xFraction;
      const wy = rect.y + rect.h;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const dx = wx - pvX;
      const dy = wy - pvY;
      const [ix, iy] = toIso(
        pvX + dx * cos - dy * sin,
        pvY + dx * sin + dy * cos,
        size.planW,
        size.planH,
      );
      return [origin.originX + ix, origin.originY + iy - isoZ(z)];
    };
    const frontQuad = (x0: number, x1: number, z0: number, z1: number): number[] => [
      ...frontPoint(x0, z0),
      ...frontPoint(x1, z0),
      ...frontPoint(x1, z1),
      ...frontPoint(x0, z1),
    ];
    const frontRight = corners[2];
    const frontLeft = corners[3];
    const frontVisible = frontRight[0] - frontLeft[0] > 0.05;
    const panelBottom = KICK_H + u(2);
    const panelTop = CAB_H - u(3);
    const handleBottom = CAB_H * 0.40;
    const handleTop = CAB_H * 0.58;

    shape = <>
      {cabinetSides.map((side, index) => (
        <Line key={`cabinet-side-${index}`} closed points={side.points}
          fill={side.fill} stroke={shade(base, 0.58)} strokeWidth={0.55} listening={false} />
      ))}
      <Line closed points={cabinetTop}
        fill={tint(base, 0.24)} stroke={tint(base, 0.48)} strokeWidth={0.8} listening={false} />
      {frontVisible && <>
        <Line closed points={frontQuad(0.05, 0.95, 0, KICK_H)}
          fill={shade(base, 0.30)} stroke={shade(base, 0.48)} strokeWidth={0.45} listening={false} />
        <Line closed points={frontQuad(0.06, 0.49, panelBottom, panelTop)}
          fill={tint(base, 0.20)} stroke={tint(base, 0.46)} strokeWidth={0.75} listening={false} />
        <Line closed points={frontQuad(0.51, 0.94, panelBottom, panelTop)}
          fill={tint(base, 0.20)} stroke={tint(base, 0.46)} strokeWidth={0.75} listening={false} />
        <Line points={[...frontPoint(0.5, panelBottom), ...frontPoint(0.5, panelTop)]}
          stroke={shade(base, 0.34)} strokeWidth={0.7} listening={false} />
        <Line points={[...frontPoint(0.45, handleBottom), ...frontPoint(0.45, handleTop)]}
          stroke={shade(base, 0.60)} strokeWidth={1.8} lineCap="round" listening={false} />
        <Line points={[...frontPoint(0.55, handleBottom), ...frontPoint(0.55, handleTop)]}
          stroke={shade(base, 0.60)} strokeWidth={1.8} lineCap="round" listening={false} />
      </>}
    </>;
  } else if (kind === 'elevator') {
    const elevH = u(270);  // 2.70m full floor-to-ceiling shaft
    const faces = extrudedFaces(rect.x, rect.y, rect.w, rect.h, size.planW, size.planH, origin.originX, origin.originY, elevH, rot, pvX, pvY);
    const face = faces.left;
    const ax = face[0] + (face[2] - face[0]) * 0.17;
    const ay = face[1] + (face[3] - face[1]) * 0.17;
    const bx = face[0] + (face[2] - face[0]) * 0.83;
    const by = face[1] + (face[3] - face[1]) * 0.83;
    const doorPanel = [ax, ay - isoZ(u(3)), bx, by - isoZ(u(3)), bx, by - isoZ(u(220)), ax, ay - isoZ(u(220))];
    const panelX = face[0] + (face[2] - face[0]) * 0.92;
    const panelY = face[1] + (face[3] - face[1]) * 0.92 - isoZ(u(130));
    shape = <>
      <IsoPrism rect={rect} size={size} origin={origin} base={base} height={elevH} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <Line closed points={doorPanel} fill="#07111f" stroke={details} strokeWidth={1.2} />
      <Line points={[(ax + bx) / 2, (ay + by) / 2 - isoZ(u(3)), (ax + bx) / 2, (ay + by) / 2 - isoZ(u(220))]}
        stroke={details} strokeWidth={0.8} />
      <Line points={[ax, ay - isoZ(u(220)), bx, by - isoZ(u(220))]} stroke={tint(base, 0.7)} strokeWidth={1.6} />
      <Circle x={panelX} y={panelY} radius={2.2} fill="#22c55e" stroke="#bbf7d0" strokeWidth={0.5} />
      <Circle x={panelX} y={panelY + 7} radius={1.5} fill="#60a5fa" stroke="#bfdbfe" strokeWidth={0.4} />
    </>;
  } else if (kind === 'restroom') {
    const fixture = subIsoRect(rect, 0.57, 0.58, 0.18, 0.2);
    const fixtureCenter = isoFaceCenter(fixture, size, origin, u(40), rot, pvX, pvY);
    shape = <>
      <IsoPrism rect={subIsoRect(rect, 0, 0, 1, 0.09)} size={size} origin={origin} base={base} height={u(220)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <IsoPrism rect={subIsoRect(rect, 0, 0.09, 0.09, 0.91)} size={size} origin={origin} base={base} height={u(220)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <IsoPrism rect={subIsoRect(rect, 0.91, 0.09, 0.09, 0.91)} size={size} origin={origin} base={base} height={u(220)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <IsoPrism rect={subIsoRect(rect, 0.45, 0.1, 0.07, 0.62)} size={size} origin={origin} base={shade(base, 0.08)} height={u(180)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <IsoPrism rect={fixture} size={size} origin={origin} base="#e2e8f0" height={u(40)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <Circle x={fixtureCenter[0]} y={fixtureCenter[1] - 2} radius={3.2} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.6} />
      <Text x={fixtureCenter[0] - 12} y={fixtureCenter[1] - 28} width={24} align="center" text="WC"
        fontSize={7} fontStyle="bold" fill={details} />
    </>;
  } else if (kind === 'human') {
    // Fixed real-world size — human is always 45u wide × 32u deep × 170u tall.
    // Anchor: bottom-center of feet = iso projection of the object centroid at z=0.
    const footX = rect.x + rect.w / 2;
    const footY = rect.y + rect.h / 2;
    const [fix, fiy] = toIso(footX, footY, size.planW, size.planH);
    const screenX = origin.originX + fix;
    const screenY = origin.originY + fiy;

    // Scale: map HUMAN_HEIGHT_U plan units to iso screen pixels.
    // One plan unit maps to ISO_PLAN_SIZE / planW pixels along the iso diagonal.
    const planUnitPx = ISO_PLAN_SIZE / Math.max(size.planW, size.planH);
    // Height in screen px = physical height * planUnitPx * ISO_TH (vertical compression)
    const humanScreenH = HUMAN_HEIGHT_U * planUnitPx * ISO_TH;
    // SVG is 270px tall, so scale factor = target height / svg height
    const svgScale = humanScreenH / 270;

    // Shadow ellipse under feet
    const shadowRx = HUMAN_WIDTH_U * planUnitPx * ISO_TW * 0.5;
    const shadowRy = HUMAN_DEPTH_U * planUnitPx * ISO_TH * 0.5;

    return (
      <Group key={`obj-${planId}-${object.id}`} listening={false}>
        {hovered && (
          <Line closed points={hoverOutline} stroke="#67e8f9" strokeWidth={5} opacity={0.32} lineJoin="round" />
        )}
        <Line
          points={[screenX - shadowRx, screenY, screenX + shadowRx * 0.6, screenY - shadowRy * 0.4,
                   screenX + shadowRx, screenY, screenX - shadowRx * 0.6, screenY + shadowRy * 0.4]}
          closed fill="rgba(2,6,14,0.30)" stroke="transparent" listening={false}
        />
        <IsoHumanFigure x={screenX} y={screenY} scale={svgScale} angle={rot * (180 / Math.PI)} opacity={hovered ? 1 : 0.92} />
      </Group>
    );
  } else {
    shape = solid(u(90), 2);
  }

  return (
    <Group key={`obj-${planId}-${object.id}`} listening={false}>
      {hovered && (
        <Line closed points={hoverOutline} stroke="#67e8f9" strokeWidth={5} opacity={0.32} lineJoin="round" />
      )}
      {kind !== 'shelf' && (
        <Line points={contact} stroke={colliding ? 'rgba(2,6,14,0.78)' : 'rgba(2,6,14,0.55)'}
          strokeWidth={colliding ? 3 : 2.2} lineCap="round" lineJoin="round" />
      )}
      {shape}
      {kind === 'drawer' && (
        <Circle {...(() => {
          const p = isoFaceCenter(rect, size, origin, 17, rot, pvX, pvY);
          return { x: p[0], y: p[1] };
        })()} radius={1.2} fill={darkDetails} />
      )}
    </Group>
  );
}

function isoPoint(x: number, y: number, size: PlanSize, origin: IsoOrigin): Pt {
  const [ix, iy] = toIso(x, y, size.planW, size.planH);
  return [origin.originX + ix, origin.originY + iy];
}

function IsoOpeningShape({
  planId, object, size, origin,
}: {
  readonly planId: string;
  readonly object: DoorObject | WindowObject | EntranceObject;
  readonly size: PlanSize;
  readonly origin: IsoOrigin;
}) {
  const angle = object.angle ?? 0;
  const dx = Math.cos(angle) * object.width / 2;
  const dy = Math.sin(angle) * object.width / 2;
  const p1 = isoPoint(object.x - dx, object.y - dy, size, origin);
  const p2 = isoPoint(object.x + dx, object.y + dy, size, origin);
  const color = object.color && parseHex(object.color)
    ? object.color
    : object.type === 'window' ? '#38bdf8' : object.type === 'entrance' ? '#10b981' : '#8b5e3c';

  if (object.type === 'entrance') {
    const h = 30;
    const screenH = isoZ(h);
    return (
      <Group key={`opening-${planId}-${object.id}`} listening={false}>
        <Line points={[p1[0], p1[1], p1[0], p1[1] - screenH]} stroke={shade(color, 0.2)} strokeWidth={3} lineCap="round" />
        <Line points={[p2[0], p2[1], p2[0], p2[1] - screenH]} stroke={shade(color, 0.45)} strokeWidth={3} lineCap="round" />
        <Line points={[p1[0], p1[1] - screenH, p2[0], p2[1] - screenH]} stroke={tint(color, 0.35)} strokeWidth={4} lineCap="round" />
      </Group>
    );
  }

  const h = object.type === 'window' ? 20 : 31;
  const lift = object.type === 'window' ? 9 : 0;
  const screenH = isoZ(h);
  const screenLift = isoZ(lift);
  const panel = [p1[0], p1[1] - screenLift, p2[0], p2[1] - screenLift, p2[0], p2[1] - screenLift - screenH, p1[0], p1[1] - screenLift - screenH];
  return (
    <Group key={`opening-${planId}-${object.id}`} listening={false}>
      <Line closed points={panel} fill={hexToRgba(color, object.type === 'window' ? 0.35 : 0.88)}
        stroke={tint(color, 0.38)} strokeWidth={1.2} />
      {object.type === 'window' ? (
        <>
          <Line points={[p1[0], p1[1] - screenLift - screenH / 2, p2[0], p2[1] - screenLift - screenH / 2]} stroke={tint(color, 0.5)} strokeWidth={0.8} />
          <Line points={[p1[0], p1[1] - screenLift, p1[0], p1[1] - screenLift - screenH]} stroke={tint(color, 0.55)} strokeWidth={1.4} />
          <Line points={[p2[0], p2[1] - screenLift, p2[0], p2[1] - screenLift - screenH]} stroke={shade(color, 0.3)} strokeWidth={1.4} />
        </>
      ) : (
          <Circle x={p2[0] * 0.7 + p1[0] * 0.3} y={(p2[1] * 0.7 + p1[1] * 0.3) - screenH * 0.48}
          radius={1.2} fill="#f8fafc" />
      )}
    </Group>
  );
}

// ── Cutaway height for a wall segment ─────────────────────────────────────────
// Matterport-style dollhouse: all 4 outer walls full height, roof removed.
// Interior visible from above via isometric angle — no wall cutaway needed.
// Indoor partition walls rise above windows but stay transparent for visibility.
function wallCutawayH(
  _startX: number, _startY: number, _endX: number, _endY: number,
  _planW: number, _planH: number, isOuter: boolean,
): { h: number; alpha: number } {
  if (!isOuter) return { h: ISO_STYLE.indoorWallH, alpha: ISO_STYLE.indoorWallAlpha };
  return { h: ISO_STYLE.backWallH, alpha: ISO_STYLE.backWallAlpha };
}

function polygonBoundsHelper(pts: number[]) {
  const xs = pts.filter((_, i) => i % 2 === 0);
  const ys = pts.filter((_, i) => i % 2 !== 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

interface AABB { minX: number; minY: number; maxX: number; maxY: number; }

function aabbFromPoints(pts: number[]): AABB {
  const xs = pts.filter((_, i) => i % 2 === 0);
  const ys = pts.filter((_, i) => i % 2 !== 0);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };
}

function aabbOverlap(a: AABB, b: AABB, padding = 0): boolean {
  return !(
    a.maxX + padding < b.minX ||
    a.minX - padding > b.maxX ||
    a.maxY + padding < b.minY ||
    a.minY - padding > b.maxY
  );
}

function boxContainsPoint(box: { x: number; y: number; width: number; height: number }, x: number, y: number, padding = 0): boolean {
  return x >= box.x - padding
    && x <= box.x + box.width + padding
    && y >= box.y - padding
    && y <= box.y + box.height + padding;
}

function isRestroomOpening(opening: DoorObject | WindowObject | EntranceObject, objects: FloorPlan['objects']): boolean {
  if (opening.type !== 'door') return false;
  const name = `${opening.label ?? ''} ${opening.id} ${opening.groupId ?? ''}`.toLowerCase();
  if (/restroom|bathroom|toilet/.test(name)) return true;

  const padding = Math.max(16, opening.width * 0.75);
  return objects?.some(obj => {
    const objName = `${obj.label ?? ''} ${obj.id} ${obj.groupId ?? ''} ${obj.type}`.toLowerCase();
    if (!/restroom|bathroom|toilet/.test(objName)) return false;
    if (obj.type === 'room') {
      return boxContainsPoint(polygonBoundsHelper(obj.points), opening.x, opening.y, padding);
    }
    if ('height' in obj && typeof obj.height === 'number' && 'width' in obj && typeof obj.width === 'number'
      && 'x' in obj && typeof obj.x === 'number' && 'y' in obj && typeof obj.y === 'number') {
      return boxContainsPoint({ x: obj.x, y: obj.y, width: obj.width, height: obj.height }, opening.x, opening.y, padding);
    }
    return false;
  }) ?? false;
}

// Real floorplan positions are never adjusted to avoid overlap — only the
// draw order is. Furniture/inventory entries carry enough info (visualBox,
// renderPriority, hovered, id) to resolve front/behind when two objects
// visually overlap on screen; walls/rooms/openings keep sorting on plain
// depth since they don't need that resolution.
type LeftBiasKind = 'shelf' | 'work-surface';
type RQ = {
  depth: number; node: React.ReactNode;
  leftBiasKind?: LeftBiasKind; leftBiasScreenX?: number;
  id?: string; visualBox?: AABB; renderPriority?: number; hovered?: boolean;
};

type IsoSortable = Omit<RQ, 'node'>;

type IsoObjectHitTarget = IsoSortable & {
  plan: FloorPlan;
  rect: RectangleObject;
  floorOx: number;
  floorOy: number;
  points: number[];
  floorOrder: number;
};

// Shared comparator used for BOTH the visual render queue and the object
// hit-test list, so the entry that draws in front is also the one that
// receives hover/click — otherwise Konva resolves overlapping clicks by
// raw array order, which can silently disagree with the visual stacking.
function compareIsoRenderEntries(a: IsoSortable, b: IsoSortable): number {
  const colliding = a.visualBox && b.visualBox && aabbOverlap(a.visualBox, b.visualBox, 4);
  if (colliding) {
    if (a.hovered !== b.hovered) return a.hovered ? 1 : -1;
    if (a.renderPriority !== undefined && b.renderPriority !== undefined
      && a.renderPriority !== b.renderPriority) {
      return a.renderPriority - b.renderPriority;
    }
    if (a.leftBiasKind !== undefined && a.leftBiasKind === b.leftBiasKind) {
      return b.leftBiasScreenX! - a.leftBiasScreenX!; // further right drawn first/behind
    }
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.id !== undefined && b.id !== undefined) return a.id < b.id ? -1 : 1;
  }
  return a.depth - b.depth;
}

interface IsoFloorResult { visual: React.ReactNode; hit: React.ReactNode; }

function buildIsoFloorNodes(
  plan: FloorPlan,
  ox: number, oy: number,
  ctx: IsoCtx,
  floorAlpha: number,
  showObjects: boolean,
  sharedSize?: PlanSize,
): IsoFloorResult {
  const fn          = plan.floorNumber ?? 1;
  const isFinalized = !!plan.isApproved;
  const isHovered   = ctx.isoMode === 'single' && ctx.hoveredId === plan.id;
  const accentColor = isFinalized ? '#3b82f6' : scoreColor(plan.generationScore);
  const planW = sharedSize?.planW ?? plan.width  ?? 800;
  const planH = sharedSize?.planH ?? plan.height ?? 600;

  const corners = planCorners(planW, planH, ox, oy);
  const footprintPts = corners.flatMap(([x, y]) => [x, y]);

  const size: PlanSize    = { planW, planH };
  const origin: IsoOrigin = { originX: ox, originY: oy };
  const objects = plan.objects ?? [];

  // ── Perimeter polygons ─────────────────────────────────────────────────────
  // The floor's OWN outline (floor_original_outdoor) is the slab — a floor must
  // never appear to own another floor's area. The shared finalized envelope
  // (union of all floors) renders only as a ghost ring for building context.
  const allWallObjs = objects.filter(o => o.type === 'wall') as import('@/types/floorplan').WallObject[];
  const finalPerim = allWallObjs.filter(w =>
    w.wallType === 'finalized_building_perimeter' || w.isFinalizedPerimeter === true
  );
  const ownOutdoor = allWallObjs.filter(w => w.wallType === 'floor_original_outdoor');
  const outerWalls = ownOutdoor.length > 0 ? ownOutdoor : finalPerim;
  const perimPts    = chainWallsToPolygon(outerWalls, planW, planH, ox, oy);
  const topFacePts  = (isFinalized && perimPts) ? perimPts : footprintPts;

  // Extract actual screen tips from the real slab polygon (not the rectangular footprint).
  // topFacePts is [x0,y0, x1,y1, ...] in screen space.
  const slabXs = topFacePts.filter((_, i) => i % 2 === 0);
  const slabYs = topFacePts.filter((_, i) => i % 2 !== 0);
  const slabMaxX = Math.max(...slabXs);
  const slabMaxY = Math.max(...slabYs);
  // Left tip: point with smallest X. Right tip: largest X. Bottom tip: largest Y.
  const rightTipIdx  = slabXs.indexOf(slabMaxX);
  const bottomTipIdx = slabYs.indexOf(slabMaxY);
  const rightTip:  [number, number] = [slabXs[rightTipIdx],  slabYs[rightTipIdx]];
  const bottomTip: [number, number] = [slabXs[bottomTipIdx], slabYs[bottomTipIdx]];

  const envelopePts = isFinalized && finalPerim.length > 0 && ownOutdoor.length > 0
    ? chainWallsToPolygon(finalPerim, planW, planH, ox, oy)
    : null;

  // Slab material — finalized floors read as deep blue glass, drafts as slate.
  const slabTopBase = isFinalized ? '#11295a' : '#0e1626';
  const slabTop = isHovered ? tint(slabTopBase, 0.1) : slabTopBase;

  // ── Build depth-sorted render queue ──────────────────────────────────────
  const queue: RQ[] = [];
  // Hit-test entries mirror the visual queue's sort keys so the object that
  // draws in front is also the one that receives hover/click when two
  // objects' hit silhouettes overlap (see compareIsoRenderEntries).
  const objectHitEntries: RQ[] = [];

  // Rooms — flat tinted zones derived from each room's own editor color so the
  // iso view mirrors the plan data. Core rooms (stairs/elevator/restroom) get
  // a stronger tint and a dashed edge to read as circulation.
  for (const obj of objects) {
    if (obj.type !== 'room') continue;
    const room = obj as import('@/types/floorplan').PolygonRoomObject;
    const b = polygonBoundsHelper(room.points);
    const pts  = rectToIsoPts({ x: b.x, y: b.y, w: b.width, h: b.height }, size, origin);
    const base = room.color && parseHex(room.color) ? room.color : OBJ_STYLE.room.topStroke;
    const isCore = /reserved-stairs|reserved-elevator|reserved-(?:male-|female-)?restroom/.test(room.id);
    const floorFill = shade(base, 0.58);
    const tileGap = 42;
    const tileLines: React.ReactNode[] = [];
    for (let y = b.y + tileGap; y < b.y + b.height; y += tileGap) {
      const start = isoPoint(b.x, y, size, origin);
      const end = isoPoint(b.x + b.width, y, size, origin);
      tileLines.push(
        <Line key={`room-tile-${plan.id}-${room.id}-${y}`}
          points={[start[0], start[1], end[0], end[1]]}
          stroke={tint(base, 0.5)} strokeWidth={0.7} opacity={0.22} listening={false}
        />,
      );
    }
    queue.push({
      depth: depthKey(b.x, b.y),
      node: (
        <Group key={`room-${plan.id}-${room.id}`} listening={false}>
          <Line closed points={pts}
            fill={hexToRgba(floorFill, isCore ? 0.82 : 0.68)}
            stroke={tint(base, 0.25)} strokeWidth={isCore ? 1 : 0.7}
            dash={isCore ? [5, 3] : undefined}
          />
          {tileLines}
        </Group>
      ),
    });
  }

  // Indoor walls — low cutaway (skip anything that is part of the outdoor/perimeter set)
  for (const obj of objects) {
    if (obj.type !== 'wall') continue;
    const w = obj as import('@/types/floorplan').WallObject;
    const isOuter = w.wallType === 'finalized_building_perimeter'
      || w.isFinalizedPerimeter === true
      || w.wallType === 'floor_original_outdoor';
    if (isOuter) continue; // handled separately

    const [x1, y1] = toIso(w.startX, w.startY, planW, planH);
    const [x2, y2] = toIso(w.endX,   w.endY,   planW, planH);
    const { h, alpha } = wallCutawayH(w.startX, w.startY, w.endX, w.endY, planW, planH, false);
    const screenH = isoZ(h);
    const thick = Math.max(1, (w.thickness ?? 8) / planW * ISO_PLAN_SIZE * 0.3);

    // Extruded wall ribbon: quad from the two base points lifted by h
    const sx = ox + x1; const sy = oy + y1;
    const ex = ox + x2; const ey = oy + y2;
    queue.push({
      depth: INDOOR_WALL_DEPTH,
      node: (
        <Group key={`iwall-${plan.id}-${w.id}`} listening={false}>
          <Line closed
            points={[sx, sy, ex, ey, ex, ey - screenH, sx, sy - screenH]}
            fill="#243049" stroke="#3a4a6b" strokeWidth={0.5} opacity={alpha}
          />
          <Line points={[sx, sy - screenH, ex, ey - screenH]}
            stroke="#6d83ad" strokeWidth={thick * 0.6} opacity={alpha * 0.8} lineCap="round"
          />
        </Group>
      ),
    });
  }

  // All furniture/object tools — extruded volumes
  const ISO_OBJECT_TYPES = new Set([
    'rack', 'shelf', 'stairs', 'elevator',
    'work-surface', 'chair', 'cabinet', 'drawer', 'locker',
    'storage-box', 'bin', 'pallet', 'bathroom', 'restroom', 'human',
  ]);

  // Pre-pass: flag objects whose flat floor footprint visually overlaps
  // another object's, so the renderer can add a small shadow/outline boost
  // to make an intentional-looking overlap instead of a glitchy one. Real
  // positions are untouched — this only affects styling.
  const collidingObjectIds = new Set<string>();
  {
    const candidateBoxes: { id: string; box: AABB }[] = [];
    for (const obj of objects) {
      if (!ISO_OBJECT_TYPES.has(obj.type)) continue;
      const rect = obj as RectangleObject;
      if (isoPresetKind(rect) === 'human') continue;
      const rot = rect.rotation ?? 0;
      const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
      const pts = rectToIsoPts({ x: rect.x, y: rect.y, w: rect.width, h: rect.height }, size, origin, rot, cx, cy);
      candidateBoxes.push({ id: rect.id, box: aabbFromPoints(pts) });
    }
    for (let i = 0; i < candidateBoxes.length; i++) {
      for (let j = i + 1; j < candidateBoxes.length; j++) {
        if (aabbOverlap(candidateBoxes[i].box, candidateBoxes[j].box, 4)) {
          collidingObjectIds.add(candidateBoxes[i].id);
          collidingObjectIds.add(candidateBoxes[j].id);
        }
      }
    }
  }

  for (const obj of objects) {
    if (!ISO_OBJECT_TYPES.has(obj.type)) continue;
    const rect = obj as RectangleObject;
    const style = OBJ_STYLE[rect.type] ?? OBJ_STYLE['rack'];
    // Boost sub-legible footprints: every projected edge renders at least
    // MIN_OBJ_EDGE_PX so thin objects read as boxes instead of slivers.
    // Inflated around center; the real object data is untouched.
    const minW = (MIN_OBJ_EDGE_PX / ISO_EDGE_SCALE) * planW;
    const minH = (MIN_OBJ_EDGE_PX / ISO_EDGE_SCALE) * planH;
    const drawW = Math.max(rect.width, minW);
    const drawH = Math.max(rect.height, minH);
    const drawX = rect.x - (drawW - rect.width) / 2;
    const drawY = rect.y - (drawH - rect.height) / 2;
    const drawRect = { x: drawX, y: drawY, w: drawW, h: drawH };
    // Lift top face by zH
    // Faces shaded from the object's own editor color (upper-left light):
    // top lightened, left face mid, right face darkest.
    const base = rect.color && parseHex(rect.color) ? rect.color : style.topStroke;
    const kind = isoPresetKind(rect);
    const hovered = ctx.hoveredObjectId === `${plan.id}:${rect.id}`;
    const rot = rect.rotation ?? 0;
    const cx = drawX + drawW / 2, cy = drawY + drawH / 2;
    const projectedFootprint = rectToIsoPts(drawRect, size, origin, rot, cx, cy);
    // Full extruded silhouette (base + lifted top), used both for the hit
    // polygon and for collision detection — collision should reflect the
    // object's actual on-screen extent, not just its flat floor footprint.
    const liftedFootprint = liftIsoPoints(projectedFootprint, isoPresetBaseLift(kind));
    const silhouette = isoPrismSilhouette(liftedFootprint, isoPresetHeight(kind, size));

    // Sort keys computed once, then reused for BOTH the visual queue entry
    // and the hit-test entry below, so they agree on which object is "in
    // front" — otherwise the visually-front object isn't always the one
    // that receives the click when two hit silhouettes overlap.
    // The lowest projected footprint point is nearest to the isometric camera.
    // Sorting on screen Y handles rotation and non-square plan dimensions.
    const frontScreenY = Math.max(...projectedFootprint.filter((_, index) => index % 2 === 1));
    const leftBiasKind: LeftBiasKind | undefined =
      kind === 'shelf' || kind === 'work-surface' ? kind : undefined;
    // Leftmost extent (not the centroid) — a long shelf/table's far end
    // shouldn't pull its "screen position" rightward when judging which of
    // two overlapping pieces reads as the left one.
    const leftBiasScreenX = leftBiasKind
      ? Math.min(...projectedFootprint.filter((_, index) => index % 2 === 0))
      : undefined;
    const depth = OBJECT_DEPTH_BASE + frontScreenY;
    const visualBox = aabbFromPoints(silhouette);
    const renderPriority = isoRenderPriority(kind);

    if (isInventoryIsoObject(rect)) {
      objectHitEntries.push({
        depth, leftBiasKind, leftBiasScreenX, visualBox, renderPriority, hovered,
        id: rect.id,
        node: (
          <Line key={`object-hit-${plan.id}-${rect.id}`} closed
            points={silhouette}
            fill="rgba(0,0,0,0.001)" stroke="transparent" strokeWidth={0}
            perfectDrawEnabled={false}
            onMouseDown={e => ctx.onObjectPointerDown(plan, rect, ox, oy, e)}
          />
        ),
      });
    }
    // Contact shadow along the base front edges (bl → br → tr)

    queue.push({
      depth, leftBiasKind, leftBiasScreenX, visualBox, renderPriority, hovered,
      id: rect.id,
      node: (
        <IsoObjectShape key={`obj-${plan.id}-${rect.id}`} planId={plan.id} object={rect}
          rect={drawRect} size={size} origin={origin} base={base} hovered={hovered}
          colliding={collidingObjectIds.has(rect.id)} />
      ),
    });
  }

  // Outdoor wall extrusion — all 4 walls full height, Matterport dollhouse style
  for (const w of outerWalls) {
    const cutaway = wallCutawayH(w.startX, w.startY, w.endX, w.endY, planW, planH, true);
    const [x1, y1] = toIso(w.startX, w.startY, planW, planH);
    const [x2, y2] = toIso(w.endX,   w.endY,   planW, planH);
    const sx = ox + x1; const sy = oy + y1;
    const ex = ox + x2; const ey = oy + y2;
    const h = cutaway.h;
    const screenH = isoZ(h);
    const alpha = ctx.isoMode === 'all' ? Math.max(0.72, cutaway.alpha) : cutaway.alpha;
    const wallColor = isFinalized ? '#16336b' : '#1d2737';
    const edgeColor = isFinalized ? '#82b5ff' : '#8b97ab';

    // Outer walls always paint before any object — use strongly negative depth offset
    // so every object depth-sorts in front of every outer wall segment.
    queue.push({
      depth: depthKey(w.startX + w.endX, w.startY + w.endY) / 2 - 99999,
      node: (
        <Group key={`owall-${plan.id}-${w.id}`} listening={false}>
          <Line closed
            points={[sx, sy, ex, ey, ex, ey - screenH, sx, sy - screenH]}
            fill={wallColor} stroke={edgeColor} strokeWidth={0.6} opacity={alpha}
          />
          <Line points={[sx, sy - screenH, ex, ey - screenH]}
            stroke={edgeColor} strokeWidth={1.2} opacity={alpha * 0.9} lineCap="round"
          />
        </Group>
      ),
    });
  }

  // Openings use projected screen depth so nearer objects can obstruct them.
  for (const obj of objects) {
    if (obj.type !== 'door' && obj.type !== 'window' && obj.type !== 'entrance') continue;
    const opening = obj as DoorObject | WindowObject | EntranceObject;
    if (!openingIsAttachedToWall(opening, allWallObjs)) continue;
    const angle = opening.angle ?? 0;
    const dx = Math.cos(angle) * opening.width / 2;
    const dy = Math.sin(angle) * opening.width / 2;
    const [x1, y1] = toIso(opening.x - dx, opening.y - dy, planW, planH);
    const [x2, y2] = toIso(opening.x + dx, opening.y + dy, planW, planH);
    const frontScreenY = oy + Math.max(y1, y2);
    const screenH = isoZ(opening.type === 'window' ? 20 : opening.type === 'entrance' ? 30 : 31);
    const screenLift = isoZ(opening.type === 'window' ? 9 : 0);
    const p1: Pt = [ox + x1, oy + y1];
    const p2: Pt = [ox + x2, oy + y2];
    const visualBox = aabbFromPoints([
      p1[0], p1[1] - screenLift,
      p2[0], p2[1] - screenLift,
      p2[0], p2[1] - screenLift - screenH,
      p1[0], p1[1] - screenLift - screenH,
    ]);
    queue.push({
      depth: OBJECT_DEPTH_BASE + frontScreenY,
      visualBox,
      renderPriority: isRestroomOpening(opening, objects) ? isoRenderPriority('restroom') : undefined,
      node: (
        <IsoOpeningShape key={`opening-${plan.id}-${obj.id}`} planId={plan.id}
          object={opening} size={size} origin={origin} />
      ),
    });
  }

  // Labels and markers — rendered outside the left wall in a uniform vertical column.
  // All floors share the same column X (corners[0].x) so the list is visually aligned
  // across the whole building stack.
  if (ctx.isoMode === 'single') {
    // Labels anchor at the bottom/front tip (corners[3]) — where left+right walls meet.
    // Stack pills centered horizontally on that tip, growing upward from it.
    const anchorX  = bottomTip[0];
    const anchorY  = bottomTip[1] + ISO_WALL_H + 8; // just below the front tip
    const pillW    = 160;
    const pillH    = 20;
    const colX     = anchorX - pillW / 2; // centered on the tip

    const labelItems: { key: string; text: string; dotColor: string }[] = [];

    for (const obj of objects) {
      if (labelItems.length >= 10) break;
      if (obj.type === 'label') {
        const label = obj as LabelObject;
        const text  = label.text || label.label || 'Label';
        labelItems.push({ key: `label-${plan.id}-${label.id}`, text, dotColor: '#60a5fa' });
      } else if (obj.type === 'marker') {
        const marker = obj as InventoryMarkerObject;
        const text   = marker.label || marker.id || 'Marker';
        labelItems.push({ key: `marker-${plan.id}-${marker.id}`, text, dotColor: '#34d399' });
      }
    }

    if (labelItems.length > 0) {
      const textW    = pillW - 22; // available text width inside pill
      const lineH    = 11;         // px per wrapped line at fontSize 9
      const padV     = 6;          // top + bottom padding inside pill

      // Pre-compute height for each pill based on estimated line count
      const itemHeights = labelItems.map(item => {
        const charsPerLine = Math.floor(textW / 5.4); // ~5.4px per char at fontSize 9
        const lines = Math.ceil(item.text.length / Math.max(1, charsPerLine));
        return Math.max(pillH, padV + lines * lineH);
      });

      // Accumulate Y positions
      const itemGap = 4;
      const itemYs: number[] = [];
      let curY = anchorY;
      for (const h of itemHeights) {
        itemYs.push(curY);
        curY += h + itemGap;
      }

      queue.push({
        depth: 999999,
        node: (
          <Group key={`labelcol-${plan.id}`} listening={false}>
            {/* Short leader line from tip down to the first pill */}
            <Line
              points={[anchorX, bottomTip[1] + ISO_WALL_H, anchorX, anchorY]}
              stroke={ctx.isDark ? '#334155' : '#94a3b8'} strokeWidth={1} dash={[3, 3]} opacity={0.6}
            />
            {/* Dot at the front tip */}
            <Circle x={anchorX} y={bottomTip[1] + ISO_WALL_H} radius={3}
              fill={ctx.isDark ? '#334155' : '#94a3b8'} opacity={0.9} />
            {labelItems.map((item, i) => {
              const rowY = itemYs[i];
              const h    = itemHeights[i];
              return (
                <Group key={item.key}>
                  <Rect
                    x={colX} y={rowY}
                    width={pillW} height={h} cornerRadius={3}
                    fill={ctx.isDark ? 'rgba(7,13,28,0.88)' : 'rgba(255,255,255,0.92)'}
                    stroke={ctx.isDark ? '#1e3a5f' : '#bfcfdf'} strokeWidth={0.8}
                  />
                  <Circle x={colX + 8} y={rowY + padV / 2 + lineH / 2} radius={3} fill={item.dotColor} />
                  <Text
                    x={colX + 18} y={rowY + padV / 2}
                    width={textW} text={item.text}
                    fontSize={9} fontStyle="bold"
                    fill={ctx.isDark ? '#cbd5e1' : '#1e293b'}
                    wrap="word"
                  />
                </Group>
              );
            })}
          </Group>
        ),
      });
    }
  }

  // Sort by depth (back-to-front), back-of-screen objects first, front
  // objects last (so they paint on top). See compareIsoRenderEntries for the
  // full priority chain used when two objects visually overlap. The hit-test
  // list below is sorted with the EXACT same comparator so the object that
  // draws in front is also the one that receives hover/click.
  queue.sort(compareIsoRenderEntries);
  objectHitEntries.sort(compareIsoRenderEntries);
  const objectHits = objectHitEntries.map(entry => entry.node);

  // ── Assemble visual + hit nodes separately ────────────────────────────────
  const labelColor = ctx.isDark
    ? (floorAlpha >= 0.7 ? (isHovered ? '#f8fafc' : '#a5b4cd') : '#5a6886')
    : (floorAlpha >= 0.7 ? (isHovered ? '#0f172a' : '#334155') : '#64748b');

  const slabSides = slabSideQuads(topFacePts, ISO_SLAB_H);
  const shadowPts = topFacePts.map((v, i) => (i % 2 === 1 ? v + isoZ(ISO_SLAB_H) + 4 : v));
  const chipW = isFinalized ? 44 : 28;

  const visual = (
    <Group key={`floor-visual-${plan.id}`} opacity={floorAlpha} listening={false}
      y={isHovered ? -ISO_HOVER_LIFT : 0}
    >
      {/* Grounded soft shadow — two passes fake a blurred edge cheaply */}
      <Line closed points={shadowPts} fill="#01040a" opacity={0.5} />
      <Line closed points={shadowPts} stroke="#01040a" strokeWidth={5} opacity={0.18} lineJoin="round" />
      {/* Shared building envelope — ghost ring for context only */}
      {envelopePts && (
        <Line closed points={envelopePts} stroke={accentColor} strokeWidth={1}
          dash={[6, 5]} opacity={0.3} lineJoin="round"
        />
      )}
      {/* Slab plinth sides — lit by the shared upper-left light */}
      {slabSides.map((side, i) => (
        <Line key={`slab-${plan.id}-${i}`} closed points={side.quad}
          fill={side.dark ? shade(slabTopBase, 0.55) : shade(slabTopBase, 0.32)}
          stroke={shade(slabTopBase, 0.7)} strokeWidth={0.4}
        />
      ))}
      {/* Slab top face */}
      <Line closed points={topFacePts} fill={slabTop}
        stroke={tint(slabTopBase, 0.28)} strokeWidth={0.8}
      />
      {/* Perimeter accent: finalized floors get a glow, drafts a plain edge */}
      {isFinalized ? (
        <>
          <Line closed points={topFacePts} stroke={accentColor} strokeWidth={4}
            opacity={isHovered ? 0.4 : 0.22} lineJoin="round"
          />
          <Line closed points={topFacePts} stroke={tint(accentColor, 0.35)}
            strokeWidth={1.3} opacity={0.95} lineJoin="round"
          />
        </>
      ) : (
        <Line closed points={topFacePts} stroke={accentColor}
          strokeWidth={isHovered ? 1.8 : 1.1} opacity={0.8}
        />
      )}
      {/* Depth-sorted content */}
      {showObjects && queue.map(item => item.node)}
      {/* Floor chip — sits exactly at the right diamond tip */}
      <Group
        visible={ctx.isoMode === 'single'}
        x={rightTip[0] + 6}
        y={rightTip[1] - 9}
      >
        <Rect width={chipW} height={18} cornerRadius={9}
          fill={ctx.isDark ? 'rgba(7,13,28,0.88)' : 'rgba(255,255,255,0.92)'}
          stroke={accentColor} strokeWidth={1}
        />
        <Text x={0} y={4} width={chipW} align="center"
          text={`F${fn}${isFinalized ? ' (F)' : ''}`}
          fontSize={10} fontStyle="bold" fill={labelColor}
        />
      </Group>
    </Group>
  );

  // Invisible hit polygon — full rectangular footprint, always same size per floor
  const hit = (
    <Group key={`floor-hit-${plan.id}`}>
      <Line closed points={footprintPts}
        fill="rgba(0,0,0,0.001)" stroke="transparent" strokeWidth={0}
        perfectDrawEnabled={false}
        onClick={() => ctx.onNavigate(plan.id)}
      />
      {objectHits}
    </Group>
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

  // All floors in a building share a render frame, then each floor is
  // translated by its finalized perimeter/content bounds so crop shifts do not
  // move the dollhouse position.
  const frame = buildIsoFrame(bld.floors);
  const sharedSize = frame.size;

  const visuals: React.ReactNode[] = [];
  const hits: React.ReactNode[] = [];

  for (const plan of sorted) {
    const fn = plan.floorNumber ?? 1;
    const oy = baseY - (fn - 1) * ISO_FLOOR_SEP;
    const origin = isoFloorOrigin(plan, bOffX, oy, frame);

    let floorAlpha: number;
    let showObjects: boolean;

    if (isSingleMode) {
      floorAlpha  = ISO_STYLE.selectedFloorAlpha;
      showObjects = true;
    } else {
      floorAlpha  = 1;
      showObjects = true;
    }

    const { visual, hit } = buildIsoFloorNodes(plan, origin.originX, origin.originY, ctx, floorAlpha, showObjects, sharedSize);
    visuals.push(visual);
    hits.push(hit);
  }

  // Building label — centred on the bottom tip of the iso diamond
  // Bottom tip screen position: origin + toIso(planW, planH) = (0, +ISO_PLAN_SIZE*ISO_TH/2)
  const bottomTipY = baseY + (ISO_PLAN_SIZE * ISO_TH) / 2 + isoZ(ISO_SLAB_H) + 10;
  visuals.push(
    <Text key={`ibl-${bld.key}`} listening={false}
      x={bOffX - 90} y={bottomTipY}
      width={180} align="center"
      text={bld.label.toUpperCase()} fontSize={ctx.labelFontSize} fontStyle="bold"
      fill={ctx.isDark ? '#64748b' : '#475569'} letterSpacing={1.5}
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
type IsoObjectHover = { planId: string; objectId: string };

// ─── component ────────────────────────────────────────────────────────────────
export default function Building2D() {
  const navigate     = useNavigate();
  const { theme }    = useTheme();
  const isDark       = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef     = useRef<Konva.Stage>(null);

  // Same permission rule as the 2D editor (FloorPlanEditor.tsx): staff are
  // always read-only; everyone else is read-only on a finalized plan unless
  // they're an admin. Used to gate object dragging in the isometric view.
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  const isPlanReadOnly = useCallback(
    (plan: FloorPlan) => user.role === 'staff' || (!!plan.isApproved && !isAdmin),
    [user.role, isAdmin],
  );

  const [allPlans, setAllPlans]       = useState<FloorPlan[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [dragError, setDragError]     = useState<string | null>(null);
  const [viewMode, setViewMode]       = useState<'elevation' | 'topDown25D' | 'isometric'>('elevation');
  // Isometric view defaults to read-only; dragging objects is opt-in via the Edit button.
  const [isoEditMode, setIsoEditMode] = useState(false);
  const [tooltip, setTooltip]         = useState<TooltipState | null>(null);
  const [hoveredId, setHoveredId]     = useState<string | null>(null);
  const [, setHoveredFloor] = useState<number | null>(null);
  const [hoveredObject, setHoveredObject] = useState<IsoObjectHover | null>(null);
  const [scale, setScale]             = useState(1);
  const [stageSize, setStageSize]     = useState({ w: 800, h: 600 });
  const [isoFloorFilter, setIsoFloorFilter] = useState<number | null>(null); // null = all
  const [isoBuildingIndex, setIsoBuildingIndex] = useState(0);
  const [labelFontSize, setLabelFontSize] = useState(10);

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
    const map = new Map<string, { label: string; floors: FloorPlan[] }>();
    for (const p of allPlans) {
      let key = p.buildingKey ?? null;
      let label: string | null = null;
      let plan = p;
      if (!key) {
        // Manual buildings have no buildingKey column — derive identity and
        // floor number from the "(Auto|Manual) - … - Building N - Floor M - …"
        // name pattern, like the FloorPlans merge flow does.
        const m = p.name.match(/^((?:Auto|Manual) - .+ - Building \d+) - Floor (\d+) - /);
        if (m) {
          key = `name:${m[1]}`;
          label = m[1].replace(/^(?:Auto|Manual) - /, '');
          plan = { ...p, floorNumber: p.floorNumber ?? Number(m[2]) };
        } else {
          // Standalone plan — only show if finalized
          if (!p.isApproved) continue;
          key = `standalone:${p.id}`;
          label = p.name;
          plan = { ...p, floorNumber: 1 };
        }
      }
      const entry = map.get(key) ?? {
        label: label ?? `Building ${key.replace(/^dept-[^-]+-building-/, '')}`,
        floors: [],
      };
      entry.floors.push(plan);
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .map(([key, { label, floors }]) => {
        const sorted = [...floors].sort((a, b) => (a.floorNumber ?? 0) - (b.floorNumber ?? 0));
        return { key, label, floors: sorted,
          maxFloor: Math.max(...sorted.map(f => f.floorNumber ?? 1)) };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [allPlans]);

  const zoom = (d: number) => setScale(s => Math.min(4, Math.max(0.2, s + d)));
  const resetZoom = () => { setScale(1); stageRef.current?.position({ x: 0, y: 0 }); };

  const handleHover = useCallback((plan: FloorPlan, e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (pos) setTooltip(prev =>
      prev && prev.plan.id === plan.id && prev.x === pos.x && prev.y === pos.y ? prev : { x: pos.x, y: pos.y, plan }
    );
    setHoveredId(prev => prev === plan.id ? prev : plan.id);
    setHoveredFloor(prev => { const fn = plan.floorNumber ?? null; return prev === fn ? prev : fn; });
    document.body.style.cursor = 'pointer';
  }, []);

  const handleHoverEnd = useCallback(() => {
    setTooltip(null);
    setHoveredId(null);
    setHoveredFloor(null);
    document.body.style.cursor = 'default';
  }, []);

  const handleObjectHover = useCallback((id: string) => {
    setHoveredObject(prev => prev?.objectId === id ? prev : { planId: '', objectId: id });
    document.body.style.cursor = 'pointer';
  }, []);

  const handleObjectHoverEnd = useCallback(() => {
    setHoveredObject(null);
    document.body.style.cursor = 'default';
  }, []);

  const handleNavigate = useCallback((id: string) => {
    navigate(`/floor-plans/${id}/edit`);
  }, [navigate]);

  const maxFloors = buildings.length > 0 ? Math.max(...buildings.map(b => b.maxFloor)) : 0;
  const focusedIsoBuilding = buildings.length > 0
    ? buildings[isoBuildingIndex % buildings.length]
    : null;

  const showNextIsoBuilding = () => {
    setIsoBuildingIndex(index => buildings.length > 0 ? (index + 1) % buildings.length : 0);
    setIsoFloorFilter(null);
    handleHoverEnd();
    handleObjectHoverEnd();
    stageRef.current?.position({ x: 0, y: 0 });
  };

  const showPreviousIsoBuilding = () => {
    setIsoBuildingIndex(index => buildings.length > 0 ? (index - 1 + buildings.length) % buildings.length : 0);
    setIsoFloorFilter(null);
    handleHoverEnd();
    handleObjectHoverEnd();
    stageRef.current?.position({ x: 0, y: 0 });
  };

  const allFloorNumbers = useMemo(() => {
    const nums = new Set<number>();
    for (const p of focusedIsoBuilding?.floors ?? []) nums.add(p.floorNumber ?? 1);
    return Array.from(nums).sort((a, b) => a - b);
  }, [focusedIsoBuilding]);

  const finalizedFloors = useMemo(
    () => (focusedIsoBuilding?.floors ?? []).filter(plan => plan.isApproved),
    [focusedIsoBuilding],
  );
  const finalizedFloorNumbers = useMemo(
    () => finalizedFloors.map(plan => plan.floorNumber ?? 1),
    [finalizedFloors],
  );
  const topDownPlan = useMemo(() => {
    const selected = finalizedFloors.find(plan => (plan.floorNumber ?? 1) === isoFloorFilter);
    return selected ?? finalizedFloors[finalizedFloors.length - 1] ?? null;
  }, [finalizedFloors, isoFloorFilter]);
  const topDownData = useMemo(
    () => topDownPlan ? floorPlanToBevData(topDownPlan) : null,
    [topDownPlan],
  );

  // Precompute the shared iso frame per building so finalized crop shifts do
  // not change the dollhouse position for individual floors.
  const isoSharedFrame = useMemo<IsoFrame | null>(
    () => focusedIsoBuilding ? buildIsoFrame(focusedIsoBuilding.floors) : null,
    [focusedIsoBuilding],
  );
  const isoSharedSize = isoSharedFrame?.size ?? null;

  // Cache chainWallsToPolygon results keyed by plan id.
  // Origin is (0,0) — callers add the real ox/oy offset when using the points.
  const isoWallPolyCache = useMemo<Map<string, number[] | null>>(() => {
    const cache = new Map<string, number[] | null>();
    if (!focusedIsoBuilding || !isoSharedSize) return cache;
    const { planW, planH } = isoSharedSize;
    for (const plan of focusedIsoBuilding.floors) {
      const allWalls = (plan.objects ?? []).filter(o => o.type === 'wall') as import('@/types/floorplan').WallObject[];
      const finalPerim = allWalls.filter(w => w.wallType === 'finalized_building_perimeter' || w.isFinalizedPerimeter === true);
      const ownOutdoor = allWalls.filter(w => w.wallType === 'floor_original_outdoor');
      const source = ownOutdoor.length > 0 ? ownOutdoor : finalPerim;
      // Store with origin (0,0); offset added at render time
      cache.set(plan.id, chainWallsToPolygon(source, planW, planH, 0, 0));
      // Also cache the finalized envelope separately
      if (finalPerim.length > 0 && ownOutdoor.length > 0) {
        cache.set(`${plan.id}:envelope`, chainWallsToPolygon(finalPerim, planW, planH, 0, 0));
      }
    }
    return cache;
  }, [focusedIsoBuilding, isoSharedSize]);

  // ── elevation (front facade) renderer ────────────────────────────────────────
  const renderElevation = () => {
    const nodes: React.ReactNode[] = [];

    buildings.forEach((bld, bi) => {
      const bx = START_X + bi * (BUILDING_W + BUILDING_GAP);
      const totalFloors = bld.maxFloor;
      const facadeH = totalFloors * FLOOR_H;
      const facadeTop = START_Y;

      // Compute the shared perimeter bounds once for all finalized floors in this
      // building so every floor band uses the same scale — producing one consistent
      // merged-perimeter shape rather than per-floor independent outlines.
      const finalizedFloors = bld.floors.filter(p => p.isApproved);
      const sharedBounds = buildingPerimeterBounds(finalizedFloors);

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

        const outdoorWalls = isFinalized ? getOutdoorWalls(plan, sharedBounds) : [];

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

  // ── isometric renderer ───────────────────────────────────────────────────────
  // Static geometry (slabs, walls, rooms, objects) is memoized — only recomputes
  // when floor plan data, layout, or theme changes. Hover state is excluded from
  // the memo deps so mouse movement never triggers a full rebuild.
  const centerX = stageSize.w / 2;
  const baseY   = stageSize.h * 0.72;
  const isoMode: 'single' | 'all' = isoFloorFilter !== null ? 'single' : 'all';

  const isoObjectHitTargets = useMemo<IsoObjectHitTarget[]>(() => {
    if (!focusedIsoBuilding || isoFloorFilter === null) return [];
    const frame = isoSharedFrame ?? buildIsoFrame(focusedIsoBuilding.floors);
    const size = frame.size;
    const targets: IsoObjectHitTarget[] = [];
    const filtered = focusedIsoBuilding.floors.filter(plan => (plan.floorNumber ?? 1) === isoFloorFilter);
    const floors = [...filtered].sort((a, b) => (a.floorNumber ?? 1) - (b.floorNumber ?? 1));

    floors.forEach((plan, floorOrder) => {
      const fn = plan.floorNumber ?? 1;
      const baseFloorOy = baseY - (fn - 1) * ISO_FLOOR_SEP;
      const origin = isoFloorOrigin(plan, centerX, baseFloorOy, frame);
      const floorOx = origin.originX;
      const floorOy = origin.originY;

      for (const object of plan.objects ?? []) {
        if (!ISO_RENDERABLE_OBJECT_TYPES.has(object.type)) continue;
        const rect = object as RectangleObject;
        if (!isInventoryIsoObject(rect)) continue;
        const minW = (MIN_OBJ_EDGE_PX / ISO_EDGE_SCALE) * size.planW;
        const minH = (MIN_OBJ_EDGE_PX / ISO_EDGE_SCALE) * size.planH;
        const drawW = Math.max(rect.width, minW);
        const drawH = Math.max(rect.height, minH);
        const drawRect = {
          x: rect.x - (drawW - rect.width) / 2,
          y: rect.y - (drawH - rect.height) / 2,
          w: drawW,
          h: drawH,
        };
        const kind = isoPresetKind(rect);
        const rot = rect.rotation ?? 0;
        const cx = drawRect.x + drawRect.w / 2;
        const cy = drawRect.y + drawRect.h / 2;
        const projectedFootprint = rectToIsoPts(drawRect, size, origin, rot, cx, cy);
        const liftedFootprint = liftIsoPoints(projectedFootprint, isoPresetBaseLift(kind));
        const points = isoPrismSilhouette(liftedFootprint, isoPresetHeight(kind, size));
        const frontScreenY = Math.max(...projectedFootprint.filter((_, index) => index % 2 === 1));
        const leftBiasKind: LeftBiasKind | undefined =
          kind === 'shelf' || kind === 'work-surface' ? kind : undefined;
        const leftBiasScreenX = leftBiasKind
          ? Math.min(...projectedFootprint.filter((_, index) => index % 2 === 0))
          : undefined;

        targets.push({
          plan,
          rect,
          floorOx,
          floorOy,
          points,
          floorOrder,
          depth: OBJECT_DEPTH_BASE + frontScreenY,
          leftBiasKind,
          leftBiasScreenX,
          visualBox: aabbFromPoints(points),
          renderPriority: isoRenderPriority(kind),
          hovered: hoveredObject?.planId === plan.id && hoveredObject.objectId === rect.id,
          id: rect.id,
        });
      }
    });

    return targets
      .sort((a, b) => a.floorOrder - b.floorOrder || compareIsoRenderEntries(a, b))
      .reverse();
  }, [focusedIsoBuilding, isoSharedFrame, isoFloorFilter, centerX, baseY, hoveredObject]);

  // ── Object dragging (isometric, single-floor mode only) ──────────────────
  // dragPreview drives a lightweight overlay layer only — never written into
  // allPlans mid-drag, so the expensive isoStaticResult memo never rebuilds
  // while the pointer is moving. The candidate ref holds everything needed
  // to resolve a single drag gesture without forcing re-renders on every
  // mousemove (only dragPreview triggers a render, intentionally).
  interface DragPreview { planId: string; objectId: string; wx: number; wy: number; }
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [isObjectDragActive, setIsObjectDragActive] = useState(false);
  const dragCandidateRef = useRef<{
    plan: FloorPlan;
    rect: RectangleObject;
    floorOx: number;
    floorOy: number;
    startScreenX: number;
    startScreenY: number;
    grabOffsetX: number; // initial object-center plan-x minus initial cursor plan-x
    grabOffsetY: number;
    isDragging: boolean;
    canDrag: boolean; // false for read-only plans — click-to-navigate still works, drag does not
  } | null>(null);

  const DRAG_THRESHOLD_PX = 5;

  const handleObjectPointerDown = useCallback((
    plan: FloorPlan, rect: RectangleObject, floorOx: number, floorOy: number,
    e: Konva.KonvaEventObject<MouseEvent>,
  ) => {
    const canDrag = isoEditMode && isoMode === 'single' && !isPlanReadOnly(plan);
    if (canDrag) e.cancelBubble = true; // stop the Stage's own pan-drag from also starting
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    const size = isoSharedSize ?? { planW: 800, planH: 600 };
    const [cursorWx, cursorWy] = fromIso(pos.x - floorOx, pos.y - floorOy, size.planW, size.planH);
    const objectCenterX = rect.x + rect.width / 2;
    const objectCenterY = rect.y + rect.height / 2;
    dragCandidateRef.current = {
      plan, rect, floorOx, floorOy,
      startScreenX: pos.x, startScreenY: pos.y,
      grabOffsetX: objectCenterX - cursorWx,
      grabOffsetY: objectCenterY - cursorWy,
      isDragging: false,
      canDrag,
    };
  }, [isoEditMode, isoMode, isoSharedSize, isPlanReadOnly]);

  const getIsoStagePoint = useCallback((stage: Konva.Stage | null) => {
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return null;
    return stage.getAbsoluteTransform().copy().invert().point(pointer);
  }, []);

  const getIsoObjectAtPoint = useCallback((x: number, y: number) => {
    for (const target of isoObjectHitTargets) {
      if (pointInIsoPolygon(x, y, target.points)) return target;
    }
    return null;
  }, [isoObjectHitTargets]);

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    const stagePoint = viewMode === 'isometric' ? getIsoStagePoint(stage) : null;
    const hoveredTarget = stagePoint ? getIsoObjectAtPoint(stagePoint.x, stagePoint.y) : null;
    const candidate = dragCandidateRef.current;
    if (viewMode === 'isometric' && !candidate?.isDragging) {
      const nextHover = hoveredTarget
        ? { planId: hoveredTarget.plan.id, objectId: hoveredTarget.rect.id }
        : null;
      setHoveredObject(prev =>
        prev?.planId === nextHover?.planId && prev?.objectId === nextHover?.objectId ? prev : nextHover
      );
      document.body.style.cursor = hoveredTarget ? 'pointer' : 'default';
    }
    if (!candidate || !candidate.canDrag) return;
    const pos = stage?.getPointerPosition();
    if (!pos) return;

    if (!candidate.isDragging) {
      const dx = pos.x - candidate.startScreenX;
      const dy = pos.y - candidate.startScreenY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      candidate.isDragging = true;
      setIsObjectDragActive(true);
      setHoveredObject(null);
      document.body.style.cursor = 'grabbing';
    }

    const size = isoSharedSize ?? { planW: 800, planH: 600 };
    const [cursorWx, cursorWy] = fromIso(
      pos.x - candidate.floorOx, pos.y - candidate.floorOy, size.planW, size.planH,
    );
    const newCenterX = cursorWx + candidate.grabOffsetX;
    const newCenterY = cursorWy + candidate.grabOffsetY;
    setDragPreview({
      planId: candidate.plan.id,
      objectId: candidate.rect.id,
      wx: newCenterX - candidate.rect.width / 2,
      wy: newCenterY - candidate.rect.height / 2,
    });
  }, [getIsoObjectAtPoint, getIsoStagePoint, isoSharedSize, viewMode]);

  const handleStageMouseUp = useCallback(() => {
    const candidate = dragCandidateRef.current;
    if (!candidate) return;
    if (!candidate.isDragging) {
      // Plain click on an object (never exceeded drag threshold) — no-op.
      // Objects are repositioned by dragging only; they no longer navigate.
      dragCandidateRef.current = null;
      setIsObjectDragActive(false);
      setDragPreview(null);
      return;
    }

    // Completed drag: commit the live preview position into allPlans (one
    // update, matching moveObjectWithGrid's snap-to-grid + rotation-aware
    // center-snap behavior), then persist with a single whole-plan PUT —
    // mirroring the 2D editor's save shape. Roll back on failure.
    const { plan, rect } = candidate;
    const finalPreview = dragPreview;
    dragCandidateRef.current = null;
    setIsObjectDragActive(false);
    setDragPreview(null);
    if (!finalPreview || finalPreview.planId !== plan.id || finalPreview.objectId !== rect.id) return;

    document.body.style.cursor = 'default';
    const previousObjects = plan.objects ?? [];
    const movedObject = moveObjectWithGrid(rect, finalPreview.wx, finalPreview.wy, true);
    const updatedObjects = previousObjects.map(o => o.id === rect.id ? movedObject : o);
    const updatedPlan = { ...plan, objects: updatedObjects };

    setAllPlans(prev => prev.map(p => p.id === plan.id ? updatedPlan : p));

    floorPlansApi.update(plan.id, { ...updatedPlan }).catch(() => {
      setAllPlans(prev => prev.map(p => p.id === plan.id ? { ...p, objects: previousObjects } : p));
      setDragError('Failed to save the new position — change reverted.');
      setTimeout(() => setDragError(null), 4000);
    });
  }, [dragPreview]);

  const isoStaticResult = useMemo(() => {
    const staticCtx: IsoCtx = {
      hoveredId: null, hoveredFloor: null, hoveredObjectId: null,
      isoMode, isDark, labelFontSize,
      onHover: handleHover, onHoverEnd: handleHoverEnd, onNavigate: handleNavigate,
      onObjectHover: handleObjectHover, onObjectHoverEnd: handleObjectHoverEnd,
      onObjectPointerDown: handleObjectPointerDown,
    };

    const allVisuals: React.ReactNode[] = [];
    const allHits: React.ReactNode[] = [];

    if (focusedIsoBuilding) {
      const { visuals, hits } = buildIsoBuilding(
        focusedIsoBuilding, 0, 1, centerX, baseY, staticCtx, isoFloorFilter
      );
      allVisuals.push(...visuals);
      allHits.push(...hits);
    }

    allHits.reverse();
    return { allVisuals, allHits };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIsoBuilding, isoMode, isDark, labelFontSize, centerX, baseY, isoFloorFilter,
      handleHover, handleHoverEnd, handleNavigate, handleObjectHover, handleObjectHoverEnd,
      handleObjectPointerDown]);

  // Hover overlay — lightweight: just a lifted floor highlight and object glow.
  // Recomputes on hover change but touches nothing in the static geometry.
  const isoHoverOverlay = useMemo(() => {
    if (!focusedIsoBuilding || (!hoveredId && !hoveredObject)) return null;

    const frame = isoSharedFrame ?? buildIsoFrame(focusedIsoBuilding.floors);
    const sharedSize = frame.size;
    const nodes: React.ReactNode[] = [];

    for (const plan of focusedIsoBuilding.floors) {
      if (isoFloorFilter !== null && (plan.floorNumber ?? 1) !== isoFloorFilter) continue;
      const fn = plan.floorNumber ?? 1;
      const oy = baseY - (fn - 1) * ISO_FLOOR_SEP;
      const origin = isoFloorOrigin(plan, centerX, oy, frame);

      // Floor lift highlight
      if (hoveredId === plan.id && isoMode === 'single') {
        const cachedPts = isoWallPolyCache.get(plan.id);
        const topFacePts = cachedPts
          ? cachedPts.map((v, i) => i % 2 === 0 ? v + origin.originX : v + origin.originY)
          : planCorners(sharedSize.planW, sharedSize.planH, origin.originX, origin.originY).flatMap(([x, y]) => [x, y]);
        nodes.push(
          <Group key={`hover-floor-${plan.id}`} listening={false} y={-ISO_HOVER_LIFT}>
            <Line closed points={topFacePts}
              stroke="#3b82f6" strokeWidth={4} opacity={0.35} lineJoin="round"
            />
          </Group>
        );
      }

      // Object hover glow
      if (hoveredObject?.planId === plan.id) {
        const obj = (plan.objects ?? []).find(o => o.id === hoveredObject.objectId) as RectangleObject | undefined;
        if (obj && ISO_RENDERABLE_OBJECT_TYPES.has(obj.type) && isInventoryIsoObject(obj)) {
          const { planW, planH } = sharedSize;
          const minW = (MIN_OBJ_EDGE_PX / ISO_EDGE_SCALE) * planW;
          const minH = (MIN_OBJ_EDGE_PX / ISO_EDGE_SCALE) * planH;
          const drawW = Math.max(obj.width, minW);
          const drawH = Math.max(obj.height, minH);
          const drawRect = {
            x: obj.x - (drawW - obj.width) / 2,
            y: obj.y - (drawH - obj.height) / 2,
            w: drawW, h: drawH,
          };
          const kind = isoPresetKind(obj);
          const rot = obj.rotation ?? 0;
          const pivotX = drawRect.x + drawRect.w / 2;
          const pivotY = drawRect.y + drawRect.h / 2;
          const footprint = rectToIsoPts(
            drawRect,
            sharedSize,
            origin,
            rot,
            pivotX,
            pivotY,
          );
          const liftedFootprint = liftIsoPoints(footprint, isoPresetBaseLift(kind));
          const outline = isoPrismSilhouette(liftedFootprint, isoPresetHeight(kind, sharedSize));
          nodes.push(
            <Line key={`hover-obj-${plan.id}-${obj.id}`} listening={false}
              closed points={outline} stroke="#67e8f9" strokeWidth={5} opacity={0.32} lineJoin="round"
            />
          );
        }
      }
    }

    return nodes.length > 0 ? nodes : null;
  }, [focusedIsoBuilding, hoveredId, hoveredObject, isoMode, isoFloorFilter,
      baseY, centerX, isoSharedFrame, isoWallPolyCache]);

  // Drag preview — lightweight, redraws on every drag-move only. Drawn above
  // the hit layer so it visually occludes the stale original at its old
  // position; never touches isoStaticResult so dragging doesn't trigger a
  // full rebuild of the building's geometry.
  const dragPreviewNode = useMemo(() => {
    if (!dragPreview || !focusedIsoBuilding) return null;
    const plan = focusedIsoBuilding.floors.find(p => p.id === dragPreview.planId);
    const obj = plan?.objects?.find(o => o.id === dragPreview.objectId) as RectangleObject | undefined;
    if (!plan || !obj) return null;

    const fn = plan.floorNumber ?? 1;
    const oy = baseY - (fn - 1) * ISO_FLOOR_SEP;
    const frame = isoSharedFrame ?? buildIsoFrame(focusedIsoBuilding.floors);
    const size = frame.size;
    const origin = isoFloorOrigin(plan, centerX, oy, frame);
    const drawRect = { x: dragPreview.wx, y: dragPreview.wy, w: obj.width, h: obj.height };
    const kind = isoPresetKind(obj);
    const rot = obj.rotation ?? 0;
    const pivotX = drawRect.x + drawRect.w / 2;
    const pivotY = drawRect.y + drawRect.h / 2;
    const footprint = rectToIsoPts(drawRect, size, origin, rot, pivotX, pivotY);
    const liftedFootprint = liftIsoPoints(footprint, isoPresetBaseLift(kind));
    const outline = isoPrismSilhouette(liftedFootprint, isoPresetHeight(kind, size));
    return (
      <Line key={`drag-preview-${dragPreview.planId}-${dragPreview.objectId}`} listening={false}
        closed points={outline} stroke="#22c55e" strokeWidth={2} fill="rgba(34,197,94,0.18)" lineJoin="round"
      />
    );
  }, [dragPreview, focusedIsoBuilding, baseY, centerX, isoSharedFrame]);

  const renderIsometric = () => (
    <>
      {/* Static layer — rebuilt only when data/theme changes, not on hover */}
      <Layer listening={false}>
        {isoStaticResult.allVisuals}
      </Layer>
      {/* Hover overlay layer — lightweight, redraws on hover only */}
      {isoHoverOverlay && (
        <Layer listening={false}>
          {isoHoverOverlay}
        </Layer>
      )}
      {/* Hit layer — invisible polygons only, always on top */}
      <Layer>
        {isoStaticResult.allHits}
      </Layer>
      {/* Drag preview — above the hit layer so it occludes the stale original */}
      {dragPreviewNode && (
        <Layer listening={false}>
          {dragPreviewNode}
        </Layer>
      )}
    </>
  );




  // ── stats ─────────────────────────────────────────────────────────────────────
  const totalFinalized = allPlans.filter(p => p.isApproved).length;
  const trackedFloors  = buildings.reduce((sum, b) => sum + b.floors.length, 0);
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
        fillLinearGradientColorStops: isDark
          ? [0, '#0f172a', 0.6, '#1e293b', 1, '#273549'] as (string | number)[]
          : [0, '#bfdbfe', 0.6, '#dbeafe', 1, '#e0f2fe'] as (string | number)[],
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
              {viewMode === 'topDown25D'
                ? 'Top-down 2.5D presentation - editable JSON floorplan with depth'
                : viewMode === 'elevation'
                ? 'Front elevation — buildings side by side, floors stacked upward'
                : 'Isometric dollhouse — floor slabs stacked per building'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Floor filter — isometric only */}
          {(viewMode === 'isometric' || viewMode === 'topDown25D') &&
            (viewMode === 'isometric' ? allFloorNumbers : finalizedFloorNumbers).length > 1 && (
            <div className="flex border border-[var(--border)] rounded overflow-hidden text-xs">
              {viewMode === 'isometric' && (
                <button
                  onClick={() => { setIsoFloorFilter(null); handleHoverEnd(); handleObjectHoverEnd(); }}
                  className={`px-2.5 py-1.5 font-medium ${isoFloorFilter === null ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
                >
                  All
                </button>
              )}
              {(viewMode === 'isometric' ? allFloorNumbers : finalizedFloorNumbers).map(fn => (
                <button
                  key={fn}
                  onClick={() => {
                    setIsoFloorFilter(viewMode === 'isometric' && isoFloorFilter === fn ? null : fn);
                    handleHoverEnd();
                    handleObjectHoverEnd();
                  }}
                  className={`px-2.5 py-1.5 font-medium border-l border-[var(--border)] ${(viewMode === 'topDown25D' ? (topDownPlan?.floorNumber ?? 1) === fn : isoFloorFilter === fn) ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
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
              onClick={() => setViewMode('topDown25D')}
              className={`px-3 py-1.5 font-medium flex items-center gap-1.5 border-l border-[var(--border)] ${viewMode === 'topDown25D' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
            >
              <Layers size={12} /> Top-Down 2.5D
            </button>
            <button
              onClick={() => setViewMode('isometric')}
              className={`px-3 py-1.5 font-medium flex items-center gap-1.5 border-l border-[var(--border)] ${viewMode === 'isometric' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
            >
              <Box size={12} /> Isometric
            </button>
          </div>

          {/* Edit toggle — isometric only; enables dragging objects to reposition them */}
          {viewMode === 'isometric' && (
            <button
              onClick={() => setIsoEditMode(v => !v)}
              title={isoEditMode ? 'Exit edit mode' : 'Edit mode: drag objects to reposition them'}
              className={`px-3 py-1.5 rounded border text-xs font-medium flex items-center gap-1.5 ${isoEditMode ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
            >
              <Pencil size={12} /> {isoEditMode ? 'Editing' : 'Edit'}
            </button>
          )}

          {/* Zoom */}
          <div className="flex border border-[var(--border)] rounded overflow-hidden">
            <button onClick={() => zoom(0.15)} className="px-2 py-1.5 hover:bg-[var(--surface-2)] text-[var(--text-muted)]"><ZoomIn size={13} /></button>
            <button onClick={() => zoom(-0.15)} className="px-2 py-1.5 hover:bg-[var(--surface-2)] text-[var(--text-muted)] border-x border-[var(--border)]"><ZoomOut size={13} /></button>
            <button onClick={resetZoom} className="px-2 py-1.5 hover:bg-[var(--surface-2)] text-[var(--text-muted)]"><Maximize2 size={13} /></button>
          </div>

          {/* Building label font size — only useful in iso view */}
          {viewMode === 'isometric' && (
            <div className="flex items-center gap-1 border border-[var(--border)] rounded overflow-hidden">
              <button
                onClick={() => setLabelFontSize(s => Math.max(6, s - 1))}
                className="px-2 py-1.5 hover:bg-[var(--surface-2)] text-[var(--text-muted)] text-xs font-bold"
              >A-</button>
              <span className="px-1 text-xs text-[var(--text-muted)] select-none">{labelFontSize}</span>
              <button
                onClick={() => setLabelFontSize(s => Math.min(24, s + 1))}
                className="px-2 py-1.5 hover:bg-[var(--surface-2)] text-[var(--text-muted)] text-xs font-bold border-l border-[var(--border)]"
              >A+</button>
            </div>
          )}

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
        <span className="ml-auto text-[var(--text-muted)]">
          {viewMode === 'isometric' && isoEditMode
            ? 'Drag an object to reposition it · Drag empty space to pan · Scroll to zoom'
            : 'Click any floor to open editor · Drag to pan · Scroll to zoom'}
        </span>
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
        {(viewMode === 'isometric' || viewMode === 'topDown25D') && buildings.length > 1 && (
          <>
            <button
              onClick={showPreviousIsoBuilding}
              aria-label="Show previous building"
              title="Previous building"
              className="group absolute left-6 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/15 text-blue-300 shadow-lg shadow-blue-950/40 backdrop-blur-sm outline-none transition-all duration-300 hover:scale-110 hover:border-blue-300/60 hover:bg-blue-500/30 hover:text-white hover:shadow-blue-500/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <ChevronLeft size={21} className="transition-transform duration-300 group-hover:-translate-x-0.5" />
            </button>
            <button
              onClick={showNextIsoBuilding}
              aria-label="Show next building"
              title="Next building"
              className="group absolute right-6 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/15 text-blue-300 shadow-lg shadow-blue-950/40 backdrop-blur-sm outline-none transition-all duration-300 hover:scale-110 hover:border-blue-300/60 hover:bg-blue-500/30 hover:text-white hover:shadow-blue-500/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <ChevronRight size={21} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          </>
        )}

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
        {dragError && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded bg-red-600 text-white text-xs shadow-lg">
            {dragError}
          </div>
        )}

        {viewMode === 'topDown25D' && topDownData ? (
          <TopDown25DFloorplanView
            data={topDownData}
            width={stageSize.w}
            height={stageSize.h}
            zoom={scale}
            isDark={isDark}
            stageRef={stageRef}
            onZoomDelta={zoom}
          />
        ) : viewMode === 'topDown25D' ? (
          !loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
              <Building2 size={36} className="opacity-20" />
              <p className="text-sm">This building has no finalized floorplan to show.</p>
            </div>
          )
        ) : hasBuildings ? (
          <Stage
            ref={stageRef}
            width={stageSize.w}
            height={stageSize.h}
            scaleX={scale}
            scaleY={scale}
            draggable={!isObjectDragActive}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            onMouseLeave={() => {
              setHoveredObject(null);
              if (!isObjectDragActive) document.body.style.cursor = 'default';
            }}
            onWheel={e => {
              e.evt.preventDefault();
              zoom(e.evt.deltaY > 0 ? -0.08 : 0.08);
            }}
            style={{ background:
              viewMode === 'elevation' ? (isDark ? '#0f172a' : '#b8d4f0') :
              /* isometric */ (isDark ? '#060b14' : '#dde6f0') }}
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
            className="absolute z-20 pointer-events-none bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl px-3 py-2.5 text-xs min-w-[190px]"
            style={{
              left: Math.min(tooltip.x + 14, stageSize.w - 210),
              top:  Math.max(8, tooltip.y - 90),
            }}
          >
            <p className="font-bold text-[var(--text)] mb-1.5 leading-tight truncate max-w-[180px]">
              {tooltip.plan.name}
            </p>
            <div className="space-y-1 text-[var(--text-muted)]">
              <div className="flex justify-between gap-4">
                <span>Floor</span>
                <span className="text-[var(--text)] font-medium">F{tooltip.plan.floorNumber}</span>
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
              <p className="text-[var(--text-muted)] opacity-60 mt-1.5 pt-1.5 border-t border-[var(--border)] text-[10px]">
                Click to open editor
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
