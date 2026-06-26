---
tags: [ims, entrance, doors]
---

# Entrance Style Logic

Styles handled in `drawEntrance` ([[../frontend/src/pages/FloorPlanEditor.tsx]]):

- `single` — one leaf, swings open toward top.
- `double` — two leaves, dashed center seam, mirrored swing arcs.
- `archway` — arched opening, no leaf/swing (open passage).

## Hinge math
- Single: hinge at `-width/2`, leaf length `width * 0.85`.
- Double: hinges at `±width/2`, leaf length `width * 0.42` each.
- Swing arc: `ctx.arc(hingeX, 0, leafLen, -Math.PI/2 - 0.78, 0)` (single), mirrored for double's right leaf.

## Open questions
- [ ] Archway dimension rules
- [ ] Sliding door style (not yet implemented?)
