import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { generateStockId } from '../utils/idGenerator';

const router = Router();
const prisma = new PrismaClient();

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

// Create stock detail
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { productId, modelNumber, serialNumber, macId, dateStock, currentStatus, currentLocationId, notes } = req.body;

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
        modelNumber: modelNumber || null,
        serialNumber: serialNumber || null,
        macId: macId || null,
        dateStock: dateStock ? new Date(dateStock) : null,
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
    const { modelNumber, serialNumber, macId, dateStock, currentStatus, currentLocationId, notes } = req.body;

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
        modelNumber: modelNumber !== undefined ? modelNumber : stockDetail.modelNumber,
        serialNumber: serialNumber !== undefined ? serialNumber : stockDetail.serialNumber,
        macId: macId !== undefined ? macId : stockDetail.macId,
        dateStock: dateStock ? new Date(dateStock) : stockDetail.dateStock,
        currentStatus: currentStatus !== undefined ? currentStatus : stockDetail.currentStatus,
        currentLocationId: currentLocationId !== undefined ? currentLocationId : stockDetail.currentLocationId,
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

    await prisma.stockDetail.delete({ where: { id: req.params.id } });

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
