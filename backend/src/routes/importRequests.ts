import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/audit';

const router = Router();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function autoApproveExpired() {
  const now = new Date();
  const expired = await prisma.importRequest.findMany({
    where: { status: 'pending', expiresAt: { lte: now } },
    select: { id: true },
  });
  if (expired.length === 0) return;
  await prisma.importRequest.updateMany({
    where: { id: { in: expired.map(r => r.id) } },
    data: { status: 'approved', reviewedAt: now, notes: 'Auto-approved after 30 days' },
  });
}

// GET / — list requests
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    await autoApproveExpired();

    let whereFilter: any = {};
    if (req.userRole === 'admin') {
      if (req.departmentIds && req.departmentIds.length > 0) {
        whereFilter = { departmentId: { in: req.departmentIds } };
      } else {
        whereFilter = { departmentId: req.departmentId };
      }
    } else if (req.userRole === 'staff') {
      whereFilter = { submittedBy: req.userId };
    }
    // superadmin sees all

    const requests = await prisma.importRequest.findMany({
      where: whereFilter,
      include: {
        submitter: { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id — single request
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const request = await prisma.importRequest.findUnique({
      where: { id: req.params.id },
      include: {
        submitter: { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
      },
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (req.userRole === 'admin') {
      const allowedDepartmentIds = req.departmentId ? [req.departmentId] : req.departmentIds || [];
      if (!request.departmentId || !allowedDepartmentIds.includes(request.departmentId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (req.userRole === 'staff' && request.submittedBy !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(request);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:id/approve — superadmin only
router.patch('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can approve requests' });
    }
    const request = await prisma.importRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    // Make imported products visible in the main app
    if (request.productIds.length > 0) {
      await prisma.product.updateMany({
        where: { id: { in: request.productIds } },
        data: { pendingApproval: false },
      });
    }

    const updated = await prisma.importRequest.update({
      where: { id: req.params.id },
      data: { status: 'approved', reviewedBy: req.userId, reviewedAt: new Date() },
    });

    await logAudit({ userId: req.userId, action: 'APPROVE', entityType: 'import_request', entityId: req.params.id, changes: { productCount: request.productIds.length } });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:id/reject — superadmin only, deletes the products
router.patch('/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can reject requests' });
    }
    const request = await prisma.importRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    const { reason } = req.body;
    const productIds = request.productIds;

    // Delete associated data in order: movement items → movements → stock details → products
    await prisma.$transaction(async (tx) => {
      const movements = await tx.stockMovement.findMany({
        where: { items: { some: { productId: { in: productIds } } } },
        select: { id: true },
      });
      const movementIds = movements.map(m => m.id);

      await tx.stockMovementItem.deleteMany({ where: { productId: { in: productIds } } });
      if (movementIds.length > 0) {
        await tx.stockMovement.deleteMany({ where: { id: { in: movementIds } } });
      }
      await tx.stockDetail.deleteMany({ where: { productId: { in: productIds } } });
      await tx.product.deleteMany({ where: { id: { in: productIds } } });

      await tx.importRequest.update({
        where: { id: req.params.id },
        data: {
          status: 'rejected',
          reviewedBy: req.userId,
          reviewedAt: new Date(),
          notes: reason || null,
        },
      });
    });

    await logAudit({ userId: req.userId, action: 'REJECT', entityType: 'import_request', entityId: req.params.id, changes: { deletedProductCount: productIds.length, reason } });
    res.json({ message: `Rejected and deleted ${productIds.length} products` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
