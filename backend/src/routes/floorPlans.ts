import express, { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { csvToJson } from '../utils/csv';

const router = Router();
const GENERATED_FLOORPLAN_SUFFIXES = [
  '1st Floor Complete Inventory Map',
  '2nd Floor Complete Inventory Map',
  'Imagined Inventory Floor Plan',
];
const GENERATED_FLOORPLAN_PREFIX = 'Auto - ';

type FloorPlanObject = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
  linkedLocationId?: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  thickness?: number;
  text?: string;
  fontSize?: number;
  angle?: number;
  style?: string;
};

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

function classifyLocation(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('rack')) return 'rack';
  if (
    normalized.includes('cabinet') ||
    normalized.includes('box') ||
    normalized.includes('drawer') ||
    normalized.includes('table') ||
    normalized.includes('shelf') ||
    normalized.includes('orocan') ||
    normalized.includes('pedestal')
  ) {
    return 'shelf';
  }
  return 'room';
}

function getLocationPlanGroup(name: string) {
  const normalized = name.toLowerCase();

  if (normalized.includes('rack') || normalized.includes('radio')) return 'Radio Room';
  if (normalized.includes('cabinet') || normalized.includes('box') || normalized.includes('shelf') || normalized.includes('drawer') || normalized.includes('orocan')) return 'Cabinet and Shelf Storage';
  if (normalized.includes('dorm') || normalized.includes('unit g')) return 'Dorm and Unit G';
  if (normalized.includes('san roque')) return 'San Roque Storage';
  if (normalized.includes('deploy') || normalized.includes('school')) return 'Deployment Sites';
  if (normalized.includes('2nd floor') || normalized.includes('second floor')) return '2nd Floor';
  if (
    normalized.includes('tagaytay') ||
    normalized.includes('kapitolyo') ||
    normalized.includes('makati') ||
    normalized.includes('nazarene') ||
    normalized.includes('remote') ||
    normalized.includes('site') ||
    normalized.includes('parking') ||
    normalized.includes('condominium') ||
    normalized.includes('pasig') ||
    normalized.includes('batangas') ||
    normalized.includes('cavite')
  ) {
    return 'Remote Sites';
  }

  return 'Main Office';
}

function buildBaseFloorObjects(floorLabel: string): FloorPlanObject[] {
  return [
    { id: `${floorLabel}-outer-wall-top`, type: 'wall', x: 40, y: 70, width: 1720, height: 10, startX: 40, startY: 70, endX: 1760, endY: 70, thickness: 10, color: '#1e293b' },
    { id: `${floorLabel}-outer-wall-bottom`, type: 'wall', x: 40, y: 1080, width: 1720, height: 10, startX: 40, startY: 1080, endX: 1760, endY: 1080, thickness: 10, color: '#1e293b' },
    { id: `${floorLabel}-outer-wall-left`, type: 'wall', x: 40, y: 70, width: 10, height: 1020, startX: 40, startY: 70, endX: 40, endY: 1090, thickness: 10, color: '#1e293b' },
    { id: `${floorLabel}-outer-wall-right`, type: 'wall', x: 1750, y: 70, width: 10, height: 1020, startX: 1750, startY: 70, endX: 1750, endY: 1090, thickness: 10, color: '#1e293b' },
    { id: `${floorLabel}-corridor-wall`, type: 'wall', x: 40, y: 560, width: 1720, height: 8, startX: 40, startY: 560, endX: 1760, endY: 560, thickness: 8, color: '#334155' },
    { id: `${floorLabel}-entrance`, type: 'entrance', x: 810, y: 1080, width: 180, height: 20, angle: 0, style: 'double', label: 'Entrance', color: '#16a34a' },
    { id: `${floorLabel}-title`, type: 'label', x: 80, y: 45, width: 600, height: 35, text: floorLabel, fontSize: 22, label: floorLabel, color: '#0f172a' },
  ];
}

function placeLocationsInZone(
  objects: FloorPlanObject[],
  zone: { key: string; label: string; x: number; y: number; w: number; h: number; color: string; cols: number },
  locations: Array<{ id: string; name: string }>,
) {
  objects.push({
    id: `zone-${zone.key}`,
    type: 'room',
    x: zone.x,
    y: zone.y,
    width: zone.w,
    height: zone.h,
    label: zone.label,
    color: zone.color,
  });

  const gap = 10;
  const topPadding = 45;
  const cols = Math.max(1, zone.cols);
  const rows = Math.max(1, Math.ceil(locations.length / cols));
  const cellWidth = Math.floor((zone.w - 30 - gap * (cols - 1)) / cols);
  const cellHeight = Math.max(28, Math.min(44, Math.floor((zone.h - topPadding - 20 - gap * (rows - 1)) / rows)));

  locations.forEach((location, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const type = classifyLocation(location.name);
    objects.push({
      id: `loc-${location.id}`,
      type,
      x: zone.x + 15 + col * (cellWidth + gap),
      y: zone.y + topPadding + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
      label: location.name,
      linkedLocationId: location.id,
      color: type === 'rack' ? '#f59e0b' : type === 'shelf' ? '#8b5cf6' : '#3b82f6',
    });
  });
}

function buildGeneratedFloorPlan(floorLabel: string, locations: Array<{ id: string; name: string }>) {
  const objects = buildBaseFloorObjects(floorLabel);
  const zones = [
    { key: 'area', label: 'Room / Area', x: 80, y: 120, w: 500, h: 430, color: '#dbeafe', cols: 3 },
    { key: 'rack', label: 'Rack Line', x: 620, y: 120, w: 500, h: 430, color: '#fef3c7', cols: 3 },
    { key: 'shelf', label: 'Shelf / Cabinet Storage', x: 1160, y: 120, w: 560, h: 430, color: '#ede9fe', cols: 3 },
    { key: 'table', label: 'Tables / Work Surface', x: 80, y: 620, w: 720, h: 420, color: '#dcfce7', cols: 4 },
    { key: 'overflow', label: 'Other Assigned Locations', x: 860, y: 620, w: 860, h: 420, color: '#f3f4f6', cols: 5 },
  ];

  const grouped = new Map<string, Array<{ id: string; name: string }>>();
  zones.forEach((zone) => grouped.set(zone.key, []));

  locations.forEach((location) => {
    const normalized = location.name.toLowerCase();
    let key = 'overflow';

    if (normalized.includes('rack')) key = 'rack';
    else if (normalized.includes('cabinet') || normalized.includes('box') || normalized.includes('shelf') || normalized.includes('drawer') || normalized.includes('orocan')) key = 'shelf';
    else if (normalized.includes('table') || normalized.includes('pedestal')) key = 'table';
    else if (classifyLocation(location.name) === 'room') key = 'area';

    grouped.get(key)?.push(location);
  });

  zones.forEach((zone) => placeLocationsInZone(objects, zone, grouped.get(zone.key) || []));

  return objects;
}

// Get all floor plans
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const departmentFilter = getDepartmentFilter(req);
    const floorPlans = await prisma.floorPlan.findMany({
      where: departmentFilter,
      include: { location: true },
    });

    // Parse JSON data
    const parsed = floorPlans.map((plan) => ({
      ...plan,
      objects: JSON.parse(plan.planJson || '[]'),
    }));

    res.json(parsed);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Find the first floor plan containing a linked location
router.get('/by-location/:locationId', async (req: AuthRequest, res: Response) => {
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import floor plans from CSV
router.post('/import/csv', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.body.csv) {
      return res.status(400).json({ error: 'CSV data required' });
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
            departmentId: req.departmentId,
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
    console.error(error);
    res.status(500).json({ error: 'Failed to import floor plans' });
  }
});

// Generate floor plans from the department's current locations
router.post('/auto-generate', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only admins can generate floor plans' });
    }

    const departmentId = req.departmentId || req.body.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'Select a department before auto-generating floor plans' });
    }

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

    const locationGroups = new Map<string, typeof locations>();
    locations.forEach((location) => {
      const groupName = getLocationPlanGroup(location.name);
      const groupLocations = locationGroups.get(groupName) || [];
      groupLocations.push(location);
      locationGroups.set(groupName, groupLocations);
    });

    const generatedNames = [
      ...Array.from(locationGroups.keys()).map((groupName) => `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${groupName}`),
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

    for (const [groupName, groupLocations] of locationGroups.entries()) {
      const name = `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${groupName}`;
      created.push(await prisma.floorPlan.create({
        data: {
          name,
          width: 1800,
          height: 1200,
          departmentId,
          planJson: JSON.stringify(buildGeneratedFloorPlan(name, groupLocations)),
        },
      }));
    }

    res.status(201).json({
      created,
      message: `Generated ${created.length} floor plan${created.length === 1 ? '' : 's'} with ${locations.length} linked locations`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to auto-generate floor plans' });
  }
});

// Get floor plan by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id: req.params.id },
      include: { location: true },
    });

    if (!floorPlan) {
      return res.status(404).json({ error: 'Floor plan not found' });
    }

    if (req.departmentId && floorPlan.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      ...floorPlan,
      objects: JSON.parse(floorPlan.planJson || '[]'),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create floor plan
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, width, height, scale, objects, locationId } = req.body;

    if (!name || !width || !height) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const floorPlan = await prisma.floorPlan.create({
      data: {
        name,
        width,
        height,
        locationId: locationId || null,
        departmentId: req.departmentId,
        planJson: JSON.stringify(objects || []),
      },
    });

    res.status(201).json({
      ...floorPlan,
      objects: objects || [],
      scale: scale || { pixelsPerMeter: 50 },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update floor plan
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Floor plan not found' });
    if (req.userRole !== 'admin' && existing.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, width, height, scale, objects, locationId } = req.body;

    const floorPlan = await prisma.floorPlan.update({
      where: { id: req.params.id },
      data: {
        name,
        width,
        height,
        locationId: locationId || null,
        planJson: JSON.stringify(objects || []),
      },
    });

    res.json({
      ...floorPlan,
      objects: objects || [],
      scale: scale || { pixelsPerMeter: 50 },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete floor plan (admin only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Staff must submit a delete request instead' });
    }

    await prisma.floorPlan.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Floor plan deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
