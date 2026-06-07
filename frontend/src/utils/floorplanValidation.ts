import booleanContains from '@turf/boolean-contains';
import booleanIntersects from '@turf/boolean-intersects';
import { bboxPolygon } from '@turf/turf';
import { Feature, Polygon } from 'geojson';
import { DoorObject, EntranceObject, FloorPlanObject, RectangleObject, WallObject } from '@/types/floorplan';

export type FloorplanValidationError =
  | 'object_outside_room'
  | 'object_crosses_wall'
  | 'object_overlap'
  | 'door_missing'
  | 'door_blocked'
  | 'object_outside_outdoor_walls';

export interface FloorplanValidationResult {
  valid: boolean;
  errors: Array<{ code: FloorplanValidationError; objectId?: string; doorId?: string; message: string }>;
}

const CLEARANCE = 4;
const EDGE_TOLERANCE = 20;
const DOOR_CLEARANCE_DEPTH = 92;

export interface DoorClearanceZone {
  polygon: Feature<Polygon>;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function rectPolygon(rect: { x: number; y: number; width: number; height: number }, inset = 0): Feature<Polygon> {
  return bboxPolygon([
    rect.x + inset,
    rect.y + inset,
    rect.x + rect.width - inset,
    rect.y + rect.height - inset,
  ]);
}

function wallPolygon(wall: WallObject): Feature<Polygon> {
  const minX = Math.min(wall.startX, wall.endX);
  const minY = Math.min(wall.startY, wall.endY);
  const maxX = Math.max(wall.startX, wall.endX);
  const maxY = Math.max(wall.startY, wall.endY);
  const half = Math.max(3, wall.thickness / 2);
  return bboxPolygon([
    minX - half,
    minY - half,
    maxX + half,
    maxY + half,
  ]);
}

function isRectObject(obj: FloorPlanObject): obj is RectangleObject {
  return obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf';
}

function isDoorLike(obj: FloorPlanObject): obj is DoorObject | EntranceObject {
  return obj.type === 'door' || obj.type === 'entrance';
}

export function getDoorClearanceZone(door: DoorObject | EntranceObject): DoorClearanceZone {
  const halfWidth = door.width / 2;
  const halfDepth = DOOR_CLEARANCE_DEPTH / 2;
  const cos = Math.cos(door.angle);
  const sin = Math.sin(door.angle);
  const corners = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([x, y]) => [
    door.x + x * cos - y * sin,
    door.y + x * sin + y * cos,
  ]);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const polygon: Feature<Polygon> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [[...corners, corners[0]]] },
  };

  return {
    polygon,
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function pointNearRectEdge(x: number, y: number, room: RectangleObject, tolerance = EDGE_TOLERANCE) {
  const inX = x >= room.x - tolerance && x <= room.x + room.width + tolerance;
  const inY = y >= room.y - tolerance && y <= room.y + room.height + tolerance;
  const nearVertical = Math.abs(x - room.x) <= tolerance || Math.abs(x - (room.x + room.width)) <= tolerance;
  const nearHorizontal = Math.abs(y - room.y) <= tolerance || Math.abs(y - (room.y + room.height)) <= tolerance;
  return (nearVertical && inY) || (nearHorizontal && inX);
}

// Traces connected outdoor-wall segments into an ordered closed-loop vertex list.
// Returns null if the segments are disconnected or don't close back to the start.
function buildOutdoorLoop(segs: WallObject[], snapTol = 2): [number, number][] | null {
  if (segs.length < 3) return null;
  const remaining = [...segs];
  const loop: [number, number][] = [];

  let cur = remaining.splice(0, 1)[0];
  const sx = cur.startX, sy = cur.startY;
  loop.push([sx, sy]);
  let ex = cur.endX, ey = cur.endY;

  while (remaining.length > 0) {
    const idx = remaining.findIndex(w =>
      Math.hypot(w.startX - ex, w.startY - ey) < snapTol ||
      Math.hypot(w.endX - ex, w.endY - ey) < snapTol
    );
    if (idx === -1) return null; // disconnected — skip validation
    const next = remaining.splice(idx, 1)[0];
    const atStart = Math.hypot(next.startX - ex, next.startY - ey) < snapTol;
    loop.push(atStart ? [next.startX, next.startY] : [next.endX, next.endY]);
    ex = atStart ? next.endX : next.startX;
    ey = atStart ? next.endY : next.startY;
  }

  // Loop must close back to its own starting point
  return Math.hypot(ex - sx, ey - sy) <= snapTol * 2 ? loop : null;
}

// Ray-casting point-in-polygon test — correct for convex and concave polygons.
function pointInsideLoop(px: number, py: number, loop: [number, number][]): boolean {
  let inside = false;
  const n = loop.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = loop[i], [xj, yj] = loop[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Minimum distance from point (px, py) to any edge of the loop.
function distToLoop(px: number, py: number, loop: [number, number][]): number {
  let min = Infinity;
  const n = loop.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [ax, ay] = loop[j], [bx, by] = loop[i];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
    min = Math.min(min, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return min;
}

export function validateFloorplanObjects(objects: FloorPlanObject[]): FloorplanValidationResult {
  const errors: FloorplanValidationResult['errors'] = [];
  const structuralRooms = objects.filter((obj): obj is RectangleObject => isRectObject(obj) && !obj.linkedLocationId);
  const placedObjects = objects.filter((obj): obj is RectangleObject => isRectObject(obj) && !!obj.linkedLocationId);
  // Furniture = racks/shelves only; rooms linked to locations are excluded from placement/clearance checks
  const placedFurniture = placedObjects.filter(o => o.type === 'rack' || o.type === 'shelf');
  const walls = objects.filter((obj): obj is WallObject => obj.type === 'wall');
  const doors = objects.filter(isDoorLike);

  // Only check containment when there are explicit structural rooms drawn
  if (structuralRooms.length > 0) {
    placedFurniture.forEach((obj) => {
      const objPoly = rectPolygon(obj);
      const containingRoom = structuralRooms.find((room) => booleanContains(rectPolygon(room, CLEARANCE), objPoly));
      if (!containingRoom) {
        errors.push({ code: 'object_outside_room', objectId: obj.id, message: 'Object is outside the room boundary.' });
      }

      if (walls.some((wall) => booleanIntersects(wallPolygon(wall), objPoly))) {
        errors.push({ code: 'object_crosses_wall', objectId: obj.id, message: 'Wall is crossing an object.' });
      }
    });
  }

  placedFurniture.forEach((obj) => {
    const objPoly = rectPolygon(obj);
    if (placedFurniture.some((other) => other.id !== obj.id && booleanIntersects(rectPolygon(other), objPoly))) {
      errors.push({ code: 'object_overlap', objectId: obj.id, message: 'Object overlaps another object.' });
    }
  });

  structuralRooms.forEach((room) => {
    if (!doors.some((door) => pointNearRectEdge(door.x, door.y, room))) {
      errors.push({ code: 'door_missing', objectId: room.id, message: 'Door is missing in this enclosed area.' });
    }
  });

  // Only flag furniture (racks/shelves) blocking door clearance — not room-sized objects
  doors.forEach((door) => {
    const doorZone = getDoorClearanceZone(door).polygon;
    placedFurniture.forEach((obj) => {
      if (booleanIntersects(rectPolygon(obj), doorZone)) {
        const name = (obj as any).label || obj.type;
        errors.push({ code: 'door_blocked', objectId: obj.id, doorId: door.id, message: `"${name}" is blocking a doorway — move it away from the door.` });
      }
    });
  });

  // Trace outdoor wall segments into a real closed loop, then use ray-casting
  // point-in-polygon plus a distance tolerance so snapped/boundary objects pass.
  // If the loop cannot be built (disconnected walls), skip this check entirely.
  const outdoorWalls = walls.filter(w => w.id.includes('-ow-'));
  if (outdoorWalls.length > 0) {
    const loop = buildOutdoorLoop(outdoorWalls);
    if (loop) {
      const TOLERANCE = 6; // px — corners within this distance of the boundary are not flagged
      objects.filter(isRectObject).forEach(obj => {
        const corners: [number, number][] = [
          [obj.x,             obj.y],
          [obj.x + obj.width, obj.y],
          [obj.x + obj.width, obj.y + obj.height],
          [obj.x,             obj.y + obj.height],
        ];
        const overflows = corners.some(([px, py]) =>
          !pointInsideLoop(px, py, loop) && distToLoop(px, py, loop) > TOLERANCE
        );
        if (overflows) {
          const label = obj.label ? `"${obj.label}"` : obj.type;
          errors.push({
            code: 'object_outside_outdoor_walls',
            objectId: obj.id,
            message: `${label} is outside the outdoor wall boundary.`,
          });
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
