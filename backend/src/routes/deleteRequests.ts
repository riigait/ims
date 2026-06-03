import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest, adminMiddleware } from '../middleware/auth';

const router = Router();

// Submit delete request (staff)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { entityType, entityId, entityName, reason } = req.body;

    if (!entityType || !entityId || !entityName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const deleteRequest = await prisma.deleteRequest.create({
      data: {
        requestedBy: req.userId!,
        entityType,
        entityId,
        entityName,
        reason: reason || '',
        status: 'pending',
      },
    });

    res.status(201).json(deleteRequest);
  } catch (error) {
    next(error);
  }
});

// List delete requests (admin sees all, staff sees own)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string;
    let where: any = status ? { status } : {};
    if (req.userRole === 'staff') {
      where = { ...where, requestedBy: req.userId };
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 200);
    const skip = (page - 1) * limit;

    const [total, deleteRequests] = await Promise.all([
      prisma.deleteRequest.count({ where }),
      prisma.deleteRequest.findMany({
        where,
        include: {
          requester: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({ data: deleteRequests, total, page, limit });
  } catch (error) {
    next(error);
  }
});

// Approve delete request (admin only)
router.patch('/:id/approve', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const deleteRequest = await prisma.deleteRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!deleteRequest) {
      return res.status(404).json({ error: 'Delete request not found' });
    }

    // Execute the actual deletion based on entityType
    switch (deleteRequest.entityType) {
      case 'product':
        await prisma.product.delete({ where: { id: deleteRequest.entityId } });
        break;
      case 'category':
        await prisma.category.delete({ where: { id: deleteRequest.entityId } });
        break;
      case 'location':
        await prisma.location.delete({ where: { id: deleteRequest.entityId } });
        break;
      case 'floor_plan':
        await prisma.floorPlan.delete({ where: { id: deleteRequest.entityId } });
        break;
      default:
        return res.status(400).json({ error: 'Invalid entity type' });
    }

    // Update delete request status
    const updated = await prisma.deleteRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'approved',
        reviewedBy: req.userId,
        reviewedAt: new Date(),
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Entity not found' });
    }
    next(error);
  }
});

// Reject delete request (admin only)
router.patch('/:id/reject', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;

    const deleteRequest = await prisma.deleteRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!deleteRequest) {
      return res.status(404).json({ error: 'Delete request not found' });
    }

    const updated = await prisma.deleteRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'rejected',
        reviewedBy: req.userId,
        reviewedAt: new Date(),
        reason,
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Delete request not found' });
    }
    next(error);
  }
});

export default router;
