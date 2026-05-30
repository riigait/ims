import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { csvToJson, jsonToCsv } from '../utils/csv';
import { generateStockId, generateMovementNo, generateSku } from '../utils/idGenerator';

const router = Router();

const VALID_MOVEMENT_TYPES = ['stock_in', 'stock_out', 'adjustment', 'transfer', 'damaged', 'returned', 'found', 'opening_stock', 'deployment', 'repair', 'disposal', 'borrowed', 'lost', 'moved_to_department'] as const;
type MovementType = typeof VALID_MOVEMENT_TYPES[number];

const DEDUCTING_TYPES: MovementType[] = ['stock_out', 'damaged', 'disposal', 'borrowed', 'lost'];
const ADDING_TYPES: MovementType[] = ['stock_in', 'returned', 'found', 'adjustment', 'opening_stock'];
const NEUTRAL_TYPES: MovementType[] = ['transfer', 'deployment', 'repair', 'moved_to_department'];
const STATUS_ONLY_TYPES: MovementType[] = ['deployment', 'repair'];
const RESTORING_TYPES: Partial<Record<MovementType, string>> = { returned: 'borrowed', found: 'lost' };

function stockDelta(type: MovementType, quantity: number): number {
  if (DEDUCTING_TYPES.includes(type)) return -quantity;
  if (NEUTRAL_TYPES.includes(type)) return 0;
  return quantity; // ADDING_TYPES
}

function incrementStockId(stockId: string): string {
  const match = stockId.match(/STK-(\d+)/);
  if (!match) return 'STK-000001';

  const nextNum = parseInt(match[1]) + 1;
  return `STK-${String(nextNum).padStart(6, '0')}`;
}

function incrementSku(sku: string): string {
  const match = sku.match(/SKU-(\d+)/);
  if (!match) return 'SKU-000001';

  const nextNum = parseInt(match[1]) + 1;
  return `SKU-${String(nextNum).padStart(6, '0')}`;
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
    const {
      movementType,
      remarks,
      items,
      toDepartmentId,
      deploymentSiteName,
      deploymentAddress,
      deploymentLatitude,
      deploymentLongitude,
      deployedToName,
      deploymentNotes,
    } = req.body;
    const userId = req.userId!;

    // Validate input
    if (!movementType || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'movementType and items array are required' });
    }

    if (movementType === 'moved_to_department' && !toDepartmentId) {
      return res.status(400).json({ error: 'toDepartmentId is required for moved_to_department' });
    }

    if (movementType === 'moved_to_department' && items.some((item: any) => !item.toLocationId)) {
      return res.status(400).json({ error: 'New location is required for moved_to_department' });
    }

    if (movementType === 'deployment') {
      if (items.some((item: any) => !item.stockDetailId)) {
        return res.status(400).json({ error: 'Deployment requires selecting a specific inventory item' });
      }
      if (deploymentLatitude !== undefined && deploymentLatitude !== null && deploymentLatitude !== '') {
        const latitude = Number(deploymentLatitude);
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
          return res.status(400).json({ error: 'deploymentLatitude must be between -90 and 90' });
        }
      }
      if (deploymentLongitude !== undefined && deploymentLongitude !== null && deploymentLongitude !== '') {
        const longitude = Number(deploymentLongitude);
        if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
          return res.status(400).json({ error: 'deploymentLongitude must be between -180 and 180' });
        }
      }
    }

    if (!VALID_MOVEMENT_TYPES.includes(movementType as MovementType)) {
      return res.status(400).json({
        error: `movementType must be one of: ${VALID_MOVEMENT_TYPES.join(', ')}`,
      });
    }

    if ((movementType === 'returned' || movementType === 'found') && items.some((item: any) => !item.stockDetailId)) {
      return res.status(400).json({
        error: `${movementType === 'returned' ? 'Returned' : 'Found'} movements must select the original inventory item so the stock ID is preserved.`,
      });
    }

    // Validate movements that remove available stock don't exceed current stock
    if (DEDUCTING_TYPES.includes(movementType as MovementType) || movementType === 'adjustment') {
      const requested: Record<string, number> = {};
      for (const item of items) {
        if (!item.productId || item.stockDetailId) continue;

        const qty = item.quantity || 1;
        const requestedQty = movementType === 'adjustment' ? Math.max(0, -qty) : qty;
        if (requestedQty > 0) {
          requested[item.productId] = (requested[item.productId] || 0) + requestedQty;
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
      const generatedStockIds = new Set<string>();
      const generatedSkus = new Set<string>();
      const departmentTransferTotals = new Map<string, { destinationProductId: string; quantity: number }>();

      const nextStockId = async () => {
        let stockId = await generateStockId();
        while (
          generatedStockIds.has(stockId) ||
          await tx.stockDetail.findUnique({ where: { stockId }, select: { id: true } })
        ) {
          stockId = incrementStockId(stockId);
        }
        generatedStockIds.add(stockId);
        return stockId;
      };

      const nextSku = async () => {
        let sku = await generateSku();
        while (
          generatedSkus.has(sku) ||
          await tx.product.findUnique({ where: { sku }, select: { id: true } })
        ) {
          sku = incrementSku(sku);
        }
        generatedSkus.add(sku);
        return sku;
      };

      const findOrCreateDestinationProduct = async (sourceProduct: any, toLocationId: string | null) => {
        if (!toDepartmentId) throw new Error('toDepartmentId is required for moved_to_department');

        let categoryId = sourceProduct.categoryId;
        if (sourceProduct.category) {
          let destinationCategory = await tx.category.findFirst({
            where: { name: sourceProduct.category.name, departmentId: toDepartmentId },
          });
          if (!destinationCategory) {
            destinationCategory = await tx.category.create({
              data: {
                name: sourceProduct.category.name,
                description: sourceProduct.category.description || null,
                departmentId: toDepartmentId,
              },
            });
          }
          categoryId = destinationCategory.id;
        }

        const existingDestinationProduct = await tx.product.findFirst({
          where: {
            name: sourceProduct.name,
            categoryId,
            departmentId: toDepartmentId,
          },
        });
        if (existingDestinationProduct) return existingDestinationProduct;

        return tx.product.create({
          data: {
            sku: await nextSku(),
            name: sourceProduct.name,
            description: sourceProduct.description,
            categoryId,
            departmentId: toDepartmentId,
            unit: sourceProduct.unit,
            currentStock: 0,
            lowStockThreshold: sourceProduct.lowStockThreshold,
            locationId: toLocationId,
            supplier: sourceProduct.supplier,
            unitPrice: sourceProduct.unitPrice,
            status: sourceProduct.status,
            expiryDate: sourceProduct.expiryDate,
            leadTimeDays: sourceProduct.leadTimeDays,
            notes: sourceProduct.notes,
            source: 'department_transfer',
          },
        });
      };

      const trackDepartmentTransfer = (sourceProductId: string, destinationProductId: string) => {
        const current = departmentTransferTotals.get(sourceProductId);
        departmentTransferTotals.set(sourceProductId, {
          destinationProductId,
          quantity: (current?.quantity ?? 0) + 1,
        });
      };

      const statusMap: Record<string, string> = {
        stock_out: 'sold', damaged: 'damaged', disposal: 'disposed',
        borrowed: 'borrowed', lost: 'lost', deployment: 'deployed', repair: 'repair',
      };

      for (const item of items) {
        const qty = item.quantity || 1;

        if (item.stockDetailId) {
          // Explicit unit selected by the user — always qty 1
          const existing = await tx.stockDetail.findUnique({
            where: { id: item.stockDetailId },
          });
          if (!existing || existing.productId !== item.productId) {
            throw new Error('Selected inventory item does not match the selected product.');
          }
          if (item.fromLocationId && existing.currentLocationId !== item.fromLocationId) {
            throw new Error('Selected inventory item is not in the source location.');
          }

          if (movementType === 'transfer') {
            if (existing.currentStatus !== 'active') {
              throw new Error('Cannot transfer an item that is not active in the source location.');
            }
            await tx.stockDetail.update({
              where: { id: item.stockDetailId },
              data: { currentLocationId: item.toLocationId || null },
            });
          } else if (movementType === 'moved_to_department') {
            if (existing.currentStatus !== 'active') {
              throw new Error('Only active inventory items can be transferred to another department.');
            }
            const sourceProduct = await tx.product.findUnique({
              where: { id: existing.productId },
              include: { category: true },
            });
            if (!sourceProduct) {
              throw new Error('Product not found for selected inventory item.');
            }
            if (item.toLocationId) {
              const toLocation = await tx.location.findUnique({ where: { id: item.toLocationId }, select: { departmentId: true } });
              if (!toLocation || toLocation.departmentId !== toDepartmentId) {
                throw new Error('New location must belong to the destination department.');
              }
            }
            const destinationProduct = await findOrCreateDestinationProduct(sourceProduct, item.toLocationId || null);
            await tx.stockDetail.update({
              where: { id: item.stockDetailId },
              data: {
                productId: destinationProduct.id,
                currentLocationId: item.toLocationId || null,
              },
            });
            trackDepartmentTransfer(sourceProduct.id, destinationProduct.id);
          } else if (RESTORING_TYPES[movementType as MovementType]) {
            const expectedStatus = RESTORING_TYPES[movementType as MovementType];
            if (existing.currentStatus !== expectedStatus) {
              throw new Error(`${movementType === 'returned' ? 'Returned' : 'Found'} movements require an item currently marked ${expectedStatus}.`);
            }
            await tx.stockDetail.update({
              where: { id: item.stockDetailId },
              data: {
                currentStatus: 'active',
                currentLocationId: item.toLocationId || null,
              },
            });
          } else if (DEDUCTING_TYPES.includes(movementType as MovementType) || STATUS_ONLY_TYPES.includes(movementType as MovementType)) {
            if (existing.currentStatus !== 'active') {
              throw new Error('Cannot update item status. The selected item is not active in the source location.');
            }
            await tx.stockDetail.update({
              where: { id: item.stockDetailId },
              data: {
                currentStatus: statusMap[movementType] ?? 'sold',
                currentLocationId: item.toLocationId || (STATUS_ONLY_TYPES.includes(movementType as MovementType) ? existing.currentLocationId : null),
              },
            });
          }
          usedIds.add(item.stockDetailId);
          processedItems.push({
            stockDetailId: item.stockDetailId,
            productId: item.productId,
            quantity: 1,
            fromLocationId: item.fromLocationId || existing.currentLocationId || null,
            toLocationId: item.toLocationId || null,
            reason: item.reason || null,
          });
        } else if (item.productId) {
          const product = await tx.product.findUnique({ where: { id: item.productId }, include: { category: true } });

          if (movementType === 'transfer') {
            for (let i = 0; i < qty; i++) {
              const existing = await tx.stockDetail.findFirst({
                where: {
                  productId: item.productId,
                  currentStatus: 'active',
                  id: { notIn: [...usedIds] },
                  ...(item.fromLocationId ? { currentLocationId: item.fromLocationId } : {}),
                },
                orderBy: { createdAt: 'desc' },
              });
              if (!existing) {
                throw new Error(`Cannot transfer ${qty} item(s). Only ${i} active item(s) available in the source location.`);
              }
              await tx.stockDetail.update({
                where: { id: existing.id },
                data: { currentLocationId: item.toLocationId || null },
              });
              usedIds.add(existing.id);
              processedItems.push({
                stockDetailId: existing.id,
                productId: item.productId,
                quantity: STATUS_ONLY_TYPES.includes(movementType as MovementType) ? 0 : 1,
                fromLocationId: item.fromLocationId || null,
                toLocationId: item.toLocationId || null,
                reason: item.reason || null,
              });
            }
          } else if (movementType === 'moved_to_department') {
            if (!product) {
              throw new Error('Product not found.');
            }
            for (let i = 0; i < qty; i++) {
              const existing = await tx.stockDetail.findFirst({
                where: {
                  productId: item.productId,
                  currentStatus: 'active',
                  id: { notIn: [...usedIds] },
                  ...(item.fromLocationId ? { currentLocationId: item.fromLocationId } : {}),
                },
                orderBy: { createdAt: 'desc' },
              });
              if (!existing) {
                throw new Error(`Cannot transfer ${qty} item(s). Only ${i} active item(s) available in the source department.`);
              }
              if (item.toLocationId) {
                const toLocation = await tx.location.findUnique({ where: { id: item.toLocationId }, select: { departmentId: true } });
                if (!toLocation || toLocation.departmentId !== toDepartmentId) {
                  throw new Error('New location must belong to the destination department.');
                }
              }
              const destinationProduct = await findOrCreateDestinationProduct(product, item.toLocationId || null);
              await tx.stockDetail.update({
                where: { id: existing.id },
                data: {
                  productId: destinationProduct.id,
                  currentLocationId: item.toLocationId || null,
                },
              });
              trackDepartmentTransfer(product.id, destinationProduct.id);
              usedIds.add(existing.id);
              processedItems.push({
                stockDetailId: existing.id,
                productId: item.productId,
                quantity: 1,
                fromLocationId: item.fromLocationId || existing.currentLocationId || null,
                toLocationId: item.toLocationId || null,
                reason: item.reason || null,
              });
            }
          } else if (RESTORING_TYPES[movementType as MovementType]) {
            throw new Error(`${movementType === 'returned' ? 'Returned' : 'Found'} movements must select the original inventory item so the stock ID is preserved.`);
          } else if (DEDUCTING_TYPES.includes(movementType as MovementType) || STATUS_ONLY_TYPES.includes(movementType as MovementType)) {
            // Find and mark exactly `qty` individual active units, skipping already-used ones
            for (let i = 0; i < qty; i++) {
              const existing = await tx.stockDetail.findFirst({
                where: {
                  productId: item.productId,
                  currentStatus: 'active',
                  id: { notIn: [...usedIds] },
                  ...(item.fromLocationId ? { currentLocationId: item.fromLocationId } : {}),
                },
                orderBy: { createdAt: 'desc' },
              });
              let unitId: string;
              if (existing) {
                unitId = existing.id;
                await tx.stockDetail.update({
                  where: { id: unitId },
                  data: {
                    currentStatus: statusMap[movementType] ?? 'sold',
                    currentLocationId: item.toLocationId || (STATUS_ONLY_TYPES.includes(movementType as MovementType) ? existing.currentLocationId : null),
                  },
                });
              } else {
                throw new Error(`Cannot stock out ${qty} item(s). Only ${i} active item(s) available.`);
              }
              usedIds.add(unitId);
              processedItems.push({
                stockDetailId: unitId,
                productId: item.productId,
                quantity: STATUS_ONLY_TYPES.includes(movementType as MovementType) ? 0 : 1,
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
                orderBy: { createdAt: 'desc' },
              });
              let unitId: string;
              if (existing) {
                unitId = existing.id;
                await tx.stockDetail.update({
                  where: { id: unitId },
                  data: { currentStatus: 'sold', currentLocationId: item.toLocationId || null },
                });
              } else {
                throw new Error(`Cannot stock out ${absQty} item(s). Only ${i} active item(s) available.`);
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
              const stockId = await nextStockId();
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

      if (movementType === 'deployment') {
        const latitudeValue = deploymentLatitude !== undefined && deploymentLatitude !== null && deploymentLatitude !== '' ? Number(deploymentLatitude) : null;
        const longitudeValue = deploymentLongitude !== undefined && deploymentLongitude !== null && deploymentLongitude !== '' ? Number(deploymentLongitude) : null;

        for (const item of processedItems) {
          const stockDetail = await tx.stockDetail.findUnique({
            where: { id: item.stockDetailId },
            select: { stockId: true, productId: true },
          });
          if (!stockDetail?.stockId) {
            throw new Error('Selected deployment item has no stock ID.');
          }

          await tx.deployedStock.create({
            data: {
              stockId: stockDetail.stockId,
              inventoryItemId: item.stockDetailId,
              productId: stockDetail.productId,
              deployedToName: deployedToName || null,
              deploymentSiteName: deploymentSiteName || null,
              deploymentAddress: deploymentAddress || null,
              deploymentLatitude: latitudeValue,
              deploymentLongitude: longitudeValue,
              notes: deploymentNotes || remarks || null,
              createdByUserId: userId,
            },
          });
        }
      }

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

      if (movementType === 'transfer') {
        for (const productId of productTotals.keys()) {
          const activeLocations = await tx.stockDetail.findMany({
            where: { productId, currentStatus: 'active' },
            distinct: ['currentLocationId'],
            select: { currentLocationId: true },
          });
          await tx.product.update({
            where: { id: productId },
            data: {
              locationId: activeLocations.length === 1 ? activeLocations[0].currentLocationId : null,
            },
          });
        }
      }

      // For moved_to_department, move only the selected units into a destination product.
      if (movementType === 'moved_to_department' && toDepartmentId) {
        const destinationProductIds = new Set<string>();
        for (const [sourceProductId, transfer] of departmentTransferTotals) {
          destinationProductIds.add(transfer.destinationProductId);

          await tx.product.update({
            where: { id: sourceProductId },
            data: { currentStock: { decrement: transfer.quantity } },
          });
          await tx.product.update({
            where: { id: transfer.destinationProductId },
            data: { currentStock: { increment: transfer.quantity } },
          });

          const sourceLocations = await tx.stockDetail.findMany({
            where: { productId: sourceProductId, currentStatus: 'active' },
            distinct: ['currentLocationId'],
            select: { currentLocationId: true },
          });
          await tx.product.update({
            where: { id: sourceProductId },
            data: {
              locationId: sourceLocations.length === 1 ? sourceLocations[0].currentLocationId : null,
            },
          });
        }

        for (const destinationProductId of destinationProductIds) {
          const destinationLocations = await tx.stockDetail.findMany({
            where: { productId: destinationProductId, currentStatus: 'active' },
            distinct: ['currentLocationId'],
            select: { currentLocationId: true },
          });
          await tx.product.update({
            where: { id: destinationProductId },
            data: {
              locationId: destinationLocations.length === 1 ? destinationLocations[0].currentLocationId : null,
            },
          });
        }
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
