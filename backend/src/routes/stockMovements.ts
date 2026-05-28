import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { csvToJson, jsonToCsv } from '../utils/csv';
import { generateStockId, generateMovementNo } from '../utils/idGenerator';

const router = Router();

const VALID_MOVEMENT_TYPES = ['stock_in', 'stock_out', 'adjustment', 'transfer', 'damaged', 'returned', 'opening_stock', 'deployment', 'repair', 'disposal', 'borrowed', 'lost', 'moved_to_department'] as const;
type MovementType = typeof VALID_MOVEMENT_TYPES[number];

const DEDUCTING_TYPES: MovementType[] = ['stock_out', 'damaged', 'disposal', 'borrowed', 'lost', 'transfer'];
const ADDING_TYPES: MovementType[] = ['stock_in', 'returned', 'adjustment', 'opening_stock'];
const NEUTRAL_TYPES: MovementType[] = ['deployment', 'repair', 'moved_to_department'];

function stockDelta(type: MovementType, quantity: number): number {
  if (DEDUCTING_TYPES.includes(type)) return -quantity;
  if (NEUTRAL_TYPES.includes(type)) return 0;
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
          { toDepartmentId: { in: req.departmentIds } },
          { departmentId: null }
        ]
      };
    } else if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
      whereFilter = {
        OR: [
          { departmentId: req.departmentId },
          { toDepartmentId: req.departmentId },
          { departmentId: null }
        ]
      };
    }
    const movements = await prisma.stockMovement.findMany({
      where: whereFilter,
      include: { items: { include: { product: true, stockDetail: true, fromLocation: true, toLocation: true } }, user: true, department: true, toDepartment: true },
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
      include: { items: { include: { product: true, stockDetail: true, fromLocation: true, toLocation: true } }, user: true, department: true, toDepartment: true },
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
    const { movementType, remarks, items, toDepartmentId } = req.body;
    const userId = req.userId!;

    // Validate input
    if (!movementType || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'movementType and items array are required' });
    }

    if (movementType === 'moved_to_department' && !toDepartmentId) {
      return res.status(400).json({ error: 'toDepartmentId is required for moved_to_department' });
    }

    if (!VALID_MOVEMENT_TYPES.includes(movementType as MovementType)) {
      return res.status(400).json({
        error: `movementType must be one of: ${VALID_MOVEMENT_TYPES.join(', ')}`,
      });
    }

    // Validate deducting movements don't exceed available stock
    if (DEDUCTING_TYPES.includes(movementType as MovementType)) {
      const requested: Record<string, number> = {};
      for (const item of items) {
        if (item.productId && !item.stockDetailId) {
          requested[item.productId] = (requested[item.productId] || 0) + (item.quantity || 1);
        }
      }
      for (const [productId, qty] of Object.entries(requested)) {
        const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true, currentStock: true } });
        if (product && qty > product.currentStock) {
          return res.status(400).json({
            error: `Cannot stock out ${qty} item(s) of "${product.name}". Only ${product.currentStock} item(s) available.`,
          });
        }
      }
    }

    // Generate movement number
    const movementNo = await generateMovementNo();

    // Create movement header and items
    const result = await prisma.$transaction(async (tx) => {
      // Each processedItem = exactly 1 physical unit (qty always 1).
      // This ensures every StockDetail status is individually updated and
      // prevents the same unit being reused across rows within the transaction.
      const processedItems: Array<{
        stockDetailId: string; productId: string; quantity: number;
        fromLocationId: string | null; toLocationId: string | null; reason: string | null;
      }> = [];

      // Track IDs already committed in this transaction to avoid reuse
      const usedIds = new Set<string>();

      const statusMap: Record<string, string> = {
        stock_out: 'sold', damaged: 'damaged', disposal: 'disposed',
        borrowed: 'borrowed', lost: 'lost', transfer: 'sold',
      };

      for (const item of items) {
        const qty = item.quantity || 1;

        if (item.stockDetailId) {
          // Explicit unit selected by the user — always qty 1
          if (DEDUCTING_TYPES.includes(movementType as MovementType)) {
            await tx.stockDetail.update({
              where: { id: item.stockDetailId },
              data: {
                currentStatus: statusMap[movementType] ?? 'sold',
                currentLocationId: item.toLocationId || null,
              },
            });
          } else if (movementType === 'returned') {
            await tx.stockDetail.update({
              where: { id: item.stockDetailId },
              data: {
                currentStatus: 'active',
                currentLocationId: item.toLocationId || null,
              },
            });
          }
          usedIds.add(item.stockDetailId);
          processedItems.push({
            stockDetailId: item.stockDetailId,
            productId: item.productId,
            quantity: 1,
            fromLocationId: item.fromLocationId || null,
            toLocationId: item.toLocationId || null,
            reason: item.reason || null,
          });
        } else if (item.productId) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });

          if (DEDUCTING_TYPES.includes(movementType as MovementType)) {
            // Find and mark exactly `qty` individual active units, skipping already-used ones
            for (let i = 0; i < qty; i++) {
              const existing = await tx.stockDetail.findFirst({
                where: {
                  productId: item.productId,
                  currentStatus: 'active',
                  id: { notIn: [...usedIds] },
                  ...(item.fromLocationId ? { currentLocationId: item.fromLocationId } : {}),
                },
              });
              let unitId: string;
              if (existing) {
                unitId = existing.id;
                await tx.stockDetail.update({
                  where: { id: unitId },
                  data: {
                    currentStatus: statusMap[movementType] ?? 'sold',
                    currentLocationId: item.toLocationId || null,
                  },
                });
              } else {
                // No remaining active unit — create a phantom with correct status
                const stockId = await generateStockId();
                const phantom = await tx.stockDetail.create({
                  data: {
                    stockId,
                    productId: item.productId,
                    currentStatus: statusMap[movementType] ?? 'sold',
                    currentLocationId: item.toLocationId || product?.locationId || null,
                  },
                });
                unitId = phantom.id;
              }
              usedIds.add(unitId);
              processedItems.push({
                stockDetailId: unitId,
                productId: item.productId,
                quantity: 1,
                fromLocationId: item.fromLocationId || null,
                toLocationId: item.toLocationId || null,
                reason: item.reason || null,
              });
            }
          } else if (qty < 0 && movementType === 'adjustment') {
            // Negative adjustment — deduct |qty| existing active units
            const absQty = Math.abs(qty);
            for (let i = 0; i < absQty; i++) {
              const existing = await tx.stockDetail.findFirst({
                where: {
                  productId: item.productId,
                  currentStatus: 'active',
                  id: { notIn: [...usedIds] },
                  ...(item.fromLocationId ? { currentLocationId: item.fromLocationId } : {}),
                },
              });
              let unitId: string;
              if (existing) {
                unitId = existing.id;
                await tx.stockDetail.update({
                  where: { id: unitId },
                  data: { currentStatus: 'sold', currentLocationId: item.toLocationId || null },
                });
              } else {
                const stockId = await generateStockId();
                const phantom = await tx.stockDetail.create({
                  data: { stockId, productId: item.productId, currentStatus: 'sold', currentLocationId: item.toLocationId || product?.locationId || null },
                });
                unitId = phantom.id;
              }
              usedIds.add(unitId);
              processedItems.push({
                stockDetailId: unitId,
                productId: item.productId,
                quantity: -1,
                fromLocationId: item.fromLocationId || null,
                toLocationId: item.toLocationId || null,
                reason: item.reason || null,
              });
            }
          } else {
            // Adding / neutral — create one new active StockDetail per unit
            for (let i = 0; i < qty; i++) {
              const stockId = await generateStockId();
              const newDetail = await tx.stockDetail.create({
                data: {
                  stockId,
                  productId: item.productId,
                  currentStatus: 'active',
                  currentLocationId: item.toLocationId || product?.locationId || null,
                },
              });
              usedIds.add(newDetail.id);
              processedItems.push({
                stockDetailId: newDetail.id,
                productId: item.productId,
                quantity: 1,
                fromLocationId: item.fromLocationId || null,
                toLocationId: item.toLocationId || null,
                reason: item.reason || null,
              });
            }
          }
        }
      }

      const movement = await tx.stockMovement.create({
        data: {
          movementNo,
          movementType: movementType as MovementType,
          status: 'pending',
          remarks: remarks || null,
          departmentId: req.departmentId || null,
          toDepartmentId: toDepartmentId || null,
          userId,
          items: {
            create: processedItems,
          },
        },
        include: { items: { include: { product: true, stockDetail: true } }, user: true, department: true, toDepartment: true },
      });

      // Update currentStock for each affected product
      const productTotals = new Map<string, number>();
      for (const item of processedItems) {
        if (item.productId) {
          productTotals.set(item.productId, (productTotals.get(item.productId) ?? 0) + (item.quantity || 0));
        }
      }
      for (const [productId, totalQty] of productTotals) {
        const delta = stockDelta(movementType as MovementType, totalQty);
        await tx.product.update({
          where: { id: productId },
          data: { currentStock: { increment: delta } },
        });
      }

      // For moved_to_department: reassign all affected products to the destination department
      if (movementType === 'moved_to_department' && toDepartmentId) {
        const productIds = [...productTotals.keys()];
        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { departmentId: toDepartmentId },
        });
      }

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
      include: {
        items: {
          include: {
            stockDetail: {
              include: { _count: { select: { movementItems: true } } },
            },
          },
        },
        department: true,
      },
    });

    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });

    if (req.departmentId && movement.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const movementType = movement.movementType as MovementType;

    // Sum quantities per product across all items
    const productTotals = new Map<string, number>();
    for (const item of movement.items) {
      if (item.productId) {
        productTotals.set(item.productId, (productTotals.get(item.productId) ?? 0) + item.quantity);
      }
    }

    // StockDetails that only exist for this movement (count = 1) should be removed.
    // Those with other movement links existed before — keep them.
    const stockDetailIdsToDelete = movement.items
      .filter(item => item.stockDetail?._count?.movementItems === 1)
      .map(item => item.stockDetailId);

    await prisma.$transaction(async (tx) => {
      // Reverse the stock delta for each affected product
      for (const [productId, totalQty] of productTotals) {
        const reverseDelta = -stockDelta(movementType, totalQty);
        await tx.product.update({
          where: { id: productId },
          data: { currentStock: { increment: reverseDelta } },
        });
      }

      // Delete orphaned StockDetails (cascade removes their StockMovementItems too)
      if (stockDetailIdsToDelete.length > 0) {
        await tx.stockDetail.deleteMany({
          where: { id: { in: stockDetailIdsToDelete } },
        });
      }

      // Delete the movement (cascade removes any remaining StockMovementItems)
      await tx.stockMovement.delete({ where: { id: req.params.id } });
    });

    await logAudit({
      userId: req.userId!,
      action: 'DELETE',
      entityType: 'stock_movement',
      entityId: req.params.id,
      changes: { reason: 'Stock movement deleted', movementType, affectedProducts: productTotals.size, removedStockDetails: stockDetailIdsToDelete.length },
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
    const { generateMovementNo } = await import('../utils/idGenerator.js');

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
