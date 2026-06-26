import type { FloorPlanObject, WallObject } from '@/types/floorplan';
import { extractOutdoorWall } from '@/utils/floorplanGeometry';

export interface FloorAlignmentTransform {
  floorId: string;
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

function transformId(transform: FloorAlignmentTransform) {
  return [
    transform.floorId,
    transform.translateX,
    transform.translateY,
    transform.scaleX,
    transform.scaleY,
    transform.rotation,
    transform.anchorX,
    transform.anchorY,
  ].join(':');
}

export function transformPoint(
  point: { x: number; y: number },
  transform: FloorAlignmentTransform,
) {
  const radians = transform.rotation * Math.PI / 180;
  const scaledX = (point.x - transform.anchorX) * transform.scaleX;
  const scaledY = (point.y - transform.anchorY) * transform.scaleY;
  return {
    x: transform.anchorX + scaledX * Math.cos(radians) - scaledY * Math.sin(radians) + transform.translateX,
    y: transform.anchorY + scaledX * Math.sin(radians) + scaledY * Math.cos(radians) + transform.translateY,
  };
}

export function transformElement(
  element: FloorPlanObject,
  transform: FloorAlignmentTransform,
): FloorPlanObject {
  const finalizedWall = element.type === 'wall' && (
    element.isFinalizedPerimeter === true
    || element.wallType === 'finalized_building_perimeter'
    || element.meta?.isFinalizedPerimeter === true
  );
  const sourceOutdoorWall = element.type === 'wall'
    && !finalizedWall
    && (element.wallType === 'floor_original_outdoor' || element.id.includes('-ow-'));

  const meta = {
    ...element.meta,
    sourceFloorId: transform.floorId,
    alignmentApplied: true,
    alignmentTransformId: transformId(transform),
    ...(sourceOutdoorWall ? { wallKind: 'source_floor_outdoor_wall' as const } : {}),
  };
  if (element.meta?.alignmentApplied) return { ...element, meta };

  if (element.type === 'wall') {
    const start = transformPoint({ x: element.startX, y: element.startY }, transform);
    const end = transformPoint({ x: element.endX, y: element.endY }, transform);
    return {
      ...element,
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      thickness: element.thickness * Math.max(transform.scaleX, transform.scaleY),
      meta,
    };
  }

  if (element.type === 'room' && Array.isArray(element.points)) {
    const points: number[] = [];
    for (let index = 0; index < element.points.length; index += 2) {
      const point = transformPoint({ x: element.points[index], y: element.points[index + 1] }, transform);
      points.push(point.x, point.y);
    }
    return { ...element, points, meta };
  }

  if ('x' in element && 'y' in element) {
    const point = transformPoint({ x: element.x, y: element.y }, transform);
    const sized = element as FloorPlanObject & { width?: number; height?: number; rotation?: number; angle?: number };
    return {
      ...element,
      x: point.x,
      y: point.y,
      ...('width' in sized && typeof sized.width === 'number' ? { width: sized.width * transform.scaleX } : {}),
      ...('height' in sized && typeof sized.height === 'number' ? { height: sized.height * transform.scaleY } : {}),
      ...('rotation' in sized && typeof sized.rotation === 'number' ? { rotation: sized.rotation + transform.rotation } : {}),
      ...('angle' in sized && typeof sized.angle === 'number' ? { angle: sized.angle + transform.rotation * Math.PI / 180 } : {}),
      meta,
    } as FloorPlanObject;
  }

  return { ...element, meta };
}

export function transformFloorplanElements(
  elements: FloorPlanObject[],
  transform: FloorAlignmentTransform,
) {
  return elements.map(element => transformElement(element, transform));
}

function isFixedObject(element: FloorPlanObject) {
  return element.id.includes('reserved-stairs')
    || element.id.includes('reserved-elevator')
    || /reserved-(male-|female-)?restroom/.test(element.id);
}

function finiteCoordinates(element: FloorPlanObject) {
  if (element.type === 'wall') return [element.startX, element.startY, element.endX, element.endY];
  if (element.type === 'room') return element.points;
  if ('x' in element && 'y' in element) {
    const sized = element as FloorPlanObject & { width?: number; height?: number };
    return [
      element.x,
      element.y,
      element.x + (sized.width ?? 0),
      element.y + (sized.height ?? 0),
    ];
  }
  return [];
}

function elementBounds(elements: FloorPlanObject[]) {
  const points = elements.flatMap(element => {
    const coordinates = finiteCoordinates(element);
    const result: Array<{ x: number; y: number }> = [];
    for (let index = 0; index + 1 < coordinates.length; index += 2) {
      result.push({ x: coordinates[index], y: coordinates[index + 1] });
    }
    return result;
  });
  if (points.length === 0) return null;
  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function validateFloorAlignment(
  original: FloorPlanObject[],
  transformed: FloorPlanObject[],
) {
  const count = (elements: FloorPlanObject[], type: FloorPlanObject['type']) =>
    elements.filter(element => element.type === type).length;
  const invalidCoordinates = transformed.filter(element =>
    finiteCoordinates(element).some(value => !Number.isFinite(value) || Math.abs(value) > 1_000_000));
  const unalignedElements = transformed.filter(element => element.meta?.alignmentApplied !== true);
  const roomsBefore = count(original, 'room');
  const roomsAfter = count(transformed, 'room');
  const wallsBefore = count(original, 'wall');
  const wallsAfter = count(transformed, 'wall');

  return {
    valid: original.length === transformed.length
      && original.filter(isFixedObject).length === transformed.filter(isFixedObject).length
      && roomsBefore === roomsAfter
      && wallsBefore === wallsAfter
      && unalignedElements.length === 0
      && invalidCoordinates.length === 0,
    elementsBefore: original.length,
    elementsAfter: transformed.length,
    objectsBefore: original.length - roomsBefore - wallsBefore,
    objectsAfter: transformed.length - roomsAfter - wallsAfter,
    roomsBefore,
    roomsAfter,
    wallsBefore,
    wallsAfter,
    fixedObjectsBefore: original.filter(isFixedObject).length,
    fixedObjectsAfter: transformed.filter(isFixedObject).length,
    bboxBefore: elementBounds(original),
    bboxAfter: elementBounds(transformed),
    alreadyAlignedBefore: original.filter(element => element.meta?.alignmentApplied === true).length,
    unalignedElements: unalignedElements.map(element => element.id),
    invalidCoordinates: invalidCoordinates.map(element => element.id),
  };
}

export function alignmentTransformForFloor(
  floorId: string,
  translateX: number,
  translateY: number,
): FloorAlignmentTransform {
  return {
    floorId,
    translateX,
    translateY,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    anchorX: 0,
    anchorY: 0,
  };
}

export function transformWall(
  wall: WallObject,
  transform: FloorAlignmentTransform,
): WallObject {
  return transformElement(wall, transform) as WallObject;
}

function wallBounds(walls: WallObject[]) {
  const points = walls.flatMap(wall => [
    { x: wall.startX, y: wall.startY },
    { x: wall.endX, y: wall.endY },
  ]);
  if (points.length === 0) return null;
  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));
  return { minX, minY, maxX, maxY };
}

function boundingBoxPerimeter(sourceOutdoorWalls: WallObject[]) {
  const bounds = wallBounds(sourceOutdoorWalls);
  if (!bounds) return [];
  const { minX, minY, maxX, maxY } = bounds;
  return [
    { x1: minX, y1: minY, x2: maxX, y2: minY },
    { x1: maxX, y1: minY, x2: maxX, y2: maxY },
    { x1: maxX, y1: maxY, x2: minX, y2: maxY },
    { x1: minX, y1: maxY, x2: minX, y2: minY },
  ];
}

export function buildFinalizedPerimeterWalls(sourceOutdoorWalls: WallObject[]) {
  if (sourceOutdoorWalls.length === 0) return [];
  const extracted = extractOutdoorWall({
    walls: sourceOutdoorWalls.map(wall => ({
      id: wall.id,
      x1: wall.startX,
      y1: wall.startY,
      x2: wall.endX,
      y2: wall.endY,
    })),
  }).outerSegments;
  const extractedWalls = extracted.map((segment, index): WallObject => ({
    id: `extracted-final-wall-${index}`,
    type: 'wall',
    startX: segment.x1,
    startY: segment.y1,
    endX: segment.x2,
    endY: segment.y2,
    thickness: 8,
  }));
  const sourceBounds = wallBounds(sourceOutdoorWalls);
  const extractedBounds = wallBounds(extractedWalls);
  const extractedCoversSource = sourceBounds && extractedBounds
    && extractedBounds.minX <= sourceBounds.minX
    && extractedBounds.minY <= sourceBounds.minY
    && extractedBounds.maxX >= sourceBounds.maxX
    && extractedBounds.maxY >= sourceBounds.maxY;
  const perimeter = extractedCoversSource ? extracted : boundingBoxPerimeter(sourceOutdoorWalls);
  return perimeter.map((segment, index): WallObject => ({
    id: `final-shared-ow-${index}`,
    type: 'wall',
    startX: segment.x1,
    startY: segment.y1,
    endX: segment.x2,
    endY: segment.y2,
    wallType: 'finalized_building_perimeter',
    isFinalizedPerimeter: true,
    thickness: 8,
    color: '#111827',
    layer: 1,
    meta: {
      wallKind: 'finalized_shared_perimeter',
      isFinalizedPerimeter: true,
      generatedBy: 'finalize_floorplan',
      alignmentApplied: true,
      alignmentTransformId: 'shared-finalized-perimeter',
    },
  }));
}

export function finalizeFloorplanElements(
  elements: FloorPlanObject[],
  transform: FloorAlignmentTransform,
  finalizedPerimeterWalls: WallObject[],
) {
  const sourceObjects = elements.filter(element => !(element.type === 'wall' && (
    element.wallType === 'finalized_building_perimeter'
    || element.isFinalizedPerimeter === true
    || element.meta?.isFinalizedPerimeter === true
  )));
  const transformedObjects = transformFloorplanElements(sourceObjects, transform);

  return {
    sourceObjects,
    transformedObjects,
    finalWalls: finalizedPerimeterWalls,
    objects: [...transformedObjects, ...finalizedPerimeterWalls],
  };
}
