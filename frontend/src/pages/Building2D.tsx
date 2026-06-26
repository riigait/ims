import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Stage, Layer, Rect, Line, Group, Text, Circle } from 'react-konva';
import Konva from 'konva';
import { authApi, floorPlansApi, productsApi, locationsApi } from '@/services/api';
import type {
  DoorObject,
  EntranceObject,
  FloorPlan,
  FloorPlanObject,
  InventoryMarkerObject,
  LabelObject,
  PolygonRoomObject,
  RectangleObject,
  TableFrontVariant,
  WallObject,
  WindowObject,
} from '@/types/floorplan';
import type { Product, Location } from '@/types/inventory';
import ObjectFrontView from '@/components/floorplan/ObjectFrontView';
import { Lock, Building2, RefreshCw, ZoomIn, ZoomOut, Maximize2, Layers, Box, ChevronLeft, ChevronRight, Pencil, ChevronsDown, ChevronDown, ChevronUp, ChevronsUp, List } from 'lucide-react';
import { extractOutdoorWall } from '@/utils/floorplanGeometry';
import { useTheme } from '@/contexts/ThemeContext';
import TopDown25DFloorplanView from '@/components/floorplan/TopDown25DFloorplanView';
import { floorPlanToBevData } from '@/utils/floorplanBevAdapter';
import { moveObjectWithGrid } from '@/utils/floorplanGrid';
import { getLinkedLocationIds } from '@/utils/floorplanLocationLinks';
import { IsoHumanFigure, HUMAN_WIDTH_U, HUMAN_DEPTH_U, HUMAN_HEIGHT_U } from '@/components/floorplan/iso/IsoHumanFigure';
import AllDepartmentsBanner from '@/components/AllDepartmentsBanner';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

// ─── isometric constants ──────────────────────────────────────────────────────
// ISO_TH/ISO_TW ratio controls camera elevation angle.
// Lower ratio = flatter footprint = lower eye position = more side faces visible.
// Mutable (not const): the user's Iso View Settings panel can adjust these
// live (and persist them server-side) — every projection helper below
// (toIso/isoZ/isoDelta/etc.) reads the current value at call time, so a
// change takes effect on the next render without threading params through
// the whole call graph.
let ISO_TW              = 3.2;
let ISO_TH              = 1.4;
let ISO_Z_SCALE         = 1.6;
const ISO_TW_DEFAULT      = 3.2;
const ISO_TH_DEFAULT      = 1.4;
const ISO_Z_SCALE_DEFAULT = 1.6;
const ISO_FLOOR_SEP    = 90;    // gap between floors in All mode
const ISO_BUILDING_SEP = 520;
const ISO_PLAN_SIZE    = 480;   // iso footprint side in screen px
// Screen px produced by one full plan-dimension along an iso footprint edge.
// Function, not a constant, since it depends on the mutable ISO_TW/ISO_TH above.
function getIsoEdgeScale(): number {
  return Math.hypot(ISO_PLAN_SIZE * ISO_TW / 2, ISO_PLAN_SIZE * ISO_TH / 2);
}
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
    // Finalized perimeter walls can carry small (~1-10 unit) joint gaps from
    // upstream endpoint clustering (buildFinalizedPerimeterWalls). The default
    // tolerance (4) rejects those as unclosed loops and falls back to a blank
    // rectangle slab — widen it here so the iso view still closes the ring.
    tolerance: 12,
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

// ─── iso open-floorplan renderer ─────────────────────────────────────────────
type HoverHandler = (plan: FloorPlan, e: Konva.KonvaEventObject<MouseEvent>) => void;


interface IsoCtx {
  hoveredId:    string | null;   // hovered plan id
  hoveredFloor: number | null;   // hovered floor number (for All mode ghosting)
  hoveredObjectId: string | null;
  isoMode:      'single' | 'all';
  isDark:       boolean;
  labelFontSize: number;
  onHover:      HoverHandler;
  onHoverEnd:   () => void;
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

/** The wall an opening sits closest to (nearest within attach tolerance), or null. */
function findAttachedWall(
  opening: DoorObject | WindowObject | EntranceObject,
  walls: import('@/types/floorplan').WallObject[],
): import('@/types/floorplan').WallObject | null {
  let best: import('@/types/floorplan').WallObject | null = null;
  let bestDist = Infinity;
  for (const wall of walls) {
    const dist = pointToWallDistance(opening.x, opening.y, wall);
    if (dist <= Math.max(20, (wall.thickness ?? 8) * 2) && dist < bestDist) {
      best = wall;
      bestDist = dist;
    }
  }
  return best;
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

// rect.type is the real, authoritative kind now (pallet/cabinet/drawer/etc.
// are their own stored types). The regex-on-label fallback below only fires
// for old, not-yet-migrated data that still has type:'rack'/'shelf' with a
// descriptive label.
function isoPresetKind(rect: RectangleObject): IsoPresetKind {
  if (rect.type === 'bathroom') return 'restroom';
  if (rect.type !== 'rack' && rect.type !== 'shelf') return rect.type as IsoPresetKind;

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
  if (/human|person|staff|figure/.test(name)) return 'human';
  return rect.type as IsoPresetKind;
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

// Standard ray-casting point-in-polygon test against a flat [x0,y0,x1,y1,...]
// points array (the same silhouette data used to draw the object), so the
// manual hover/click scan (handleStageMouseMove/handleStageMouseUp) tests
// hits against exactly what's on screen — mirrors pointInElementHitBox in
// the Top-Down 2.5D view's TopDown25DFloorplanView.tsx.
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
    const wallC   = '#e8edf3';  // off-white plaster walls
    const floorC  = '#c8d4de';  // light blue-grey ceramic tile
    const ceramic = '#f4f8fc';  // white porcelain
    const cShadow = '#d4dde8';  // porcelain shadow face
    const chrome  = '#8fa4bc';  // chrome fittings
    const mirrorC = '#c5daf5';  // mirror glass tint (light blue)

    const sinkCounter = subIsoRect(rect, 0.12, 0.11, 0.28, 0.18);
    const sinkBowl    = subIsoRect(rect, 0.15, 0.12, 0.22, 0.13);
    const toiletTank  = subIsoRect(rect, 0.58, 0.11, 0.27, 0.19);
    const toiletBowl  = subIsoRect(rect, 0.55, 0.26, 0.32, 0.27);
    const mirrorRect  = subIsoRect(rect, 0.12, 0.09, 0.27, 0.022);

    const sinkCenter  = isoFaceCenter(sinkCounter, size, origin, u(98), rot, pvX, pvY);
    const tankCenter  = isoFaceCenter(toiletTank,  size, origin, u(94), rot, pvX, pvY);

    shape = <>
      {/* Walls */}
      <IsoPrism rect={subIsoRect(rect, 0, 0, 1, 0.09)}         size={size} origin={origin} base={wallC} height={u(220)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <IsoPrism rect={subIsoRect(rect, 0, 0.09, 0.09, 0.91)}   size={size} origin={origin} base={wallC} height={u(220)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      <IsoPrism rect={subIsoRect(rect, 0.91, 0.09, 0.09, 0.91)} size={size} origin={origin} base={wallC} height={u(220)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      {/* Floor tile */}
      <IsoPrism rect={subIsoRect(rect, 0.09, 0.09, 0.82, 0.91)} size={size} origin={origin} base={floorC} height={u(3)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      {/* Mirror strip on back wall */}
      <IsoPrism rect={mirrorRect} size={size} origin={origin} base={mirrorC} height={u(215)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      {/* Sink counter */}
      <IsoPrism rect={sinkCounter} size={size} origin={origin} base={ceramic} height={u(96)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      {/* Sink basin recessed */}
      <IsoPrism rect={sinkBowl} size={size} origin={origin} base={cShadow} height={u(89)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      {/* Faucet knob */}
      <Circle x={sinkCenter[0]} y={sinkCenter[1] - 1} radius={2.2} fill={chrome} stroke="#4a6070" strokeWidth={0.5} />
      {/* Toilet tank */}
      <IsoPrism rect={toiletTank} size={size} origin={origin} base={ceramic} height={u(93)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      {/* Toilet bowl / seat */}
      <IsoPrism rect={toiletBowl} size={size} origin={origin} base={ceramic} height={u(48)} rotation={rot} pivotX={pvX} pivotY={pvY} />
      {/* Flush button */}
      <Circle x={tankCenter[0]} y={tankCenter[1] - 1} radius={1.7} fill={chrome} stroke="#4a6070" strokeWidth={0.4} />
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
  // Doors and windows are 30% opaque / 70% transparent (0.3 fill alpha) and
  // always frontmost (every corner, see the openings loop) — so the frame
  // highlight always uses the bright "front" styling, no per-corner fade.
  const windowFillAlpha = 0.3;
  const windowGlow = object.type === 'window' ? tint(color, 0.7) : tint(color, 0.38);
  const windowStrokeWidth = object.type === 'window' ? 2.2 : 1.2;

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
      <Line closed points={panel} fill={hexToRgba(color, windowFillAlpha)}
        stroke={windowGlow} strokeWidth={windowStrokeWidth} />
      {object.type === 'window' ? (
        <>
          <Line points={[p1[0], p1[1] - screenLift - screenH / 2, p2[0], p2[1] - screenLift - screenH / 2]} stroke={tint(color, 0.6)} strokeWidth={1.0} />
          <Line points={[p1[0], p1[1] - screenLift, p1[0], p1[1] - screenLift - screenH]} stroke={tint(color, 0.65)} strokeWidth={1.8} />
          <Line points={[p2[0], p2[1] - screenLift, p2[0], p2[1] - screenLift - screenH]} stroke={shade(color, 0.2)} strokeWidth={1.8} />
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
  // Screen-space vertical extent of the object's extrusion (smaller y = higher
  // up). Lets two overlapping objects at different heights resolve by actual
  // physical separation — e.g. a tall rack's top reaching over a low cabinet
  // beside it — before falling back to type priority/left-bias/depth.
  zTopScreen?: number; zBaseScreen?: number;
  // Set only when the user explicitly used the layer-order buttons on this
  // specific object (persisted as isoManualOrder). Undefined for every
  // object that was never manually reordered, so the automatic
  // height/priority/depth tiers below stay authoritative for them — this
  // must NOT be the object's raw array position, or every pair of touching
  // objects would resolve by array order instead of physics, which silently
  // breaks hover/click for whichever one loses that comparison.
  manualOrder?: number;
  // Present only on furniture hit entries — lets the Stage-level manual
  // hover/click scan reuse this exact sorted list instead of recomputing a
  // second, separately-sorted hit-test (the previous source of hover/click
  // disagreement). points is the same projected silhouette used to draw
  // the object, so "what you see" and "what gets hit" can never diverge.
  // Mirrors the 2.5D view: ONE function (the manual scan) resolves both
  // hover and click, instead of relying on Konva's native per-shape
  // mouseenter/mouseleave (unreliable for many overlapping rotated
  // polygons) for hover while click goes through Konva's hit-graph.
  hitTarget?: {
    plan: FloorPlan;
    rect: RectangleObject | DoorObject | WindowObject | EntranceObject;
    floorOx: number; floorOy: number; points: number[];
  };
  // Set only on outdoor/perimeter wall entries. Lets "All floors" mode keep
  // the building's outer shell visible while skipping every interior
  // object/indoor-wall/opening node — those scale with floor count and are
  // the actual cost driver at 50-100 floors (thousands of shapes redrawn on
  // every pan/hover), while exterior walls stay a fixed ~4 segments/floor.
  isExterior?: boolean;
};

type IsoSortable = Omit<RQ, 'node'>;

// Shared comparator used for BOTH the visual render queue and the object
// hit-test list, so the entry that draws in front is also the one that
// receives hover/click — otherwise Konva resolves overlapping clicks by
// raw array order, which can silently disagree with the visual stacking.
function compareIsoRenderEntries(a: IsoSortable, b: IsoSortable): number {
  // 4px padding: an actual silhouette overlap, or a near-miss within 4px,
  // should trigger front/behind resolution.
  const colliding = a.visualBox && b.visualBox && aabbOverlap(a.visualBox, b.visualBox, 4);
  if (colliding) {
    // Doors/windows carry an absolute front (100) or absolute back (10)
    // render priority, set per-quadrant in the openings loop. Both are
    // checked first, before hover/manual-order/height — nothing (not a
    // hovered object's glow, not a taller object's physical extent) can
    // push an absolute-front opening behind, or an absolute-back opening
    // in front of, a colliding nearby object.
    const aAbsolute = a.renderPriority === 100 ? 1 : a.renderPriority === 10 ? -1 : 0;
    const bAbsolute = b.renderPriority === 100 ? 1 : b.renderPriority === 10 ? -1 : 0;
    if (aAbsolute !== bAbsolute) return aAbsolute - bAbsolute;

    if (a.hovered !== b.hovered) return a.hovered ? 1 : -1;
    // Every object in a plan gets a manualOrder stamp (= its array index) as
    // soon as ANY object on that floor is reordered once — see
    // reorderIsoObject, which restamps the whole array so indices stay
    // mutually consistent. So once a floor has had one manual reorder, this
    // branch decides every collision on it by array position; floors never
    // touched fall through to physical depth below as before.
    if (a.manualOrder !== undefined || b.manualOrder !== undefined) {
      const ao = a.manualOrder ?? -Infinity;
      const bo = b.manualOrder ?? -Infinity;
      if (ao !== bo) return ao - bo;
    }
    // Physical height separation beats type/left-bias/depth tie-breaks: if
    // one object's extrusion sits entirely above or below the other's on
    // screen, that vertical gap is real and should decide front/behind.
    if (a.zTopScreen !== undefined && a.zBaseScreen !== undefined
      && b.zTopScreen !== undefined && b.zBaseScreen !== undefined) {
      if (a.zBaseScreen <= b.zTopScreen) return 1; // a sits above b's top — a in front
      if (b.zBaseScreen <= a.zTopScreen) return -1; // b sits above a's top — b in front
    }
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

interface IsoFloorResult { visual: React.ReactNode; hitTargets: NonNullable<RQ['hitTarget']>[]; }

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
  // ownOutdoor can be non-empty but still NOT form a closed loop (e.g. only
  // 3 of the 4 sides are tagged floor_original_outdoor, the rest are plain
  // walls) — chainWallsToPolygon returns null in that case. Fall through to
  // the finalized shared perimeter (usually a complete closed loop) before
  // giving up and using the oversized rectangular plan footprint. Track
  // which wall set actually produced a usable polygon so bounds (below)
  // are computed from the SAME set the slab shape uses — otherwise an
  // incomplete ownOutdoor set would clip the bounds too.
  let perimPts = chainWallsToPolygon(outerWalls, planW, planH, ox, oy);
  let boundsWalls = outerWalls;
  if (!perimPts && outerWalls !== finalPerim) {
    perimPts = chainWallsToPolygon(finalPerim, planW, planH, ox, oy);
    if (perimPts) boundsWalls = finalPerim;
  }
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

  // This floor's own occupied bounds (NOT planW/planH, which is the shared
  // cross-floor frame size used only for screen projection — normalizing a
  // wall's position against that instead of this floor's actual extent
  // misclassifies its quadrant whenever floors differ in size, since a
  // wall on the east edge of a small floor can still be < 50% of a larger
  // shared planW). Falls back to the full plan rect if there are no walls.
  const floorBoundsXs = boundsWalls.length > 0
    ? boundsWalls.flatMap(w => [w.startX, w.endX])
    : [0, planW];
  const floorBoundsYs = boundsWalls.length > 0
    ? boundsWalls.flatMap(w => [w.startY, w.endY])
    : [0, planH];
  const floorMinX = Math.min(...floorBoundsXs), floorMaxX = Math.max(...floorBoundsXs);
  const floorMinY = Math.min(...floorBoundsYs), floorMaxY = Math.max(...floorBoundsYs);

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

  for (let objArrayIndex = 0; objArrayIndex < objects.length; objArrayIndex++) {
    const obj = objects[objArrayIndex];
    if (!ISO_OBJECT_TYPES.has(obj.type)) continue;
    const rect = obj as RectangleObject;
    const style = OBJ_STYLE[rect.type] ?? OBJ_STYLE['rack'];
    // Boost sub-legible footprints: every projected edge renders at least
    // MIN_OBJ_EDGE_PX so thin objects read as boxes instead of slivers.
    // Inflated around center; the real object data is untouched.
    const minW = (MIN_OBJ_EDGE_PX / getIsoEdgeScale()) * planW;
    const minH = (MIN_OBJ_EDGE_PX / getIsoEdgeScale()) * planH;
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
    // Base = lowest point of the lifted footprint (closest to the floor);
    // top = highest point after extrusion. Smaller screen-y is higher up.
    const zBaseScreen = Math.max(...liftedFootprint.filter((_, index) => index % 2 === 1));
    const zTopScreen = Math.min(...silhouette.filter((_, index) => index % 2 === 1));
    const manualOrder = rect.isoManualOrder;

    // Every iso object type is hit-testable now (drag + layer-order
    // selection apply uniformly, including chairs/stairs/elevators/
    // restroom/human). No Konva listeners here — hover and click are both
    // resolved by the Stage-level manual scan in handleStageMouseMove/
    // handleStageMouseUp, against this exact sorted entry list, so they can
    // never disagree about which object is "at" a point.
    objectHitEntries.push({
      depth, leftBiasKind, leftBiasScreenX, visualBox, renderPriority, hovered, zTopScreen, zBaseScreen,
      manualOrder,
      id: rect.id,
      hitTarget: { plan, rect, floorOx: ox, floorOy: oy, points: silhouette },
      node: null,
    });
    // Contact shadow along the base front edges (bl → br → tr)

    queue.push({
      depth, leftBiasKind, leftBiasScreenX, visualBox, renderPriority, hovered, zTopScreen, zBaseScreen,
      manualOrder,
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
      isExterior: true,
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
    const attachedWall = findAttachedWall(opening, allWallObjs);
    if (!attachedWall) continue;
    const angle = opening.angle ?? 0;
    const dx = Math.cos(angle) * opening.width / 2;
    const dy = Math.sin(angle) * opening.width / 2;
    const [x1, y1] = toIso(opening.x - dx, opening.y - dy, planW, planH);
    const [x2, y2] = toIso(opening.x + dx, opening.y + dy, planW, planH);
    const frontScreenY = oy + Math.max(y1, y2);
    // Quadrant = host wall's midpoint position, normalized against THIS
    // FLOOR's own occupied bounds (floorMinX/MaxX/MinY/MaxY), not the
    // shared cross-floor planW/planH — otherwise a wall on a small floor's
    // east edge can still normalize below 0.5 against a larger floor's
    // shared frame size. SE = high-X (east) AND high-Y (south). NW =
    // low-X (west) AND low-Y (north).
    const wallMidX = (attachedWall.startX + attachedWall.endX) / 2;
    const wallMidY = (attachedWall.startY + attachedWall.endY) / 2;
    const floorSpanX = floorMaxX - floorMinX || 1;
    const floorSpanY = floorMaxY - floorMinY || 1;
    const nWallX = Math.min(1, Math.max(0, (wallMidX - floorMinX) / floorSpanX));
    const nWallY = Math.min(1, Math.max(0, (wallMidY - floorMinY) / floorSpanY));
    const isNWCorner = nWallX < 0.5 && nWallY < 0.5;
    // The absolute front/back quadrant rule only applies to openings on
    // OUTDOOR walls (the building's outer shell). A door/window set into an
    // INDOOR wall is just another piece of furniture as far as stacking
    // goes — it falls back to the normal object render path (no fixed
    // priority, eligible for isoManualOrder) so it can be reordered with
    // the same Back/Backward/Forward/Front controls as a rack or shelf.
    const isOutdoorWall = attachedWall.wallType === 'floor_original_outdoor';
    const isWindow = opening.type === 'window';
    // Windows: no absolute priority — depth-sorted between outdoor walls and
    // objects so they appear embedded in the wall (behind furniture/racks but
    // visible above the outer wall surface). Doors/entrances keep the existing
    // outdoor-wall quadrant rule (NW = always back, else always front).
    // Openings rotated to 270° (angle stored in radians, so 3*PI/2) always
    // render frontmost regardless of quadrant — e.g. a NW-corner door/window
    // that faces the camera at this rotation must not fall back into the
    // always-back tier. Still drawn at the existing 0.3 fill alpha (see
    // IsoOpeningShape) so objects behind it stay visible/hoverable.
    const isRotated270 = Math.abs(((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - (3 * Math.PI) / 2) < 0.01;
    const isAlwaysBack = !isWindow && isOutdoorWall && isNWCorner && !isRotated270;
    const isAlwaysFront = isRotated270 || (!isWindow && isOutdoorWall && !isAlwaysBack);
    const screenH = isoZ(isWindow ? 20 : opening.type === 'entrance' ? 30 : 31);
    const screenLift = isoZ(isWindow ? 9 : 0);
    const p1: Pt = [ox + x1, oy + y1];
    const p2: Pt = [ox + x2, oy + y2];
    const visualBox = aabbFromPoints([
      p1[0], p1[1] - screenLift,
      p2[0], p2[1] - screenLift,
      p2[0], p2[1] - screenLift - screenH,
      p1[0], p1[1] - screenLift - screenH,
    ]);
    // Windows sit above outdoor walls (depth -99999) but below objects (OBJECT_DEPTH_BASE = 1M).
    // Doors/entrances: always-front at INDOOR_WALL_DEPTH+1, always-back at object tier.
    // 270°-rotated openings (doors AND windows) always win the always-front tier.
    const openingDepth = isAlwaysFront
      ? INDOOR_WALL_DEPTH + 1 + frontScreenY
      : isWindow
        ? Math.floor(OBJECT_DEPTH_BASE / 2) + frontScreenY
        : OBJECT_DEPTH_BASE + frontScreenY;
    const openingPanel = [
      p1[0], p1[1] - screenLift,
      p2[0], p2[1] - screenLift,
      p2[0], p2[1] - screenLift - screenH,
      p1[0], p1[1] - screenLift - screenH,
    ];
    const openingRenderPriority = isAlwaysFront ? 100 : isAlwaysBack ? 10 : undefined;
    // Windows and outdoor-wall openings never participate in manual layer order.
    const openingManualOrder = isWindow || isOutdoorWall ? undefined : opening.isoManualOrder;
    objectHitEntries.push({
      depth: openingDepth,
      visualBox,
      zTopScreen: visualBox.minY, zBaseScreen: visualBox.maxY,
      renderPriority: openingRenderPriority,
      manualOrder: openingManualOrder,
      id: opening.id,
      hitTarget: { plan, rect: opening, floorOx: ox, floorOy: oy, points: openingPanel },
      node: null,
    });
    queue.push({
      depth: openingDepth,
      visualBox,
      zTopScreen: visualBox.minY, zBaseScreen: visualBox.maxY,
      renderPriority: openingRenderPriority,
      manualOrder: openingManualOrder,
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
      {/* Compass labels at the four OUTDOOR WALL boundary corners (floorMinX/
          MaxX/MinY/MaxY — the same bounds the door/window quadrant rule
          uses), not the full floor-plate footprint — the slab is often much
          larger than the building shell, so corners[] (planCorners) would
          place labels far outside the actual building. Same NW/NE/SE/SW
          order as planCorners for consistency. Ground markings, drawn
          under all objects, so they never interfere with hover/click.
          In "All floors" mode every stacked slab shares the same compass
          orientation, so repeating it on each floor is pure clutter —
          show it once on floor 1 only. Clicking a floor switches to
          isoMode 'single' (see isoFloorFilter), which always shows its
          own compass regardless of floor number. */}
      {(ctx.isoMode === 'single' || fn === 1) && (['NW', 'NE', 'SE', 'SW'] as const).map((compass, i) => {
        const [bx, by] = [
          [floorMinX, floorMinY],
          [floorMaxX, floorMinY],
          [floorMaxX, floorMaxY],
          [floorMinX, floorMaxY],
        ][i];
        const [ix, iy] = toIso(bx, by, planW, planH);
        const cx = ox + ix, cy = oy + iy;
        return (
          <Text key={`compass-${plan.id}-${compass}`} listening={false}
            text={compass} x={cx} y={cy} offsetX={12} offsetY={6}
            fontSize={12} fontStyle="bold" fill={accentColor} opacity={0.55}
          />
        );
      })}
      {/* Depth-sorted content. When interior objects are hidden (showObjects
          false), still draw exterior/perimeter walls so the building shell
          stays visible — only furniture/indoor-walls/openings are dropped. */}
      {(showObjects ? queue : queue.filter(item => item.isExterior)).map(item => item.node)}
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

  // Sorted, front-to-back-resolved hit targets for this floor's furniture —
  // consumed by the Stage-level manual scan (getIsoObjectAtPoint) for BOTH
  // hover and click, mirroring the Top-Down 2.5D view's proven single-scan
  // architecture instead of relying on Konva's native per-shape hover
  // events (unreliable across many overlapping rotated polygons).
  const hitTargets = objectHitEntries
    .map(entry => entry.hitTarget)
    .filter((t): t is NonNullable<RQ['hitTarget']> => t !== undefined);

  return { visual, hitTargets };
}

interface IsoBuildingNodes {
  visuals: React.ReactNode[];
  hitTargets: NonNullable<RQ['hitTarget']>[];
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
  const hitTargets: NonNullable<RQ['hitTarget']>[] = [];

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
      // "All floors" mode: shape count scales with floor count, so at 50-100
      // floors rendering every interior object/indoor-wall/opening on every
      // floor is the actual perf cost (thousands of shapes redrawn on every
      // pan/hover). Only the exterior shell is shown — click a floor to drop
      // into single mode for full interior detail.
      floorAlpha  = 1;
      showObjects = false;
    }

    const { visual, hitTargets: floorHitTargets } = buildIsoFloorNodes(plan, origin.originX, origin.originY, ctx, floorAlpha, showObjects, sharedSize);
    visuals.push(visual);
    hitTargets.push(...floorHitTargets);
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

  return { visuals, hitTargets };
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
  // Isometric view scale — persisted per-user (see authApi.updateIsoViewSettings).
  // Synced into the mutable module-level ISO_TW/ISO_TH/ISO_Z_SCALE (read by every
  // projection helper below) on each render, right before any iso geometry is built.
  const [isoViewOpen, setIsoViewOpen] = useState(false);
  const [isoTW, setIsoTW]             = useState(user.isoViewSettings?.isoTW ?? ISO_TW_DEFAULT);
  const [isoTH, setIsoTH]             = useState(user.isoViewSettings?.isoTH ?? ISO_TH_DEFAULT);
  const [isoZScaleState, setIsoZScaleState] = useState(user.isoViewSettings?.isoZScale ?? ISO_Z_SCALE_DEFAULT);
  const [isoViewSaving, setIsoViewSaving] = useState(false);
  const [isoViewSaveError, setIsoViewSaveError] = useState<string | null>(null);
  ISO_TW = isoTW;
  ISO_TH = isoTH;
  ISO_Z_SCALE = isoZScaleState;
  const [viewMode, setViewMode]       = useState<'topDown25D' | 'isometric'>('topDown25D');
  // Isometric view defaults to read-only; dragging objects is opt-in via the Edit button.
  const [isoEditMode, setIsoEditMode] = useState(false);
  const [tooltip, setTooltip]         = useState<TooltipState | null>(null);
  const [hoveredId, setHoveredId]     = useState<string | null>(null);
  const [, setHoveredFloor] = useState<number | null>(null);
  const [hoveredObject, setHoveredObject] = useState<IsoObjectHover | null>(null);
  // Selected object in Edit mode — drives the small Front/Back/Auto control.
  // Click-to-select only (drag still repositions); cleared on edit-mode exit.
  const [selectedIsoObject, setSelectedIsoObject] = useState<IsoObjectHover | null>(null);
  // Free-typed value for the layer-jump number input in the Edit-mode popup.
  const [layerJumpInput, setLayerJumpInput] = useState('');
  // Whether the "all objects in this floor" list popup is open (Edit mode only).
  const [isoObjectListOpen, setIsoObjectListOpen] = useState(false);
  // Tracks which iso side panel was opened most recently, so the shared
  // sidebar stack puts the freshest one on top instead of a fixed order.
  const [lastOpenedIsoPanel, setLastOpenedIsoPanel] = useState<'objects' | 'view'>('view');
  // Objects panel: search/pagination/expanded-detail state. Reset together
  // whenever the panel closes so reopening it doesn't show a stale page or
  // search term from a previous floor.
  const [objectsSearch, setObjectsSearch] = useState('');
  const [objectsPage, setObjectsPage] = useState(1);
  const [objectsPageSize, setObjectsPageSize] = useState(20);
  // Detail popup: which object, and the row's on-screen anchor so the popup
  // floats beside the clicked row instead of pushing rows down inline.
  // `top` anchors downward (popup grows below the row); `bottom` anchors
  // upward (popup grows above the row, used for rows near list bottom).
  type ObjectDetailPopup = { objectId: string; left: number } & (
    | { top: number; bottom?: undefined }
    | { bottom: number; top?: undefined }
  );
  const [objectDetailPopup, setObjectDetailPopup] = useState<ObjectDetailPopup | null>(null);
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

  // Loaded once for the object front-view panel (left-click a rack/shelf/
  // etc. in isometric mode) — not used by the canvas render itself.
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    productsApi.getAll({ limit: 500 }).then(res => {
      setProducts((res.data.data ?? res.data) as Product[]);
    }).catch(() => { /* non-critical for the front-view panel */ });
  }, []);

  const [locations, setLocations] = useState<Location[]>([]);
  useEffect(() => {
    locationsApi.getAll({ limit: 500 }).then(res => {
      setLocations((res.data.data ?? res.data) as Location[]);
    }).catch(() => { /* non-critical for the front-view panel */ });
  }, []);

  const [frontViewTarget, setFrontViewTarget] = useState<{ planId: string; object: RectangleObject } | null>(null);
  const FRONT_VIEW_TYPES = new Set([
    'rack', 'shelf', 'cabinet', 'locker', 'storage-box', 'bin', 'pallet', 'drawer', 'work-surface',
  ]);

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

  const handleObjectHoverEnd = useCallback(() => {
    setHoveredObject(null);
    document.body.style.cursor = 'default';
  }, []);

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
    [focusedIsoBuilding, isoTW, isoTH],
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

  // ── isometric renderer ───────────────────────────────────────────────────────
  // Static geometry (slabs, walls, rooms, objects) is memoized — only recomputes
  // when floor plan data, layout, or theme changes. Hover state is excluded from
  // the memo deps so mouse movement never triggers a full rebuild.
  const centerX = stageSize.w / 2;
  const baseY   = stageSize.h * 0.72;
  // Buildings with exactly one floor never show the All/1/2/.. filter chip
  // (rendered only when allFloorNumbers.length > 1), so isoFloorFilter can
  // never become non-null for them — without this they'd be stuck in "all
  // floors" mode forever and never render their own objects.
  const isoMode: 'single' | 'all' =
    (isoFloorFilter !== null || allFloorNumbers.length <= 1) ? 'single' : 'all';

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
    rect: RectangleObject | DoorObject | WindowObject | EntranceObject;
    floorOx: number;
    floorOy: number;
    startScreenX: number;
    startScreenY: number;
    grabOffsetX: number; // initial object-center plan-x minus initial cursor plan-x
    grabOffsetY: number;
    isDragging: boolean;
    canDrag: boolean; // false for read-only plans, or "All floors" mode — drag needs single-floor mode
    canSelect: boolean; // Edit mode + not read-only; allowed in "All floors" mode too (selection only, no drag)
    isLeftButton: boolean; // front-view panel opens on left-click release regardless of edit mode
  } | null>(null);

  const DRAG_THRESHOLD_PX = 5;

  const isoStaticResult = useMemo(() => {
    const staticCtx: IsoCtx = {
      hoveredId: null, hoveredFloor: null, hoveredObjectId: null,
      isoMode, isDark, labelFontSize,
      onHover: handleHover, onHoverEnd: handleHoverEnd,
    };

    const allVisuals: React.ReactNode[] = [];
    let allHitTargets: NonNullable<RQ['hitTarget']>[] = [];

    if (focusedIsoBuilding) {
      const { visuals, hitTargets } = buildIsoBuilding(
        focusedIsoBuilding, 0, 1, centerX, baseY, staticCtx, isoFloorFilter
      );
      allVisuals.push(...visuals);
      allHitTargets = hitTargets;
    }

    // Front-most object should be checked FIRST by the manual point scan —
    // hitTargets came out sorted back-to-front (same order they're drawn),
    // so reverse for hit-testing, matching the 2.5D view's hitElements.
    allHitTargets.reverse();
    return { allVisuals, allHitTargets };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIsoBuilding, isoMode, isDark, labelFontSize, centerX, baseY, isoFloorFilter,
      handleHover, handleHoverEnd, isoTW, isoTH, isoZScaleState]);

  // stage.getPointerPosition() returns RAW container-pixel coordinates —
  // it does NOT divide out the Stage's own scaleX/scaleY/x/y (the zoom/pan
  // transform applied via <Stage scaleX={scale} ...>). The silhouette
  // points used for hit-testing are in pre-scale Stage-local units, so at
  // any zoom other than 1.0 a raw pointer position no longer lines up with
  // them — this was the exact cause of hover drifting off objects when
  // zoomed. getRelativePointerPosition() applies the Stage's own inverse
  // transform first, matching Konva's documented approach for this case.
  const getIsoStagePoint = useCallback((stage: Konva.Stage | null) => {
    return stage?.getRelativePointerPosition() ?? null;
  }, []);

  // Single source of truth for "what object is at this Stage-local point",
  // used by BOTH hover and click/drag-start below — mirrors the Top-Down
  // 2.5D view's getElementAtPoint, which is exactly why that view's hover
  // never disagrees with its click. isoStaticResult.allHitTargets is
  // already sorted front-to-back (reversed from draw order) so the first
  // match is the visually front-most object.
  const getIsoObjectAtPoint = useCallback((x: number, y: number) => {
    for (const target of isoStaticResult.allHitTargets) {
      if (pointInIsoPolygon(x, y, target.points)) return target;
    }
    return null;
  }, [isoStaticResult]);

  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (viewMode !== 'isometric') return;
    const stage = e.target.getStage();
    const pos = getIsoStagePoint(stage);
    if (!pos) return;
    const target = getIsoObjectAtPoint(pos.x, pos.y);
    if (!target) return;

    const { plan, rect, floorOx, floorOy } = target;
    // Doors/windows/entrances are selectable (for the layer toolbar + outline)
    // but stay pinned to their host wall — never draggable.
    const isOpening = rect.type === 'door' || rect.type === 'window' || rect.type === 'entrance';
    const isRightButton = e.evt.button === 2;
    // Select + front-view open on left-click only; drag-to-move on right-click
    // only (middle-click does neither — it's reserved for nothing here, so it
    // just falls through to the Stage's own pan).
    const canSelect = !isRightButton && isoEditMode && !isPlanReadOnly(plan);
    const canDrag = isRightButton && isoEditMode && !isPlanReadOnly(plan) && isoMode === 'single' && !isOpening;
    if (canDrag) e.cancelBubble = true; // stop the Stage's own pan-drag from also starting
    const size = isoSharedSize ?? { planW: 800, planH: 600 };
    const [cursorWx, cursorWy] = fromIso(pos.x - floorOx, pos.y - floorOy, size.planW, size.planH);
    const objectCenterX = rect.x + rect.width / 2;
    const objectCenterY = rect.y + ('height' in rect && rect.height ? rect.height : 0) / 2;
    dragCandidateRef.current = {
      plan, rect, floorOx, floorOy,
      startScreenX: pos.x, startScreenY: pos.y,
      grabOffsetX: objectCenterX - cursorWx,
      grabOffsetY: objectCenterY - cursorWy,
      isDragging: false,
      canDrag,
      canSelect,
      isLeftButton: !isRightButton,
    };
  }, [viewMode, getIsoStagePoint, getIsoObjectAtPoint, isoEditMode, isoMode, isoSharedSize, isPlanReadOnly]);

  // Front-view detail panel — isometric object shows where something is
  // located; this panel shows what's inside it. Only rectangle types that
  // can plausibly hold inventory get it. Opens on a plain left-click (same
  // click that also selects the object in Edit mode) — no double-click.
  const openFrontViewIfEligible = useCallback((target: { planId: string; rect: FloorPlanObject } | null) => {
    if (!target || !FRONT_VIEW_TYPES.has(target.rect.type)) return;
    setFrontViewTarget({ planId: target.planId, object: target.rect as RectangleObject });
  }, []);

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    const candidate = dragCandidateRef.current;
    const pos = getIsoStagePoint(stage);

    // Hover: same manual scan as click, run on every move while not
    // mid-drag, so hover and click can never point at different objects.
    if (viewMode === 'isometric' && !candidate?.isDragging) {
      const target = pos ? getIsoObjectAtPoint(pos.x, pos.y) : null;
      const nextHover = target ? { planId: target.plan.id, objectId: target.rect.id } : null;
      setHoveredObject(prev =>
        prev?.planId === nextHover?.planId && prev?.objectId === nextHover?.objectId ? prev : nextHover
      );
      document.body.style.cursor = target ? 'pointer' : 'default';
    }

    if (!candidate || !candidate.canDrag || !pos) return;

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
    const candidateHeight = 'height' in candidate.rect && candidate.rect.height ? candidate.rect.height : 0;
    setDragPreview({
      planId: candidate.plan.id,
      objectId: candidate.rect.id,
      wx: newCenterX - candidate.rect.width / 2,
      wy: newCenterY - candidateHeight / 2,
    });
  }, [viewMode, getIsoStagePoint, getIsoObjectAtPoint, isoSharedSize]);

  const handleStageMouseUp = useCallback(() => {
    const candidate = dragCandidateRef.current;
    if (!candidate) return;
    if (!candidate.isDragging) {
      // Plain click on an object (never exceeded drag threshold). Objects
      // are repositioned by dragging only — a plain click never navigates —
      // but in Edit mode it selects the object so its Front/Back/Auto
      // stacking control can be shown. Selection is allowed in "All floors"
      // mode too (just not dragging) — canSelect omits the single-floor
      // restriction that canDrag has.
      if (candidate.canSelect) {
        setSelectedIsoObject(prev =>
          prev?.planId === candidate.plan.id && prev?.objectId === candidate.rect.id
            ? null // clicking the already-selected object again deselects it
            : { planId: candidate.plan.id, objectId: candidate.rect.id }
        );
        setLayerJumpInput('');
      }
      if (candidate.isLeftButton) openFrontViewIfEligible({ planId: candidate.plan.id, rect: candidate.rect });
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
  }, [dragPreview, openFrontViewIfEligible]);

  // Persist a chosen front-view table design — same single-PUT pattern as the
  // drag commit above. Updates both allPlans and the open front-view panel's
  // local copy so the preview reflects the change immediately.
  const handleSaveFrontViewStyle = useCallback((planId: string, objectId: string, style: TableFrontVariant) => {
    setAllPlans(prev => prev.map(plan => {
      if (plan.id !== planId) return plan;
      const previousObjects = plan.objects ?? [];
      const updatedObjects = previousObjects.map(o =>
        o.id === objectId ? { ...o, frontViewStyle: style } as FloorPlanObject : o
      );
      const updatedPlan = { ...plan, objects: updatedObjects };
      floorPlansApi.update(planId, { ...updatedPlan }).catch(() => {
        setAllPlans(p => p.map(pl => pl.id === planId ? { ...pl, objects: previousObjects } : pl));
      });
      return updatedPlan;
    }));
    setFrontViewTarget(prev => prev && prev.object.id === objectId
      ? { ...prev, object: { ...prev.object, frontViewStyle: style } }
      : prev);
  }, []);

  // Same single-PUT pattern, for toggling which locations the front-view
  // panel's object links to — the same field FloorPlanEditor's Linked
  // Locations tab writes, so both surfaces stay on one source of truth.
  const handleSaveFrontViewLocations = useCallback((planId: string, objectId: string, locationIds: string[]) => {
    setAllPlans(prev => prev.map(plan => {
      if (plan.id !== planId) return plan;
      const previousObjects = plan.objects ?? [];
      const updatedObjects = previousObjects.map(o =>
        o.id === objectId
          ? { ...o, linkedLocationIds: locationIds.length > 0 ? locationIds : undefined, linkedLocationId: undefined } as FloorPlanObject
          : o
      );
      const updatedPlan = { ...plan, objects: updatedObjects };
      floorPlansApi.update(planId, { ...updatedPlan }).catch(() => {
        setAllPlans(p => p.map(pl => pl.id === planId ? { ...pl, objects: previousObjects } : pl));
      });
      return updatedPlan;
    }));
    setFrontViewTarget(prev => prev && prev.object.id === objectId
      ? { ...prev, object: { ...prev.object, linkedLocationIds: locationIds.length > 0 ? locationIds : undefined, linkedLocationId: undefined } }
      : prev);
  }, []);

  // Dropping a Product row onto the front-view object assigns it to one of
  // the object's linked locations — same effect as editing the product's
  // location elsewhere in the app, just via drag instead of a form.
  const handleAssignProductLocation = useCallback((productId: string, locationId: string) => {
    const previous = products.find(p => p.id === productId);
    if (!previous) return;
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, locationId } : p));
    productsApi.update(productId, { locationId }).catch(() => {
      setProducts(prev => prev.map(p => p.id === productId ? previous : p));
    });
  }, [products]);

  // Manual layer-order override (Edit mode selection control) — same
  // array-reorder convention as the 2D editor's Bring to Front/Send to
  // Back/Move Forward/Move Backward (floorPlanStore.ts), applied to
  // plan.objects directly and auto-saved with one PUT per change, mirroring
  // the drag commit above.
  const reorderIsoObject = useCallback((
    planId: string, objectId: string, reorder: (objs: FloorPlanObject[], idx: number) => FloorPlanObject[] | null,
  ) => {
    setAllPlans(prev => prev.map(plan => {
      if (plan.id !== planId) return plan;
      const previousObjects = plan.objects ?? [];
      const idx = previousObjects.findIndex(o => o.id === objectId);
      if (idx === -1) return plan;
      // Outdoor-wall doors/windows resolve front/back by a fixed
      // per-quadrant rule (see the openings render loop) — they're
      // identifiable/selectable but never take a manual layer-order
      // position. Indoor-wall doors/windows are normal objects and CAN be
      // reordered, same as a rack or shelf.
      const reorderTarget = previousObjects[idx];
      if (reorderTarget.type === 'door' || reorderTarget.type === 'window') {
        const walls = previousObjects.filter((o): o is WallObject => o.type === 'wall');
        const attachedWall = findAttachedWall(reorderTarget as DoorObject | WindowObject, walls);
        if (attachedWall?.wallType === 'floor_original_outdoor') return plan;
      }
      const reordered = reorder(previousObjects, idx);
      if (!reordered) return plan; // already at that end — no-op
      // Stamp isoManualOrder = array index on EVERY object, not just the one
      // moved. Index-only-on-the-moved-object left untouched objects holding
      // stale indices from earlier reorders (or none at all), so the
      // comparator's manual-order tier compared numbers that no longer
      // reflected a single consistent ordering — front/back flickered
      // depending on which pair Array.sort happened to compare first.
      // Stamping the whole array keeps every manualOrder in sync with the
      // current array position, so comparisons are always consistent.
      const stamped = reordered.map((o, i) => ({ ...o, isoManualOrder: i }));
      const updatedPlan = { ...plan, objects: stamped };
      floorPlansApi.update(planId, { ...updatedPlan }).catch(() => {
        setAllPlans(p => p.map(pl => pl.id === planId ? { ...pl, objects: previousObjects } : pl));
        setDragError('Failed to save the stacking change — change reverted.');
        setTimeout(() => setDragError(null), 4000);
      });
      return updatedPlan;
    }));
  }, []);

  // Persists the live ISO_TW/ISO_TH/ISO_Z_SCALE values to the user's account
  // and patches localStorage's `user` so the preference survives a reload
  // without needing a full /auth/me refetch.
  const handleSaveIsoViewSettings = useCallback(async () => {
    setIsoViewSaveError(null);
    setIsoViewSaving(true);
    try {
      await authApi.updateIsoViewSettings({ isoTW, isoTH, isoZScale: isoZScaleState });
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      stored.isoViewSettings = { isoTW, isoTH, isoZScale: isoZScaleState };
      localStorage.setItem('user', JSON.stringify(stored));
    } catch {
      setIsoViewSaveError('Failed to save settings.');
    } finally {
      setIsoViewSaving(false);
    }
  }, [isoTW, isoTH, isoZScaleState]);

  const handleBringToFront = useCallback((planId: string, objectId: string) => {
    reorderIsoObject(planId, objectId, (objs, idx) => {
      if (idx === objs.length - 1) return null;
      const reordered = [...objs];
      reordered.push(reordered.splice(idx, 1)[0]);
      return reordered;
    });
  }, [reorderIsoObject]);

  const handleSendToBack = useCallback((planId: string, objectId: string) => {
    reorderIsoObject(planId, objectId, (objs, idx) => {
      if (idx <= 0) return null;
      const reordered = [...objs];
      reordered.unshift(reordered.splice(idx, 1)[0]);
      return reordered;
    });
  }, [reorderIsoObject]);

  const handleMoveForward = useCallback((planId: string, objectId: string) => {
    reorderIsoObject(planId, objectId, (objs, idx) => {
      if (idx === objs.length - 1) return null;
      const reordered = [...objs];
      [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
      return reordered;
    });
  }, [reorderIsoObject]);

  const handleMoveBackward = useCallback((planId: string, objectId: string) => {
    reorderIsoObject(planId, objectId, (objs, idx) => {
      if (idx <= 0) return null;
      const reordered = [...objs];
      [reordered[idx], reordered[idx - 1]] = [reordered[idx - 1], reordered[idx]];
      return reordered;
    });
  }, [reorderIsoObject]);

  // Jump straight to a 1-based layer position (the popup's numeric input),
  // instead of clicking Forward/Backward repeatedly.
  const handleMoveToLayer = useCallback((planId: string, objectId: string, targetLayer1Based: number) => {
    reorderIsoObject(planId, objectId, (objs, idx) => {
      const targetIdx = Math.max(0, Math.min(objs.length - 1, Math.round(targetLayer1Based) - 1));
      if (targetIdx === idx) return null;
      const reordered = [...objs];
      reordered.splice(targetIdx, 0, reordered.splice(idx, 1)[0]);
      return reordered;
    });
  }, [reorderIsoObject]);

  // Hover overlay — lightweight: just a lifted floor highlight and object glow.
  // Recomputes on hover change but touches nothing in the static geometry.
  const isoHoverOverlay = useMemo(() => {
    if (!focusedIsoBuilding || (!hoveredId && !hoveredObject && !selectedIsoObject)) return null;

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
        if (obj && ISO_RENDERABLE_OBJECT_TYPES.has(obj.type)) {
          const { planW, planH } = sharedSize;
          const minW = (MIN_OBJ_EDGE_PX / getIsoEdgeScale()) * planW;
          const minH = (MIN_OBJ_EDGE_PX / getIsoEdgeScale()) * planH;
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

        // Hovered door/window/entrance — same glow, drawn on the opening's
        // own panel silhouette since it isn't a rectangle prism.
        const hoveredOpening = (plan.objects ?? []).find(o => o.id === hoveredObject.objectId) as
          DoorObject | WindowObject | EntranceObject | undefined;
        if (hoveredOpening && (hoveredOpening.type === 'door' || hoveredOpening.type === 'window' || hoveredOpening.type === 'entrance')) {
          const angle = hoveredOpening.angle ?? 0;
          const dx = Math.cos(angle) * hoveredOpening.width / 2;
          const dy = Math.sin(angle) * hoveredOpening.width / 2;
          const p1 = isoPoint(hoveredOpening.x - dx, hoveredOpening.y - dy, sharedSize, origin);
          const p2 = isoPoint(hoveredOpening.x + dx, hoveredOpening.y + dy, sharedSize, origin);
          const h = hoveredOpening.type === 'window' ? 20 : hoveredOpening.type === 'entrance' ? 30 : 31;
          const lift = hoveredOpening.type === 'window' ? 9 : 0;
          const screenH = isoZ(h);
          const screenLift = isoZ(lift);
          const panel = [
            p1[0], p1[1] - screenLift,
            p2[0], p2[1] - screenLift,
            p2[0], p2[1] - screenLift - screenH,
            p1[0], p1[1] - screenLift - screenH,
          ];
          nodes.push(
            <Line key={`hover-opening-${plan.id}-${hoveredOpening.id}`} listening={false}
              closed points={panel} stroke="#67e8f9" strokeWidth={5} opacity={0.32} lineJoin="round"
            />
          );
        }
      }

      // Selected object outline — dashed, persists until another object is selected
      if (selectedIsoObject?.planId === plan.id) {
        const obj = (plan.objects ?? []).find(o => o.id === selectedIsoObject.objectId) as RectangleObject | undefined;
        if (obj && ISO_RENDERABLE_OBJECT_TYPES.has(obj.type)) {
          const { planW, planH } = sharedSize;
          const minW = (MIN_OBJ_EDGE_PX / getIsoEdgeScale()) * planW;
          const minH = (MIN_OBJ_EDGE_PX / getIsoEdgeScale()) * planH;
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
            <Line key={`selected-obj-${plan.id}-${obj.id}`} listening={false}
              closed points={outline} stroke="#67e8f9" strokeWidth={2.4} dash={[8, 6]} opacity={0.95} lineJoin="round"
            />
          );
        }

        // Selected door/window/entrance — dashed outline around the same
        // panel silhouette IsoOpeningShape draws, since these aren't
        // rectangle prisms and don't go through the rect outline path above.
        const opening = (plan.objects ?? []).find(o => o.id === selectedIsoObject.objectId) as
          DoorObject | WindowObject | EntranceObject | undefined;
        if (opening && (opening.type === 'door' || opening.type === 'window' || opening.type === 'entrance')) {
          const angle = opening.angle ?? 0;
          const dx = Math.cos(angle) * opening.width / 2;
          const dy = Math.sin(angle) * opening.width / 2;
          const p1 = isoPoint(opening.x - dx, opening.y - dy, sharedSize, origin);
          const p2 = isoPoint(opening.x + dx, opening.y + dy, sharedSize, origin);
          const h = opening.type === 'window' ? 20 : opening.type === 'entrance' ? 30 : 31;
          const lift = opening.type === 'window' ? 9 : 0;
          const screenH = isoZ(h);
          const screenLift = isoZ(lift);
          const panel = [
            p1[0], p1[1] - screenLift,
            p2[0], p2[1] - screenLift,
            p2[0], p2[1] - screenLift - screenH,
            p1[0], p1[1] - screenLift - screenH,
          ];
          nodes.push(
            <Line key={`selected-opening-${plan.id}-${opening.id}`} listening={false}
              closed points={panel} stroke="#67e8f9" strokeWidth={2.4} dash={[8, 6]} opacity={0.95} lineJoin="round"
            />
          );
        }
      }
    }

    return nodes.length > 0 ? nodes : null;
  }, [focusedIsoBuilding, hoveredId, hoveredObject, selectedIsoObject, isoMode, isoFloorFilter,
      baseY, centerX, isoSharedFrame, isoWallPolyCache, isoTW, isoTH, isoZScaleState]);

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
      {/* No separate hit layer — hover/click are resolved by a manual scan
          against isoStaticResult.allHitTargets (see handleStageMouseMove/
          handleStageMouseUp), mirroring the Top-Down 2.5D view. */}
      {/* Drag preview — above the static layer so it occludes the stale original */}
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

  const hasBuildings = buildings.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 text-[var(--text)]">

      {/* ── Title ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        {user.role === 'admin' && localStorage.getItem('currentDepartmentId') === ALL_DEPARTMENTS_ID && (
          <AllDepartmentsBanner />
        )}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-[var(--text)]">2D Building View</h1>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          {viewMode === 'topDown25D'
            ? 'Top-down 2.5D presentation - editable JSON floorplan with depth'
            : 'Isometric dollhouse — floor slabs stacked per building'}
        </p>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 bg-[var(--surface)] rounded-lg shadow p-4 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
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
              onClick={() => setViewMode('topDown25D')}
              className={`px-3 py-1.5 font-medium flex items-center gap-1.5 ${viewMode === 'topDown25D' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
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
            <>
              <div className="w-px h-5 bg-[var(--border)]" aria-hidden="true" />
              <button
                onClick={() => { setIsoEditMode(v => !v); setSelectedIsoObject(null); setLayerJumpInput(''); setIsoObjectListOpen(false); setObjectDetailPopup(null); }}
                title={isoEditMode ? 'Exit edit mode' : 'Edit mode: drag objects to reposition them'}
                className={`px-3 py-1.5 rounded border text-xs font-medium flex items-center gap-1.5 ${isoEditMode ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
              >
                <Pencil size={12} /> {isoEditMode ? 'Editing' : 'Edit'}
              </button>
            </>
          )}

          {/* Object list — lists every object in the focused finalized floor;
              clicking one selects it (same dashed outline + layer toolbar
              as clicking it directly on the canvas). */}
          {viewMode === 'isometric' && isoEditMode && topDownPlan && (
            <button
              onClick={() => { setIsoObjectListOpen(v => !v); setLastOpenedIsoPanel('objects'); }}
              title="List all objects in this floor"
              className={`px-3 py-1.5 rounded border text-xs font-medium flex items-center gap-1.5 ${isoObjectListOpen ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
            >
              <List size={12} /> Objects
            </button>
          )}

          {/* Iso View Settings — adjust the projection's width/height/depth scale */}
          {viewMode === 'isometric' && (
            <button
              onClick={() => { setIsoViewOpen(v => !v); setLastOpenedIsoPanel('view'); }}
              title="Isometric view settings"
              className={`px-3 py-1.5 rounded border text-xs font-medium flex items-center gap-1.5 ${isoViewOpen ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
            >
              <Box size={12} /> View Settings
            </button>
          )}

          {/* Zoom */}
          <div className="w-px h-5 bg-[var(--border)]" aria-hidden="true" />
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

      {/* ── Stats + Legend ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 pt-3 border-t border-[var(--border)] text-xs items-center">
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
        <span className="w-px h-3.5 bg-[var(--border)]" aria-hidden="true" />
        {[
          { color: '#22c55e', label: '≥95 Excellent' },
          { color: '#84cc16', label: '≥80 Good' },
          { color: '#eab308', label: '≥70 Fair' },
          { color: '#f97316', label: '<70 Weak' },
          { color: '#3b82f6', label: 'Finalized' },
          { color: '#64748b', label: 'No score' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-[var(--text-muted)]">
            <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-[var(--text-muted)]">
          {viewMode === 'isometric' && isoEditMode
            ? 'Drag an object to reposition it · Drag empty space to pan · Scroll to zoom'
            : 'Click any floor to open editor · Drag to pan · Scroll to zoom'}
        </span>
      </div>
      </div>

      {/* ── Canvas ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 bg-[var(--surface)] rounded-lg shadow overflow-hidden">
      <div ref={containerRef} className="w-full h-full overflow-hidden relative min-h-0">
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

        {viewMode === 'isometric' && (isoObjectListOpen || isoViewOpen) && (() => {
          const objectsPanel = isoEditMode && isoObjectListOpen && topDownPlan && (() => {
            const planId = topDownPlan.id;
            // All object types now included (walls/labels/markers used to be
            // filtered out) so "All Floors" really means every object on
            // the floor, not just furniture.
            const allObjs = topDownPlan.objects ?? [];
            // Walls are excluded from the listed/searchable objects entirely.
            const listableObjs = allObjs.filter(o => o.type !== 'wall');
            const query = objectsSearch.trim().toLowerCase();
            const filtered = query
              ? listableObjs.filter(o => (o.label || o.type).toLowerCase().includes(query) || o.type.toLowerCase().includes(query))
              : listableObjs;
            const totalPages = Math.max(1, Math.ceil(filtered.length / objectsPageSize));
            const currentPage = Math.min(objectsPage, totalPages);
            const pageObjs = filtered.slice((currentPage - 1) * objectsPageSize, currentPage * objectsPageSize);
            return (
              <div key="objects" className="w-72 max-h-[70%] flex flex-col rounded border border-[var(--border)] bg-[var(--surface)] shadow-lg text-xs overflow-hidden">
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)] flex-shrink-0">
                  <span className="font-medium text-[var(--text)]">Objects ({filtered.length})</span>
                  <button
                    className="text-[var(--text-muted)] hover:text-[var(--text)] px-1"
                    title="Close"
                    onClick={() => { setIsoObjectListOpen(false); setObjectsSearch(''); setObjectsPage(1); setObjectDetailPopup(null); }}
                  >
                    ✕
                  </button>
                </div>
                <div className="px-2.5 py-1.5 border-b border-[var(--border)] flex-shrink-0">
                  <input
                    type="text"
                    value={objectsSearch}
                    onChange={e => { setObjectsSearch(e.target.value); setObjectsPage(1); }}
                    placeholder="Search objects…"
                    className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-xs outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div className="overflow-y-auto flex-1">
                  {pageObjs.length === 0 && (
                    <div className="px-2.5 py-3 text-[var(--text-muted)]">
                      {filtered.length === 0 && allObjs.length > 0 ? 'No objects match.' : 'No objects on this floor.'}
                    </div>
                  )}
                  {pageObjs.map((obj, idx) => {
                    const isSelected = selectedIsoObject?.planId === planId && selectedIsoObject?.objectId === obj.id;
                    const isPopupOpen = objectDetailPopup?.objectId === obj.id;
                    // Last 5 rows in the page open their popup upward (anchored
                    // to the row's bottom edge growing up) so it doesn't render
                    // past the bottom of the viewport.
                    const openUpward = idx >= pageObjs.length - 5;
                    return (
                      <div
                        key={obj.id}
                        className={`w-full text-left px-2.5 py-1.5 border-b border-[var(--border)] last:border-b-0 flex items-center justify-between gap-2 ${isSelected ? 'bg-[var(--primary)] text-white' : 'text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
                      >
                        <button
                          onClick={() => { setSelectedIsoObject({ planId, objectId: obj.id }); setLayerJumpInput(''); }}
                          className="flex-1 text-left truncate"
                        >
                          {obj.label || obj.type}
                        </button>
                        <span className={`flex-shrink-0 ${isSelected ? 'opacity-80' : 'opacity-60'}`}>{obj.type}</span>
                        <button
                          onClick={e => {
                            if (isPopupOpen) { setObjectDetailPopup(null); return; }
                            const rect = e.currentTarget.getBoundingClientRect();
                            setObjectDetailPopup(
                              openUpward
                                ? { objectId: obj.id, left: rect.left, bottom: window.innerHeight - rect.top }
                                : { objectId: obj.id, left: rect.left, top: rect.top },
                            );
                          }}
                          title="More details"
                          className={`flex-shrink-0 px-1 rounded ${isSelected ? 'hover:bg-white/20' : 'hover:bg-[var(--border)]'}`}
                        >
                          {isPopupOpen ? (openUpward ? '▴' : '▾') : '▸'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {filtered.length > objectsPageSize && (
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-t border-[var(--border)] flex-shrink-0">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setObjectsPage(p => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30"
                      >
                        ‹
                      </button>
                      <span className="text-[var(--text-muted)]">{currentPage}/{totalPages}</span>
                      <button
                        onClick={() => setObjectsPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        className="px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30"
                      >
                        ›
                      </button>
                    </div>
                    <select
                      value={objectsPageSize}
                      onChange={e => { setObjectsPageSize(Number(e.target.value)); setObjectsPage(1); }}
                      className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]"
                    >
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                )}
              </div>
            );
          })();

          const objectDetailOverlay = objectDetailPopup && (() => {
            // Walls never reach this popup (excluded from the list rows that
            // open it), so narrow the type here rather than re-deriving it.
            const rawObj = (topDownPlan?.objects ?? []).find(o => o.id === objectDetailPopup.objectId);
            if (!rawObj || rawObj.type === 'wall') return null;
            const obj = rawObj;
            const isOpening = obj.type === 'window' || obj.type === 'door' || obj.type === 'entrance';
            const walls = (topDownPlan?.objects ?? []).filter((o): o is WallObject => o.type === 'wall');
            const attachedWall = isOpening
              ? findAttachedWall(obj as DoorObject | WindowObject | EntranceObject, walls)
              : null;
            const toDeg = (rad?: number) => Math.round(((rad ?? 0) * 180 / Math.PI + 360) % 360);
            // Anchored to the row's button position at click-time. Rows near
            // the top of the page anchor by `top` (popup grows downward);
            // rows near the bottom anchor by `bottom` (popup grows upward)
            // so it never renders past the viewport edge either way.
            const left = Math.max(8, objectDetailPopup.left - 240);
            const positionStyle = objectDetailPopup.bottom !== undefined
              ? { bottom: Math.max(8, objectDetailPopup.bottom - 8), left }
              : { top: Math.min(objectDetailPopup.top, window.innerHeight - 180), left };
            return (
              <div
                key="detail-popup"
                className="fixed z-30 w-56 rounded border border-[var(--border)] bg-[var(--surface)] shadow-xl text-xs overflow-hidden animate-detailPopupIn"
                style={positionStyle}
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)]">
                  <span className="font-medium text-[var(--text)] truncate">{obj.label || obj.type}</span>
                  <button
                    className="text-[var(--text-muted)] hover:text-[var(--text)] px-1 flex-shrink-0"
                    title="Close"
                    onClick={() => setObjectDetailPopup(null)}
                  >
                    ✕
                  </button>
                </div>
                <div className="px-2.5 py-2 text-[var(--text-muted)] grid grid-cols-2 gap-x-2 gap-y-1">
                  {obj.type === 'room' ? (
                    <>
                      <span>Points</span><span className="text-[var(--text)]">{obj.points.length / 2}</span>
                    </>
                  ) : (
                    <>
                      <span>X</span><span className="text-[var(--text)]">{Math.round(obj.x)}</span>
                      <span>Y</span><span className="text-[var(--text)]">{Math.round(obj.y)}</span>
                      <span>Width</span><span className="text-[var(--text)]">{'width' in obj ? Math.round(obj.width) : '—'}</span>
                      <span>Angle</span><span className="text-[var(--text)]">{toDeg((obj as { angle?: number }).angle)}°</span>
                      {isOpening && (
                        <>
                          <span>Wall</span>
                          <span className="text-[var(--text)] col-span-1">
                            {attachedWall
                              ? `(${Math.round(attachedWall.startX)},${Math.round(attachedWall.startY)}) → (${Math.round(attachedWall.endX)},${Math.round(attachedWall.endY)})${attachedWall.wallType === 'floor_original_outdoor' ? ' · outdoor' : ''}`
                              : '—'}
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })();

          const viewSettingsPanel = isoViewOpen && (
            <div key="view" className="w-60 rounded border border-[var(--border)] bg-[var(--surface)] shadow-lg text-xs overflow-hidden">
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)]">
                <span className="font-medium text-[var(--text)]">Iso View Settings</span>
                <button
                  className="text-[var(--text-muted)] hover:text-[var(--text)] px-1"
                  title="Close"
                  onClick={() => setIsoViewOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div className="px-2.5 py-2.5 flex flex-col gap-2.5">
                {/* Presets */}
                {(() => {
                  const presets = [
                    { label: 'Main',      tw: 3.2, th: 1.3, z: 1.6 },
                    { label: 'Dollhouse', tw: 3.2, th: 1.4, z: 1.6 },
                    { label: 'Miniature', tw: 2.7, th: 0.65, z: 1.3 },
                    { label: '2.5D',      tw: 2.8, th: 0.55, z: 1.2 },
                  ];
                  return (
                    <div className="grid grid-cols-2 gap-1">
                      {presets.map(p => {
                        const active = isoTW === p.tw && isoTH === p.th && isoZScaleState === p.z;
                        return (
                          <button
                            key={p.label}
                            onClick={() => { setIsoTW(p.tw); setIsoTH(p.th); setIsoZScaleState(p.z); }}
                            className={`px-1.5 py-1 rounded border text-xs font-medium transition-colors ${active ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                {([
                  { key: 'isoTW' as const, label: 'Width', value: isoTW, setter: setIsoTW, min: 0.5, max: 8, step: 0.1 },
                  { key: 'isoTH' as const, label: 'Height', value: isoTH, setter: setIsoTH, min: 0.5, max: 8, step: 0.1 },
                  { key: 'isoZScale' as const, label: 'Depth', value: isoZScaleState, setter: setIsoZScaleState, min: 0.2, max: 5, step: 0.1 },
                ]).map(({ key, label, value, setter, min, max, step }) => (
                  <label key={key} className="flex flex-col gap-1">
                    <span className="flex items-center justify-between text-[var(--text-muted)]">
                      <span>{label}</span>
                      <span className="text-[var(--text)] font-medium">{value.toFixed(1)}</span>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={value}
                      onChange={e => setter(parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </label>
                ))}
                {isoViewSaveError && (
                  <span className="text-red-500">{isoViewSaveError}</span>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setIsoTW(ISO_TW_DEFAULT); setIsoTH(ISO_TH_DEFAULT); setIsoZScaleState(ISO_Z_SCALE_DEFAULT); }}
                    className="flex-1 px-2 py-1.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] font-medium"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleSaveIsoViewSettings}
                    disabled={isoViewSaving}
                    className="flex-1 px-2 py-1.5 rounded bg-[var(--primary)] text-white font-medium disabled:opacity-60"
                  >
                    {isoViewSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          );

          const panels = lastOpenedIsoPanel === 'objects'
            ? [objectsPanel, viewSettingsPanel]
            : [viewSettingsPanel, objectsPanel];

          return (
            <>
              <div className="absolute top-3 right-3 z-20 flex flex-col gap-2 items-end">
                {panels}
              </div>
              {objectDetailOverlay}
            </>
          );
        })()}

        {viewMode === 'isometric' && isoEditMode && selectedIsoObject && (() => {
          const selectedPlan = allPlans.find(p => p.id === selectedIsoObject.planId);
          const selectedRect = selectedPlan?.objects?.find(
            o => o.id === selectedIsoObject.objectId
          ) as RectangleObject | DoorObject | WindowObject | EntranceObject | undefined;
          if (!selectedPlan || !selectedRect) return null;
          const isOpeningType = selectedRect.type === 'door' || selectedRect.type === 'window';
          const objs = selectedPlan.objects ?? [];
          const total = objs.length;
          const index = objs.findIndex(o => o.id === selectedRect.id);
          const isBack = index === 0;
          const isFront = index === total - 1;
          let layerLabel = isBack ? 'Back layer' : isFront ? 'Front layer' : `Layer ${index + 1} of ${total}`;
          // The absolute front/back rule (and the layer-order exclusion)
          // only applies to openings on OUTDOOR walls — an indoor-wall
          // door/window is just another piece of furniture for stacking
          // purposes and keeps the normal layer controls + label.
          let isOutdoorOpening = false;
          if (isOpeningType) {
            // Must normalize against THIS FLOOR's own occupied wall bounds
            // (matching the openings render loop), not the shared
            // cross-floor frame size — otherwise a wall on a small floor's
            // east edge can still compute as < 50% of a larger shared
            // frame and misreport as west.
            const openingWalls = objs.filter((o): o is WallObject => o.type === 'wall');
            const outdoorWalls = openingWalls.filter(w => w.wallType === 'floor_original_outdoor');
            const finalizedWalls = openingWalls.filter(w =>
              w.wallType === 'finalized_building_perimeter' || w.isFinalizedPerimeter === true
            );
            // outdoorWalls can be non-empty but still only cover part of the
            // building's actual perimeter (some sides tagged plain 'wall'
            // instead of floor_original_outdoor) — chainWallsToPolygon in
            // the render loop falls through to finalizedWalls in that case,
            // so the bounds used for this label must match that, picking
            // whichever set actually spans more area (a true subset would
            // never have a larger span).
            const spanOf = (walls: WallObject[]) => {
              if (walls.length === 0) return 0;
              const xs = walls.flatMap(w => [w.startX, w.endX]);
              const ys = walls.flatMap(w => [w.startY, w.endY]);
              return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
            };
            const boundsWalls = spanOf(finalizedWalls) > spanOf(outdoorWalls)
              ? finalizedWalls
              : outdoorWalls.length > 0 ? outdoorWalls : openingWalls;
            const boundsXs = boundsWalls.flatMap(w => [w.startX, w.endX]);
            const boundsYs = boundsWalls.flatMap(w => [w.startY, w.endY]);
            const minX = boundsXs.length ? Math.min(...boundsXs) : 0;
            const maxX = boundsXs.length ? Math.max(...boundsXs) : (selectedPlan.width || 800);
            const minY = boundsYs.length ? Math.min(...boundsYs) : 0;
            const maxY = boundsYs.length ? Math.max(...boundsYs) : (selectedPlan.height || 600);
            const attachedWall = findAttachedWall(selectedRect as DoorObject | WindowObject, openingWalls);
            isOutdoorOpening = attachedWall?.wallType === 'floor_original_outdoor';
            if (isOutdoorOpening) {
              const isEast = ((attachedWall!.startX + attachedWall!.endX) / 2 - minX) / ((maxX - minX) || 1) >= 0.5;
              const isSouth = ((attachedWall!.startY + attachedWall!.endY) / 2 - minY) / ((maxY - minY) || 1) >= 0.5;
              const quadrant = isEast ? (isSouth ? 'SE' : 'NE') : (isSouth ? 'SW' : 'NW');
              const isNWCorner = quadrant === 'NW';
              const isAlwaysBack = selectedRect.type !== 'window' && isNWCorner;
              const rule = selectedRect.type === 'window'
                ? 'Behind objects'
                : isAlwaysBack ? 'Always back' : 'Always front';
              layerLabel = `${quadrant} · ${rule}`;
            }
          }
          const btnClass = "flex flex-col items-center gap-0.5 px-2 py-1 border border-[var(--border)] rounded text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:cursor-not-allowed";
          return (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col gap-1.5 px-2.5 py-2 rounded border border-[var(--border)] bg-[var(--surface)] shadow-lg text-xs max-w-[min(92vw,560px)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--text-muted)] whitespace-nowrap truncate">
                  {selectedRect.label || selectedRect.type} <span className="opacity-70">({layerLabel})</span>
                </span>
                <button
                  className="text-[var(--text-muted)] hover:text-[var(--text)] px-1 flex-shrink-0"
                  title="Deselect"
                  onClick={() => { setSelectedIsoObject(null); setLayerJumpInput(''); }}
                >
                  ✕
                </button>
              </div>
              {!isOutdoorOpening && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="grid grid-cols-4 gap-1">
                    <button onClick={() => handleSendToBack(selectedPlan.id, selectedRect.id)} disabled={isBack} title="Send to Back" className={btnClass}>
                      <ChevronsDown size={13} />
                      <span className="text-[9px]">Back</span>
                    </button>
                    <button onClick={() => handleMoveBackward(selectedPlan.id, selectedRect.id)} disabled={isBack} title="Move Backward" className={btnClass}>
                      <ChevronDown size={13} />
                      <span className="text-[9px]">Backward</span>
                    </button>
                    <button onClick={() => handleMoveForward(selectedPlan.id, selectedRect.id)} disabled={isFront} title="Move Forward" className={btnClass}>
                      <ChevronUp size={13} />
                      <span className="text-[9px]">Forward</span>
                    </button>
                    <button onClick={() => handleBringToFront(selectedPlan.id, selectedRect.id)} disabled={isFront} title="Bring to Front" className={btnClass}>
                      <ChevronsUp size={13} />
                      <span className="text-[9px]">Front</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1 border-l border-[var(--border)] pl-2">
                    <input
                      type="number"
                      min={1}
                      max={total}
                      placeholder={`${index + 1}`}
                      value={layerJumpInput}
                      onChange={e => setLayerJumpInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key !== 'Enter') return;
                        const n = parseInt(layerJumpInput, 10);
                        if (Number.isFinite(n)) handleMoveToLayer(selectedPlan.id, selectedRect.id, n);
                        setLayerJumpInput('');
                      }}
                      title={`Jump to layer (1-${total})`}
                      className="w-12 px-1.5 py-1 border border-[var(--border)] rounded text-[var(--text)] bg-[var(--surface)]"
                    />
                    <button
                      className="px-2 py-1 border border-[var(--border)] rounded text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Go to layer"
                      disabled={!layerJumpInput}
                      onClick={() => {
                        const n = parseInt(layerJumpInput, 10);
                        if (Number.isFinite(n)) handleMoveToLayer(selectedPlan.id, selectedRect.id, n);
                        setLayerJumpInput('');
                      }}
                    >
                      Go
                    </button>
                    {[20, 50, 100].filter(n => n <= total).map(n => (
                      <button key={n}
                        className="px-1.5 py-1 border border-[var(--border)] rounded text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                        title={`Jump to layer ${n}`}
                        onClick={() => handleMoveToLayer(selectedPlan.id, selectedRect.id, n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            onContextMenu={e => e.evt.preventDefault()}
            onMouseLeave={() => {
              if (!isObjectDragActive) document.body.style.cursor = 'default';
            }}
            onWheel={e => {
              e.evt.preventDefault();
              zoom(e.evt.deltaY > 0 ? -0.08 : 0.08);
            }}
            style={{ background: isDark ? '#060b14' : '#dde6f0' }}
          >
              {renderIsometric()}
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
      {frontViewTarget && (
        <ObjectFrontView
          object={frontViewTarget.object}
          products={products.filter(p => p.locationId && getLinkedLocationIds(frontViewTarget.object).includes(p.locationId))}
          allLocations={locations}
          allProducts={products}
          onClose={() => setFrontViewTarget(null)}
          onChangeStyle={style => handleSaveFrontViewStyle(frontViewTarget.planId, frontViewTarget.object.id, style)}
          onChangeLocations={ids => handleSaveFrontViewLocations(frontViewTarget.planId, frontViewTarget.object.id, ids)}
          onAssignProductLocation={handleAssignProductLocation}
        />
      )}
    </div>
  );
}
