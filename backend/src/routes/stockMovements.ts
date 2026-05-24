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
      include: { items: { include: { product: true, stockDetail: true, fromLocation: true, toLocation: true } }, user: true, department: true },
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
      include: { items: { include: { product: true, stockDetail: true, fromLocation: true, toLocation: true } }, user: true, department: true },
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

// Create stock movement with items
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { movementType, remarks, items } = req.body;
    const userId = req.userId!;

    // Validate input
    if (!movementType || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'movementType and items array are required' });
    }

    if (!VALID_MOVEMENT_TYPES.includes(movementType as MovementType)) {
      return res.status(400).json({
        error: `movementType must be one of: ${VALID_MOVEMENT_TYPES.join(', ')}`,
      });
    }

    // Generate movement number
    const { generateMovementNo } = await import('../utils/idGenerator');
    const movementNo = await generateMovementNo();

    // Create movement header and items
    const result = await prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          movementNo,
          movementType: movementType as MovementType,
          status: 'pending',
          remarks: remarks || null,
          departmentId: req.departmentId || null,
          userId,
          items: {
            create: items.map((item: any) => ({
              stockDetailId: item.stockDetailId,
              productId: item.productId,
              quantity: item.quantity || 0,
              fromLocationId: item.fromLocationId || null,
              toLocationId: item.toLocationId || null,
              reason: item.reason || null,
            })),
          },
        },
        include: { items: { include: { product: true, stockDetail: true } }, user: true, department: true },
      });

      return movement;
    });

    await logAudit({
      userId,
      action: movementType.toUpperCase(),
      entityType: 'stock_movement',
      entityId: result.id,
      changes: { movementNo, movementType, itemCount: items.length },
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Update stock movement header (status, remarks only)
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { status, remarks, movementType } = req.body;
    const movementId = req.params.id;

    const oldMovement = await prisma.stockMovement.findUnique({
      where: { id: movementId },
      include: { department: true },
    });

    if (!oldMovement) return res.status(404).json({ error: 'Stock movement not found' });

    if (req.departmentId && oldMovement.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await prisma.stockMovement.update({
      where: { id: movementId },
      data: {
        status: status || oldMovement.status,
        remarks: remarks !== undefined ? remarks : oldMovement.remarks,
        movementType: movementType || oldMovement.movementType,
      },
      include: { items: { include: { product: true, stockDetail: true } }, user: true, department: true },
    });

    await logAudit({
      userId: req.userId!,
      action: 'UPDATE',
      entityType: 'stock_movement',
      entityId: movementId,
      changes: { status, remarks, movementType },
    });

    res.json(updated);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete stock movement
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const movement = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: { department: true },
    });

    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });

    if (req.departmentId && movement.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete cascade will handle items deletion
    await prisma.stockMovement.delete({
      where: { id: req.params.id },
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
        movementNo: true,
        movementType: true,
        status: true,
        remarks: true,
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

// Import stock movements from CSV
router.post('/import/csv', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.body.csv) {
      return res.status(400).json({ error: 'CSV data required' });
    }

    const rows = csvToJson<any>(req.body.csv);
    const created = [];
    const errors = [];
    const { generateMovementNo } = await import('../utils/idGenerator');

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const movementNo = await generateMovementNo();

        const movement = await prisma.stockMovement.create({
          data: {
            movementNo,
            movementType: row.movementType || 'stock_in',
            status: row.status || 'pending',
            remarks: row.remarks || null,
            departmentId: req.departmentId,
            userId: req.userId!,
          },
        });
        created.push(movement);

        await logAudit({
          userId: req.userId,
          action: 'STOCK_IN',
          entityType: 'stock_movement',
          entityId: movement.id,
          changes: { movementType: movement.movementType },
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
