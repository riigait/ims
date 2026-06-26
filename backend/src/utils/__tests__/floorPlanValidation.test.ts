import { validateFloorplanObjects, applyFloorplanAutoFixes } from '../floorPlanValidation';

// Pure-function characterization tests — no DB, no HTTP. These pin today's
// behavior of validateFloorplanObjects/applyFloorplanAutoFixes before any
// refactor touches the duplicated type lists or isFixed/isServiceRoom logic
// (see the floor-plan dedup plan). A later phase that changes these
// functions' internals must keep these green; a phase that changes their
// documented behavior should update these tests deliberately, not by accident.

function room(id: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}) {
  return { id, type: 'rack', x, y, width, height, ...extra };
}

describe('validateFloorplanObjects', () => {
  it('returns valid with no errors for an empty plan', () => {
    expect(validateFloorplanObjects([])).toEqual({ valid: true, errors: [] });
  });

  it('flags an object outside any room boundary', () => {
    const structuralRoom = { id: 'room-1', type: 'rack', x: 0, y: 0, width: 200, height: 200 };
    const furniture = { id: 'item-1', type: 'shelf', x: 500, y: 500, width: 40, height: 40, linkedLocationId: 'loc-1' };
    const result = validateFloorplanObjects([structuralRoom, furniture]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'object_outside_room' && e.objectId === 'item-1')).toBe(true);
  });

  it('does not flag furniture fully inside its room', () => {
    const structuralRoom = { id: 'room-1', type: 'rack', x: 0, y: 0, width: 200, height: 200 };
    const furniture = { id: 'item-1', type: 'shelf', x: 20, y: 20, width: 40, height: 40, linkedLocationId: 'loc-1' };
    const result = validateFloorplanObjects([structuralRoom, furniture]);
    expect(result.errors.some(e => e.code === 'object_outside_room')).toBe(false);
  });

  it('flags overlapping furniture objects', () => {
    const a = { id: 'item-1', type: 'shelf', x: 0, y: 0, width: 40, height: 40, linkedLocationId: 'loc-1' };
    const b = { id: 'item-2', type: 'shelf', x: 10, y: 10, width: 40, height: 40, linkedLocationId: 'loc-2' };
    const result = validateFloorplanObjects([a, b]);
    expect(result.errors.some(e => e.code === 'object_overlap' && e.objectId === 'item-1')).toBe(true);
  });

  it('flags a room missing a door, for a non-service room', () => {
    const structuralRoom = room('room-1', 0, 0, 200, 200);
    const result = validateFloorplanObjects([structuralRoom]);
    expect(result.errors.some(e => e.code === 'door_missing' && e.objectId === 'room-1')).toBe(true);
  });

  it('does not flag door_missing for a service room by label (bathroom)', () => {
    const structuralRoom = room('room-1', 0, 0, 200, 200, { label: 'Bathroom' });
    const result = validateFloorplanObjects([structuralRoom]);
    expect(result.errors.some(e => e.code === 'door_missing')).toBe(false);
  });

  it('does not flag door_missing for a service room by label (restroom variants)', () => {
    for (const label of ['Restroom', 'Toilet', 'Stairs A', 'Elevator', 'Male Restroom']) {
      const structuralRoom = room(`room-${label}`, 0, 0, 200, 200, { label });
      const result = validateFloorplanObjects([structuralRoom]);
      expect(result.errors.some(e => e.code === 'door_missing')).toBe(false);
    }
  });

  it('treats a reserved-id object as fixed, exempt from door_missing, regardless of label', () => {
    const structuralRoom = room('reserved-stairs-1', 0, 0, 200, 200, { label: 'Storage Room' });
    const result = validateFloorplanObjects([structuralRoom]);
    expect(result.errors.some(e => e.code === 'door_missing')).toBe(false);
  });

  it('recognizes all four reserved-id fixed patterns', () => {
    const ids = ['reserved-stairs-1', 'reserved-elevator-1', 'reserved-restroom-1', 'reserved-male-restroom-1', 'reserved-female-restroom-1', 'reserved-column-1'];
    for (const id of ids) {
      const structuralRoom = room(id, 0, 0, 200, 200);
      const result = validateFloorplanObjects([structuralRoom]);
      expect(result.errors.some(e => e.code === 'door_missing')).toBe(false);
    }
  });

  it('flags a door blocking furniture in its clearance zone', () => {
    const door = { id: 'door-1', type: 'door', x: 100, y: 100, width: 40, angle: 0 };
    const furniture = { id: 'item-1', type: 'shelf', x: 90, y: 90, width: 20, height: 20, linkedLocationId: 'loc-1' };
    const result = validateFloorplanObjects([door, furniture]);
    expect(result.errors.some(e => e.code === 'door_blocked' && e.objectId === 'item-1' && e.doorId === 'door-1')).toBe(true);
  });

  it('flags a wall crossing furniture', () => {
    const wall = { id: 'wall-1', type: 'wall', startX: 0, startY: 0, endX: 200, endY: 0, thickness: 8 };
    const furniture = { id: 'item-1', type: 'shelf', x: 50, y: -5, width: 20, height: 20, linkedLocationId: 'loc-1' };
    const result = validateFloorplanObjects([wall, furniture]);
    expect(result.errors.some(e => e.code === 'object_crosses_wall' && e.objectId === 'item-1')).toBe(true);
  });

  it('flags objects outside a closed outdoor wall loop', () => {
    const walls = [
      { id: 'ow-1-ow-1', type: 'wall', startX: 0, startY: 0, endX: 300, endY: 0, thickness: 8 },
      { id: 'ow-2-ow-2', type: 'wall', startX: 300, startY: 0, endX: 300, endY: 300, thickness: 8 },
      { id: 'ow-3-ow-3', type: 'wall', startX: 300, startY: 300, endX: 0, endY: 300, thickness: 8 },
      { id: 'ow-4-ow-4', type: 'wall', startX: 0, startY: 300, endX: 0, endY: 0, thickness: 8 },
    ];
    const outside = { id: 'item-1', type: 'shelf', x: 400, y: 400, width: 20, height: 20 };
    const result = validateFloorplanObjects([...walls, outside]);
    expect(result.errors.some(e => e.code === 'object_outside_outdoor_walls' && e.objectId === 'item-1')).toBe(true);
  });

  it('does not flag objects with broad-list rect types (stairs, elevator, bathroom, human, chair) for being unrecognized', () => {
    // These types are in RECT_OBJECT_TYPES (broad set) but not necessarily
    // storage-capable — validateFloorplanObjects should still treat them as
    // valid rects (containment/overlap checks apply) and not error/throw.
    for (const type of ['stairs', 'elevator', 'bathroom', 'human', 'chair']) {
      const structuralRoom = { id: 'room-1', type: 'rack', x: 0, y: 0, width: 200, height: 200 };
      const object = { id: `item-${type}`, type, x: 20, y: 20, width: 20, height: 20, linkedLocationId: 'loc-1' };
      expect(() => validateFloorplanObjects([structuralRoom, object])).not.toThrow();
    }
  });
});

describe('applyFloorplanAutoFixes', () => {
  it('returns the same objects with fixedCount 0 when there are no door_blocked issues', () => {
    const structuralRoom = { id: 'room-1', type: 'rack', x: 0, y: 0, width: 200, height: 200 };
    const result = applyFloorplanAutoFixes([structuralRoom]);
    expect(result.fixedCount).toBe(0);
    expect(result.objects).toEqual([structuralRoom]);
  });

  it('nudges furniture out of a door clearance zone and reports fixedCount', () => {
    const door = { id: 'door-1', type: 'door', x: 100, y: 100, width: 40, angle: 0 };
    const furniture = { id: 'item-1', type: 'shelf', x: 90, y: 90, width: 20, height: 20, linkedLocationId: 'loc-1' };
    const result = applyFloorplanAutoFixes([door, furniture]);
    expect(result.fixedCount).toBe(1);
    const fixedFurniture = result.objects.find(o => o.id === 'item-1') as { x: number; y: number };
    // After the fix, re-validating should no longer report door_blocked for this object.
    const revalidated = validateFloorplanObjects(result.objects);
    expect(revalidated.errors.some(e => e.code === 'door_blocked' && e.objectId === 'item-1')).toBe(false);
    expect(fixedFurniture).toBeDefined();
  });
});
