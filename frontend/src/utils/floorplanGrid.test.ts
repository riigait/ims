import { describe, it, expect } from 'vitest';
import { upgradeLegacyRoomObjects } from './floorplanGrid';
import type { FloorPlanObject, PolygonRoomObject } from '@/types/floorplan';

describe('upgradeLegacyRoomObjects', () => {
  it('converts a legacy rect room to a 4-corner polygon room', () => {
    const legacyRoom = {
      id: 'zone-a', type: 'room', x: 100, y: 50, width: 160, height: 120,
      label: 'Storage', color: '#abc', layer: 1,
    } as unknown as FloorPlanObject;

    const [result] = upgradeLegacyRoomObjects([legacyRoom]) as PolygonRoomObject[];

    expect(result.points).toEqual([100, 50, 260, 50, 260, 170, 100, 170]);
    expect(result.label).toBe('Storage');
    expect(result.color).toBe('#abc');
    expect(result).not.toHaveProperty('x');
    expect(result).not.toHaveProperty('width');
  });

  it('leaves polygon rooms untouched', () => {
    const room: PolygonRoomObject = {
      id: 'room-1', type: 'room', points: [0, 0, 50, 0, 25, 40],
    };
    expect(upgradeLegacyRoomObjects([room])[0]).toBe(room);
  });

  it('leaves non-room objects and malformed rooms untouched', () => {
    const wall = {
      id: 'w1', type: 'wall', startX: 0, startY: 0, endX: 10, endY: 0, thickness: 10,
    } as FloorPlanObject;
    const broken = { id: 'room-broken', type: 'room', x: 10 } as unknown as FloorPlanObject;

    const result = upgradeLegacyRoomObjects([wall, broken]);
    expect(result[0]).toBe(wall);
    expect(result[1]).toBe(broken);
  });
});
