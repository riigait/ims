import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { csvToJson, jsonToCsv } from '../utils/csv';

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
      include: { product: true, location: true, user: true, department: true },
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
      include: { product: true, location: true, user: true, department: true },
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
          departmentId: req.departmentId || product.departmentId,
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

// Update stock movement
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { productId, movementType, quantity, reason, locationId } = req.body;
    const movementId = req.params.id;

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

    const oldMovement = await prisma.stockMovement.findUnique({
      where: { id: movementId },
      include: { product: true },
    });

    if (!oldMovement) return res.status(404).json({ error: 'Stock movement not found' });

    if (req.departmentId && oldMovement.departmentId !== req.departmentId && oldMovement.departmentId !== null) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const type = movementType as MovementType;
    const userRole = req.userRole ?? 'staff';

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });

      const oldDelta = stockDelta(oldMovement.movementType as MovementType, oldMovement.quantity);
      const newDelta = stockDelta(type, qty);
      const stockAdjustment = newDelta - oldDelta;

      if (DEDUCTING_TYPES.includes(type) && product.currentStock + stockAdjustment < 0) {
        if (userRole !== 'admin') {
          throw Object.assign(
            new Error(`Insufficient stock. Available: ${product.currentStock + stockAdjustment}`),
            { status: 400 }
          );
        }
      }

      const newStock = product.currentStock + stockAdjustment;
      const finalStock = userRole === 'admin' && DEDUCTING_TYPES.includes(type)
        ? newStock
        : Math.max(0, newStock);

      const updated = await tx.stockMovement.update({
        where: { id: movementId },
        data: {
          productId,
          movementType: type,
          quantity: qty,
          reason: reason ?? null,
          locationId: locationId || null,
        },
        include: { product: true },
      });

      await tx.product.update({
        where: { id: productId },
        data: { currentStock: finalStock },
      });

      return updated;
    });

    await logAudit({
      userId: req.userId!,
      action: 'UPDATE',
      entityType: 'stock_movement',
      entityId: movementId,
      changes: { productId, movementType: type, quantity: qty, reason },
    });

    res.json(result);
  } catch (error: any) {
    if (error?.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete stock movement
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const movement = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: { product: true },
    });

    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });

    if (req.departmentId && movement.departmentId !== req.departmentId && movement.departmentId !== null) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.$transaction(async (tx) => {
      const delta = stockDelta(movement.movementType as MovementType, movement.quantity);
      const newStock = Math.max(0, movement.product.currentStock - delta);

      await tx.product.update({
        where: { id: movement.productId },
        data: { currentStock: newStock },
      });

      await tx.stockMovement.delete({
        where: { id: req.params.id },
      });
    });

    await logAudit({
      userId: req.userId!,
      action: 'DELETE',
      entityType: 'stock_movement',
      entityId: req.params.id,
      changes: { reason: 'Stock movement deleted' },
    });

    res.json({ message: 'Stock movement deleted successfully' });
  } catch (error: any) {
    if (error?.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export stock movements as CSV
router.get('/export/csv', async (req: AuthRequest, res: Response) => {
  try {
    const movements = await prisma.stockMovement.findMany({
      select: {
        id: true,
        productId: true,
        movementType: true,
        quantity: true,
        reason: true,
        locationId: true,
        departmentId: true,
        userId: true,
        createdAt: true,
      },
    });

    const csv = jsonToCsv(movements);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="stock-movements.csv"');
    res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to export stock movements' });
  }
});

// Import stock movements from CSV (uses stock_in type by default)
router.post('/import/csv', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.body.csv) {
      return res.status(400).json({ error: 'CSV data required' });
    }

    const rows = csvToJson<any>(req.body.csv);
    const created = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const movement = await prisma.stockMovement.create({
          data: {
            productId: row.productId,
            movementType: row.movementType || 'stock_in',
            quantity: parseInt(row.quantity) || 0,
            reason: row.reason || null,
            locationId: row.locationId || null,
            departmentId: req.departmentId,
            userId: req.userId!,
          },
        });
        created.push(movement);

        // Log audit
        await logAudit({
          userId: req.userId,
          action: 'STOCK_IN',
          entityType: 'stock_movement',
          entityId: movement.id,
          changes: { movementType: movement.movementType, quantity: movement.quantity },
        });
      } catch (err: any) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    res.json({
      created: created.length,
      errors: errors,
      message: `Imported ${created.length} stock movements${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to import stock movements' });
  }
});

export default router;
