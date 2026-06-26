/**
 * Single source of truth for the floor-plan object-type lists previously
 * hand-duplicated in floorPlanValidation.ts and routes/floorPlans.ts.
 * Frontend has its own mirror at
 * frontend/src/utils/floorplanObjectTypes.ts — the two packages can't share
 * a module (no npm workspace), so keep both lists in sync by hand if either
 * changes; each file cross-references the other's path in a comment.
 */

// Every rect-shaped furniture/fixture type — mirrors frontend RectangleObjectType.
export const RECT_OBJECT_TYPES = new Set([
  'rack', 'shelf', 'stairs', 'elevator',
  'work-surface', 'chair', 'cabinet', 'drawer', 'locker', 'storage-box', 'bin', 'pallet', 'bathroom', 'human',
]);

export function isRectObjectType(type: string): boolean {
  return RECT_OBJECT_TYPES.has(type);
}

// Reserved/auto-generated objects (stairs, elevator, restroom variants,
// columns) shared across sibling floors — exempt from certain validation
// checks (e.g. door_missing) regardless of label.
export function isFixedReservedObject(id: string): boolean {
  return id.includes('reserved-stairs')
    || id.includes('reserved-elevator')
    || /reserved-(male-|female-)?restroom/.test(id)
    || id.includes('reserved-column');
}

// Mirrors frontend/src/utils/floorplanLocationLinks.ts — resolves the
// effective set of linked location ids: linkedLocationIds (multi-location,
// current) if present, else the single-value legacy linkedLocationId.
export function getLinkedLocationIds(object: { linkedLocationId?: string; linkedLocationIds?: string[] }): string[] {
  if (object.linkedLocationIds && object.linkedLocationIds.length > 0) return object.linkedLocationIds;
  return object.linkedLocationId ? [object.linkedLocationId] : [];
}
