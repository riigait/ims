import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { generateStockId } from '../utils/idGenerator';

const router = Router();

// Get all stock details (optionally filter by department)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let whereFilter: any = {};
    if (req.departmentIds && req.departmentIds.length > 0) {
      whereFilter = { product: { departmentId: { in: req.departmentIds } } };
    } else if (req.departmentId) {
      whereFilter = { product: { departmentId: req.departmentId } };
    }
    const stockDetails = await prisma.stockDetail.findMany({
      where: whereFilter,
      include: { product: true, currentLocation: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(stockDetails);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all stock details for a product
router.get('/product/:productId', async (req: AuthRequest, res: Response) => {
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single stock detail
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const stockDetail = await prisma.stockDetail.findUnique({
      where: { id: req.params.id },
      include: { product: true, currentLocation: true, movementItems: true },
    });

    if (!stockDetail) return res.status(404).json({ error: 'Stock detail not found' });

    // Check department access
    if (req.departmentId && stockDetail.product.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(stockDetail);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get movement history for a stock detail
router.get('/:id/movements', async (req: AuthRequest, res: Response) => {
  try {
    const stockDetail = await prisma.stockDetail.findUnique({
      where: { id: req.params.id },
      include: { product: true },
    });
    if (!stockDetail) return res.status(404).json({ error: 'Stock detail not found' });

    if (req.departmentId && stockDetail.product.departmentId !== req.departmentId) {
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
      take: 20,
    });

    res.json(movements);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create stock detail
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { productId, modelNumber, serialNumber, macId, dateStock, currentStatus, currentLocationId, notes, assetTag, barcode, condition, warrantyExpiry, warrantyNotes } = req.body;

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
        notes: notes || null,
      },
      include: { product: true, currentLocation: true },
    });

    await logAudit({
      userId: req.userId,
      action: 'CREATE',
      entityType: 'stock_detail',
      entityId: stockDetail.id,
      changes: { productId, serialNumber, modelNumber, stockId },
    });

    res.status(201).json(stockDetail);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update stock detail
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { modelNumber, serialNumber, macId, dateStock, currentStatus, currentLocationId, notes, assetTag, barcode, condition, warrantyExpiry, warrantyNotes } = req.body;

    const stockDetail = await prisma.stockDetail.findUnique({
      where: { id: req.params.id },
      include: { product: true },
    });

    if (!stockDetail) return res.status(404).json({ error: 'Stock detail not found' });

    // Check department access
    if (req.departmentId && stockDetail.product.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await prisma.stockDetail.update({
      where: { id: req.params.id },
      data: {
        assetTag: assetTag !== undefined ? (assetTag || null) : stockDetail.assetTag,
        barcode: barcode !== undefined ? (barcode || null) : stockDetail.barcode,
        modelNumber: modelNumber !== undefined ? modelNumber : stockDetail.modelNumber,
        serialNumber: serialNumber !== undefined ? serialNumber : stockDetail.serialNumber,
        macId: macId !== undefined ? macId : stockDetail.macId,
        dateStock: dateStock !== undefined ? (dateStock ? new Date(dateStock) : null) : stockDetail.dateStock,
        condition: condition !== undefined ? condition : stockDetail.condition,
        warrantyExpiry: warrantyExpiry !== undefined ? (warrantyExpiry ? new Date(warrantyExpiry) : null) : stockDetail.warrantyExpiry,
        warrantyNotes: warrantyNotes !== undefined ? (warrantyNotes || null) : stockDetail.warrantyNotes,
        currentStatus: currentStatus !== undefined ? currentStatus : stockDetail.currentStatus,
        currentLocationId: currentLocationId !== undefined ? (currentLocationId || null) : stockDetail.currentLocationId,
        notes: notes !== undefined ? notes : stockDetail.notes,
      },
      include: { product: true, currentLocation: true },
    });

    await logAudit({
      userId: req.userId,
      action: 'UPDATE',
      entityType: 'stock_detail',
      entityId: updated.id,
      changes: { modelNumber, serialNumber, currentStatus },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete stock detail
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const stockDetail = await prisma.stockDetail.findUnique({
      where: { id: req.params.id },
      include: { product: true },
    });

    if (!stockDetail) return res.status(404).json({ error: 'Stock detail not found' });

    // Check department access
    if (req.departmentId && stockDetail.product.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.$transaction([
      prisma.stockDetail.delete({ where: { id: req.params.id } }),
      prisma.product.update({
        where: { id: stockDetail.productId },
        data: { currentStock: { decrement: 1 } },
      }),
    ]);

    await logAudit({
      userId: req.userId,
      action: 'DELETE',
      entityType: 'stock_detail',
      entityId: req.params.id,
      changes: { productId: stockDetail.productId },
    });

    res.json({ message: 'Stock detail deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
