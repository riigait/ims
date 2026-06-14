import type {
  DoorObject,
  EntranceObject,
  FloorPlanObject,
  FloorPlanObjectType,
  LabelObject,
  PolygonRoomObject,
  RectangleObject,
  WallObject,
  WindowObject,
} from '@/types/floorplan';

// Scale: 1 m = 100 SVG units. Grid cell = 10 cm.
export const GRID_SIZE = 10;
export const MAJOR_GRID_EVERY = 4;
export const WALL_THICKNESS = 10;
export const A4_PAGE_WIDTH = 2000;
export const A4_PAGE_HEIGHT = 3000;
export const GUIDE_SNAP_DISTANCE = 6;

export interface GridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridPage extends GridRect {}

export type SmartGuide =
  | { type: 'vertical'; x: number }
  | { type: 'horizontal'; y: number };

export const DEFAULT_OBJECT_SIZES = {
  room:           { width: 300, height: 200 },
  wall:           { width: 120, height: WALL_THICKNESS },
  door:           { width: 80,  height: WALL_THICKNESS },
  window:         { width: 90,  height: WALL_THICKNESS },
  entrance:       { width: 120, height: WALL_THICKNESS },
  shelf:          { width: 90,  height: 30 },
  rack:           { width: 90,  height: 40 },
  restroom:       { width: 150, height: 150 },
  stairs:         { width: 120, height: 240 },
  elevator:       { width: 110, height: 140 },
  column:         { width: 30,  height: 30 },
  'work-surface': { width: 160, height: 80 },
  chair:          { width: 50,  height: 50 },
  cabinet:        { width: 80,  height: 50 },
  drawer:         { width: 80,  height: 50 },
  locker:         { width: 40,  height: 50 },
  'storage-box':  { width: 60,  height: 40 },
  bin:            { width: 50,  height: 50 },
  pallet:         { width: 120, height: 100 },
  human:          { width: 50,  height: 30 },
} as const;

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export const snap = snapToGrid;

// Angles are stored in RADIANS throughout the editor (atan2 from the rotate
// handle, deg→rad from the properties panel). Keep all angle math in radians.
export const ANGLE_SNAP_TOLERANCE = (2 * Math.PI) / 180; // 2°

/**
 * Snap a radian angle to the nearest cardinal (0/90/180/270) when within
 * ANGLE_SNAP_TOLERANCE, and normalize the result to [0, 2π).
 *
 * Used for the rotation HANDLE so an imprecise drag lands exactly on a cardinal
 * instead of values like 359.8°/0.2° that read as 0° but aren't. Do not apply
 * this to a typed properties value — it would make near-cardinal inputs (e.g.
 * 271°) un-enterable.
 */
export function snapAngle(angleRad: number): number {
  const TWO_PI = Math.PI * 2;
  let a = angleRad % TWO_PI;
  if (a < 0) a += TWO_PI;
  for (const cardinal of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, TWO_PI]) {
    if (Math.abs(a - cardinal) <= ANGLE_SNAP_TOLERANCE) {
      return cardinal === TWO_PI ? 0 : cardinal;
    }
  }
  return a;
}

export function screenToWorld(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  pan: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  return {
    x: (clientX - canvasRect.left - pan.x) / zoom,
    y: (clientY - canvasRect.top - pan.y) / zoom,
  };
}

export function clampRectToPage<T extends GridRect>(rect: T, page: GridPage): T {
  const width = Math.min(rect.width, page.width);
  const height = Math.min(rect.height, page.height);
  return {
    ...rect,
    x: Math.min(Math.max(rect.x, page.x), page.x + page.width - width),
    y: Math.min(Math.max(rect.y, page.y), page.y + page.height - height),
    width,
    height,
  };
}

export function getObjectAnchors(object: GridRect): { x: number[]; y: number[] } {
  return {
    x: [object.x, object.x + object.width / 2, object.x + object.width],
    y: [object.y, object.y + object.height / 2, object.y + object.height],
  };
}

export function getPageGuideLines(page: GridPage): { x: number[]; y: number[] } {
  return getObjectAnchors(page);
}

export function applySmartGuides(
  object: GridRect,
  page: GridPage,
  zoom: number,
): { object: GridRect; guides: SmartGuide[] } {
  const threshold = GUIDE_SNAP_DISTANCE / zoom;
  const anchors = getObjectAnchors(object);
  const pageGuides = getPageGuideLines(page);
  let dx = 0;
  let dy = 0;
  let closestX = threshold + 1;
  let closestY = threshold + 1;
  const guides: SmartGuide[] = [];

  for (const objectX of anchors.x) {
    for (const guideX of pageGuides.x) {
      const distance = Math.abs(objectX - guideX);
      const nextX = object.x + guideX - objectX;
      if (distance <= threshold && distance < closestX && snapToGrid(nextX) === nextX) {
        closestX = distance;
        dx = guideX - objectX;
        guides.splice(0, guides.length, { type: 'vertical', x: guideX });
      }
    }
  }

  for (const objectY of anchors.y) {
    for (const guideY of pageGuides.y) {
      const distance = Math.abs(objectY - guideY);
      const nextY = object.y + guideY - objectY;
      if (distance <= threshold && distance < closestY && snapToGrid(nextY) === nextY) {
        closestY = distance;
        dy = guideY - objectY;
        const vertical = guides.filter(guide => guide.type === 'vertical');
        guides.splice(0, guides.length, ...vertical, { type: 'horizontal', y: guideY });
      }
    }
  }

  return {
    object: { ...object, x: object.x + dx, y: object.y + dy },
    guides,
  };
}

export function createObjectAtPointer(
  type: 'rack' | 'shelf',
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  pan: { x: number; y: number },
  zoom: number,
  page: GridPage,
): RectangleObject {
  const world = screenToWorld(clientX, clientY, canvasRect, pan, zoom);
  const size = DEFAULT_OBJECT_SIZES[type];
  const object = createFloorplanObject(
    type,
    snapToGrid(world.x - size.width / 2),
    snapToGrid(world.y - size.height / 2),
  ) as RectangleObject;
  return clampRectToPage(object, page);
}

function normalizeValue(value: number, snap: boolean): number {
  return snap ? snapToGrid(value) : value;
}

function normalizeSize(value: number, snap: boolean): number {
  return Math.max(GRID_SIZE, normalizeValue(value, snap));
}

export function normalizeObject<T extends FloorPlanObject>(object: T, snap = true): T {
  if (object.type === 'wall') {
    return {
      ...object,
      startX: normalizeValue(object.startX, snap),
      startY: normalizeValue(object.startY, snap),
      endX: normalizeValue(object.endX, snap),
      endY: normalizeValue(object.endY, snap),
      thickness: WALL_THICKNESS,
    } as T;
  }

  if (object.type === 'room') {
    return {
      ...object,
      points: object.points.map(v => normalizeValue(v, snap)),
    } as T;
  }

  if (object.type === 'rack' || object.type === 'shelf') {
    return {
      ...object,
      x: normalizeValue(object.x, snap),
      y: normalizeValue(object.y, snap),
      width: normalizeSize(object.width, snap),
      height: normalizeSize(object.height, snap),
    } as T;
  }

  if (object.type === 'door' || object.type === 'entrance') {
    return {
      ...object,
      x: normalizeValue(object.x, snap),
      y: normalizeValue(object.y, snap),
      width: normalizeSize(object.width, snap),
    } as T;
  }

  if (object.type === 'window') {
    return {
      ...object,
      x: normalizeValue(object.x, snap),
      y: normalizeValue(object.y, snap),
      width: normalizeSize(object.width, snap),
      ...(object.height === undefined ? {} : { height: normalizeSize(object.height, snap) }),
    } as T;
  }

  return {
    ...object,
    x: normalizeValue(object.x, snap),
    y: normalizeValue(object.y, snap),
  } as T;
}

export function createFloorplanObject(type: FloorPlanObjectType, x: number, y: number, snap = true): FloorPlanObject {
  const uuid = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const id = `${type}_${uuid}`;

  if (type === 'wall') {
    const size = DEFAULT_OBJECT_SIZES.wall;
    return normalizeObject({
      id,
      type,
      startX: x,
      startY: y,
      endX: x + size.width,
      endY: y,
      thickness: WALL_THICKNESS,
      color: '#1e293b',
    } satisfies WallObject, snap);
  }

  if (type === 'room') {
    // Returns a degenerate 1-point room; caller must replace points with the finished polygon.
    return { id, type, points: [snapToGrid(x), snapToGrid(y)], color: '#e0e0e0' };
  }

  if (type === 'rack' || type === 'shelf' || type === 'stairs' || type === 'elevator') {
    const size = DEFAULT_OBJECT_SIZES[type];
    return normalizeObject({
      id,
      type,
      x,
      y,
      width: size.width,
      height: size.height,
      rotation: 0,
    } satisfies RectangleObject, snap);
  }

  if (type === 'door') {
    return normalizeObject({
      id,
      type,
      x,
      y,
      width: DEFAULT_OBJECT_SIZES.door.width,
      angle: 0,
      swingDirection: 'right',
      color: '#8B4513',
    } satisfies DoorObject, snap);
  }

  if (type === 'window') {
    return normalizeObject({
      id,
      type,
      x,
      y,
      width: DEFAULT_OBJECT_SIZES.window.width,
      height: DEFAULT_OBJECT_SIZES.window.height,
      angle: 0,
      color: '#87CEEB',
    } satisfies WindowObject, snap);
  }

  if (type === 'entrance') {
    return normalizeObject({
      id,
      type,
      x,
      y,
      width: DEFAULT_OBJECT_SIZES.entrance.width,
      angle: 0,
      style: 'single',
      color: '#10b981',
    } satisfies EntranceObject, snap);
  }

  if (type === 'label') {
    return normalizeObject({
      id,
      type,
      x,
      y,
      text: 'Label',
      fontSize: 14,
      label: 'Label',
    } satisfies LabelObject, snap);
  }

  return normalizeObject({ id, type, x, y }, snap);
}

/**
 * Center of a rectangle's (unrotated) box. Objects render rotated about this
 * point, so it is the stable anchor for resize and rotation — never x/y.
 */
export function getRectCenter(rect: GridRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * Reposition a rectangle so its center lands on (centerX, centerY). Width,
 * height, rotation and every other field are left untouched; only x/y move.
 * The corner is intentionally NOT grid-snapped (see resizeObjectWithGrid).
 */
export function setRectCenter<T extends GridRect>(rect: T, centerX: number, centerY: number): T {
  return { ...rect, x: centerX - rect.width / 2, y: centerY - rect.height / 2 };
}

/**
 * Resize a rectangle object while keeping its center fixed.
 *
 * Rectangle objects render rotated about their center, so anchoring the
 * top-left corner makes a rotated object swing to a new spot. Anchoring the
 * center keeps it visually in place at any rotation.
 *
 * Only the dimensions snap to the grid; the corner is derived from the exact
 * (unsnapped) center. Snapping the corner too would force a half-grid center
 * onto the full grid, drifting the object by up to half a cell — the "slight
 * movement" seen even at 0° when the width/height changes grid parity.
 */
export function resizeObjectWithGrid(
  object: RectangleObject,
  newWidth: number,
  newHeight: number,
  snap = true,
): RectangleObject {
  const center = getRectCenter(object);
  const width = normalizeSize(newWidth, snap);
  const height = normalizeSize(newHeight, snap);
  return setRectCenter({ ...object, width, height }, center.x, center.y);
}

export function moveObjectWithGrid<T extends FloorPlanObject>(object: T, newX: number, newY: number, snap = true): T {
  if (object.type === 'wall') {
    const dx = newX - object.startX;
    const dy = newY - object.startY;
    return normalizeObject({
      ...object,
      startX: newX,
      startY: newY,
      endX: object.endX + dx,
      endY: object.endY + dy,
    }, snap);
  }

  if (object.type === 'room') {
    const pts = object.points;
    const ox = pts[0], oy = pts[1];
    const dx = newX - ox, dy = newY - oy;
    const moved = pts.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));
    return normalizeObject({ ...object, points: moved }, snap);
  }

  return normalizeObject({ ...object, x: newX, y: newY } as T, snap);
}

/** Bounding box of a polygon room's points. */
export function polygonBounds(points: number[]): { x: number; y: number; width: number; height: number } {
  if (!Array.isArray(points) || points.length < 4) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 !== 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Auto-generated and pre-polygon plans store rooms as rectangles
 * ({x, y, width, height}); the UI renders rooms from `points` only.
 * Convert legacy rect rooms to 4-corner polygons so they stay visible.
 */
export function upgradeLegacyRoomObjects(objects: FloorPlanObject[]): FloorPlanObject[] {
  return objects.map((object) => {
    if (object.type !== 'room') return object;
    const legacy = object as PolygonRoomObject & Partial<GridRect>;
    if (Array.isArray(legacy.points) && legacy.points.length >= 6) return object;
    const { x, y, width, height, ...rest } = legacy;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number'
      || ![x, y, width, height].every(Number.isFinite)) return object;
    return {
      ...rest,
      points: [x, y, x + width, y, x + width, y + height, x, y + height],
    };
  });
}
