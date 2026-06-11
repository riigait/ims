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

export const GRID_SIZE = 10;
export const MAJOR_GRID_EVERY = 4;
export const WALL_THICKNESS = 10;
export const A4_PAGE_WIDTH = 800;
export const A4_PAGE_HEIGHT = 1120;
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
  room: { width: 160, height: 120 },
  wall: { width: 120, height: WALL_THICKNESS },
  door: { width: 40, height: WALL_THICKNESS },
  window: { width: 40, height: WALL_THICKNESS },
  entrance: { width: 60, height: WALL_THICKNESS },
  shelf: { width: 60, height: 40 },
  rack: { width: 60, height: 40 },
  restroom: { width: 80, height: 80 },
  stairs: { width: 80, height: 120 },
  elevator: { width: 60, height: 60 },
  column: { width: 20, height: 20 },
  'work-surface': { width: 120, height: 60 },
  chair:          { width: 40,  height: 40  },
  cabinet: { width: 60, height: 50 },
  drawer: { width: 60, height: 40 },
  locker: { width: 50, height: 50 },
  'storage-box': { width: 50, height: 40 },
  bin: { width: 40, height: 40 },
  pallet: { width: 100, height: 80 },
} as const;

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export const snap = snapToGrid;

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

  if (type === 'rack' || type === 'shelf') {
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

export function resizeObjectWithGrid(
  object: RectangleObject,
  newWidth: number,
  newHeight: number,
  snap = true,
): RectangleObject {
  return normalizeObject({ ...object, width: newWidth, height: newHeight }, snap);
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
