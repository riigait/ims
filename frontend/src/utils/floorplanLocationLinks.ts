import type { BaseFloorPlanObject } from '@/types/floorplan';

/**
 * Resolves the effective set of linked location ids for an object —
 * linkedLocationIds (multi-location, current) if present, else falls back to
 * the single-value legacy linkedLocationId. Every call site (product
 * filtering, the editor's multi-select UI, etc) should go through this
 * instead of reading either field directly, so the fallback only lives here.
 */
export function getLinkedLocationIds(object: Pick<BaseFloorPlanObject, 'linkedLocationId' | 'linkedLocationIds'>): string[] {
  if (object.linkedLocationIds && object.linkedLocationIds.length > 0) return object.linkedLocationIds;
  return object.linkedLocationId ? [object.linkedLocationId] : [];
}
