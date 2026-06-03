import { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Create password change request — staff only
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requester = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!requester || requester.role !== 'staff') {
      return res.status(403).json({ error: 'Only staff can request password changes' });
    }

    const { reason } = req.body;

    // Check if staff already has pending request
    const existing = await prisma.passwordChangeRequest.findFirst({
      where: {
        requestedBy: req.userId,
        status: 'pending',
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'You already have a pending password change request' });
    }

    const request = await prisma.passwordChangeRequest.create({
      data: {
        requestedBy: req.userId,
        reason,
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json(request);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List password change requests — admin/superadmin only
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const role = req.userRole;
    let where: any = {};
    if (role === 'staff') {
      where = { requestedBy: req.userId };
    } else if (!['admin', 'superadmin'].includes(role || '')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 200);
    const skip = (page - 1) * limit;

    const [total, requests] = await Promise.all([
      prisma.passwordChangeRequest.count({ where }),
      prisma.passwordChangeRequest.findMany({
        where,
        include: {
          requester: { select: { id: true, name: true, email: true, role: true } },
          approver: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({ data: requests, total, page, limit });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve password change request — admin/superadmin
router.patch('/:id/approve', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const approver = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!approver || !['admin', 'superadmin'].includes(approver.role)) {
      return res.status(403).json({ error: 'Only admin/superadmin can approve requests' });
    }

    const { temporaryPassword } = req.body;
    if (!temporaryPassword || temporaryPassword.length < 8) {
      return res.status(400).json({ error: 'Temporary password must be at least 8 characters' });
    }

    const request = await prisma.passwordChangeRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    // Update the password change request
    const updated = await prisma.passwordChangeRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'approved',
        approvedBy: req.userId,
        approvedAt: new Date(),
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    // Set temporary password for the staff member
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    await prisma.user.update({
      where: { id: request.requestedBy },
      data: { passwordHash },
    });

    res.json({
      message: 'Password change approved and temporary password set',
      request: updated,
      temporaryPassword, // Send back to admin to share with staff
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject password change request
router.patch('/:id/reject', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const approver = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!approver || !['admin', 'superadmin'].includes(approver.role)) {
      return res.status(403).json({ error: 'Only admin/superadmin can reject requests' });
    }

    const request = await prisma.passwordChangeRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    const updated = await prisma.passwordChangeRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'rejected',
        approvedBy: req.userId,
        approvedAt: new Date(),
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ message: 'Password change request rejected', request: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
