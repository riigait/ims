import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import bcrypt from 'bcryptjs';

const router = Router();
const prisma = new PrismaClient();

// List all users (admin/superadmin only)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).json({ error: 'Only admins can view users' });
    }

    const users = await prisma.user.findMany({
      select: {
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
        createdAt: true,
      },
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
    const requester = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!requester) return res.status(404).json({ error: 'User not found' });

    // Allow users to view themselves or admins/superadmins to view anyone
    if (req.userId !== req.params.id && !['admin', 'superadmin'].includes(requester.role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user (admin/superadmin only, cannot change own role)
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const requester = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!requester || !['admin', 'superadmin'].includes(requester.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, email, role, departmentId } = req.body;
    const updates: any = {};

    if (name) updates.name = name;
    if (email) updates.email = email;
    if (role && ['admin', 'staff'].includes(role)) {
      // Prevent admin from changing their own role
      if (req.params.id === req.userId) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }
      updates.role = role;
    }
    if (departmentId !== undefined) updates.departmentId = departmentId;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updates,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
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
    const requester = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!requester || !['admin', 'superadmin'].includes(requester.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.params.id === req.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
