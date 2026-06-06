# Floor Plan Auto-Generation Development Report

**Project:** Inventory Management System  
**Report date:** June 6, 2026  
**Scope:** Floor-plan changes beginning with the multi-floor auto-generation request and ending with the removal of sibling-floor object resizing.

## Starting Request

The floor-plan work began with this requirement:

> Add how many floors in auto generate. The outdoor-wall shape must be the same as the next floor. Allow a different template for each floor, such as Storage room for Floor 1 and SCADA control room for Floor 2.

The original auto-generation flow created independent plans. It did not model a building with multiple related floors, per-floor templates, or a shared outdoor-wall footprint.

## Development Timeline

### 1. Multi-Floor Auto Generation

Added building and floor controls to Auto Generate:

- Select how many buildings to generate.
- Select how many floors each building contains.
- Select a different template for every floor.
- Floor 1 defines the building's outdoor-wall shape.
- Every sibling floor reuses the same outdoor-wall shape.
- Generated floor names identify their building, floor number, and template.

Result: a generated building can show Floor 1, Floor 2, and additional sibling floors as separate floor plans while keeping one building footprint.

### 2. Stairs, Elevators, and Restrooms

Added mandatory vertical-access and restroom generation:

- Auto Generate asks whether to use stairs, elevators, or both.
- Every generated floor receives restroom facilities.
- Restrooms can be one shared restroom or a grouped Male/Female pair.
- Male and Female restroom rooms use the same size.
- Stairs, elevators, and restrooms use visually distinguishable designs.

The wording was changed from bathroom to restroom.

### 3. Indoor and Outdoor Object Groups

Added grouping behavior to make generated layouts easier to move and regenerate:

- Indoor walls belonging to the same room are grouped.
- Outdoor walls are grouped as one building shell.
- Grouped indoor layouts can move to different positions during regeneration.
- Indoor objects remain contained by the outdoor-wall footprint.

### 4. Randomized Indoor Layout Placement

Expanded regeneration randomization:

- Indoor room groups can move to substantially different positions.
- Random movement is not limited to small offsets.
- Indoor groups remain inside the outdoor walls.
- The outdoor shell can encapsulate different randomized indoor arrangements.

### 5. Realistic Wall Snapping and Doors

Added realistic boundary behavior:

- Indoor walls near outdoor walls can snap or merge with the outdoor boundary.
- Duplicate wall edges are avoided when an indoor wall shares an outdoor wall.
- Doors are moved to the opposite side instead of being placed directly on a snapped edge.
- General spacing between indoor and outdoor walls was reduced to more practical values.

### 6. Multi-Floor Regeneration

Changed regeneration to operate at building level:

- Only the parent plan, Floor 1, displays the regenerate action.
- Regenerating Floor 1 regenerates every sibling floor in that building.
- Sibling floors do not display a separate regenerate action.
- The backend rejects direct sibling-floor regeneration.

### 7. Optional Outdoor-Wall Regeneration

Added the `Regenerate outdoor walls` Auto Generate option:

- Checked: the outdoor-wall shell may be regenerated.
- Unchecked: the existing outdoor walls are preserved exactly.
- When outdoor walls are preserved, only indoor layouts are randomized.

Generation and regeneration include progress messages and validation status.

### 8. Overflow and Floor Suggestions

Added capacity-aware location assignment:

- Locations are assigned only once across floors.
- Locations are not duplicated between sibling floors.
- Indoor objects must stay inside rooms and outdoor walls.
- Auto Generate suggests additional floors when selected floors cannot safely contain all locations.
- Suggested templates are based on the remaining location types.
- Unused total floor capacity is filled before another floor is suggested.

Practical capacities were based on the requested office, storage, dormitory, factory, warehouse, shelf, and rack planning guidance.

### 9. Sibling-Floor Fit Correction

Fixed an issue where Floor 2 and Floor 3 indoor layouts appeared extremely small:

- The cause was uniform scaling against the Floor 1 outdoor-wall bounding box.
- Placement logic was improved to search for usable positions inside the actual outdoor-wall polygon.
- Available floor capacity is now used before suggesting an additional floor.

### 10. Paired Stair Logic

Added the `Pair stairs by floors` option:

- Checked: stairs align in floor pairs such as Floors 1-2, 3-4, and 5-6.
- Unchecked: Floor 1 stairs are reused at the same location on all sibling floors.
- The rule applies during initial generation and building regeneration.

### 11. Rooftop Floor

Added the `Add rooftop floor` option:

- A location-free rooftop is added after the requested occupied floors.
- The rooftop uses the same outdoor-wall footprint.
- When the occupied-floor count is odd, the last occupied floor pairs its stairs with the rooftop.
- Example: Floors 1-2 share stairs, then Floor 3 and Rooftop share stairs.
- Rooftops remain location-free during regeneration.

### 12. Fixed Stair Size

Updated generated stair spaces:

- Stairs use a fixed size of **2.00 m by 2.00 m**.
- Fitting logic does not scale the stair group.
- The complete stair group includes its room, walls, and door.

### 13. Shared Elevator Shaft

Added physically correct elevator alignment:

- Elevators use a fixed **2.00 m by 2.00 m** shaft.
- Floor 1 defines the elevator location.
- Every sibling floor and rooftop uses the exact same elevator-shaft location.
- The complete elevator group is shared during generation and regeneration.
- Elevator alignment remains separate from optional stair-pair behavior.

### 14. Removed Sibling Object Resizing

The latest change removed automatic resizing of sibling-floor indoor objects:

- Sibling indoor objects retain their originally generated width and height.
- Objects are no longer enlarged or shrunk to fit the parent outdoor shell.
- The fitting helper may reposition the complete indoor layout only when it fits without resizing.
- If an unchanged-size layout cannot fit, its original geometry is retained.

## Current Auto-Generation Rules

The final Auto Generate flow follows these rules:

1. The user selects the building count and occupied-floor count.
2. The user selects one template for each occupied floor.
3. An optional rooftop can be added.
4. Floor 1 defines the shared outdoor-wall footprint.
5. Sibling floors and the rooftop reuse that footprint.
6. Locations are assigned once and are not duplicated across floors.
7. Every floor receives restroom facilities.
8. Stairs are fixed at 2.00 m by 2.00 m.
9. Paired stairs align Floors 1-2, 3-4, 5-6, and an odd final floor with the rooftop.
10. When stair pairing is disabled, Floor 1 stairs align across every floor.
11. Elevators are fixed at 2.00 m by 2.00 m and align across every floor.
12. Only Floor 1 can regenerate the complete building.
13. Preserved outdoor walls do not move when outdoor-wall regeneration is disabled.
14. Sibling indoor objects may be repositioned but are not resized.

## Main Files Changed

- `frontend/src/pages/FloorPlans.tsx`
  - Auto Generate controls, per-floor templates, rooftop option, stair-pair option, progress status, and parent-only regeneration controls.

- `backend/src/routes/floorPlans.ts`
  - Multi-floor generation, shared outdoor walls, location assignment, overflow suggestions, building regeneration, stair pairing, rooftop handling, shared elevator shafts, and no-resize sibling fitting.

- `backend/src/utils/floorPlanGenerator.ts`
  - Floor-plan object generation, room grouping, wall grouping, randomized layouts, wall snapping, restroom generation, and fixed stair/elevator sizing.

- `frontend/src/pages/FloorPlanEditor.tsx`
  - Distinguishable rendering and editor behavior for generated floor-plan objects.

- `frontend/src/utils/floorplanFixer.ts`
  - Supporting floor-plan object validation and correction behavior.

## Verification

During development, targeted frontend and backend builds were run after the related changes.

- Backend TypeScript build passed after the latest no-resize sibling-floor update.
- Frontend and backend builds passed after rooftop, paired-stair, and shared-elevator changes.
- No new dependencies or database schema changes were required.

## Final Outcome

The Auto Generate feature now models a building as a parent floor with related sibling floors and an optional rooftop. Floors share one outdoor-wall footprint while supporting different templates and independently generated indoor layouts. Stairs and elevators follow vertical-access rules, location assignments avoid duplication, overflow can trigger floor recommendations, and sibling indoor objects retain their generated dimensions.
