---
tags: [ims, isometric, performance]
---

# Isometric Depth Sorting

Covers `buildIsoFloorNodes` / `buildIsoBuilding` in [[../frontend/src/pages/Building2D.tsx]].

## Draw order
1. Exterior/perimeter walls (`isExterior: true`) — always drawn, fixed cost (~4 segments/floor).
2. Interior walls + furniture/markers — depth-sorted queue, only drawn when `showObjects` true.
3. Openings (doors/windows/entrances) — drawn in a second pass after all walls, so they're never painted over.

## "All floors" mode perf rule
At 50-100 floors, interior objects scale per-floor and dominate render cost (thousands of shapes on every pan/hover). In "all floors" mode: `showObjects = false`, only exterior shell renders. Click a floor → single mode → full interior detail returns.

## Why this matters
Any new object type added to the iso renderer must be tagged `isExterior` correctly or it either disappears in "all floors" mode (if it should always show) or kills perf at scale (if it shouldn't).
