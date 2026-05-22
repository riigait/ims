import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest, adminMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Submit delete request (staff)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List delete requests (admin only)
router.get('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string;
    const where = status ? { status } : {};

    const deleteRequests = await prisma.deleteRequest.findMany({
      where,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(deleteRequests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve delete request (admin only)
router.patch('/:id/approve', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject delete request (admin only)
router.patch('/:id/reject', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
