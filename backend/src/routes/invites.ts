import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

// Generate invite code (admin only)
router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can generate invites' });
    }

    const { role = 'staff' } = req.body;
    if (!['admin', 'staff'].includes(role)) {
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
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can view invites' });
    }

    const invites = await prisma.inviteCode.findMany({
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
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can revoke invites' });
    }

    const invite = await prisma.inviteCode.findUnique({ where: { id: req.params.id } });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.usedAt) return res.status(400).json({ error: 'Cannot revoke used invite' });

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

export default router;
