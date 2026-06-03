import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest, adminMiddleware } from '../middleware/auth';

const router = Router();

// List all departments (admin only)
router.get('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(departments);
  } catch (error) {
    next(error);
  }
});

// Get single department (authenticated users can view departments they have access to)
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Superadmins can view any department
    // Admins can view any department
    // Staff can only view their assigned department
    if (user.role === 'staff' && user.departmentId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const department = await prisma.department.findUnique({
      where: { id: req.params.id },
    });
    if (!department) return res.status(404).json({ error: 'Department not found' });
    res.json(department);
  } catch (error) {
    next(error);
  }
});

// Create department (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const name = (req.body.name || '').trim();
    const description = (req.body.description || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const existing = await prisma.department.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ error: 'Department already exists' });
    }

    const department = await prisma.department.create({
      data: { name, description },
    });

    res.status(201).json(department);
  } catch (error) {
    next(error);
  }
});

// Update department (admin only)
router.patch('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const updates: any = {};

    if (req.body.name) updates.name = (req.body.name || '').trim();
    if (req.body.description !== undefined) updates.description = (req.body.description || '').trim();

    const department = await prisma.department.update({
      where: { id: req.params.id },
      data: updates,
    });

    res.json(department);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Department not found' });
    }
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Department name already exists' });
    }
    next(error);
  }
});

// Delete department (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.department.delete({ where: { id: req.params.id } });
    res.json({ message: 'Department deleted' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Department not found' });
    }
    next(error);
  }
});

export default router;
