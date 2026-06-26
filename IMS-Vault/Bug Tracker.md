---
tags: [ims, bugs]
---

# Bug Tracker

| Status | Area | Issue | Notes |
|---|---|---|---|
| Fixed | DataPageLayout | Add-button label broke on plural nouns ending "ies" | af93a81 |
| Fixed | Building2D | Iso perf collapse at 50-100 floors in "all floors" mode | af93a81, see [[Isometric Depth Sorting]] |
| Fixed | FloorPlanEditor | Walls painted over door/window openings | af93a81 |
| Fixed | Building2D | Single-floor buildings stuck in "all floors" mode (no filter chip ever rendered → isoFloorFilter always null → showObjects always false) — objects never appeared | 437a9db, see [[Isometric Depth Sorting]] |
| Fixed | TopDown25D renderer | Entrance style (double/archway/stairway) dropped during BEV adapter conversion — all entrances rendered as plain single-door shape | not yet committed |
| Open | — | — | — |
