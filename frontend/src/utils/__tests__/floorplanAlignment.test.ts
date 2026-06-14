import { describe, expect, it } from 'vitest';
import type { FloorPlanObject, PolygonRoomObject, RectangleObject, WallObject } from '@/types/floorplan';
import {
  alignmentTransformForFloor,
  transformFloorplanElements,
  validateFloorAlignment,
} from '@/utils/floorplanAlignment';

const objects: FloorPlanObject[] = [
  { id: 'room-1', type: 'room', points: [0, 0, 100, 0, 100, 100, 0, 100] },
  { id: 'wall-1', type: 'wall', startX: 0, startY: 0, endX: 100, endY: 0, thickness: 8 },
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
});
