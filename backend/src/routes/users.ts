import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  departmentId: true,
  adminDepartments: {
    select: {
      departmentId: true,
      department: { select: { id: true, name: true, description: true } },
    },
  },
  staffDepartments: {
    select: {
      departmentId: true,
      department: { select: { id: true, name: true, description: true } },
    },
  },
  createdAt: true,
};

function assignedStaffWhere(departmentIds: string[]) {
  return {
    role: 'staff',
    staffDepartments: {
      some: { departmentId: { in: departmentIds } },
    },
  };
}

function adminCanManageUser(targetUser: any, departmentIds: string[]) {
  return targetUser.role === 'staff'
    && targetUser.staffDepartments.some((dept: { departmentId: string }) => departmentIds.includes(dept.departmentId));
}

// List all users (admin/superadmin only) — superadmin sees all, admin sees admin+staff only
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userRole || !['admin', 'superadmin'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Only admins can view users' });
    }

    const departmentIds = req.accessibleDepartmentIds || [];
    const whereClause = req.userRole === 'superadmin' ? {} : assignedStaffWhere(departmentIds);

    const users = await prisma.user.findMany({
      where: whereClause,
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single user (admin/superadmin or self)
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: USER_SELECT,
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.userId !== req.params.id && req.userRole !== 'superadmin') {
      const departmentIds = req.accessibleDepartmentIds || [];
      if (req.userRole !== 'admin' || !adminCanManageUser(user, departmentIds)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user (admin/superadmin only, cannot change own role)
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userRole || !['admin', 'superadmin'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const existing = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: USER_SELECT,
    });
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const departmentIds = req.accessibleDepartmentIds || [];
    if (req.userRole === 'admin' && !adminCanManageUser(existing, departmentIds)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, email, role, departmentId } = req.body;
    const updates: any = {};

    if (name) updates.name = name;
    if (email) updates.email = email;
    if (role && ['admin', 'staff'].includes(role)) {
      if (req.params.id === req.userId) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }
      if (req.userRole === 'admin' && role !== existing.role) {
        return res.status(403).json({ error: 'Admins cannot change user roles' });
      }
      updates.role = role;
    }
    if (departmentId !== undefined) {
      if (req.userRole === 'admin' && departmentId && !departmentIds.includes(departmentId)) {
        return res.status(403).json({ error: 'Access denied for selected department' });
      }
      updates.departmentId = departmentId;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updates,
      select: USER_SELECT,
    });

    res.json(user);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user (admin/superadmin only, cannot delete self)
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userRole || !['admin', 'superadmin'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.params.id === req.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: USER_SELECT,
    });
    if (!target) return res.status(404).json({ error: 'User not found' });

    const departmentIds = req.accessibleDepartmentIds || [];
    if (req.userRole === 'admin' && !adminCanManageUser(target, departmentIds)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
