import type { FloorPlan, FloorPlanObject, WallObject, PolygonRoomObject, RectangleObject, DoorObject, WindowObject, EntranceObject, LabelObject, InventoryMarkerObject } from '@/types/floorplan';
import type { FloorplanData, FloorplanElement, FloorplanElementType } from '@/types/birdsEye';

function polygonBounds(pts: number[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < minX) minX = pts[i];
    if (pts[i + 1] < minY) minY = pts[i + 1];
    if (pts[i] > maxX) maxX = pts[i];
    if (pts[i + 1] > maxY) maxY = pts[i + 1];
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function isOutdoorWall(w: WallObject): boolean {
  return w.wallType === 'floor_original_outdoor' ||
    w.isFinalizedPerimeter === true ||
    w.id.includes('-ow-');
}

// Default colors matching the editor's DEFAULT_RECT_FILL
const EDITOR_COLORS: Record<string, string> = {
  rack: '#ffeb3b', shelf: '#90caf9',
  'work-surface': '#e9d5ff', chair: '#f3e8ff', cabinet: '#a7f3d0',
  drawer: '#bfdbfe', locker: '#fde68a', 'storage-box': '#fca5a5',
  bin: '#d1d5db', pallet: '#fed7aa', stairs: '#fde68a',
  elevator: '#d8b4fe', bathroom: '#bfdbfe', human: '#bfdbfe',
};

// Includes all rect-shaped object types the editor can produce, beyond the 4 in FloorPlanObjectType
const ALL_RECT_TYPES = new Set([
  'rack', 'shelf', 'stairs', 'elevator',
  'work-surface', 'chair', 'cabinet', 'drawer', 'locker',
  'storage-box', 'bin', 'pallet', 'bathroom', 'human',
]);

// rack/shelf deliberately excluded: those are also the legacy storage types
// for not-yet-migrated old data, so they must fall through to the
// label/id-matching patterns below to recover their real kind (pallet,
// cabinet, etc.) instead of being trusted as literally "rack"/"shelf".
const TYPE_MAP: Partial<Record<string, FloorplanElementType>> = {
  stairs: 'stairs', elevator: 'elevator', bathroom: 'restroom',
  chair: 'chair', 'work-surface': 'table', cabinet: 'cabinet',
  drawer: 'drawer', locker: 'locker', 'storage-box': 'storage_box',
  bin: 'bin', pallet: 'pallet',
  human: 'chair',
};

const LABEL_PATTERNS: [RegExp, FloorplanElementType][] = [
  [/work surface|table/, 'table'],
  [/chair/, 'chair'],
  [/cabinet/, 'cabinet'],
  [/drawer/, 'drawer'],
  [/locker/, 'locker'],
  [/storage box/, 'storage_box'],
  [/\bbin\b|container/, 'bin'],
  [/pallet/, 'pallet'],
  [/stair/, 'stairs'],
  [/elevator|lift/, 'elevator'],
  [/restroom|bathroom|toilet/, 'restroom'],
];

function topDown25DType(type: string, label?: string, id = ''): FloorplanElementType {
  const direct = TYPE_MAP[type];
  if (direct) return direct;
  const name = `${label ?? ''} ${id}`.toLowerCase();
  const fallback = type === 'shelf' ? 'shelf' : 'rack';
  return LABEL_PATTERNS.find(([re]) => re.test(name))?.[1] ?? fallback;
}

// Type predicate so ALL_RECT_TYPES.has() narrows to RectangleObject in the caller
function isRectObj(obj: FloorPlanObject): obj is RectangleObject {
  return ALL_RECT_TYPES.has(obj.type);
}

function wallToEl(w: WallObject): FloorplanElement {
  const outdoor = isOutdoorWall(w);
  const sw = w.thickness ?? (outdoor ? 8 : 4);
  const minX = Math.min(w.startX, w.endX);
  const minY = Math.min(w.startY, w.endY);
  return {
    id: w.id,
    type: outdoor ? 'outdoor_wall' : 'indoor_wall',
    x: minX, y: minY,
    width: Math.abs(w.endX - w.startX),
    height: Math.abs(w.endY - w.startY),
    linePoints: [w.startX, w.startY, w.endX, w.endY],
    layer: 'wall',
    style: { strokeWidth: sw },
  };
}

function roomToEl(r: PolygonRoomObject): FloorplanElement | null {
  if (!r.points || r.points.length < 6) return null;
  const b = polygonBounds(r.points);
  return {
    id: r.id, type: 'room',
    x: b.x, y: b.y, width: b.w, height: b.h,
    polygonPoints: r.points, label: r.label,
    layer: 'room',
    style: r.color ? { fill: r.color } : undefined,
  };
}

function rectToEl(rect: RectangleObject): FloorplanElement {
  return {
    id: rect.id,
    type: topDown25DType(rect.type, rect.label, rect.id),
    x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    rotation: rect.rotation === undefined ? undefined : rect.rotation * (180 / Math.PI),
    label: rect.label,
    layer: 'object',
    style: { fill: rect.color ?? EDITOR_COLORS[rect.type] },
  };
}

function doorToEl(obj: DoorObject | EntranceObject): FloorplanElement {
  return {
    id: obj.id, type: 'door',
    x: obj.x, y: obj.y, width: obj.width, height: 0,
    rotation: (obj.angle ?? 0) * 180 / Math.PI,
    swingDirection: obj.type === 'door' ? obj.swingDirection : undefined,
    entranceStyle: obj.type === 'entrance' ? obj.style : undefined,
    layer: 'opening',
  };
}

function windowToEl(w: WindowObject): FloorplanElement {
  return {
    id: w.id, type: 'window',
    x: w.x, y: w.y, width: w.width, height: w.height ?? 8,
    rotation: (w.angle ?? 0) * 180 / Math.PI,
    layer: 'opening',
  };
}

function labelToEl(lbl: LabelObject): FloorplanElement {
  return {
    id: lbl.id, type: 'label',
    x: lbl.x, y: lbl.y, width: 120, height: 20,
    label: lbl.text, layer: 'label',
    style: { stroke: lbl.color ?? '#334155', strokeWidth: lbl.fontSize ?? 12 },
  };
}

function markerToEl(obj: InventoryMarkerObject): FloorplanElement {
  return {
    id: obj.id, type: 'inventory_marker',
    x: obj.x, y: obj.y, width: 20, height: 20,
    label: obj.label, layer: 'label',
  };
}

export function floorPlanToBevData(plan: FloorPlan): FloorplanData {
  const elements: FloorplanElement[] = [];
  for (const obj of plan.objects ?? []) {
    if (obj.type === 'wall') elements.push(wallToEl(obj));
    else if (obj.type === 'room') { const el = roomToEl(obj); if (el) elements.push(el); }
    else if (isRectObj(obj)) elements.push(rectToEl(obj));
    else if (obj.type === 'door' || obj.type === 'entrance') elements.push(doorToEl(obj));
    else if (obj.type === 'window') elements.push(windowToEl(obj));
    else if (obj.type === 'label') elements.push(labelToEl(obj));
    else if (obj.type === 'marker') elements.push(markerToEl(obj));
  }
  return {
    id: plan.id, name: plan.name,
    width: plan.width || 800, height: plan.height || 600,
    viewMode: 'sketch', elements,
  };
}
