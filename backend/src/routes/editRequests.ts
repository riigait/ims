import { Router, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest, adminMiddleware } from '../middleware/auth';
import { listRequests } from '../utils/routeHelpers';

const router = Router();

const ALLOWED_PRODUCT_FIELDS = [
  'name', 'description', 'unit', 'lowStockThreshold',
  'supplier', 'unitPrice', 'status', 'expiryDate',
  'leadTimeDays', 'notes', 'locationId', 'categoryId',
] as const;

const NULLABLE_STRING_FIELDS = ['locationId', 'description', 'supplier', 'notes'] as const;

function buildSafeChanges(proposedChanges: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const key of ALLOWED_PRODUCT_FIELDS) {
    if (key in proposedChanges) safe[key] = proposedChanges[key];
  }
  if ('expiryDate' in safe) {
    safe.expiryDate = safe.expiryDate && safe.expiryDate !== '' ? new Date(safe.expiryDate) : null;
  }
  for (const field of NULLABLE_STRING_FIELDS) {
    if (field in safe && safe[field] === '') safe[field] = null;
  }
  return safe;
}

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
  const status = req.query.status as string;
  let where: any = status ? { status } : {};
  if (req.userRole === 'staff') where = { ...where, requestedBy: req.userId };
  await listRequests(res, next, prisma.editRequest, where, {
    product: { select: { id: true, name: true, sku: true } },
    requester: { select: { id: true, name: true, email: true } },
    reviewer: { select: { id: true, name: true, email: true } },
  }, req.query);
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

    const safeChanges = buildSafeChanges(editRequest.proposedChanges as Record<string, any>);

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
