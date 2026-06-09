import { Router, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, canAccessDepartment } from '../middleware/auth';
import { csvToJson } from '../utils/csv';
import { buildDepartmentWhereFilter, parsePagination, sendCsv, csvImportRows } from '../utils/routeHelpers';

const router = Router();

interface CategoryWriteBody {
  name?: string;
  description?: string | null;
}

function validateCategoryWrite(body: CategoryWriteBody, isCreate: boolean): string | null {
  if (isCreate && (typeof body.name !== 'string' || !body.name.trim())) return 'Category name is required';
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 255)) return 'name must be a non-empty string under 255 characters';
  if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') return 'description must be a string';
  if (typeof body.description === 'string' && body.description.length > 1000) return 'description too long';
  return null;
}

// Get all categories
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const search = (req.query.search as string)?.trim();
    const whereFilter = buildDepartmentWhereFilter(req, req.query.departmentId as string);
    if (search) whereFilter.name = { contains: search, mode: 'insensitive' };

    const [total, categories] = await Promise.all([
      prisma.category.count({ where: whereFilter }),
      prisma.category.findMany({ where: whereFilter, include: { department: { select: { name: true } } }, orderBy: { name: 'asc' }, skip, take: limit }),
    ]);
    res.json({ data: categories, total, page, limit });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.json({ message: 'Category already deleted' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Category is still referenced by other records' });
    }
    next(error);
  }
});

// Get category by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    if (error.code === 'P2025') {
      return res.json({ message: 'Category already deleted' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Category is still referenced by other records' });
    }
    next(error);
  }
});

// Create category
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body as CategoryWriteBody;
    const validationError = validateCategoryWrite(body, true);
    if (validationError) return res.status(400).json({ error: validationError });

    const { name, description } = body;

    const category = await prisma.category.create({
      data: {
        name: name!,
        description,
        departmentId: req.departmentId,
      },
    });

    res.status(201).json(category);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Category with this name already exists in this department' });
    }
    next(error);
  }
});

// Update category
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    if (!canAccessDepartment(req, existing.departmentId, true)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const body = req.body as CategoryWriteBody;
    const validationError = validateCategoryWrite(body, false);
    if (validationError) return res.status(400).json({ error: validationError });

    const { name, description } = body;

    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { ...(name !== undefined && { name }), description },
    });

    res.json(category);
  } catch (error) {
    next(error);
  }
});

// Delete category (admin only)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Staff must submit a delete request instead' });
    }

    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    if (!canAccessDepartment(req, existing.departmentId, true)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.category.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Category deleted' });
  } catch (error) {
    next(error);
  }
});

// Export categories as CSV
router.get('/export/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      select: { id: true, name: true, description: true, departmentId: true },
    });
    sendCsv(res, categories, 'categories.csv');
  } catch (error) {
    next(error);
  }
});

// Import categories from CSV
router.post('/import/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.body.csv) return res.status(400).json({ error: 'CSV data required' });
  const rows = csvToJson<any>(req.body.csv);
  await csvImportRows({
    req, res, next, rows,
    buildData: row => ({ name: row.name, description: row.description || null, departmentId: req.departmentId }),
    upsertFn: (id, data) => prisma.category.upsert({ where: { id }, update: data, create: { id, ...data } }),
    createFn: data => prisma.category.create({ data }),
    entityName: 'categories',
  });
});

export default router;
