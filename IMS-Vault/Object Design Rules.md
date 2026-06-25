---
tags: [ims, design-rules]
---

# Object Design Rules

Source of truth for floor-plan object dimensions, styling, and constraints. Update here before changing rendering code in `FloorPlanEditor.tsx` or `Building2D.tsx`.

## Doors
- Single door: jamb pair + one leaf + swing arc from hinge. Leaf length = `width * 0.85`.
- Double door: two leaves (`width * 0.42` each), dashed center seam, two swing arcs.
- Doors/windows/entrances draw in a second pass after all walls (see [[Isometric Depth Sorting]]) so later walls never paint over an opening.

## Windows
- TBD — document current `drawWindow` conventions here.

## Stairs
- Tread lines descend toward threshold.
- Side rails run full length of stair.

## Open questions
- [ ] Window dimension conventions
- [ ] Marker/rack default sizes
