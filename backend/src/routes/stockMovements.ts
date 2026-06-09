import { Router, Response, NextFunction } from 'express';
import type { MovementType, MovementStatus, ItemStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import { AuthRequest, canAccessDepartment } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { csvToJson, jsonToCsv } from '../utils/csv';
import { generateStockId, generateMovementNo, generateSku } from '../utils/idGenerator';

const router = Router();

const VALID_MOVEMENT_TYPES = ['stock_in', 'stock_out', 'adjustment', 'borrowed', 'returned', 'lost', 'found', 'transfer', 'moved_to_department', 'pre_deployment', 'post_deployment', 'repair_out', 'repair_return', 'damaged', 'defective', 'disposal', 'opening_stock'] as const;

const DEDUCTING_TYPES: MovementType[] = ['stock_out', 'damaged', 'defective', 'disposal', 'borrowed', 'lost', 'pre_deployment', 'repair_out'];
const ADDING_TYPES: MovementType[] = ['stock_in', 'returned', 'found', 'adjustment', 'opening_stock', 'post_deployment', 'repair_return'];
const NEUTRAL_TYPES: MovementType[] = ['transfer', 'moved_to_department'];
const STATUS_ONLY_TYPES: MovementType[] = [];
const RESTORING_TYPES: Partial<Record<MovementType, ItemStatus>> = { returned: 'borrowed', found: 'lost', post_deployment: 'deployed', repair_return: 'repair' };

function canViewMovement(req: AuthRequest, movement: { departmentId: string | null; toDepartmentId?: string | null }) {
  return canAccessDepartment(req, movement.departmentId, true)
    || canAccessDepartment(req, movement.toDepartmentId);
}

function canModifyMovement(req: AuthRequest, movement: { departmentId: string | null }) {
  return canAccessDepartment(req, movement.departmentId);
}

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

function validateStockMovementInput(body: {
  movementType?: string;
  items?: any[];
  toDepartmentId?: string;
  deploymentLatitude?: any;
  deploymentLongitude?: any;
}): void {
  const { movementType, items, toDepartmentId, deploymentLatitude, deploymentLongitude } = body;
  if (!movementType || !items || !Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('movementType and items array are required'), { status: 400 });
  }
  if (movementType === 'moved_to_department' && !toDepartmentId) {
    throw Object.assign(new Error('toDepartmentId is required for moved_to_department'), { status: 400 });
  }
  if (movementType === 'moved_to_department' && items.some((item: any) => !item.toLocationId)) {
    throw Object.assign(new Error('New location is required for moved_to_department'), { status: 400 });
  }
  if (movementType === 'pre_deployment') {
    validateCoordinate(deploymentLatitude, 'deploymentLatitude', -90, 90);
    validateCoordinate(deploymentLongitude, 'deploymentLongitude', -180, 180);
  }
  if (!VALID_MOVEMENT_TYPES.includes(movementType as MovementType)) {
    throw Object.assign(new Error(`movementType must be one of: ${VALID_MOVEMENT_TYPES.join(', ')}`), { status: 400 });
  }
  if ((movementType === 'returned' || movementType === 'found') && items.some((item: any) => !item.stockDetailId && (!item.productId || item.quantity <= 0))) {
    throw Object.assign(new Error(`${movementType === 'returned' ? 'Returned' : 'Found'} movements must select an inventory item or enter a product quantity.`), { status: 400 });
  }
}

function validateCoordinate(value: unknown, field: string, min: number, max: number): void {
  if (value === undefined || value === null || value === '') return;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw Object.assign(new Error(`${field} must be between ${min} and ${max}`), { status: 400 });
  }
}

async function checkStockAvailability(movementType: string, items: any[]): Promise<void> {
  if (!DEDUCTING_TYPES.includes(movementType as MovementType) && movementType !== 'adjustment') return;
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
      throw Object.assign(new Error(`Cannot stock out ${qty} item(s) of "${product.name}". Only ${product.currentStock} item(s) available.`), { status: 400 });
    }
  }
}

// Get all stock movements
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 200);
    const skip = (page - 1) * limit;
    const search = (req.query.search as string)?.trim();
    const movementType = req.query.movementType as string;
    const movementStatus = req.query.movementStatus as string;
    const qDepartmentId = req.query.departmentId as string;

    let deptFilter: any = {};
    if (req.departmentIds && req.departmentIds.length > 0) {
      deptFilter = { OR: [{ departmentId: { in: req.departmentIds } }, { toDepartmentId: { in: req.departmentIds } }, { departmentId: null }] };
    } else if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
      deptFilter = { OR: [{ departmentId: req.departmentId }, { toDepartmentId: req.departmentId }, { departmentId: null }] };
    }
    if (qDepartmentId) deptFilter = { ...deptFilter, departmentId: qDepartmentId };

    let whereFilter: any = { ...deptFilter, items: { none: { product: { pendingApproval: true } } } };
    if (movementType) whereFilter.movementType = movementType;
    if (movementStatus) whereFilter.status = movementStatus;
    if (search) {
      whereFilter.OR = [
        { movementNo: { contains: search, mode: 'insensitive' } },
        { remarks: { contains: search, mode: 'insensitive' } },
        { items: { some: { product: { name: { contains: search, mode: 'insensitive' } } } } },
        { items: { some: { stockDetail: { stockId: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    const listInclude = {
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, unit: true } },
          stockDetail: { select: { id: true, stockId: true, serialNumber: true, assetTag: true, currentStatus: true } },
          fromLocation: { select: { id: true, name: true } },
          toLocation: { select: { id: true, name: true } },
        },
      },
      user: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      toDepartment: { select: { id: true, name: true } },
    };

    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where: whereFilter }),
      prisma.stockMovement.findMany({ where: whereFilter, include: listInclude, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    ]);

    res.json({ data: movements, total, page, limit });
  } catch (error) {
    next(error);
  }
});

// Get stock movement by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const movement = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true, stockDetail: true, fromLocation: true, toLocation: true } }, user: true, department: true, toDepartment: true },
    });
    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });

    if (!canViewMovement(req, movement)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(movement);
  } catch (error) {
    next(error);
  }
});

// Create stock movement with items
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
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

    validateStockMovementInput(req.body);
    await checkStockAvailability(movementType, items);

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

      // Track IDs already committed in this transaction to avoid reuse.
      // Pre-seed with all explicitly specified stockDetailIds so random pickers never steal them.
      const usedIds = new Set<string>(
        items.filter((it: any) => it.stockDetailId).map((it: any) => it.stockDetailId)
      );
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

      const statusMap: Record<string, ItemStatus> = {
        stock_out: 'sold', damaged: 'damaged', disposal: 'disposed',
        borrowed: 'borrowed', lost: 'lost', pre_deployment: 'deployed', repair_out: 'repair', defective: 'defective',
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
          if (movementType !== 'found' && item.fromLocationId && existing.currentLocationId !== item.fromLocationId) {
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
              const labelMap: Partial<Record<MovementType, string>> = { returned: 'Returned', post_deployment: 'Post Deployment', repair_return: 'Repair Return', found: 'Found' };
              throw new Error(`${labelMap[movementType as MovementType] ?? movementType} movements require an item currently marked ${expectedStatus}.`);
            }
            await tx.stockDetail.update({
              where: { id: item.stockDetailId },
              data: {
                currentStatus: 'active',
                currentLocationId: item.toLocationId || null,
              },
            });
          } else if (movementType === 'adjustment' && qty < 0) {
            if (existing.currentStatus !== 'active') {
              throw new Error('Cannot update item status. The selected item is not active.');
            }
            await tx.stockDetail.update({
              where: { id: item.stockDetailId },
              data: { currentStatus: 'sold', currentLocationId: item.toLocationId || null },
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
            quantity: STATUS_ONLY_TYPES.includes(movementType as MovementType) ? 0 : qty < 0 ? -1 : 1,
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
            const expectedStatus = RESTORING_TYPES[movementType as MovementType];
            const movementLabel = movementType === 'returned' ? 'returned' : 'found';
            for (let i = 0; i < qty; i++) {
              const existing = await tx.stockDetail.findFirst({
                where: {
                  productId: item.productId,
                  currentStatus: expectedStatus!,
                  id: { notIn: [...usedIds] },
                },
                orderBy: { createdAt: 'desc' },
              });
              if (!existing) {
                throw new Error(`Cannot mark ${qty} item(s) as ${movementLabel}. Only ${i} ${expectedStatus} item(s) available for this product.`);
              }
              await tx.stockDetail.update({
                where: { id: existing.id },
                data: {
                  currentStatus: 'active',
                  currentLocationId: item.toLocationId || null,
                },
              });
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

      if (movementType === 'pre_deployment') {
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
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

// Update stock movement header — pending only; remarks + status transition only
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, remarks } = req.body;
    const movementId = req.params.id;

    const oldMovement = await prisma.stockMovement.findUnique({
      where: { id: movementId },
      include: { department: true },
    });

    if (!oldMovement) return res.status(404).json({ error: 'Stock movement not found' });
    if (!canModifyMovement(req, oldMovement)) return res.status(403).json({ error: 'Access denied' });

    if (oldMovement.status !== 'pending') {
      return res.status(409).json({ error: 'Only pending movements can be edited. Create a reversal to undo a committed movement.' });
    }

    // Only allow pending → committed or pending → cancelled status transitions
    const allowedTransitions: MovementStatus[] = ['committed', 'cancelled'];
    if (status !== undefined && status !== 'pending' && !allowedTransitions.includes(status as MovementStatus)) {
      return res.status(400).json({ error: 'Invalid status transition. Allowed: committed, cancelled.' });
    }

    const updated = await prisma.stockMovement.update({
      where: { id: movementId },
      data: {
        ...(status !== undefined && { status: status as MovementStatus }),
        ...(remarks !== undefined && { remarks }),
      },
      include: { items: { include: { product: true, stockDetail: true } }, user: true, department: true },
    });

    await logAudit({
      userId: req.userId!,
      action: 'UPDATE',
      entityType: 'stock_movement',
      entityId: movementId,
      changes: { status, remarks },
    });

    res.json(updated);
  } catch (error: any) {
    next(error);
  }
});

// Reverse a committed movement — creates a new committed movement that undoes all effects
router.post('/:id/reverse', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const movement = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: {
        items: {
          include: {
            stockDetail: { include: { _count: { select: { movementItems: true } } } },
          },
        },
        department: true,
      },
    });

    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });
    if (!canModifyMovement(req, movement)) return res.status(403).json({ error: 'Access denied' });
    if (movement.status !== 'committed') {
      return res.status(409).json({ error: 'Only committed movements can be reversed.' });
    }

    const reason: string = req.body.reason || '';
    const movementType = movement.movementType;
    const reversalNo = await generateMovementNo();

    const reversal = await prisma.$transaction(async (tx) => {
      const rev = await tx.stockMovement.create({
        data: {
          movementNo: reversalNo,
          movementType: 'adjustment',
          status: 'committed',
          remarks: `Reversal of ${movement.movementNo ?? movement.id}${reason ? ': ' + reason : ''}`,
          departmentId: movement.departmentId,
          userId: req.userId!,
        },
      });

      for (const item of movement.items) {
        const stockDetail = item.stockDetail;
        if (!stockDetail) continue;

        // Determine status to restore
        let newStatus: ItemStatus | null = null;
        if (DEDUCTING_TYPES.includes(movementType)) {
          // Items were deducted and their status was changed → restore to active
          newStatus = 'active';
        } else if (RESTORING_TYPES[movementType]) {
          // Items were restored to active from a stored status → revert back
          newStatus = RESTORING_TYPES[movementType]!;
        } else if (ADDING_TYPES.includes(movementType)) {
          // Items were added; if this is their only movement record, deactivate them
          if ((stockDetail._count?.movementItems ?? 0) <= 1) {
            newStatus = 'disposed';
          }
        }
        // NEUTRAL_TYPES: no status change; location will be restored below

        // Reverse the stock count delta
        const delta = stockDelta(movementType, item.quantity);
        if (delta !== 0 && item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { increment: -delta } },
          });
        }

        // Restore StockDetail status if needed
        if (newStatus !== null) {
          await tx.stockDetail.update({
            where: { id: item.stockDetailId },
            data: {
              currentStatus: newStatus,
              // Restore location for neutral movements (transfer/moved_to_department)
              ...(NEUTRAL_TYPES.includes(movementType) && item.fromLocationId
                ? { currentLocationId: item.fromLocationId }
                : {}),
            },
          });
        } else if (NEUTRAL_TYPES.includes(movementType) && item.fromLocationId) {
          await tx.stockDetail.update({
            where: { id: item.stockDetailId },
            data: { currentLocationId: item.fromLocationId },
          });
        }

        // Create reversal StockMovementItem (reversed from/to locations)
        await tx.stockMovementItem.create({
          data: {
            movementId: rev.id,
            stockDetailId: item.stockDetailId,
            productId: item.productId,
            quantity: item.quantity,
            fromLocationId: item.toLocationId,
            toLocationId: item.fromLocationId,
            reason: reason || 'Reversal',
          },
        });
      }

      return rev;
    });

    await logAudit({
      userId: req.userId!,
      action: 'REVERSAL',
      entityType: 'stock_movement',
      entityId: movement.id,
      changes: { originalMovementNo: movement.movementNo, reversalMovementNo: reversalNo, reason },
    });

    res.status(201).json({ message: 'Movement reversed successfully', reversalMovementNo: reversalNo, reversalId: reversal.id });
  } catch (error: any) {
    next(error);
  }
});

// Delete stock movement
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    if (!canModifyMovement(req, movement)) return res.status(403).json({ error: 'Access denied' });
    if (movement.status !== 'pending') {
      return res.status(409).json({ error: 'Only pending movements can be cancelled. Use POST /:id/reverse for committed movements.' });
    }

    const movementType = movement.movementType;
    const reason = (req.body?.reason as string) || '';

    // Sum quantities per product across all items
    const productTotals = new Map<string, number>();
    for (const item of movement.items) {
      if (item.productId) {
        productTotals.set(item.productId, (productTotals.get(item.productId) ?? 0) + item.quantity);
      }
    }

    // StockDetails that only exist for this movement (count = 1) should be disposed.
    const orphanedDetailIds = movement.items
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

      // Soft-dispose orphaned StockDetails instead of hard-deleting
      if (orphanedDetailIds.length > 0) {
        await tx.stockDetail.updateMany({
          where: { id: { in: orphanedDetailIds } },
          data: { currentStatus: 'disposed' },
        });
      }

      // Cancel the movement (keep for audit trail)
      await tx.stockMovement.update({
        where: { id: req.params.id },
        data: {
          status: 'cancelled',
          remarks: [movement.remarks, reason ? `Cancelled: ${reason}` : 'Cancelled'].filter(Boolean).join(' | '),
        },
      });
    });

    await logAudit({
      userId: req.userId!,
      action: 'CANCEL',
      entityType: 'stock_movement',
      entityId: req.params.id,
      changes: { reason, movementType, affectedProducts: productTotals.size, disposedStockDetails: orphanedDetailIds.length },
    });

    res.json({ message: 'Stock movement cancelled' });
  } catch (error: any) {
    next(error);
  }
});

// Export stock movements as CSV
router.get('/export/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    next(error);
  }
});

// Import stock movements from CSV
router.post('/import/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.body.csv) {
      return res.status(400).json({ error: 'CSV data required' });
    }

    const rows = csvToJson<Record<string, string>>(req.body.csv);
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
            movementType: (row.movementType || 'stock_in') as MovementType,
            status: (row.status || 'pending') as MovementStatus,
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
      } catch (err: unknown) {
        errors.push({ row: i + 1, error: err instanceof Error ? err.message : String(err) });
      }
    }

    res.json({
      created: created.length,
      errors: errors,
      message: `Imported ${created.length} stock movements${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
