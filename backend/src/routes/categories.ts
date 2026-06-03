import express, { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, canAccessDepartment } from '../middleware/auth';
import { csvToJson, jsonToCsv } from '../utils/csv';

const router = Router();

// Get all categories
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 200), 500);
    const skip = (page - 1) * limit;
    const search = (req.query.search as string)?.trim();
    const qDepartmentId = req.query.departmentId as string;

    let whereFilter: any = {};
    if (req.departmentIds && req.departmentIds.length > 0) {
      whereFilter = { OR: [{ departmentId: { in: req.departmentIds } }, { departmentId: null }] };
    } else if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
      whereFilter = { departmentId: req.departmentId };
    }
    if (qDepartmentId && !req.departmentId) whereFilter.departmentId = qDepartmentId;
    if (search) whereFilter.name = { contains: search, mode: 'insensitive' };

    const [total, categories] = await Promise.all([
      prisma.category.count({ where: whereFilter }),
      prisma.category.findMany({ where: whereFilter, include: { department: { select: { name: true } } }, orderBy: { name: 'asc' }, skip, take: limit }),
    ]);
    res.json({ data: categories, total, page, limit });
  } catch (error: any) {
    console.error(error);
    if (error.code === 'P2025') {
      return res.json({ message: 'Category already deleted' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Category is still referenced by other records' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get category by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (!canAccessDepartment(req, category.departmentId, true)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(category);
  } catch (error: any) {
    console.error(error);
    if (error.code === 'P2025') {
      return res.json({ message: 'Category already deleted' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Category is still referenced by other records' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create category
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const category = await prisma.category.create({
      data: {
        name,
        description,
        departmentId: req.departmentId,
      },
    });

    res.status(201).json(category);
  } catch (error: any) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Category with this name already exists in this department' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update category
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    if (!canAccessDepartment(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, description } = req.body;

    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { name, description },
    });

    res.json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete category (admin only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Staff must submit a delete request instead' });
    }

    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    if (!canAccessDepartment(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.category.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export categories as CSV
router.get('/export/csv', async (req: AuthRequest, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        departmentId: true,
      },
    });

    const csv = jsonToCsv(categories);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="categories.csv"');
    res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to export categories' });
  }
});

// Import categories from CSV
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
            description: row.description || null,
            departmentId: req.departmentId,
          };
        const category = row.id
          ? await prisma.category.upsert({
              where: { id: row.id },
              update: data,
              create: { id: row.id, ...data },
            })
          : await prisma.category.create({ data });
        created.push(category);
      } catch (err: any) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    res.json({
      created: created.length,
      errors: errors,
      message: `Imported ${created.length} categories${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to import categories' });
  }
});

export default router;
