import { describe, expect, it } from 'vitest';
import type { FloorPlanObject, PolygonRoomObject, RectangleObject, WallObject } from '@/types/floorplan';
import {
  alignmentTransformForFloor,
  buildFinalizedPerimeterWalls,
  finalizeFloorplanElements,
  transformFloorplanElements,
  transformWall,
  validateFloorAlignment,
} from '@/utils/floorplanAlignment';

const objects: FloorPlanObject[] = [
  { id: 'room-1', type: 'room', points: [0, 0, 100, 0, 100, 100, 0, 100] },
  { id: 'wall-1', type: 'wall', startX: 0, startY: 0, endX: 100, endY: 0, thickness: 8, wallType: 'floor_original_outdoor' },
  { id: 'rack-1', type: 'rack', x: 20, y: 30, width: 20, height: 10 },
  { id: 'reserved-elevator', type: 'elevator', x: 60, y: 60, width: 20, height: 20 },
];

describe('floorplan alignment transforms', () => {
  it('preserves coordinates for an identity transform', () => {
    const transformed = transformFloorplanElements(objects, alignmentTransformForFloor('floor-1', 0, 0));
    expect((transformed[2] as RectangleObject).x).toBe(20);
    expect((transformed[1] as WallObject).endX).toBe(100);
  });

  it('translates every element with the same offset', () => {
    const transformed = transformFloorplanElements(objects, alignmentTransformForFloor('floor-1', 100, 50));
    expect((transformed[0] as PolygonRoomObject).points[0]).toBe(100);
    expect((transformed[1] as WallObject).startY).toBe(50);
    expect((transformed[2] as RectangleObject).x).toBe(120);
    expect((transformed[3] as RectangleObject).y).toBe(110);
  });

  it('scales every element around one anchor', () => {
    const transform = { ...alignmentTransformForFloor('floor-1', 0, 0), scaleX: 1.2, scaleY: 1.2 };
    const transformed = transformFloorplanElements(objects, transform);
    expect((transformed[1] as WallObject).endX).toBe(120);
    expect((transformed[2] as RectangleObject).width).toBe(24);
  });

  it('does not apply alignment twice', () => {
    const transform = alignmentTransformForFloor('floor-1', 100, 50);
    const once = transformFloorplanElements(objects, transform);
    const twice = transformFloorplanElements(once, transform);
    expect(twice).toEqual(once);
  });

  it('preserves fixed object counts', () => {
    const transformed = transformFloorplanElements(objects, alignmentTransformForFloor('floor-1', 100, 50));
    expect(validateFloorAlignment(objects, transformed)).toMatchObject({
      valid: true,
      fixedObjectsBefore: 1,
      fixedObjectsAfter: 1,
    });
  });

  it('finalizes from source objects using the same transform', () => {
    const transform = alignmentTransformForFloor('floor-1', 100, 50);
    const sourceSnapshot = structuredClone(objects);
    const sharedPerimeter = buildFinalizedPerimeterWalls([transformWall(objects[1] as WallObject, transform)]);
    const finalized = finalizeFloorplanElements(objects, transform, sharedPerimeter);

    expect(objects).toEqual(sourceSnapshot);
    expect((finalized.objects[0] as PolygonRoomObject).points[0]).toBe(100);
    expect((finalized.objects[2] as RectangleObject).x).toBe(120);
    expect(finalized.finalWalls[0]).toMatchObject({
      startX: 100,
      startY: 50,
      endX: 200,
      endY: 50,
      isFinalizedPerimeter: true,
      meta: {
        wallKind: 'finalized_shared_perimeter',
        isFinalizedPerimeter: true,
      },
    });
  });

  it('does not move finalized source objects a second time', () => {
    const transform = alignmentTransformForFloor('floor-1', 100, 50);
    const sharedPerimeter = buildFinalizedPerimeterWalls([transformWall(objects[1] as WallObject, transform)]);
    const once = finalizeFloorplanElements(objects, transform, sharedPerimeter);
    const twice = finalizeFloorplanElements(once.objects, transform, sharedPerimeter);

    expect(twice.objects).toEqual(once.objects);
  });

  it('preserves source outdoor walls when replacing finalized perimeter walls', () => {
    const transform = alignmentTransformForFloor('floor-1', 0, 0);
    const sharedPerimeter = buildFinalizedPerimeterWalls([objects[1] as WallObject]);
    const once = finalizeFloorplanElements(objects, transform, sharedPerimeter);
    const twice = finalizeFloorplanElements(once.objects, transform, sharedPerimeter);

    expect(twice.objects.some(object => object.id === 'wall-1')).toBe(true);
    expect(twice.objects.filter(object => object.meta?.wallKind === 'finalized_shared_perimeter')).toHaveLength(sharedPerimeter.length);
  });

  it('falls back to a visible perimeter covering every source floor', () => {
    const distantWall: WallObject = {
      id: 'floor-2-ow-1',
      type: 'wall',
      startX: 300,
      startY: 200,
      endX: 400,
      endY: 200,
      thickness: 8,
      wallType: 'floor_original_outdoor',
    };
    const perimeter = buildFinalizedPerimeterWalls([objects[1] as WallObject, distantWall]);
    const coordinates = perimeter.flatMap(wall => [wall.startX, wall.startY, wall.endX, wall.endY]);

    expect(Math.min(...coordinates)).toBe(0);
    expect(Math.max(...coordinates)).toBe(400);
    expect(perimeter.every(wall => wall.meta?.isFinalizedPerimeter === true)).toBe(true);
  });
});
