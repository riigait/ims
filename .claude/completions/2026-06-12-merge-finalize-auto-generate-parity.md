# Merge/finalize floor plans — auto-generate parity with manual

**Date**: 2026-06-12
**Status**: Complete, verified by user in app. Not yet committed.

## Problem
Merge Floors preview / Finalize worked for manual buildings but not auto-generated ones:
finalized perimeter lost slanted drawn edges, finalize wiped floor objects, auto floors
scattered in preview, cores (stairs/elevator/restroom) didn't stack, generated floors
landed outside their canvas, and the finalize union shell traced interior zones instead
of the footprint.

## Changes

### frontend/src/pages/FloorPlans.tsx
- Finalize writes one **union exterior loop** (all floors' aligned outlines combined via
  `extractOutdoorWall`) as `finalized_building_perimeter` on every floor; preview overlay
  shows the same shell.
- `rawWalls` carried per aligned entry: unsnapped outlines translated by alignment offsets
  (20px grid snap deformed hand-drawn slanted edges); finalize union + preview use them.
- Finalize **keeps all floor objects** (shifted into shared space), replacing only old
  finalized perimeter walls. Previously it replaced the whole object list — original data
  of two manual floors was unrecoverable (no audit trail on floor plan routes).
- Auto-generated buildings (`Auto - … - Building N - Floor M` names): aligned by footprint
  bbox top-left, skip core-centroid pass; plus a core-relocation pass (`coreDx/coreDy`)
  that rigidly moves each floor's reserved core cluster onto the reference floor's cluster
  (applies to preview render, Apply Alignment, Finalize). Manual path untouched.
- `previewFitBounds`: merge preview viewBox auto-fits everything actually rendered,
  recomputed per view mode.
- `outdoorWallsFor`: explicit outdoor walls (`-ow-` / finalized perimeter) are the
  authoritative footprint when present; polygon-derived outline remains the manual-plan path.

### backend/src/routes/floorPlans.ts
- `translateOutdoorWallsToSharedAnchor` now translates the **whole floor** (was walls-only,
  leaving interiors decoupled from footprints).
- Auto-generate saves per building in two phases: generate all floors, then apply one
  common grid-snapped shift into positive canvas space and one shared canvas size
  (building bounds + 60px margin, min 1800×1200). Per-floor shifts would un-stack cores.
- Extracted `translateFloorPlanObjects` helper.

## Notes / follow-ups
- Floor plan routes write no audit entries — overwrites are unrecoverable. Consider audit
  logging with `oldValues` (route: backend/src/routes/floorPlans.ts).
- Core relocation on old corrupted buildings can overlap rooms; regeneration is cleanest.
- Verified with vitest (floorplanGeometry, 9 tests) + tsc on both packages + live DB checks.
