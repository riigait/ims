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
  | 'door_blocked';

export interface FloorplanValidationResult {
  valid: boolean;
  errors: Array<{ code: FloorplanValidationError; objectId?: string; doorId?: string; message: string }>;
}

const CLEARANCE = 4;
const EDGE_TOLERANCE = 20;

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

function pointNearRectEdge(x: number, y: number, room: RectangleObject, tolerance = EDGE_TOLERANCE) {
  const inX = x >= room.x - tolerance && x <= room.x + room.width + tolerance;
  const inY = y >= room.y - tolerance && y <= room.y + room.height + tolerance;
  const nearVertical = Math.abs(x - room.x) <= tolerance || Math.abs(x - (room.x + room.width)) <= tolerance;
  const nearHorizontal = Math.abs(y - room.y) <= tolerance || Math.abs(y - (room.y + room.height)) <= tolerance;
  return (nearVertical && inY) || (nearHorizontal && inX);
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
    const doorZone = rectPolygon({ x: door.x - door.width / 2, y: door.y - door.width / 2, width: door.width, height: door.width });
    placedFurniture.forEach((obj) => {
      if (booleanIntersects(rectPolygon(obj), doorZone)) {
        const name = (obj as any).label || obj.type;
        errors.push({ code: 'door_blocked', objectId: obj.id, doorId: door.id, message: `"${name}" is blocking a doorway — move it away from the door.` });
      }
    });
  });

  return { valid: errors.length === 0, errors };
}
