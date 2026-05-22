import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/audit';

const router = Router();
const prisma = new PrismaClient();

const VALID_MOVEMENT_TYPES = ['stock_in', 'stock_out', 'adjustment', 'transfer', 'damaged', 'returned'] as const;
type MovementType = typeof VALID_MOVEMENT_TYPES[number];

// Types that reduce stock (require stock validation)
const DEDUCTING_TYPES: MovementType[] = ['stock_out', 'transfer', 'damaged'];
// Types that increase stock
const ADDING_TYPES: MovementType[] = ['stock_in', 'returned', 'adjustment'];

function stockDelta(type: MovementType, quantity: number): number {
  if (DEDUCTING_TYPES.includes(type)) return -quantity;
  return quantity; // ADDING_TYPES
}

// Get all stock movements
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let whereFilter: any = {};
    if (req.departmentIds && req.departmentIds.length > 0) {
      // Include movements with null departmentId
      whereFilter = {
        OR: [
          { departmentId: { in: req.departmentIds } },
          { departmentId: null }
        ]
      };
    } else if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
      whereFilter = { departmentId: req.departmentId };
    }
    const movements = await prisma.stockMovement.findMany({
      where: whereFilter,
      include: { product: true, location: true, user: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(movements);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stock movement by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const movement = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: { product: true, location: true, user: true },
    });
    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });

    if (req.departmentId && movement.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(movement);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create stock movement
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { productId, movementType, quantity, reason, locationId } = req.body;
    const userId = req.userId!;
    const userRole = req.userRole ?? 'staff';

    // ── Validation ──────────────────────────────────────────────────────────
    if (!productId || !movementType || quantity === undefined || quantity === null) {
      return res.status(400).json({ error: 'productId, movementType, and quantity are required' });
    }

    if (!VALID_MOVEMENT_TYPES.includes(movementType as MovementType)) {
      return res.status(400).json({
        error: `movementType must be one of: ${VALID_MOVEMENT_TYPES.join(', ')}`,
      });
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    const type = movementType as MovementType;

    // ── Transaction: validate stock + create movement + update product ──────
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });

      // stock_out guard — admin can override
      if (DEDUCTING_TYPES.includes(type) && product.currentStock < qty) {
        if (userRole !== 'admin') {
          throw Object.assign(
            new Error(`Insufficient stock. Available: ${product.currentStock}, requested: ${qty}`),
            { status: 400 }
          );
        }
        // Admin override: allow negative stock
      }

      const delta = stockDelta(type, qty);
      const newStock = Math.max(0, product.currentStock + delta);
      // Allow admins to go below zero only on deducting moves; otherwise floor at 0
      const finalStock = userRole === 'admin' && DEDUCTING_TYPES.includes(type)
        ? product.currentStock + delta
        : newStock;

      const movement = await tx.stockMovement.create({
        data: {
          productId,
          movementType: type,
          quantity: qty,
          reason: reason ?? null,
          locationId: locationId || null,
          departmentId: req.departmentId,
          userId,
        },
        include: { product: true },
      });

      await tx.product.update({
        where: { id: productId },
        data: { currentStock: finalStock },
      });

      return movement;
    });

    await logAudit({
      userId,
      action: type.toUpperCase(),
      entityType: 'stock_movement',
      entityId: result.id,
      changes: { productId, movementType: type, quantity: qty, reason },
    });

    res.status(201).json(result);
  } catch (error: any) {
    if (error?.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
