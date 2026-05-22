import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest, getJwtSecret } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

function signToken(userId: string, role: string, departmentId?: string): string {
  return jwt.sign({ userId, role, departmentId }, getJwtSecret(), { expiresIn: '7d' });
}

// Register — use invite code to get role; defaults to staff if no invite
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, inviteCode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    // Validate invite code if provided
    let role = 'staff';
    if (inviteCode) {
      const invite = await prisma.inviteCode.findUnique({ where: { code: inviteCode } });
      if (!invite) return res.status(400).json({ error: 'Invalid invite code' });
      if (invite.usedAt) return res.status(400).json({ error: 'Invite already used' });
      if (new Date() > invite.expiresAt) return res.status(400).json({ error: 'Invite expired' });

      role = invite.role;

      // Mark invite as used
      await prisma.inviteCode.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedBy: 'pending' }, // Will be updated to actual user ID after user creation
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role },
    });

    // Update invite code with actual user ID if invite was used
    if (inviteCode) {
      const invite = await prisma.inviteCode.findUnique({ where: { code: inviteCode } });
      if (invite) {
        await prisma.inviteCode.update({
          where: { id: invite.id },
          data: { usedBy: user.id },
        });
      }
    }

    const token = signToken(user.id, user.role, user.departmentId ?? undefined);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const adminDepartments = user.role === 'admin' ? await prisma.adminDepartment.findMany({
      where: { userId: user.id },
      select: { departmentId: true, department: { select: { id: true, name: true, description: true } } },
    }) : [];

    const token = signToken(user.id, user.role, user.departmentId ?? undefined);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        adminDepartments,
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user — protected by authMiddleware
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const adminDepartments = user.role === 'admin' ? await prisma.adminDepartment.findMany({
      where: { userId: user.id },
      select: { departmentId: true, department: { select: { id: true, name: true, description: true } } },
    }) : [];

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      adminDepartments,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
