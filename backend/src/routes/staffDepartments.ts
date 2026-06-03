import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Get staff's assigned departments
router.get('/staff/:staffId', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !['superadmin', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (user.role === 'admin') {
      const departmentIds = req.accessibleDepartmentIds || [];
      const allowed = await prisma.staffDepartment.findFirst({
        where: {
          userId: req.params.staffId,
          departmentId: { in: departmentIds },
        },
      });
      if (!allowed) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const staffDepts = await prisma.staffDepartment.findMany({
      where: { userId: req.params.staffId },
      include: { department: true },
    });

    res.json(staffDepts);
  } catch (error) {
    next(error);
  }
});

// Assign department to staff
router.post('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmins can assign departments' });
    }

    const { staffId, departmentId } = req.body;
    if (!staffId || !departmentId) {
      return res.status(400).json({ error: 'Missing staffId or departmentId' });
    }

    // Verify staff exists and is staff role
    const staff = await prisma.user.findUnique({ where: { id: staffId } });
    if (!staff || staff.role !== 'staff') {
      return res.status(404).json({ error: 'Staff not found' });
    }

    // Verify department exists
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Create assignment
    const assignment = await prisma.staffDepartment.create({
      data: { userId: staffId, departmentId },
      include: { department: true },
    });

    res.status(201).json(assignment);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Staff already assigned to this department' });
    }
    next(error);
  }
});

// Remove department assignment
router.delete('/:staffId/:departmentId', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmins can remove assignments' });
    }

    const { staffId, departmentId } = req.params;

    await prisma.staffDepartment.deleteMany({
      where: { userId: staffId, departmentId },
    });

    res.json({ message: 'Department assignment removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
