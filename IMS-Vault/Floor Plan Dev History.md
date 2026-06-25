---
tags: [ims, floorplan, history]
---

# Floor Plan Dev History

Full history: `FLOORPLAN_DEVELOPMENT_REPORT.md` (repo root). Summary here, read the source doc for complete timeline.

## Auto-generation
- Multi-building, multi-floor generation; per-floor template selection.
- Floor 1 defines the outdoor-wall footprint; every sibling floor reuses it.
- Mandatory stairs/elevators + restrooms per generated floor (shared or Male/Female pair, same size).

## Superseded
- Sibling-floor object resizing — removed (see report for why).

## Related
- [[Object Design Rules]]
- [[Isometric Depth Sorting]]
