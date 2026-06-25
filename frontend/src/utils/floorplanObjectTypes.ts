import type { RectangleObjectType } from '@/types/floorplan';

/**
 * Single source of truth for the floor-plan object-type lists previously
 * hand-duplicated in FloorPlanEditor.tsx, floorplanFixer.ts, floorplanGrid.ts,
 * and floorplanValidation.ts. Backend has its own mirror at
 * backend/src/utils/floorPlanObjectTypes.ts — the two packages can't share a
 * module (no npm workspace), so keep both lists in sync by hand if either
 * changes; each file cross-references the other's path in a comment.
 */

// Every rect-shaped furniture/fixture type — drag/resize/rotate geometry
// applies to all of these, regardless of storage capability below.
export const RECTANGLE_OBJECT_TYPES = new Set<RectangleObjectType>([
  'rack', 'shelf', 'stairs', 'elevator',
  'work-surface', 'chair', 'cabinet', 'drawer', 'locker', 'storage-box', 'bin', 'pallet', 'bathroom', 'human',
]);

// Storage-capable rect types: support width/height editing, the rotation
// handle, and linking to an inventory location. Excludes chair/human (not
// storage) and stairs/elevator/bathroom (fixed building structures).
const NON_STORAGE_RECT_TYPES = new Set<RectangleObjectType>(['stairs', 'elevator', 'chair', 'bathroom', 'human']);
export const STORAGE_RECT_TYPES = new Set<RectangleObjectType>(
  [...RECTANGLE_OBJECT_TYPES].filter(type => !NON_STORAGE_RECT_TYPES.has(type))
);

export function isStorageRectType(type: string): boolean {
  return STORAGE_RECT_TYPES.has(type as RectangleObjectType);
}

export function isRectangleObjectType(type: string): boolean {
  return RECTANGLE_OBJECT_TYPES.has(type as RectangleObjectType);
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
