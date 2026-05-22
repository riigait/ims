import express, { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all floor plans
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let departmentFilter: any = {};
    if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
      departmentFilter = { departmentId: req.departmentId };
    }
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
