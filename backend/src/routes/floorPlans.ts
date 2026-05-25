import express, { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { csvToJson } from '../utils/csv';

const router = Router();

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
