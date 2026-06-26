/**
 * floorplanSketch25D.ts
 *
 * Converts raw FloorPlanObject[] into typed render groups for the
 * Sketch 2.5D view. No coordinate changes — only visual metadata is added.
 */
import type {
  FloorPlanObject,
  WallObject,
  RectangleObject,
  DoorObject,
  WindowObject,
  EntranceObject,
  PolygonRoomObject,
  InventoryMarkerObject,
} from '@/types/floorplan';

// ── Visual depth constants ────────────────────────────────────────────────────
export const WALL_RISE  = 18;   // px of fake height for outdoor walls
export const WALL_RISE_INDOOR = 10;
export const FURNITURE_RISE = 8;
export const SHADOW_X = 6;
export const SHADOW_Y = 5;

// ── Colour palette ────────────────────────────────────────────────────────────
export const PALETTE = {
  floor:          '#f5f0e8',
  floorLine:      '#e8e0d0',
  roomFill:       '#ede8df',
  roomStroke:     '#b8b0a4',
  outdoorWallTop: '#3a3530',
  outdoorWallFace:'#2c2820',
  outdoorWallLight:'#504840',
  indoorWallTop:  '#6a6560',
  indoorWallFace: '#505050',
  indoorWallLight:'#808078',
  doorPanel:      '#8B6914',
  doorArc:        '#a07820',
  doorFill:       'rgba(139,105,20,0.08)',
  windowGlass:    '#b8d8f0',
  windowFrame:    '#38bdf8',
  furnitureTop:   '#d8d0c4',
  furnitureFace:  '#b0a898',
  furnitureStroke:'#a09888',
  rackStripe:     '#f0d060',
  shelfStripe:    '#7ab0e0',
  stairsStripe:   '#c07830',
  shadow:         'rgba(30,24,16,0.18)',
  markerFill:     '#3b82f6',
  markerGlow:     'rgba(59,130,246,0.28)',
} as const;

// ── Render group types ────────────────────────────────────────────────────────

export type Sketch25DLayer =
  | 'floor'
  | 'room'
  | 'furniture'
  | 'outdoor_wall'
  | 'indoor_wall'
  | 'opening'
  | 'label'
  | 'marker';

export interface WallRenderItem {
  kind: 'wall';
  id: string;
  outdoor: boolean;
  x1: number; y1: number;
  x2: number; y2: number;
  thickness: number;
}

export interface RoomRenderItem {
  kind: 'room';
  id: string;
  points: number[];   // polygon flat array
  label?: string;
  fill?: string;
}

export interface FurnitureRenderItem {
  kind: 'furniture';
  id: string;
  subtype: string;
  x: number; y: number;
  w: number; h: number;
  rotation?: number;
  label?: string;
  fill?: string;
}

export interface OpeningRenderItem {
  kind: 'opening';
  id: string;
  subtype: 'door' | 'window' | 'entrance';
  x: number; y: number;
  width: number;
  height: number;
  rotation: number;         // degrees
  swingDirection?: 'left' | 'right';
}

export interface LabelRenderItem {
  kind: 'label';
  id: string;
  x: number; y: number;
  text: string;
  fontSize: number;
  color?: string;
}

export interface MarkerRenderItem {
  kind: 'marker';
  id: string;
  x: number; y: number;
}

export type Sketch25DItem =
  | WallRenderItem
  | RoomRenderItem
  | FurnitureRenderItem
  | OpeningRenderItem
  | LabelRenderItem
  | MarkerRenderItem;

export interface Sketch25DGroups {
  rooms:        RoomRenderItem[];
  outdoorWalls: WallRenderItem[];
  indoorWalls:  WallRenderItem[];
  openings:     OpeningRenderItem[];
  furniture:    FurnitureRenderItem[];
  labels:       LabelRenderItem[];
  markers:      MarkerRenderItem[];
}

// ── Furniture subtypes we know about ─────────────────────────────────────────
const FURNITURE_TYPES = new Set([
  'rack', 'shelf', 'stairs', 'elevator',
  'work-surface', 'chair', 'cabinet', 'drawer', 'locker',
  'storage-box', 'bin', 'pallet', 'bathroom', 'human',
]);

function isFurnitureObj(obj: FloorPlanObject): obj is RectangleObject {
  return FURNITURE_TYPES.has(obj.type);
}

function isOutdoorWall(w: WallObject): boolean {
  return (
    w.wallType === 'floor_original_outdoor' ||
    w.wallType === 'finalized_building_perimeter' ||
    w.isFinalizedPerimeter === true ||
    w.meta?.isFinalizedPerimeter === true ||
    w.id.includes('-ow-')
  );
}

// ── Main adapter ──────────────────────────────────────────────────────────────
export function planToSketch25DGroups(objects: FloorPlanObject[]): Sketch25DGroups {
  const groups: Sketch25DGroups = {
    rooms: [], outdoorWalls: [], indoorWalls: [],
    openings: [], furniture: [], labels: [], markers: [],
  };

  for (const obj of objects) {
    if (obj.type === 'wall') {
      const w = obj as WallObject;
      const item: WallRenderItem = {
        kind: 'wall',
        id: w.id,
        outdoor: isOutdoorWall(w),
        x1: w.startX, y1: w.startY,
        x2: w.endX,   y2: w.endY,
        thickness: w.thickness ?? (isOutdoorWall(w) ? 12 : 6),
      };
      (item.outdoor ? groups.outdoorWalls : groups.indoorWalls).push(item);

    } else if (obj.type === 'room') {
      const r = obj as PolygonRoomObject;
      if (r.points && r.points.length >= 6) {
        groups.rooms.push({ kind: 'room', id: r.id, points: r.points, label: r.label, fill: r.color });
      }

    } else if (isFurnitureObj(obj)) {
      const f = obj as RectangleObject;
      groups.furniture.push({
        kind: 'furniture', id: f.id,
        subtype: f.type,
        x: f.x, y: f.y, w: f.width, h: f.height,
        rotation: f.rotation !== undefined ? f.rotation * (180 / Math.PI) : undefined,
        label: f.label,
        fill: f.color,
      });

    } else if (obj.type === 'door' || obj.type === 'entrance') {
      const d = obj as DoorObject | EntranceObject;
      groups.openings.push({
        kind: 'opening', id: d.id, subtype: d.type === 'entrance' ? 'entrance' : 'door',
        x: d.x, y: d.y, width: d.width, height: 0,
        rotation: (d.angle ?? 0) * (180 / Math.PI),
        swingDirection: d.type === 'door' ? (d as DoorObject).swingDirection : undefined,
      });

    } else if (obj.type === 'window') {
      const w = obj as WindowObject;
      groups.openings.push({
        kind: 'opening', id: w.id, subtype: 'window',
        x: w.x, y: w.y, width: w.width, height: w.height ?? 8,
        rotation: (w.angle ?? 0) * (180 / Math.PI),
      });

    } else if (obj.type === 'label') {
      const l = obj as { type: 'label'; id: string; x: number; y: number; text: string; fontSize: number; color?: string };
      groups.labels.push({ kind: 'label', id: l.id, x: l.x, y: l.y, text: l.text, fontSize: l.fontSize, color: l.color });

    } else if (obj.type === 'marker') {
      const m = obj as InventoryMarkerObject;
      groups.markers.push({ kind: 'marker', id: m.id, x: m.x, y: m.y });
    }
  }

  return groups;
}

// ── Tight bounding box for auto-crop ─────────────────────────────────────────
export interface ContentBounds {
  minX: number; minY: number; maxX: number; maxY: number;
}

export function computeSketch25DBounds(
  objects: FloorPlanObject[],
  fallbackW: number,
  fallbackH: number,
): ContentBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const obj of objects) {
    if (obj.type === 'wall') {
      const w = obj as WallObject;
      minX = Math.min(minX, w.startX, w.endX);
      minY = Math.min(minY, w.startY, w.endY);
      maxX = Math.max(maxX, w.startX, w.endX);
      maxY = Math.max(maxY, w.startY, w.endY);
    } else if (obj.type === 'room') {
      const r = obj as PolygonRoomObject;
      for (let i = 0; i < r.points.length; i += 2) {
        minX = Math.min(minX, r.points[i]);
        minY = Math.min(minY, r.points[i + 1]);
        maxX = Math.max(maxX, r.points[i]);
        maxY = Math.max(maxY, r.points[i + 1]);
      }
    } else if (isFurnitureObj(obj)) {
      const f = obj as RectangleObject;
      minX = Math.min(minX, f.x);
      minY = Math.min(minY, f.y);
      maxX = Math.max(maxX, f.x + f.width);
      maxY = Math.max(maxY, f.y + f.height);
    } else if ('x' in obj && 'width' in obj) {
      const p = obj as { x: number; y: number; width: number; height?: number };
      minX = Math.min(minX, p.x - (p.width / 2));
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + (p.width / 2));
      maxY = Math.max(maxY, p.y + (p.height ?? 0));
    }
  }

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: fallbackW, maxY: fallbackH };
  return { minX, minY, maxX, maxY };
}
