import { Router, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest, adminMiddleware } from '../middleware/auth';

const router = Router();

// Submit edit request (staff only)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId, proposedChanges, reason } = req.body;

    if (!productId || !proposedChanges || typeof proposedChanges !== 'object') {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const editRequest = await prisma.editRequest.create({
      data: {
        productId,
        requestedBy: req.userId!,
        proposedChanges,
        reason: reason || null,
        status: 'pending',
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        requester: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json(editRequest);
  } catch (error) {
    next(error);
  }
});

// List edit requests (admin/superadmin sees all, staff sees own)
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

    const [total, editRequests] = await Promise.all([
      prisma.editRequest.count({ where }),
      prisma.editRequest.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          requester: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({ data: editRequests, total, page, limit });
  } catch (error) {
    next(error);
  }
});

// Approve edit request — applies proposedChanges to the product
router.patch('/:id/approve', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const editRequest = await prisma.editRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!editRequest) {
      return res.status(404).json({ error: 'Edit request not found' });
    }
    if (editRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Request already reviewed' });
    }

    const changes = editRequest.proposedChanges as Record<string, any>;

    // Apply only known product fields — strip any dangerous overrides
    const allowed: (keyof typeof changes)[] = [
      'name', 'description', 'unit', 'lowStockThreshold',
      'supplier', 'unitPrice', 'status', 'expiryDate',
      'leadTimeDays', 'notes', 'locationId', 'categoryId',
    ];
    const safeChanges: Record<string, any> = {};
    for (const key of allowed) {
      if (key in changes) safeChanges[key] = changes[key];
    }

    // Normalize empty strings to null for optional fields
    if ('expiryDate' in safeChanges) {
      safeChanges.expiryDate = safeChanges.expiryDate && safeChanges.expiryDate !== ''
        ? new Date(safeChanges.expiryDate)
        : null;
    }
    if ('locationId' in safeChanges && safeChanges.locationId === '') safeChanges.locationId = null;
    if ('description' in safeChanges && safeChanges.description === '') safeChanges.description = null;
    if ('supplier' in safeChanges && safeChanges.supplier === '') safeChanges.supplier = null;
    if ('notes' in safeChanges && safeChanges.notes === '') safeChanges.notes = null;

    await prisma.product.update({
      where: { id: editRequest.productId },
      data: safeChanges,
    });

    const updated = await prisma.editRequest.update({
      where: { id: req.params.id },
      data: { status: 'approved', reviewedBy: req.userId, reviewedAt: new Date() },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        requester: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Product not found' });
    }
    next(error);
  }
});

// Reject edit request
router.patch('/:id/reject', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { rejectionReason } = req.body;

    const editRequest = await prisma.editRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!editRequest) {
      return res.status(404).json({ error: 'Edit request not found' });
    }
    if (editRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Request already reviewed' });
    }

    const updated = await prisma.editRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'rejected',
        rejectionReason: rejectionReason || null,
        reviewedBy: req.userId,
        reviewedAt: new Date(),
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        requester: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Edit request not found' });
    }
    next(error);
  }
});

export default router;
