import { Router, Response, NextFunction } from 'express';
import type { ItemStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import { AuthRequest, canAccessDepartment } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { generateStockId } from '../utils/idGenerator';

const router = Router();

const FINAL_STATUSES: ItemStatus[] = ['sold', 'disposed', 'lost'];

function pf<T>(incoming: T | undefined, fallback: T): T {
  return incoming ?? fallback;
}
function pfn(incoming: string | undefined, fallback: string | null): string | null {
  return incoming === undefined ? fallback : (incoming || null);
}
function pfDate(incoming: string | undefined, fallback: Date | null): Date | null {
  if (incoming === undefined) return fallback;
  return incoming ? new Date(incoming) : null;
}

function buildStockDetailData(body: any, existing: any): Record<string, any> {
  return {
    assetTag: pfn(body.assetTag, existing.assetTag),
    barcode: pfn(body.barcode, existing.barcode),
    modelNumber: pf(body.modelNumber, existing.modelNumber),
    serialNumber: pf(body.serialNumber, existing.serialNumber),
    macId: pf(body.macId, existing.macId),
    dateStock: pfDate(body.dateStock, existing.dateStock),
    condition: pf(body.condition, existing.condition),
    warrantyExpiry: pfDate(body.warrantyExpiry, existing.warrantyExpiry),
    warrantyNotes: pfn(body.warrantyNotes, existing.warrantyNotes),
    currentStatus: pf(body.currentStatus, existing.currentStatus),
    currentLocationId: pfn(body.currentLocationId, existing.currentLocationId),
    brand: pfn(body.brand, existing.brand),
    itemType: pfn(body.itemType, existing.itemType),
    custodian: pfn(body.custodian, existing.custodian),
    lastCheckedDate: pfDate(body.lastCheckedDate, existing.lastCheckedDate),
    checkedBy: pfn(body.checkedBy, existing.checkedBy),
    notes: pf(body.notes, existing.notes),
  };
}

async function recalculateProductStock(productId: string): Promise<void> {
  const count = await prisma.stockDetail.count({
    where: { productId, currentStatus: { notIn: FINAL_STATUSES } },
  });
  await prisma.product.update({ where: { id: productId }, data: { currentStock: count } });
}

// Get all stock details (optionally filter by department)
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 200);
    const skip = (page - 1) * limit;
    const search = (req.query.search as string)?.trim();
    const productId = req.query.productId as string;
    const status = req.query.status as string;
    const categoryId = req.query.categoryId as string;
    const locationId = req.query.locationId as string;

    let productFilter: any = { pendingApproval: false };
    if (req.departmentIds && req.departmentIds.length > 0) {
      productFilter = { departmentId: { in: req.departmentIds }, pendingApproval: false };
    } else if (req.departmentId) {
      productFilter = { departmentId: req.departmentId, pendingApproval: false };
    }
    if (categoryId) productFilter.categoryId = categoryId;

    let whereFilter: any = { product: productFilter };
    if (productId) whereFilter.productId = productId;
    if (status) whereFilter.currentStatus = status;
    if (locationId) whereFilter.currentLocationId = locationId;
    if (search) {
      whereFilter.OR = [
        { stockId: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
        { assetTag: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { custodian: { contains: search, mode: 'insensitive' } },
        { product: { ...productFilter, name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, stockDetails] = await Promise.all([
      prisma.stockDetail.count({ where: whereFilter }),
      prisma.stockDetail.findMany({
        where: whereFilter,
        include: { product: { include: { category: true, department: true } }, currentLocation: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({ data: stockDetails, total, page, limit });
  } catch (error) {
    next(error);
  }
});

// Get all stock details for a product
router.get('/product/:productId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Check department access
    if (req.departmentId && product.departmentId !== req.departmentId && product.departmentId !== null) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stockDetails = await prisma.stockDetail.findMany({
      where: { productId },
      include: { currentLocation: true, movementItems: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(stockDetails);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/deployment', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const record = await prisma.deployedStock.findFirst({
      where: { inventoryItemId: req.params.id },
      orderBy: { createdAt: 'desc' },
      select: { deploymentAddress: true, deploymentSiteName: true, deploymentLatitude: true, deploymentLongitude: true, deployedToName: true },
    });
    res.json(record || null);
  } catch (error) {
    next(error);
  }
});

// Get single stock detail
router.get('/by-status/:status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const where: any = { currentStatus: req.params.status };
    if (req.departmentId) where.product = { departmentId: req.departmentId };
    const items = await prisma.stockDetail.findMany({
      where,
      select: { id: true, stockId: true, productId: true, currentStatus: true, currentLocationId: true, currentLocation: { select: { name: true } }, assetTag: true },
    });
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stockDetail = await prisma.stockDetail.findUnique({
      where: { id: req.params.id },
      include: { product: { include: { category: true, department: true } }, currentLocation: true, movementItems: true },
    });

    if (!stockDetail) return res.status(404).json({ error: 'Stock detail not found' });

    if (!canAccessDepartment(req, stockDetail.product.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(stockDetail);
  } catch (error) {
    next(error);
  }
});

// Get movement history for a stock detail
router.get('/:id/movements', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stockDetail = await prisma.stockDetail.findUnique({
      where: { id: req.params.id },
      include: { product: true },
    });
    if (!stockDetail) return res.status(404).json({ error: 'Stock detail not found' });

    if (!canAccessDepartment(req, stockDetail.product.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const movements = await prisma.stockMovementItem.findMany({
      where: { stockDetailId: req.params.id },
      include: {
        movement: { include: { user: true } },
        fromLocation: true,
        toLocation: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(movements);
  } catch (error) {
    next(error);
  }
});

// Bulk verify — set lastCheckedDate = today for given IDs (or all accessible items)
router.post('/bulk-verify', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    const now = new Date();
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
    const checkedBy = user?.name || null;

    let whereClause: any = {};
    if (Array.isArray(ids) && ids.length > 0) {
      whereClause = { id: { in: ids } };
    } else if (req.departmentIds && req.departmentIds.length > 0) {
      whereClause = { product: { departmentId: { in: req.departmentIds } } };
    } else if (req.departmentId) {
      whereClause = { product: { departmentId: req.departmentId } };
    }

    const result = await prisma.stockDetail.updateMany({
      where: whereClause,
      data: { lastCheckedDate: now, checkedBy },
    });

    res.json({ count: result.count });
  } catch (error) {
    next(error);
  }
});

// Create stock detail
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId, modelNumber, serialNumber, macId, dateStock, currentStatus, currentLocationId, notes, assetTag, barcode, condition, warrantyExpiry, warrantyNotes, brand, itemType, custodian, lastCheckedDate, checkedBy } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Check department access
    if (req.departmentId && product.departmentId !== req.departmentId && product.departmentId !== null) {
      return res.status(403).json({ error: 'Access denied to this product' });
    }

    // Generate unique stockId
    const stockId = await generateStockId();

    const stockDetail = await prisma.stockDetail.create({
      data: {
        stockId,
        productId,
        assetTag: assetTag || null,
        barcode: barcode || null,
        modelNumber: modelNumber || null,
        serialNumber: serialNumber || null,
        macId: macId || null,
        dateStock: dateStock ? new Date(dateStock) : null,
        condition: condition || 'new',
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
        warrantyNotes: warrantyNotes || null,
        currentStatus: currentStatus || 'active',
        currentLocationId: currentLocationId || null,
        brand: brand || null,
        itemType: itemType || null,
        custodian: custodian || null,
        lastCheckedDate: lastCheckedDate ? new Date(lastCheckedDate) : null,
        checkedBy: checkedBy || null,
        notes: notes || null,
      },
      include: { product: { include: { category: true, department: true } }, currentLocation: true },
    });

    await recalculateProductStock(stockDetail.productId);

    await logAudit({
      userId: req.userId,
      action: 'CREATE',
      entityType: 'stock_detail',
      entityId: stockDetail.id,
      changes: { productId, serialNumber, modelNumber, stockId },
    });

    res.status(201).json(stockDetail);
  } catch (error) {
    next(error);
  }
});

// Update stock detail
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentStatus, modelNumber, serialNumber } = req.body;

    const stockDetail = await prisma.stockDetail.findUnique({
      where: { id: req.params.id },
      include: { product: true },
    });

    if (!stockDetail) return res.status(404).json({ error: 'Stock detail not found' });

    if (!canAccessDepartment(req, stockDetail.product.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await prisma.stockDetail.update({
      where: { id: req.params.id },
      data: buildStockDetailData(req.body, stockDetail),
      include: { product: { include: { category: true, department: true } }, currentLocation: true },
    });

    if (currentStatus !== undefined) {
      await recalculateProductStock(updated.productId);
    }

    await logAudit({
      userId: req.userId,
      action: 'UPDATE',
      entityType: 'stock_detail',
      entityId: updated.id,
      changes: { modelNumber, serialNumber, currentStatus },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete stock detail
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stockDetail = await prisma.stockDetail.findUnique({
      where: { id: req.params.id },
      include: { product: true },
    });

    if (!stockDetail) return res.status(404).json({ error: 'Stock detail not found' });

    if (!canAccessDepartment(req, stockDetail.product.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (stockDetail.currentStatus === 'disposed') {
      return res.status(409).json({ error: 'Stock detail is already disposed' });
    }

    await prisma.stockDetail.update({
      where: { id: req.params.id },
      data: { currentStatus: 'disposed' },
    });
    await recalculateProductStock(stockDetail.productId);

    await logAudit({
      userId: req.userId,
      action: 'DISPOSE',
      entityType: 'stock_detail',
      entityId: req.params.id,
      changes: { productId: stockDetail.productId, previousStatus: stockDetail.currentStatus },
    });

    res.json({ message: 'Stock detail disposed' });
  } catch (error) {
    next(error);
  }
});

export default router;
