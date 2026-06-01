import { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const router = Router();

// Generate invite code (admin only)
router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !['superadmin', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Only admins can generate invites' });
    }

    const { role = 'staff' } = req.body;
    // Superadmin can create any role, regular admin can only create staff
    if (user.role === 'admin' && !['staff'].includes(role)) {
      return res.status(403).json({ error: 'Admins can only create staff invites' });
    }
    if (!['superadmin', 'admin', 'staff'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const code = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await prisma.inviteCode.create({
      data: {
        code,
        role,
        createdBy: req.userId!,
        expiresAt,
      },
      include: { creator: { select: { id: true, name: true, email: true } } },
    });

    res.json({ id: invite.id, code: invite.code, role: invite.role, expiresAt: invite.expiresAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List invites (admin only)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !['superadmin', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Only admins can view invites' });
    }

    const whereClause = user.role === 'superadmin' ? {} : { createdBy: req.userId!, role: 'staff' };

    const invites = await prisma.inviteCode.findMany({
      where: whereClause,
      include: { creator: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(invites);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke invite (admin only)
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !['superadmin', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Only admins can revoke invites' });
    }

    const invite = await prisma.inviteCode.findUnique({ where: { id: req.params.id } });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.usedAt) return res.status(400).json({ error: 'Cannot revoke used invite' });
    if (user.role === 'admin' && (invite.createdBy !== req.userId || invite.role !== 'staff')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.inviteCode.delete({ where: { id: req.params.id } });
    res.json({ message: 'Invite revoked' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Validate invite code
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing invite code' });

    const invite = await prisma.inviteCode.findUnique({ where: { code } });
    if (!invite) return res.status(404).json({ error: 'Invalid invite code' });
    if (invite.usedAt) return res.status(400).json({ error: 'Invite already used' });
    if (new Date() > invite.expiresAt) return res.status(400).json({ error: 'Invite expired' });

    res.json({ valid: true, role: invite.role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Redeem invite code to create account
router.post('/redeem', async (req: Request, res: Response) => {
  try {
    const { code, name, email, password } = req.body;

    if (!code || !name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate password: 8+ chars with uppercase, lowercase, and number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters with uppercase, lowercase, and number'
      });
    }

    // Validate and check invite
    const invite = await prisma.inviteCode.findUnique({ where: { code } });
    if (!invite) return res.status(404).json({ error: 'Invalid invite code' });
    if (invite.usedAt) return res.status(400).json({ error: 'Invite already used' });
    if (new Date() > invite.expiresAt) return res.status(400).json({ error: 'Invite expired' });

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with invite role
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashedPassword,
        role: invite.role as 'admin' | 'staff',
        initialSetupComplete: true,
      },
    });

    // Mark invite as used
    await prisma.inviteCode.update({
      where: { id: invite.id },
      data: {
        usedAt: new Date(),
        usedBy: user.id,
      },
    });

    res.status(201).json({
      message: 'Account created successfully',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
