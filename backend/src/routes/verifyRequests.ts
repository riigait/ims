import { Router, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, adminMiddleware } from '../middleware/auth';

const router = Router();

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { stockDetailIds, reason } = req.body;
    if (!Array.isArray(stockDetailIds) || stockDetailIds.length === 0) {
      return res.status(400).json({ error: 'stockDetailIds array is required' });
    }

    const isAdmin = req.userRole === 'admin' || req.userRole === 'superadmin';
    const now = new Date();
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });

    if (isAdmin) {
      await prisma.stockDetail.updateMany({
        where: { id: { in: stockDetailIds } },
        data: { lastCheckedDate: now, checkedBy: user?.name ?? null },
      });
      const created = await prisma.verifyRequest.create({
        data: {
          stockDetailIds,
          requestedBy: req.userId!,
          reason: reason || null,
          status: 'approved',
          reviewedBy: req.userId,
          reviewedAt: now,
        },
        include: {
          requester: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
        },
      });
      return res.status(201).json(created);
    }

    const created = await prisma.verifyRequest.create({
      data: {
        stockDetailIds,
        requestedBy: req.userId!,
        reason: reason || null,
        status: 'pending',
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
      },
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string;
    let where: any = status ? { status } : {};
    if (req.userRole === 'staff') {
      where = { ...where, requestedBy: req.userId };
    }

    const [total, requests] = await Promise.all([
      prisma.verifyRequest.count({ where }),
      prisma.verifyRequest.findMany({
        where,
        include: {
          requester: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({ data: requests, total });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/approve', adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const verifyRequest = await prisma.verifyRequest.findUnique({ where: { id: req.params.id } });
    if (!verifyRequest) return res.status(404).json({ error: 'Verify request not found' });
    if (verifyRequest.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    const now = new Date();
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });

    await prisma.stockDetail.updateMany({
      where: { id: { in: verifyRequest.stockDetailIds } },
      data: { lastCheckedDate: now, checkedBy: user?.name ?? null },
    });

    const updated = await prisma.verifyRequest.update({
      where: { id: req.params.id },
      data: { status: 'approved', reviewedBy: req.userId, reviewedAt: now },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/reject', adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { rejectionReason } = req.body;
    const verifyRequest = await prisma.verifyRequest.findUnique({ where: { id: req.params.id } });
    if (!verifyRequest) return res.status(404).json({ error: 'Verify request not found' });
    if (verifyRequest.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    const updated = await prisma.verifyRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'rejected',
        reviewedBy: req.userId,
        reviewedAt: new Date(),
        rejectionReason: rejectionReason || null,
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
