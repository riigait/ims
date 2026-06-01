import express, { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, canAccessDepartment } from '../middleware/auth';
import { csvToJson, jsonToCsv } from '../utils/csv';

const router = Router();

// Get all locations
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let whereFilter: any = {};
    if (req.departmentIds && req.departmentIds.length > 0) {
      // Include locations with null departmentId
      whereFilter = {
        OR: [
          { departmentId: { in: req.departmentIds } },
          { departmentId: null }
        ]
      };
    } else if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
      whereFilter = { departmentId: req.departmentId };
    }
    const locations = await prisma.location.findMany({
      where: whereFilter,
      include: { parent: true, children: true, department: { select: { name: true } } },
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

    if (!canAccessDepartment(req, location.departmentId, true)) {
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
    if (!canAccessDepartment(req, existing.departmentId)) {
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

    const existing = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Location not found' });
    if (!canAccessDepartment(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
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

// Export locations as CSV
router.get('/export/csv', async (req: AuthRequest, res: Response) => {
  try {
    const locations = await prisma.location.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        parentId: true,
        notes: true,
        departmentId: true,
      },
    });

    const csv = jsonToCsv(locations);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="locations.csv"');
    res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to export locations' });
  }
});

// Import locations from CSV
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
        const data = {
            name: row.name,
            type: row.type || 'room',
            parentId: row.parentId || null,
            notes: row.notes || null,
            departmentId: req.departmentId,
          };
        const location = row.id
          ? await prisma.location.upsert({
              where: { id: row.id },
              update: data,
              create: { id: row.id, ...data },
            })
          : await prisma.location.create({ data });
        created.push(location);
      } catch (err: any) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    res.json({
      created: created.length,
      errors: errors,
      message: `Imported ${created.length} locations${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to import locations' });
  }
});

export default router;
