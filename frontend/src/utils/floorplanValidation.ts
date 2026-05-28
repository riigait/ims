import booleanContains from '@turf/boolean-contains';
import booleanIntersects from '@turf/boolean-intersects';
import { bboxPolygon } from '@turf/turf';
import { Feature, Polygon } from 'geojson';
import { DoorObject, EntranceObject, FloorPlanObject, RectangleObject, WallObject, WindowObject } from '@/types/floorplan';

export type FloorplanValidationError =
  | 'object_outside_room'
  | 'object_crosses_wall'
  | 'object_overlap'
  | 'door_missing'
  | 'door_blocked'
  | 'window_not_on_exterior';

export interface FloorplanValidationResult {
  valid: boolean;
  errors: Array<{ code: FloorplanValidationError; objectId?: string; message: string }>;
}

const CLEARANCE = 8;

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

function isWindow(obj: FloorPlanObject): obj is WindowObject {
  return obj.type === 'window';
}

function pointNearRectEdge(x: number, y: number, room: RectangleObject, tolerance = 12) {
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
  const walls = objects.filter((obj): obj is WallObject => obj.type === 'wall');
  const doors = objects.filter(isDoorLike);
  const windows = objects.filter(isWindow);

  placedObjects.forEach((obj) => {
    const objPoly = rectPolygon(obj);
    const containingRoom = structuralRooms.find((room) => booleanContains(rectPolygon(room, CLEARANCE), objPoly));
    if (!containingRoom) {
      errors.push({ code: 'object_outside_room', objectId: obj.id, message: 'Object is outside the room boundary.' });
    }

    if (walls.some((wall) => booleanIntersects(wallPolygon(wall), objPoly))) {
      errors.push({ code: 'object_crosses_wall', objectId: obj.id, message: 'Wall is crossing an object.' });
    }

    if (placedObjects.some((other) => other.id !== obj.id && booleanIntersects(rectPolygon(other), objPoly))) {
      errors.push({ code: 'object_overlap', objectId: obj.id, message: 'Object overlaps another object.' });
    }
  });

  structuralRooms.forEach((room) => {
    if (!doors.some((door) => pointNearRectEdge(door.x, door.y, room))) {
      errors.push({ code: 'door_missing', objectId: room.id, message: 'Door is missing in this enclosed area.' });
    }
  });

  doors.forEach((door) => {
    const doorZone = rectPolygon({ x: door.x - door.width / 2, y: door.y - door.width / 2, width: door.width, height: door.width });
    if (placedObjects.some((obj) => booleanIntersects(rectPolygon(obj), doorZone))) {
      errors.push({ code: 'door_blocked', objectId: door.id, message: 'Door is blocked by an object.' });
    }
  });

  windows.forEach((windowObject) => {
    if (!structuralRooms.some((room) => pointNearRectEdge(windowObject.x, windowObject.y, room))) {
      errors.push({ code: 'window_not_on_exterior', objectId: windowObject.id, message: 'Window is not placed on a room wall.' });
    }
  });

  return { valid: errors.length === 0, errors };
}
