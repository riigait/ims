import { isRectObjectType, isFixedReservedObject } from './floorPlanObjectTypes';

type FloorPlanObject = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: number[];
  label?: string;
  linkedLocationId?: string;
  groupId?: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  thickness?: number;
  angle?: number;
};

export type FloorplanValidationError =
  | 'object_outside_room'
  | 'object_crosses_wall'
  | 'object_overlap'
  | 'door_missing'
  | 'door_blocked'
  | 'object_outside_outdoor_walls';

export type FloorplanValidationIssue = {
  code: FloorplanValidationError;
  objectId?: string;
  doorId?: string;
  message: string;
};

export type FloorplanValidationResult = {
  valid: boolean;
  errors: FloorplanValidationIssue[];
};

type Rect = { x: number; y: number; width: number; height: number };
type Point = [number, number];
type Zone = { left: number; right: number; top: number; bottom: number };

const CLEARANCE = 4;
const EDGE_TOLERANCE = 20;
const DOOR_CLEARANCE_DEPTH = 92;
const FIX_MARGIN = 12;

const isRect = (object: FloorPlanObject): object is FloorPlanObject & Rect =>
  isRectObjectType(object.type)
  && [object.x, object.y, object.width, object.height].every(Number.isFinite);

const isPolygonRoom = (object: FloorPlanObject): object is FloorPlanObject & { points: number[] } =>
  object.type === 'room' && Array.isArray(object.points) && object.points.length >= 6;

const isDoorLike = (object: FloorPlanObject) => object.type === 'door' || object.type === 'entrance';
const isOutdoorWall = (object: FloorPlanObject) => object.type === 'wall' && object.id.includes('-ow-');
const isFixed = (object: FloorPlanObject) => isFixedReservedObject(object.id);

const isServiceRoom = (object: FloorPlanObject): boolean => {
  if (isFixed(object)) return true;
  const lbl = (object.label ?? '').toLowerCase().trim();
  return (
    lbl === 'restroom' || lbl === 'bathroom' || lbl === 'toilet' ||
    lbl.startsWith('stairs') || lbl === 'elevator' ||
    lbl.includes('restroom') || lbl.includes('bathroom')
  );
};

function polygonBounds(points: number[]): Rect {
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function insetRect(rect: Rect, inset = 0): Rect {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2),
  };
}

function containsRect(container: Rect, object: Rect): boolean {
  return object.x >= container.x
    && object.y >= container.y
    && object.x + object.width <= container.x + container.width
    && object.y + object.height <= container.y + container.height;
}

function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

function wallRect(wall: FloorPlanObject): Rect | null {
  if (![wall.startX, wall.startY, wall.endX, wall.endY].every(Number.isFinite)) return null;
  const half = Math.max(3, (wall.thickness ?? 8) / 2);
  return {
    x: Math.min(wall.startX!, wall.endX!) - half,
    y: Math.min(wall.startY!, wall.endY!) - half,
    width: Math.abs(wall.endX! - wall.startX!) + half * 2,
    height: Math.abs(wall.endY! - wall.startY!) + half * 2,
  };
}

function pointNearRectEdge(x: number, y: number, room: Rect, tolerance = EDGE_TOLERANCE): boolean {
  const inX = x >= room.x - tolerance && x <= room.x + room.width + tolerance;
  const inY = y >= room.y - tolerance && y <= room.y + room.height + tolerance;
  const nearVertical = Math.abs(x - room.x) <= tolerance || Math.abs(x - (room.x + room.width)) <= tolerance;
  const nearHorizontal = Math.abs(y - room.y) <= tolerance || Math.abs(y - (room.y + room.height)) <= tolerance;
  return (nearVertical && inY) || (nearHorizontal && inX);
}

function doorClearancePoints(door: FloorPlanObject): Point[] {
  const halfWidth = (door.width ?? 40) / 2;
  const halfDepth = DOOR_CLEARANCE_DEPTH / 2;
  const angle = door.angle ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([x, y]) => [
    (door.x ?? 0) + x * cos - y * sin,
    (door.y ?? 0) + x * sin + y * cos,
  ]);
}

function zoneForPoints(points: Point[]): Zone {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

function doorClearanceZone(door: FloorPlanObject): Zone {
  return zoneForPoints(doorClearancePoints(door));
}

function rectIntersectsDoorZone(rect: Rect, door: FloorPlanObject): boolean {
  const zone = doorClearanceZone(door);
  return rectsOverlap(rect, {
    x: zone.left,
    y: zone.top,
    width: zone.right - zone.left,
    height: zone.bottom - zone.top,
  });
}

function buildOutdoorLoop(walls: FloorPlanObject[], snapTolerance = 2): Point[] | null {
  if (walls.length < 3) return null;
  const remaining = [...walls];
  const first = remaining.shift()!;
  if (![first.startX, first.startY, first.endX, first.endY].every(Number.isFinite)) return null;
  const loop: Point[] = [[first.startX!, first.startY!]];
  const start = loop[0];
  let end: Point = [first.endX!, first.endY!];

  while (remaining.length > 0) {
    const index = remaining.findIndex(wall =>
      Math.hypot((wall.startX ?? Infinity) - end[0], (wall.startY ?? Infinity) - end[1]) < snapTolerance
      || Math.hypot((wall.endX ?? Infinity) - end[0], (wall.endY ?? Infinity) - end[1]) < snapTolerance
    );
    if (index === -1) return null;
    const next = remaining.splice(index, 1)[0];
    const atStart = Math.hypot((next.startX ?? Infinity) - end[0], (next.startY ?? Infinity) - end[1]) < snapTolerance;
    loop.push(atStart ? [next.startX!, next.startY!] : [next.endX!, next.endY!]);
    end = atStart ? [next.endX!, next.endY!] : [next.startX!, next.startY!];
  }

  return Math.hypot(end[0] - start[0], end[1] - start[1]) <= snapTolerance * 2 ? loop : null;
}

function pointInsideLoop(px: number, py: number, loop: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToLoop(px: number, py: number, loop: Point[]): number {
  let minimum = Infinity;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [ax, ay] = loop[j];
    const [bx, by] = loop[i];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
    minimum = Math.min(minimum, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return minimum;
}

const labelFor = (object: FloorPlanObject) => object.label ? `"${object.label}"` : object.type;

export function validateFloorplanObjects(objects: FloorPlanObject[]): FloorplanValidationResult {
  const errors: FloorplanValidationIssue[] = [];
  const polygonRooms = objects.filter(isPolygonRoom);
  const structuralPolygonRooms = polygonRooms.filter(room => !room.linkedLocationId);
  const structuralRooms = objects.filter(isRect).filter(room => !room.linkedLocationId);
  const furniture = objects.filter(isRect).filter(object => !!object.linkedLocationId);
  const walls = objects.filter(object => object.type === 'wall');
  const indoorWalls = walls.filter(wall => !isOutdoorWall(wall));
  const doors = objects.filter(isDoorLike);
  const fixedRooms = structuralRooms.filter(isFixed);

  const roomBounds = [
    ...structuralRooms.map(room => insetRect(room, CLEARANCE)),
    ...structuralPolygonRooms.map(room => insetRect(polygonBounds(room.points), CLEARANCE)),
  ];

  for (const object of furniture) {
    if (roomBounds.length > 0 && !roomBounds.some(room => containsRect(room, object))) {
      errors.push({ code: 'object_outside_room', objectId: object.id, message: 'Object is outside the room boundary.' });
    }
    if (walls.some(wall => {
      const bounds = wallRect(wall);
      return bounds ? rectsOverlap(bounds, object) : false;
    })) {
      errors.push({ code: 'object_crosses_wall', objectId: object.id, message: 'Wall is crossing an object.' });
    }
    const blocker = fixedRooms.find(room => !room.id.includes('reserved-column') && rectsOverlap(object, room));
    if (blocker) {
      errors.push({ code: 'object_overlap', objectId: object.id, message: `${labelFor(object)} overlaps fixed ${labelFor(blocker)}.` });
    }
    if (furniture.some(other => other.id !== object.id && rectsOverlap(object, other))) {
      errors.push({ code: 'object_overlap', objectId: object.id, message: 'Object overlaps another object.' });
    }
  }

  for (const room of structuralRooms.filter(room => !room.id.includes('reserved-column'))) {
    const overlap = structuralRooms.find(other => other.id !== room.id && !other.id.includes('reserved-column') && rectsOverlap(room, other));
    if (overlap && !isFixed(room)) {
      errors.push({ code: 'object_overlap', objectId: room.id, message: `${labelFor(room)} overlaps ${labelFor(overlap)}.` });
    }
    if (indoorWalls.some(wall => wall.groupId !== room.groupId && (() => {
      const bounds = wallRect(wall);
      return bounds ? rectsOverlap(bounds, insetRect(room, CLEARANCE)) : false;
    })())) {
      errors.push({ code: 'object_crosses_wall', objectId: room.id, message: `Indoor wall crosses ${isFixed(room) ? 'fixed ' : ''}${labelFor(room)}.` });
    }
    if (!isServiceRoom(room) && !doors.some(door => Number.isFinite(door.x) && Number.isFinite(door.y) && pointNearRectEdge(door.x!, door.y!, room))) {
      errors.push({ code: 'door_missing', objectId: room.id, message: 'Door is missing in this enclosed area.' });
    }
  }

  for (const room of structuralPolygonRooms.filter(room => !room.id.includes('reserved-column'))) {
    const bounds = insetRect(polygonBounds(room.points), CLEARANCE);
    if (indoorWalls.some(wall => wall.groupId !== room.groupId && (() => {
      const wallBounds = wallRect(wall);
      return wallBounds ? rectsOverlap(wallBounds, bounds) : false;
    })())) {
      errors.push({ code: 'object_crosses_wall', objectId: room.id, message: `Indoor wall crosses ${labelFor(room)}.` });
    }
  }

  for (const door of doors) {
    for (const object of furniture) {
      if (rectIntersectsDoorZone(object, door)) {
        errors.push({
          code: 'door_blocked',
          objectId: object.id,
          doorId: door.id,
          message: `"${object.label || object.type}" is blocking a doorway - move it away from the door.`,
        });
      }
    }
  }

  const outdoorLoop = buildOutdoorLoop(walls.filter(isOutdoorWall));
  if (outdoorLoop) {
    const outside = (x: number, y: number) => !pointInsideLoop(x, y, outdoorLoop) && distanceToLoop(x, y, outdoorLoop) > 6;
    for (const object of objects.filter(isRect).filter(object => !object.id.includes('reserved-column'))) {
      const corners: Point[] = [
        [object.x, object.y],
        [object.x + object.width, object.y],
        [object.x + object.width, object.y + object.height],
        [object.x, object.y + object.height],
      ];
      if (corners.some(([x, y]) => outside(x, y))) {
        errors.push({ code: 'object_outside_outdoor_walls', objectId: object.id, message: `${labelFor(object)} is outside the outdoor wall boundary.` });
      }
    }
    for (const room of polygonRooms.filter(room => !room.id.includes('reserved-column'))) {
      if (room.points.some((value, index) => index % 2 === 0 && outside(value, room.points[index + 1]))) {
        errors.push({ code: 'object_outside_outdoor_walls', objectId: room.id, message: `${labelFor(room)} is outside the outdoor wall boundary.` });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function nudgeOutOfZone(rect: Rect, zone: Zone): Pick<Rect, 'x' | 'y'> | null {
  const candidates = [
    { push: rect.x + rect.width - zone.left, x: Math.round(zone.left - rect.width - FIX_MARGIN), y: rect.y },
    { push: zone.right - rect.x, x: Math.round(zone.right + FIX_MARGIN), y: rect.y },
    { push: rect.y + rect.height - zone.top, x: rect.x, y: Math.round(zone.top - rect.height - FIX_MARGIN) },
    { push: zone.bottom - rect.y, x: rect.x, y: Math.round(zone.bottom + FIX_MARGIN) },
  ].map(candidate => ({ ...candidate, push: candidate.push > 0 ? candidate.push : Infinity }));
  const best = candidates.reduce((left, right) => left.push < right.push ? left : right);
  return Number.isFinite(best.push) ? { x: best.x, y: best.y } : null;
}

export function applyFloorplanAutoFixes(objects: FloorPlanObject[]): { objects: FloorPlanObject[]; fixedCount: number } {
  const fixed = objects.map(object => ({ ...object }));
  let fixedCount = 0;
  const result = validateFloorplanObjects(fixed);

  for (const issue of result.errors) {
    if (issue.code !== 'door_blocked' || !issue.objectId || !issue.doorId) continue;
    const index = fixed.findIndex(object => object.id === issue.objectId);
    const door = fixed.find(object => object.id === issue.doorId);
    if (index === -1 || !door || !isRect(fixed[index])) continue;
    const position = nudgeOutOfZone(fixed[index] as FloorPlanObject & Rect, doorClearanceZone(door));
    if (!position) continue;
    fixed[index] = { ...fixed[index], ...position };
    fixedCount++;
  }

  return { objects: fixed, fixedCount };
}
