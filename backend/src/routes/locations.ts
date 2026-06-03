import express, { Router, Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, canAccessDepartment } from '../middleware/auth';
import { csvToJson, jsonToCsv } from '../utils/csv';

const router = Router();

// Get all locations
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 200), 500);
    const skip = (page - 1) * limit;
    const search = (req.query.search as string)?.trim();
    const typeFilter = req.query.type as string;
    const qDepartmentId = req.query.departmentId as string;

    let whereFilter: any = {};
    if (req.departmentIds && req.departmentIds.length > 0) {
      whereFilter = { OR: [{ departmentId: { in: req.departmentIds } }, { departmentId: null }] };
    } else if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
      whereFilter = { departmentId: req.departmentId };
    }
    if (qDepartmentId && !req.departmentId) whereFilter.departmentId = qDepartmentId;
    if (search) whereFilter.name = { contains: search, mode: 'insensitive' };
    if (typeFilter) whereFilter.type = typeFilter;

    const [total, locations] = await Promise.all([
      prisma.location.count({ where: whereFilter }),
      prisma.location.findMany({
        where: whereFilter,
        include: { parent: true, children: true, department: { select: { name: true } }, _count: { select: { products: true, stockDetails: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);
    res.json({ data: locations, total, page, limit });
  } catch (error) {
    next(error);
  }
});

// Get location by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    next(error);
  }
});

// Create location
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    next(error);
  }
});

// Update location
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Location not found' });
    if (!canAccessDepartment(req, existing.departmentId, true)) {
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
    next(error);
  }
});

// Delete location (admin only)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Staff must submit a delete request instead' });
    }

    const existing = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Location not found' });
    if (!canAccessDepartment(req, existing.departmentId, true)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.location.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Location deleted' });
  } catch (error) {
    next(error);
  }
});

// Export locations as CSV
router.get('/export/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    next(error);
  }
});

// Import locations from CSV
router.post('/import/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    next(error);
  }
});

export default router;
