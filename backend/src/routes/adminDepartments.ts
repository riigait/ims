import { Router, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireSuperadmin } from '../utils/routeHelpers';

const router = Router();

// Get admin's assigned departments
router.get('/admin/:adminId', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!await requireSuperadmin(req, res)) return;

    const adminDepts = await prisma.adminDepartment.findMany({
      where: { userId: req.params.adminId },
      include: { department: true },
    });

    res.json(adminDepts);
  } catch (error) {
    next(error);
  }
});

// Assign department to admin
router.post('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!await requireSuperadmin(req, res)) return;

    const { adminId, departmentId } = req.body;
    if (!adminId || !departmentId) {
      return res.status(400).json({ error: 'Missing adminId or departmentId' });
    }

    // Verify admin exists and is admin role
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Verify department exists
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Create assignment
    const assignment = await prisma.adminDepartment.create({
      data: { userId: adminId, departmentId },
      include: { department: true },
    });

    res.status(201).json(assignment);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Admin already assigned to this department' });
    }
    next(error);
  }
});

// Remove department assignment
router.delete('/:adminId/:departmentId', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!await requireSuperadmin(req, res)) return;

    const { adminId, departmentId } = req.params;

    await prisma.adminDepartment.deleteMany({
      where: { userId: adminId, departmentId },
    });

    res.json({ message: 'Department assignment removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
