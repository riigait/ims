import express, { Router, Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, canAccessDepartment } from '../middleware/auth';
import { csvToJson } from '../utils/csv';
import {
  GENERATED_FLOORPLAN_SUFFIXES,
  GENERATED_FLOORPLAN_PREFIX,
  FLOORPLAN_KNOWLEDGE,
  DEFAULT_AUTO_GENERATE_TEMPLATES,
  TEMPLATE_RULES,
  FloorPlanObject,
  getLocationPlanGroup,
  determineTemplateType,
  validateGeneratedFloorPlan,
  buildGeneratedFloorPlan,
  buildKnowledgeTemplateFloorPlan,
} from '../utils/floorPlanGenerator';

const router = Router();

// Margin between the outdoor wall polygon and the usable indoor area.
// Must stay in sync with `margin` in fitIndoorObjectsInsideOutdoorWalls
// and `WALL_MARGIN` in resolveIndoorObjectOverlaps (both are 28).
const OUTDOOR_WALL_MARGIN = 28;

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getDepartmentFilter(req: AuthRequest) {
  if (req.departmentIds && req.departmentIds.length > 0) {
    return {
      OR: [
        { departmentId: { in: req.departmentIds } },
        { departmentId: null }
      ]
    };
  }

  if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
    return { departmentId: req.departmentId };
  }

  return {};
}

function canManageFloorPlan(req: AuthRequest, departmentId: string | null) {
  if (req.userRole === 'superadmin') return true;
  return req.userRole === 'admin' && Boolean(req.departmentId) && departmentId === req.departmentId;
}

type LocationKind = 'rack' | 'shelf' | 'room';

// Per-floor location-assignment caps aligned with ZONE_RACK_SHELF_DEFAULTS.
// Values represent location DB records (not physical units); one shelf/rack can
// hold many records. Caps prevent a single floor from becoming visually unreadable.
const FLOOR_CAPACITY: Record<string, Record<LocationKind, number>> = {
  warehouse: { rack: 24,  shelf: 50,  room: 10 },
  storage:   { rack: 4,   shelf: 6,   room: 10 },
  dormitory: { rack: 2,   shelf: 4,   room: 40 },
  office:    { rack: 2,   shelf: 4,   room: 60 },
  technical: { rack: 4,   shelf: 2,   room: 10 },
  reception: { rack: 1,   shelf: 1,   room: 20 },
};

function getLocationKind(name: string): LocationKind {
  const normalized = name.toLowerCase();
  if (normalized.includes('rack') || normalized.includes('server') || normalized.includes('radio')) return 'rack';
  if (['shelf', 'cabinet', 'box', 'drawer', 'bin', 'orocan', 'pedestal'].some((keyword) => normalized.includes(keyword))) return 'shelf';
  return 'room';
}

function getTemplateCapacity(templateName: string): Record<LocationKind, number> {
  const normalized = templateName.toLowerCase();
  if (normalized.includes('warehouse')) return FLOOR_CAPACITY.warehouse;
  if (normalized.includes('storage')) return FLOOR_CAPACITY.storage;
  if (normalized.includes('dormitory')) return FLOOR_CAPACITY.dormitory;
  if (normalized.includes('server') || normalized.includes('scada')) return FLOOR_CAPACITY.technical;
  if (normalized.includes('reception')) return FLOOR_CAPACITY.reception;
  return FLOOR_CAPACITY.office;
}

function assignLocationsToFloors(locations: Array<{ id: string; name: string }>, templates: string[]) {
  const remaining = [...locations];
  const assignments = templates.map(() => [] as typeof locations);
  const capacities = templates.map(getTemplateCapacity);

  templates.forEach((templateName, floorIndex) => {
    const capacity = capacities[floorIndex];
    (['rack', 'shelf', 'room'] as LocationKind[]).forEach((kind) => {
      let available = capacity[kind];
      for (let index = 0; index < remaining.length && available > 0;) {
        if (getLocationKind(remaining[index].name) === kind) {
          assignments[floorIndex].push(remaining.splice(index, 1)[0]);
          available--;
        } else {
          index++;
        }
      }
    });
  });

  while (remaining.length > 0) {
    const floorIndex = assignments
      .map((assignment, index) => {
        const totalCapacity = Object.values(capacities[index]).reduce((sum, value) => sum + value, 0);
        return { index, available: totalCapacity - assignment.length, utilization: assignment.length / totalCapacity };
      })
      .filter((floor) => floor.available > 0)
      .sort((a, b) => a.utilization - b.utilization)[0]?.index;
    if (floorIndex === undefined) break;
    assignments[floorIndex].push(remaining.shift()!);
  }

  return { assignments, remaining };
}

function suggestFloorTemplates(locations: Array<{ id: string; name: string }>, existingTemplates: string[]) {
  const suggestions = [...existingTemplates];
  let remaining = [...locations];

  while (remaining.length > 0 && suggestions.length < 12) {
    const counts = remaining.reduce((result, location) => {
      result[getLocationKind(location.name)]++;
      return result;
    }, { rack: 0, shelf: 0, room: 0 } as Record<LocationKind, number>);
    const template = counts.rack >= counts.shelf && counts.rack >= counts.room
      ? 'Warehouse'
      : counts.shelf >= counts.room
        ? 'Storage room'
        : 'Office layout';
    suggestions.push(template);
    remaining = assignLocationsToFloors(remaining, [template]).remaining;
  }

  return { suggestions, remaining };
}

function fitIndoorObjectsInsideOutdoorWalls(objects: FloorPlanObject[]): FloorPlanObject[] {
  const isOutdoorWall = (object: FloorPlanObject) => object.type === 'wall' && object.id.includes('-ow-');
  const isFixedVerticalAccess = (object: FloorPlanObject) => (
    object.id.includes('reserved-stairs') || object.id.includes('reserved-elevator')
  );
  // Sort by the numeric suffix in "-ow-N" so the polygon vertices are in
  // traversal order even if the objects array was shuffled (e.g. by layer sort).
  const owIndex = (wall: FloorPlanObject) => {
    const m = wall.id.match(/-ow-(\d+)$/);
    return m ? Number(m[1]) : 0;
  };
  const outdoorWalls = objects.filter(isOutdoorWall).sort((a, b) => owIndex(a) - owIndex(b));
  const indoorObjects = objects.filter((object) => !isOutdoorWall(object));
  if (outdoorWalls.length === 0 || indoorObjects.length === 0) return objects;

  const polygon = outdoorWalls.map((wall) => [wall.startX ?? wall.x, wall.startY ?? wall.y] as [number, number]);
  const pointInsidePolygon = (x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1) + xi) inside = !inside;
    }
    return inside;
  };
  const outdoorXs = outdoorWalls.flatMap((wall) => [wall.startX ?? wall.x, wall.endX ?? wall.x + wall.width]);
  const outdoorYs = outdoorWalls.flatMap((wall) => [wall.startY ?? wall.y, wall.endY ?? wall.y + wall.height]);
  const margin = 28;
  const targetLeft = Math.min(...outdoorXs) + margin;
  const targetTop = Math.min(...outdoorYs) + margin;
  const targetRight = Math.max(...outdoorXs) - margin;
  const targetBottom = Math.max(...outdoorYs) - margin;

  // Exclude stairs/elevators from source bounds and polygon test — they are replaced after fitting.
  const spatial = indoorObjects.filter((object) => object.type !== 'label' && !isFixedVerticalAccess(object));
  const xs = spatial.flatMap((object) => object.type === 'wall'
    ? [object.startX ?? object.x, object.endX ?? object.x + object.width]
    : [object.x, object.x + object.width]);
  const ys = spatial.flatMap((object) => object.type === 'wall'
    ? [object.startY ?? object.y, object.endY ?? object.y + object.height]
    : [object.y, object.y + object.height]);
  if (xs.length === 0 || ys.length === 0) return objects;

  const sourceLeft = Math.min(...xs);
  const sourceTop = Math.min(...ys);
  const sourceWidth = Math.max(1, Math.max(...xs) - sourceLeft);
  const sourceHeight = Math.max(1, Math.max(...ys) - sourceTop);
  const targetWidth = Math.max(1, targetRight - targetLeft);
  const targetHeight = Math.max(1, targetBottom - targetTop);

  // Scale down uniformly if the source content is larger than the target area.
  // Never scale up (cap at 1) — only shrink to fit when needed.
  const scale = Math.min(1, targetWidth / sourceWidth, targetHeight / sourceHeight);
  const scaledW = sourceWidth  * scale;
  const scaledH = sourceHeight * scale;

  const rectangles = indoorObjects.filter((object) =>
    (object.type === 'room' || object.type === 'rack' || object.type === 'shelf')
    && !isFixedVerticalAccess(object));
  // offsetX/Y is the target-space coordinate of the scaled content's top-left corner.
  const transformFits = (ox: number, oy: number) => rectangles.every((object) => {
    const left   = ox + (object.x - sourceLeft) * scale;
    const top    = oy + (object.y - sourceTop)  * scale;
    const right  = left + object.width  * scale;
    const bottom = top  + object.height * scale;
    return [
      [left, top], [(left + right) / 2, top], [right, top],
      [left, (top + bottom) / 2], [right, (top + bottom) / 2],
      [left, bottom], [(left + right) / 2, bottom], [right, bottom],
    ].every(([x, y]) => pointInsidePolygon(x, y));
  });

  const availableX = Math.max(0, targetWidth  - scaledW);
  const availableY = Math.max(0, targetHeight - scaledH);
  // Fast path: if scale=1 and the current position already fits, keep it in place.
  let offsetX = sourceLeft;
  let offsetY = sourceTop;
  let foundPlacement = scale === 1 && transformFits(sourceLeft, sourceTop);
  for (let yStep = 0; yStep <= 12 && !foundPlacement; yStep++) {
    for (let xStep = 0; xStep <= 12; xStep++) {
      const cx = targetLeft + availableX * (xStep / 12);
      const cy = targetTop  + availableY * (yStep / 12);
      if (transformFits(cx, cy)) {
        offsetX = cx;
        offsetY = cy;
        foundPlacement = true;
        break;
      }
    }
  }
  if (!foundPlacement) {
    offsetX = targetLeft + availableX / 2;
    offsetY = targetTop  + availableY / 2;
  }

  const mapX = (value: number) => offsetX + (value - sourceLeft) * scale;
  const mapY = (value: number) => offsetY + (value - sourceTop)  * scale;
  // Stairs/elevators are replaced with shared floor-1 objects after fitting,
  // so their exact transformation here doesn't matter — mapX/Y is sufficient.
  const mapFixedX = (_object: FloorPlanObject, value: number) => mapX(value);
  const mapFixedY = (_object: FloorPlanObject, value: number) => mapY(value);

  return objects.map((object) => {
    if (isOutdoorWall(object)) return object;
    if (isFixedVerticalAccess(object)) {
      if (object.type === 'wall') {
        const startX = mapFixedX(object, object.startX ?? object.x);
        const startY = mapFixedY(object, object.startY ?? object.y);
        const endX = mapFixedX(object, object.endX ?? object.x + object.width);
        const endY = mapFixedY(object, object.endY ?? object.y + object.height);
        return {
          ...object,
          x: Math.min(startX, endX),
          y: Math.min(startY, endY),
          width: Math.abs(endX - startX) || object.width,
          height: Math.abs(endY - startY) || object.height,
          startX,
          startY,
          endX,
          endY,
        };
      }
      return { ...object, x: mapFixedX(object, object.x), y: mapFixedY(object, object.y) };
    }
    if (object.type === 'label') return { ...object, x: mapX(object.x), y: mapY(object.y) };
    if (object.type === 'wall') {
      const startX = mapX(object.startX ?? object.x);
      const startY = mapY(object.startY ?? object.y);
      const endX = mapX(object.endX ?? object.x + object.width);
      const endY = mapY(object.endY ?? object.y + object.height);
      return {
        ...object,
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        width: Math.abs(endX - startX) || object.width,
        height: Math.abs(endY - startY) || object.height,
        startX,
        startY,
        endX,
        endY,
      };
    }
    return {
      ...object,
      x:      mapX(object.x),
      y:      mapY(object.y),
      width:  object.width  * scale,
      height: object.height * scale,
    };
  });
}

// Push overlapping indoor rect objects apart so every pair has at least minGap px
// of clearance, then clamp each object back inside the outdoor wall boundary so
// no object can escape the enclosure. Fixed objects (outdoor walls, stairs,
// elevators) are never moved. Runs up to MAX_ITER passes and stops early when stable.
// minGap = 16: racks sit 15 px inside each zone edge, so a 16 px zone gap gives
// ~46 px clearance between racks in adjacent zones — well above the 6 px minimum.
function resolveIndoorObjectOverlaps(objects: FloorPlanObject[], minGap = 16): FloorPlanObject[] {
  const isOW = (o: FloorPlanObject) => o.type === 'wall' && o.id.includes('-ow-');
  const isFixed = (o: FloorPlanObject) =>
    isOW(o) || o.id.includes('reserved-stairs') || o.id.includes('reserved-elevator');

  // Only push zone rects — racks/shelves follow their zone via groupId so grid alignment is preserved.
  // linkedLocationId marks individual inventory items — they are never zone containers
  // and must not be pushed by the overlap resolver even if type === 'room'.
  const isMovableZone = (o: FloorPlanObject) => o.type === 'room' && !isFixed(o) && !o.linkedLocationId;

  const movable: FloorPlanObject[] = objects.filter(isMovableZone).map(o => ({ ...o }));
  if (movable.length < 2) return objects;

  // Derive interior bounds from outdoor walls so pushed zones are clamped inside.
  const outdoorWalls = objects.filter(isOW);
  const WALL_MARGIN = 28; // matches fitIndoorObjectsInsideOutdoorWalls
  let bMinX = -Infinity, bMinY = -Infinity, bMaxX = Infinity, bMaxY = Infinity;
  if (outdoorWalls.length > 0) {
    const xs = outdoorWalls.flatMap(w => [w.startX ?? w.x, w.endX ?? w.x + w.width]);
    const ys = outdoorWalls.flatMap(w => [w.startY ?? w.y, w.endY ?? w.y + w.height]);
    bMinX = Math.min(...xs) + WALL_MARGIN;
    bMinY = Math.min(...ys) + WALL_MARGIN;
    bMaxX = Math.max(...xs) - WALL_MARGIN;
    bMaxY = Math.max(...ys) - WALL_MARGIN;
  }
  const hasBounds = Number.isFinite(bMinX);
  const clamp = (o: FloorPlanObject) => {
    if (!hasBounds) return;
    o.x = Math.max(bMinX, Math.min(bMaxX - o.width,  o.x));
    o.y = Math.max(bMinY, Math.min(bMaxY - o.height, o.y));
  };

  const MAX_ITER = 80;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let moved = false;
    for (let i = 0; i < movable.length; i++) {
      for (let j = i + 1; j < movable.length; j++) {
        const a = movable[i], b = movable[j];
        // Positive overlap = rooms intersect on that axis; skip pairs that don't actually overlap.
        const overlapX = Math.min(a.x + a.width,  b.x + b.width)  - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (overlapX <= 0 || overlapY <= 0) continue;

        // Push along the axis of minimum penetration.
        // Distribute the required push proportionally to each room's available space
        // so a room pressed against a boundary hands its unused share to its partner
        // instead of both clamping to the same spot and leaving the overlap unresolved.
        const pushAlongX = overlapX <= overlapY;
        const needed = (pushAlongX ? overlapX : overlapY) + minGap;

        if (pushAlongX) {
          const dir = (a.x + a.width / 2) <= (b.x + b.width / 2) ? 1 : -1;
          const aRoom = dir > 0 ? Math.max(0, a.x - bMinX)           : Math.max(0, bMaxX - a.width  - a.x);
          const bRoom = dir > 0 ? Math.max(0, bMaxX - b.width - b.x) : Math.max(0, b.x - bMinX);
          const total  = aRoom + bRoom || 1;
          const aPush  = hasBounds ? Math.min(aRoom, needed * aRoom / total) : needed / 2;
          const bPush  = hasBounds ? Math.min(bRoom, needed - aPush)         : needed / 2;
          a.x -= dir * aPush;
          b.x += dir * bPush;
        } else {
          const dir = (a.y + a.height / 2) <= (b.y + b.height / 2) ? 1 : -1;
          const aRoom = dir > 0 ? Math.max(0, a.y - bMinY)              : Math.max(0, bMaxY - a.height - a.y);
          const bRoom = dir > 0 ? Math.max(0, bMaxY - b.height - b.y)   : Math.max(0, b.y - bMinY);
          const total  = aRoom + bRoom || 1;
          const aPush  = hasBounds ? Math.min(aRoom, needed * aRoom / total) : needed / 2;
          const bPush  = hasBounds ? Math.min(bRoom, needed - aPush)         : needed / 2;
          a.y -= dir * aPush;
          b.y += dir * bPush;
        }
        clamp(a);
        clamp(b);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Compute per-groupId deltas so every child (walls, door, window, racks, shelves) follows its zone rect.
  const deltas = new Map<string, { dx: number; dy: number }>();
  for (const mz of movable) {
    if (!mz.groupId) continue;
    const orig = objects.find(o => o.id === mz.id);
    if (!orig) continue;
    const dx = mz.x - orig.x, dy = mz.y - orig.y;
    if (dx !== 0 || dy !== 0) deltas.set(mz.groupId, { dx, dy });
  }

  return objects.map(o => {
    // Zone rect itself
    const movedZone = movable.find(m => m.id === o.id);
    if (movedZone) return movedZone;
    // Children: shift by same delta as their zone so racks/shelves stay grid-aligned
    if (o.groupId) {
      const d = deltas.get(o.groupId);
      if (d) {
        if (o.type === 'wall') {
          return { ...o, startX: (o as any).startX + d.dx, startY: (o as any).startY + d.dy, endX: (o as any).endX + d.dx, endY: (o as any).endY + d.dy };
        }
        return { ...o, x: (o as any).x + d.dx, y: (o as any).y + d.dy };
      }
    }
    return o;
  });
}

// â”€â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Get all floor plans
// ?summary=true — returns metadata only (no objects); use GET /:id for full data
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const departmentFilter = getDepartmentFilter(req);
    const summary = req.query.summary === 'true';

    if (summary) {
      const plans = await prisma.floorPlan.findMany({
        where: departmentFilter,
        select: {
          id: true,
          name: true,
          locationId: true,
          departmentId: true,
          width: true,
          height: true,
          isApproved: true,
          isTemplate: true,
          generationScore: true,
          createdAt: true,
          updatedAt: true,
          location: { select: { id: true, name: true } },
        },
      });
      return res.json(plans);
    }

    const floorPlans = await prisma.floorPlan.findMany({
      where: departmentFilter,
      include: { location: true },
    });

    const parsed = floorPlans.map((plan) => ({
      ...plan,
      objects: JSON.parse(plan.planJson || '[]'),
    }));

    res.json(parsed);
  } catch (error) {
    next(error);
  }
});

// Find the first floor plan containing a linked location
router.get('/by-location/:locationId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const floorPlans = await prisma.floorPlan.findMany({
      where: getDepartmentFilter(req),
      include: { location: true },
    });

    for (const plan of floorPlans) {
      const objects = JSON.parse(plan.planJson || '[]');
      const matchingObject = objects.find((obj: any) => obj.linkedLocationId === req.params.locationId);

      if (matchingObject) {
        return res.json({
          ...plan,
          objects,
          matchingObjectId: matchingObject.id,
        });
      }
    }

    return res.status(404).json({ error: 'Floor plan not found for location' });
  } catch (error) {
    next(error);
  }
});

// Get template room type definitions
router.get('/room-types', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dbRoomTypes = await prisma.floorPlanRoomType.findMany({ orderBy: { templateType: 'asc' } });

    if (dbRoomTypes.length > 0) {
      return res.json({ roomTypes: dbRoomTypes, source: 'database' });
    }

    // Return hardcoded defaults
    const defaults = Object.entries(TEMPLATE_RULES).flatMap(([templateType, rules]) =>
      rules.requiredRooms.map((name, i) => ({
        id: `${templateType}-${i}`,
        name,
        templateType,
        isRequired: true,
        defaultColor: templateType === 'technical' ? '#bfdbfe' :
                      templateType === 'warehouse' ? '#fde68a' :
                      templateType === 'dormitory' ? '#bfdbfe' : '#dcfce7',
        minWidth: 120,
        minHeight: 80,
        notes: null,
      }))
    );

    res.json({ roomTypes: defaults, source: 'defaults' });
  } catch (error) {
    next(error);
  }
});

// Get template rules
router.get('/rules', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dbRules = await prisma.floorPlanRule.findMany({ orderBy: { templateType: 'asc' } });

    if (dbRules.length > 0) {
      return res.json({ rules: dbRules, templateRules: TEMPLATE_RULES, source: 'database' });
    }

    res.json({ rules: [], templateRules: TEMPLATE_RULES, source: 'defaults' });
  } catch (error) {
    next(error);
  }
});

// Import floor plans from CSV
router.post('/import/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.body.csv) {
      return res.status(400).json({ error: 'CSV data required' });
    }

    const departmentId = req.departmentId || (req.userRole === 'superadmin' ? req.body.departmentId : undefined);
    if (!departmentId) {
      return res.status(400).json({ error: 'Select a department before importing floor plans' });
    }

    const rows = csvToJson<any>(req.body.csv);
    const created = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const width = parseInt(row.width, 10);
        const height = parseInt(row.height, 10);

        if (!row.name || !width || !height) {
          throw new Error('name, width, and height are required');
        }

        const data = {
            name: row.name,
            width,
            height,
            locationId: row.locationId || null,
            departmentId,
            planJson: row.planJson || '[]',
          };
        const floorPlan = row.id
          ? await prisma.floorPlan.upsert({
              where: { id: row.id },
              update: data,
              create: { id: row.id, ...data },
            })
          : await prisma.floorPlan.create({ data });
        created.push(floorPlan);
      } catch (err: any) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    res.json({
      created: created.length,
      errors,
      message: `Imported ${created.length} floor plans${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
    });
  } catch (error) {
    next(error);
  }
});

// Auto-generate floor plans from the department's current locations
router.post('/auto-generate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only admins can generate floor plans' });
    }

    const departmentId = req.departmentId || req.body.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'Select a department before auto-generating floor plans' });
    }
    const requestedCount = Number.parseInt(req.body.count, 10);
    const planCount = Number.isFinite(requestedCount) ? Math.max(1, Math.min(12, requestedCount)) : 3;
    const requestedTemplates: unknown[] = Array.isArray(req.body.templates) ? req.body.templates : [];
    const allowedTemplates = new Set(FLOORPLAN_KNOWLEDGE.imsUseful);
    const selectedTemplates = (requestedTemplates.length > 0 ? requestedTemplates : DEFAULT_AUTO_GENERATE_TEMPLATES)
      .filter((templateName): templateName is string => typeof templateName === 'string' && allowedTemplates.has(templateName));
    const templatesToGenerate: string[] = (selectedTemplates.length > 0 ? selectedTemplates : DEFAULT_AUTO_GENERATE_TEMPLATES).slice(0, planCount);

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const locations = await prisma.location.findMany({
      where: { departmentId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    if (locations.length === 0) {
      return res.status(400).json({ error: 'No locations found for this department' });
    }

    const requestedFloorTemplates: unknown[] = Array.isArray(req.body.floorTemplates) ? req.body.floorTemplates : [];
    if (requestedFloorTemplates.length > 0) {
      const requestedVerticalAccess = req.body.verticalAccess;
      if (requestedVerticalAccess !== 'stairs' && requestedVerticalAccess !== 'elevator' && requestedVerticalAccess !== 'both') {
        return res.status(400).json({ error: 'Choose stairs, elevator, or both before generating floor plans' });
      }
      const verticalAccess: 'stairs' | 'elevator' | 'both' = requestedVerticalAccess;
      const requestedFloorCount = Number.parseInt(req.body.floorCount, 10);
      const floorCount = Number.isFinite(requestedFloorCount)
        ? Math.max(1, Math.min(12, requestedFloorCount))
        : requestedFloorTemplates.length;
      const floorTemplates = Array.from({ length: floorCount }, (_, index) => {
        const requestedTemplate = requestedFloorTemplates[index];
        if (typeof requestedTemplate === 'string' && allowedTemplates.has(requestedTemplate)) {
          return requestedTemplate;
        }
        return DEFAULT_AUTO_GENERATE_TEMPLATES[index % DEFAULT_AUTO_GENERATE_TEMPLATES.length];
      });
      const slotTemplates = Array.from({ length: planCount }, () => floorTemplates).flat();
      const locationPlan = assignLocationsToFloors(locations, slotTemplates);
      if (locationPlan.remaining.length > 0) {
        let suggestedFloorTemplates = [...floorTemplates];
        let suggestedPlan = locationPlan;
        while (suggestedPlan.remaining.length > 0 && suggestedFloorTemplates.length < 12) {
          const recommendation = suggestFloorTemplates(suggestedPlan.remaining, []);
          const nextTemplate = recommendation.suggestions[0] ?? 'Office layout';
          suggestedFloorTemplates.push(nextTemplate);
          suggestedPlan = assignLocationsToFloors(
            locations,
            Array.from({ length: planCount }, () => suggestedFloorTemplates).flat(),
          );
        }

        const overflowCounts = locationPlan.remaining.reduce((result, location) => {
          result[getLocationKind(location.name)]++;
          return result;
        }, { rack: 0, shelf: 0, room: 0 } as Record<LocationKind, number>);

        return res.status(409).json({
          error: `The selected ${floorCount} floor${floorCount === 1 ? '' : 's'} per building cannot safely contain all ${locations.length} locations.`,
          requiresMoreFloors: true,
          suggestedFloorCount: suggestedFloorTemplates.length,
          suggestedFloorTemplates,
          overflowCount: locationPlan.remaining.length,
          overflowCounts,
        });
      }
      const regenerateOutdoorWalls = req.body.regenerateOutdoorWalls !== false;
      const pairStairsByFloors = req.body.pairStairsByFloors !== false;
      const addRooftopFloor = req.body.addRooftopFloor !== false;
      const preservedOutdoorWalls = new Map<number, FloorPlanObject[]>();
      if (!regenerateOutdoorWalls) {
        const existingBuildingFloors = await prisma.floorPlan.findMany({
          where: {
            departmentId,
            name: { startsWith: `${GENERATED_FLOORPLAN_PREFIX}${department.name} - Building ` },
          },
        });
        existingBuildingFloors.forEach((plan) => {
          const match = plan.name.match(/ - Building (\d+) - Floor 1 - /);
          if (!match) return;
          try {
            const objects: FloorPlanObject[] = JSON.parse(plan.planJson || '[]');
            preservedOutdoorWalls.set(Number(match[1]), objects.filter((object) => object.type === 'wall' && object.id.includes('-ow-')));
          } catch {
            // Existing invalid JSON cannot provide a reusable outdoor shell.
          }
        });
      }

      await prisma.floorPlan.deleteMany({
        where: {
          departmentId,
          name: { startsWith: `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ` },
        },
      });

      const created = [];
      const isOutdoorWall = (object: FloorPlanObject) => object.type === 'wall' && object.id.includes('-ow-');

      for (let buildingIndex = 0; buildingIndex < planCount; buildingIndex++) {
        const preservedWalls = preservedOutdoorWalls.get(buildingIndex + 1) ?? [];
        let sharedOutdoorWalls: FloorPlanObject[] = preservedWalls.map((wall) => ({ ...wall }));
        const sharedStairs = new Map<number, FloorPlanObject[]>();
        let sharedElevator: FloorPlanObject[] = [];

        const generatedFloorCount = floorCount + (addRooftopFloor ? 1 : 0);
        let siblingMaxLayoutWidth: number | undefined;
        let siblingMaxLayoutHeight: number | undefined;
        if (preservedWalls.length > 0) {
          const wallXs = preservedWalls.flatMap((w) => [w.startX ?? w.x, w.endX ?? w.x + w.width]);
          const wallYs = preservedWalls.flatMap((w) => [w.startY ?? w.y, w.endY ?? w.y + w.height]);
          const xSpan = Math.max(...wallXs) - Math.min(...wallXs);
          const ySpan = Math.max(...wallYs) - Math.min(...wallYs);
          if (xSpan > 0) siblingMaxLayoutWidth  = Math.max(0, xSpan - 2 * OUTDOOR_WALL_MARGIN);
          if (ySpan > 0) siblingMaxLayoutHeight = Math.max(0, ySpan - 2 * OUTDOOR_WALL_MARGIN);
        }
        for (let floorIndex = 0; floorIndex < generatedFloorCount; floorIndex++) {
          const isRooftop = addRooftopFloor && floorIndex === floorCount;
          const templateName = isRooftop ? 'Rooftop' : floorTemplates[floorIndex];
          const assignedLocations = isRooftop ? [] : locationPlan.assignments[buildingIndex * floorCount + floorIndex];
          const name = `${GENERATED_FLOORPLAN_PREFIX}${department.name} - Building ${buildingIndex + 1} - Floor ${floorIndex + 1} - ${templateName}`;
          let objects = buildKnowledgeTemplateFloorPlan(templateName, department.name, assignedLocations, {
            verticalAccess,
            totalFloors: generatedFloorCount,
            ...(floorIndex > 0 && siblingMaxLayoutWidth  ? { maxLayoutWidth:  siblingMaxLayoutWidth  } : {}),
            ...(floorIndex > 0 && siblingMaxLayoutHeight ? { maxLayoutHeight: siblingMaxLayoutHeight } : {}),
          });
          objects = objects.filter((object) => (
            (verticalAccess !== 'stairs' || !object.id.includes('reserved-elevator'))
            && (verticalAccess !== 'elevator' || !object.id.includes('reserved-stairs'))
          ));

          if (floorIndex === 0 && sharedOutdoorWalls.length === 0) {
            sharedOutdoorWalls = objects.filter(isOutdoorWall).map((wall) => ({ ...wall }));
            const wallXs = sharedOutdoorWalls.flatMap((w) => [w.startX ?? w.x, w.endX ?? w.x + w.width]);
            const wallYs = sharedOutdoorWalls.flatMap((w) => [w.startY ?? w.y, w.endY ?? w.y + w.height]);
            const xSpan = Math.max(...wallXs) - Math.min(...wallXs);
            const ySpan = Math.max(...wallYs) - Math.min(...wallYs);
            if (xSpan > 0) siblingMaxLayoutWidth  = Math.floor(xSpan * 0.85);
            if (ySpan > 0) siblingMaxLayoutHeight = Math.floor(ySpan * 0.85);
          }
          if (sharedOutdoorWalls.length > 0) {
            objects = [
              ...objects.filter((object) => !isOutdoorWall(object)),
              ...sharedOutdoorWalls.map((wall, wallIndex) => regenerateOutdoorWalls
                ? { ...wall, id: `${name}-shared-ow-${wallIndex}` }
                : { ...wall }),
            ];
            if (preservedWalls.length > 0 || floorIndex > 0) {
              objects = fitIndoorObjectsInsideOutdoorWalls(objects);
            }
          }
          if (verticalAccess === 'stairs' || verticalAccess === 'both') {
            const stairGroupKey = pairStairsByFloors ? Math.floor(floorIndex / 2) : 0;
            const stairObjects = sharedStairs.get(stairGroupKey);
            if (stairObjects) {
              objects = [
                ...objects.filter((object) => !object.id.includes('reserved-stairs')),
                ...stairObjects.map((object) => ({ ...object })),
              ];
            } else {
              sharedStairs.set(stairGroupKey, objects.filter((object) => object.id.includes('reserved-stairs')).map((object) => ({ ...object })));
            }
          }
          if (verticalAccess === 'elevator' || verticalAccess === 'both') {
            if (sharedElevator.length > 0) {
              objects = [
                ...objects.filter((object) => !object.id.includes('reserved-elevator')),
                ...sharedElevator.map((object) => ({ ...object })),
              ];
            } else {
              sharedElevator = objects.filter((object) => object.id.includes('reserved-elevator')).map((object) => ({ ...object }));
            }
          }

          objects = resolveIndoorObjectOverlaps(objects);
          const templateType = determineTemplateType(templateName);
          const validation = validateGeneratedFloorPlan(objects, templateType);
          const floorPlan = await prisma.floorPlan.create({
            data: {
              name,
              width: 1800,
              height: 1200,
              departmentId,
              generationScore: validation.score,
              planJson: JSON.stringify(objects),
            },
          });
          await prisma.floorPlanGenerationLog.create({
            data: {
              floorPlanId: floorPlan.id,
              templateUsed: templateName,
              score: validation.score,
              validationResult: JSON.stringify(validation),
            },
          });
          created.push({ ...floorPlan, validation });
        }
      }

      const avgScore = created.length > 0
        ? Math.round(created.reduce((sum, plan) => sum + (plan.validation?.score ?? 0), 0) / created.length)
        : 0;

      return res.status(201).json({
        created,
        avgScore,
        message: `Generated ${planCount} building${planCount === 1 ? '' : 's'} with ${floorCount} occupied floor${floorCount === 1 ? '' : 's'}${addRooftopFloor ? ' plus a rooftop' : ''} each and assigned all ${locations.length} locations exactly once${regenerateOutdoorWalls ? '' : ' while preserving existing outdoor walls'}${verticalAccess === 'elevator' ? '' : pairStairsByFloors ? ' with paired stair positions' : ' with Floor 1 stairs shared across all floors'}.`,
      });
    }

    const locationGroups = new Map<string, typeof locations>();
    locations.forEach((location) => {
      const groupName = getLocationPlanGroup(location.name);
      const groupLocations = locationGroups.get(groupName) || [];
      groupLocations.push(location);
      locationGroups.set(groupName, groupLocations);
    });

    const generatedNames = [
      ...Array.from(locationGroups.keys()).slice(0, Math.max(0, planCount - templatesToGenerate.length)).map((groupName) => `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${groupName}`),
      ...templatesToGenerate.map((templateName) => `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${templateName}`),
      ...GENERATED_FLOORPLAN_SUFFIXES.map((suffix) => `${department.name} ${suffix}`),
    ];

    await prisma.floorPlan.deleteMany({
      where: {
        departmentId,
        OR: [
          { name: { in: [...new Set(generatedNames)] } },
          { name: { startsWith: `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ` } },
        ],
      },
    });

    const created = [];

    const groupSlots = Math.max(0, planCount - templatesToGenerate.length);
    for (const [groupName, groupLocations] of Array.from(locationGroups.entries()).slice(0, groupSlots)) {
      const name = `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${groupName}`;
      let objects = buildGeneratedFloorPlan(name, groupLocations);
      objects = resolveIndoorObjectOverlaps(objects);
      const validation = validateGeneratedFloorPlan(objects, 'office');
      const floorPlan = await prisma.floorPlan.create({
        data: {
          name,
          width: 1800,
          height: 1200,
          departmentId,
          generationScore: validation.score,
          planJson: JSON.stringify(objects),
        },
      });
      await prisma.floorPlanGenerationLog.create({
        data: {
          floorPlanId: floorPlan.id,
          templateUsed: groupName,
          score: validation.score,
          validationResult: JSON.stringify(validation),
        },
      });
      created.push({ ...floorPlan, validation });
    }

    for (const templateName of templatesToGenerate) {
      const name = `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${templateName}`;
      let objects = buildKnowledgeTemplateFloorPlan(templateName, department.name, locations);
      objects = resolveIndoorObjectOverlaps(objects);
      const templateType = determineTemplateType(templateName);
      const validation = validateGeneratedFloorPlan(objects, templateType);
      const floorPlan = await prisma.floorPlan.create({
        data: {
          name,
          width: 1800,
          height: 1200,
          departmentId,
          generationScore: validation.score,
          planJson: JSON.stringify(objects),
        },
      });
      await prisma.floorPlanGenerationLog.create({
        data: {
          floorPlanId: floorPlan.id,
          templateUsed: templateName,
          score: validation.score,
          validationResult: JSON.stringify(validation),
        },
      });
      created.push({ ...floorPlan, validation });
    }

    const avgScore = created.length > 0
      ? Math.round(created.reduce((sum, p) => sum + (p.validation?.score ?? 0), 0) / created.length)
      : 0;

    res.status(201).json({
      created,
      avgScore,
      message: `Generated ${created.length} floor plan${created.length === 1 ? '' : 's'} with ${locations.length} linked locations â€” avg layout score: ${avgScore}%`,
    });
  } catch (error) {
    next(error);
  }
});

// Get floor plan by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id: req.params.id },
      include: { location: true },
    });

    if (!floorPlan) {
      return res.status(404).json({ error: 'Floor plan not found' });
    }

    if (!canAccessDepartment(req, floorPlan.departmentId, true)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      ...floorPlan,
      objects: JSON.parse(floorPlan.planJson || '[]'),
    });
  } catch (error) {
    next(error);
  }
});

// Create floor plan
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, width, height, scale, objects, locationId, departmentId: requestedDepartmentId } = req.body;

    if (!name || !width || !height) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const departmentId = req.departmentId || (req.userRole === 'superadmin' ? requestedDepartmentId : undefined);
    if (!departmentId) {
      return res.status(400).json({ error: 'Select a department before creating a floor plan' });
    }

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const floorPlan = await prisma.floorPlan.create({
      data: {
        name,
        width,
        height,
        locationId: locationId || null,
        departmentId,
        planJson: JSON.stringify(objects || []),
      },
    });

    res.status(201).json({
      ...floorPlan,
      objects: objects || [],
      scale: scale || { pixelsPerMeter: 50 },
    });
  } catch (error) {
    next(error);
  }
});

// Save user feedback on a floor plan (approve, edited, bad_layout)
router.post('/:id/feedback', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { feedback, rating, correctedData } = req.body;
    if (!feedback) return res.status(400).json({ error: 'feedback is required' });

    const floorPlan = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!floorPlan) return res.status(404).json({ error: 'Floor plan not found' });
    if (!canManageFloorPlan(req, floorPlan.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const templateType = determineTemplateType(floorPlan.name);

    await prisma.floorPlanExample.create({
      data: {
        floorPlanId: floorPlan.id,
        templateType,
        originalData: floorPlan.planJson,
        correctedData: correctedData || null,
        feedback,
        rating: rating ?? null,
        approvedByUserId: (req as any).userId || null,
      },
    });

    if (feedback === 'approved') {
      await prisma.floorPlan.update({
        where: { id: req.params.id },
        data: { isApproved: true },
      });
    }

    await prisma.floorPlanGenerationLog.updateMany({
      where: { floorPlanId: req.params.id },
      data: { userFeedback: feedback },
    });

    res.json({ message: 'Feedback saved', isApproved: feedback === 'approved' });
  } catch (error) {
    next(error);
  }
});

// Regenerate a single auto-generated floor plan
router.post('/:id/regenerate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only admins can regenerate floor plans' });
    }

    const floorPlan = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!floorPlan) return res.status(404).json({ error: 'Floor plan not found' });
    if (!canManageFloorPlan(req, floorPlan.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const departmentId = floorPlan.departmentId;
    if (!departmentId) return res.status(400).json({ error: 'Floor plan has no department' });
    const regenerateOutdoorWalls = req.body.regenerateOutdoorWalls !== false;
    const pairStairsByFloors = req.body.pairStairsByFloors !== false;

    const buildingMatch = floorPlan.name.match(/^(Auto - .+ - Building \d+) - Floor \d+ - /);
    if (buildingMatch) {
      if (!/ - Floor 1 - /.test(floorPlan.name)) {
        // Single-floor regeneration: rebuild only this floor's indoor objects.
        // Outdoor walls and stair/elevator positions are preserved from existing data.
        const floorNum = Number(floorPlan.name.match(/ - Floor (\d+) - /)?.[1] ?? 1);
        let existingObjects: FloorPlanObject[] = [];
        try { existingObjects = JSON.parse(floorPlan.planJson || '[]'); } catch { existingObjects = []; }

        const isOW = (o: FloorPlanObject) => o.type === 'wall' && o.id.includes('-ow-');
        const isAccess = (o: FloorPlanObject) =>
          o.id.includes('reserved-stairs') || o.id.includes('reserved-elevator');

        const existingOutdoorWalls = existingObjects.filter(isOW);
        const existingAccessObjects = existingObjects.filter(isAccess);
        const assignedIds = existingObjects
          .filter(o => o.linkedLocationId)
          .map(o => o.linkedLocationId as string);

        const dept = await prisma.department.findUnique({ where: { id: departmentId } });
        if (!dept) return res.status(404).json({ error: 'Department not found' });

        const floorLocations = assignedIds.length > 0
          ? await prisma.location.findMany({
              where: { id: { in: assignedIds } },
              orderBy: { name: 'asc' },
              select: { id: true, name: true },
            })
          : [];

        const floorTemplate =
          FLOORPLAN_KNOWLEDGE.imsUseful.find(t => floorPlan.name.endsWith(` - ${t}`)) ||
          floorPlan.name.split(' - ').pop() ||
          floorPlan.name;

        const hasStairs = existingObjects.some(o => o.id.includes('reserved-stairs'));
        const hasElevator = existingObjects.some(o => o.id.includes('reserved-elevator'));
        const floorVerticalAccess: 'stairs' | 'elevator' | 'both' =
          hasStairs && hasElevator ? 'both' : hasElevator ? 'elevator' : 'stairs';

        let maxLayoutWidth: number | undefined;
        let maxLayoutHeight: number | undefined;
        if (existingOutdoorWalls.length > 0) {
          const wallXs = existingOutdoorWalls.flatMap(w => [w.startX ?? w.x, w.endX ?? w.x + w.width]);
          const wallYs = existingOutdoorWalls.flatMap(w => [w.startY ?? w.y, w.endY ?? w.y + w.height]);
          const xSpan = Math.max(...wallXs) - Math.min(...wallXs);
          const ySpan = Math.max(...wallYs) - Math.min(...wallYs);
          if (xSpan > 0) maxLayoutWidth  = Math.max(0, xSpan - 2 * OUTDOOR_WALL_MARGIN);
          if (ySpan > 0) maxLayoutHeight = Math.max(0, ySpan - 2 * OUTDOOR_WALL_MARGIN);
        }

        let newFloorObjects = buildKnowledgeTemplateFloorPlan(floorTemplate, dept.name, floorLocations, {
          verticalAccess: floorVerticalAccess,
          totalFloors: 1,
          ...(maxLayoutWidth  ? { maxLayoutWidth  } : {}),
          ...(maxLayoutHeight ? { maxLayoutHeight } : {}),
        });
        newFloorObjects = [
          ...newFloorObjects.filter(o => !isOW(o)),
          ...existingOutdoorWalls,
        ];
        newFloorObjects = fitIndoorObjectsInsideOutdoorWalls(newFloorObjects);
        newFloorObjects = resolveIndoorObjectOverlaps(newFloorObjects);
        // Restore stairs/elevators at their existing positions (shared across sibling floors)
        newFloorObjects = [
          ...newFloorObjects.filter(o => !isAccess(o)),
          ...existingAccessObjects,
        ];

        const floorValidation = validateGeneratedFloorPlan(newFloorObjects, determineTemplateType(floorTemplate));
        const updatedFloor = await prisma.floorPlan.update({
          where: { id: floorPlan.id },
          data: {
            planJson: JSON.stringify(newFloorObjects),
            generationScore: floorValidation.score,
            isApproved: false,
          },
        });
        await prisma.floorPlanGenerationLog.create({
          data: {
            floorPlanId: updatedFloor.id,
            templateUsed: floorTemplate,
            score: floorValidation.score,
            validationResult: JSON.stringify(floorValidation),
          },
        });
        return res.json({
          ...updatedFloor,
          objects: newFloorObjects,
          generationScore: floorValidation.score,
          message: `Regenerated Floor ${floorNum} indoor layout`,
        });
      }
      const buildingFloors = await prisma.floorPlan.findMany({
        where: {
          departmentId,
          name: { startsWith: `${buildingMatch[1]} - Floor ` },
        },
        orderBy: { name: 'asc' },
      });
      buildingFloors.sort((a, b) => {
        const aFloor = Number(a.name.match(/ - Floor (\d+) - /)?.[1] ?? Number.MAX_SAFE_INTEGER);
        const bFloor = Number(b.name.match(/ - Floor (\d+) - /)?.[1] ?? Number.MAX_SAFE_INTEGER);
        return aFloor - bFloor;
      });
      if (buildingFloors.length > 1) {
        const department = await prisma.department.findUnique({ where: { id: departmentId } });
        if (!department) return res.status(404).json({ error: 'Department not found' });

        const locations = await prisma.location.findMany({
          where: { departmentId },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        });
        if (locations.length === 0) return res.status(400).json({ error: 'No locations found for department' });

        let referenceObjects: FloorPlanObject[] = [];
        try {
          referenceObjects = JSON.parse(buildingFloors[0].planJson || '[]');
        } catch {
          referenceObjects = [];
        }
        const hasStairs = referenceObjects.some((object) => object.id.includes('reserved-stairs'));
        const hasElevator = referenceObjects.some((object) => object.id.includes('reserved-elevator'));
        const verticalAccess = hasStairs && hasElevator ? 'both' : hasElevator ? 'elevator' : 'stairs';
        const isOutdoorWall = (object: FloorPlanObject) => object.type === 'wall' && object.id.includes('-ow-');
        const buildingLocationIds = new Set<string>();
        buildingFloors.forEach((plan) => {
          try {
            const objects: FloorPlanObject[] = JSON.parse(plan.planJson || '[]');
            objects.forEach((object) => {
              if (object.linkedLocationId) buildingLocationIds.add(object.linkedLocationId);
            });
          } catch {
            // Invalid existing JSON contributes no reusable location assignments.
          }
        });
        const buildingLocations = buildingLocationIds.size > 0
          ? locations.filter((location) => buildingLocationIds.has(location.id))
          : locations;
        const siblingTemplates = buildingFloors.map((sibling) => (
          FLOORPLAN_KNOWLEDGE.imsUseful.find((template) => sibling.name.endsWith(` - ${template}`))
          || sibling.name.split(' - ').pop()
          || sibling.name
        ));
        const occupiedTemplates = siblingTemplates.filter((template) => template.toLowerCase() !== 'rooftop');
        const locationPlan = assignLocationsToFloors(buildingLocations, occupiedTemplates);
        if (locationPlan.remaining.length > 0) {
          const recommendation = suggestFloorTemplates(locationPlan.remaining, siblingTemplates);
          return res.status(409).json({
            error: `${locationPlan.remaining.length} assigned locations no longer fit this building. Add floors before regenerating.`,
            requiresMoreFloors: true,
            suggestedFloorCount: recommendation.suggestions.length,
            suggestedFloorTemplates: recommendation.suggestions,
            overflowCount: locationPlan.remaining.length,
          });
        }
        const existingWalls = referenceObjects.filter(isOutdoorWall);
        let sharedOutdoorWalls: FloorPlanObject[] = regenerateOutdoorWalls
          ? []
          : existingWalls.map((wall) => ({ ...wall }));
        const sharedStairs = new Map<number, FloorPlanObject[]>();
        let sharedElevator: FloorPlanObject[] = [];
        const regenerated = [];
        let occupiedFloorIndex = 0;

        // Compute width + height constraints for sibling layouts from the preserved or initial outdoor walls.
        let siblingMaxLayoutWidth: number | undefined;
        let siblingMaxLayoutHeight: number | undefined;
        if (!regenerateOutdoorWalls && existingWalls.length > 0) {
          const wallXs = existingWalls.flatMap((w) => [w.startX ?? w.x, w.endX ?? w.x + w.width]);
          const wallYs = existingWalls.flatMap((w) => [w.startY ?? w.y, w.endY ?? w.y + w.height]);
          const xSpan = Math.max(...wallXs) - Math.min(...wallXs);
          const ySpan = Math.max(...wallYs) - Math.min(...wallYs);
          if (xSpan > 0) siblingMaxLayoutWidth  = Math.max(0, xSpan - 2 * OUTDOOR_WALL_MARGIN);
          if (ySpan > 0) siblingMaxLayoutHeight = Math.max(0, ySpan - 2 * OUTDOOR_WALL_MARGIN);
        }

        for (let index = 0; index < buildingFloors.length; index++) {
          const sibling = buildingFloors[index];
          const templateName = siblingTemplates[index];
          const isRooftop = templateName.toLowerCase() === 'rooftop';
          const assignedLocations = isRooftop ? [] : locationPlan.assignments[occupiedFloorIndex++];
          let objects = buildKnowledgeTemplateFloorPlan(templateName, department.name, assignedLocations, {
            verticalAccess,
            totalFloors: buildingFloors.length,
            ...(index > 0 && siblingMaxLayoutWidth  ? { maxLayoutWidth:  siblingMaxLayoutWidth  } : {}),
            ...(index > 0 && siblingMaxLayoutHeight ? { maxLayoutHeight: siblingMaxLayoutHeight } : {}),
          });

          if (index === 0 && regenerateOutdoorWalls) {
            sharedOutdoorWalls = objects.filter(isOutdoorWall).map((wall) => ({ ...wall }));
            const wallXs = sharedOutdoorWalls.flatMap((w) => [w.startX ?? w.x, w.endX ?? w.x + w.width]);
            const wallYs = sharedOutdoorWalls.flatMap((w) => [w.startY ?? w.y, w.endY ?? w.y + w.height]);
            const xSpan = Math.max(...wallXs) - Math.min(...wallXs);
            const ySpan = Math.max(...wallYs) - Math.min(...wallYs);
            if (xSpan > 0) siblingMaxLayoutWidth  = Math.floor(xSpan * 0.85);
            if (ySpan > 0) siblingMaxLayoutHeight = Math.floor(ySpan * 0.85);
          }
          if (sharedOutdoorWalls.length > 0) {
            objects = [
              ...objects.filter((object) => !isOutdoorWall(object)),
              ...sharedOutdoorWalls.map((wall, wallIndex) => regenerateOutdoorWalls
                ? { ...wall, id: `${sibling.name}-shared-ow-${wallIndex}` }
                : { ...wall }),
            ];
            if (!regenerateOutdoorWalls || index > 0) {
              objects = fitIndoorObjectsInsideOutdoorWalls(objects);
            }
          }
          if (verticalAccess === 'stairs' || verticalAccess === 'both') {
            const stairGroupKey = pairStairsByFloors ? Math.floor(index / 2) : 0;
            const stairObjects = sharedStairs.get(stairGroupKey);
            if (stairObjects) {
              objects = [
                ...objects.filter((object) => !object.id.includes('reserved-stairs')),
                ...stairObjects.map((object) => ({ ...object })),
              ];
            } else {
              sharedStairs.set(stairGroupKey, objects.filter((object) => object.id.includes('reserved-stairs')).map((object) => ({ ...object })));
            }
          }
          if (verticalAccess === 'elevator' || verticalAccess === 'both') {
            if (sharedElevator.length > 0) {
              objects = [
                ...objects.filter((object) => !object.id.includes('reserved-elevator')),
                ...sharedElevator.map((object) => ({ ...object })),
              ];
            } else {
              sharedElevator = objects.filter((object) => object.id.includes('reserved-elevator')).map((object) => ({ ...object }));
            }
          }

          objects = resolveIndoorObjectOverlaps(objects);
          const validation = validateGeneratedFloorPlan(objects, determineTemplateType(templateName));
          const updated = await prisma.floorPlan.update({
            where: { id: sibling.id },
            data: {
              planJson: JSON.stringify(objects),
              generationScore: validation.score,
              isApproved: false,
            },
          });
          await prisma.floorPlanGenerationLog.create({
            data: {
              floorPlanId: updated.id,
              templateUsed: templateName,
              score: validation.score,
              validationResult: JSON.stringify(validation),
            },
          });
          regenerated.push({ ...updated, objects, validation });
        }

        return res.json({
          regenerated,
          message: `Regenerated all ${regenerated.length} floors in ${buildingMatch[1]}${regenerateOutdoorWalls ? '' : ' while keeping outdoor walls fixed'}`,
        });
      }
    }

    // Extract template from plan name: "Auto - DeptName - TemplateName"
    const prefix = GENERATED_FLOORPLAN_PREFIX;
    let templateName = floorPlan.name;
    if (floorPlan.name.startsWith(prefix)) {
      const suffix = floorPlan.name.slice(prefix.length);
      const knownTemplate = FLOORPLAN_KNOWLEDGE.imsUseful.find((template) => suffix.endsWith(` - ${template}`));
      templateName = knownTemplate || suffix.split(' - ').pop() || suffix;
    }

    if (!templateName) {
      return res.status(400).json({ error: 'Cannot determine template from plan name â€” only auto-generated plans can be regenerated' });
    }

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) return res.status(404).json({ error: 'Department not found' });

    const locations = await prisma.location.findMany({
      where: { departmentId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    if (locations.length === 0) return res.status(400).json({ error: 'No locations found for department' });

    const isKnownTemplate = FLOORPLAN_KNOWLEDGE.imsUseful.includes(templateName);
    let existingObjects: FloorPlanObject[] = [];
    try {
      existingObjects = JSON.parse(floorPlan.planJson || '[]');
    } catch {
      existingObjects = [];
    }
    const hasStairs = existingObjects.some((object) => object.id.includes('reserved-stairs'));
    const hasElevator = existingObjects.some((object) => object.id.includes('reserved-elevator'));
    const verticalAccess = hasStairs && hasElevator ? 'both' : hasElevator ? 'elevator' : 'stairs';
    let objects = isKnownTemplate
      ? buildKnowledgeTemplateFloorPlan(templateName, department.name, locations, { verticalAccess })
      : buildGeneratedFloorPlan(floorPlan.name, locations, { verticalAccess });
    if (!regenerateOutdoorWalls) {
      const isOutdoorWall = (object: FloorPlanObject) => object.type === 'wall' && object.id.includes('-ow-');
      objects = [
        ...objects.filter((object) => !isOutdoorWall(object)),
        ...existingObjects.filter(isOutdoorWall),
      ];
      objects = fitIndoorObjectsInsideOutdoorWalls(objects);
    }
    objects = resolveIndoorObjectOverlaps(objects);

    const templateType = determineTemplateType(templateName);
    const validation = validateGeneratedFloorPlan(objects, templateType);

    const updated = await prisma.floorPlan.update({
      where: { id: req.params.id },
      data: {
        planJson: JSON.stringify(objects),
        generationScore: validation.score,
        isApproved: false,
      },
    });

    await prisma.floorPlanGenerationLog.create({
      data: {
        floorPlanId: updated.id,
        templateUsed: templateName,
        score: validation.score,
        validationResult: JSON.stringify(validation),
      },
    });

    res.json({
      ...updated,
      objects,
      validation,
      message: `Regenerated${regenerateOutdoorWalls ? '' : ' with outdoor walls fixed'} â€” layout score: ${validation.score}%`,
    });
  } catch (error) {
    next(error);
  }
});

// Update floor plan
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Floor plan not found' });
    if (!canManageFloorPlan(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, width, height, scale, objects, locationId, isTemplate, isApproved } = req.body;

    const floorPlan = await prisma.floorPlan.update({
      where: { id: req.params.id },
      data: {
        name,
        width,
        height,
        locationId: locationId || null,
        planJson: JSON.stringify(objects || []),
        ...(isTemplate !== undefined && { isTemplate }),
        ...(isApproved !== undefined && { isApproved }),
      },
    });

    res.json({
      ...floorPlan,
      objects: objects || [],
      scale: scale || { pixelsPerMeter: 50 },
    });
  } catch (error) {
    next(error);
  }
});

// Delete floor plan (admin or superadmin)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Floor plan not found' });
    if (!canManageFloorPlan(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.floorPlan.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Floor plan deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
