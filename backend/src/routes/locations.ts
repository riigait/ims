import express, { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all locations
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let whereFilter: any = {};
    if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
      whereFilter = { departmentId: req.departmentId };
    }
    const locations = await prisma.location.findMany({
      where: whereFilter,
      include: { parent: true, children: true },
    });
    res.json(locations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get location by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const location = await prisma.location.findUnique({
      where: { id: req.params.id },
      include: { parent: true, children: true },
    });

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    if (req.departmentId && location.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(location);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create location
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, parentId, notes } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const location = await prisma.location.create({
      data: {
        name,
        type,
        parentId: parentId || null,
        departmentId: req.departmentId,
        notes,
      },
    });

    res.status(201).json(location);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update location
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Location not found' });
    if (req.userRole !== 'admin' && existing.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, type, parentId, notes } = req.body;

    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: {
        name,
        type,
        parentId: parentId || null,
        notes,
      },
    });

    res.json(location);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete location (admin only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Staff must submit a delete request instead' });
    }

    await prisma.location.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Location deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
