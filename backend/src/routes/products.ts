import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { csvToJson, jsonToCsv } from '../utils/csv';
import { generateStockId, generateMovementNo } from '../utils/idGenerator';

const router = Router();

// Get all products
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    // For admins without a selected department, fetch all products they have access to
    // For staff, only fetch products from their department(s)
    // For superadmins, fetch all products
    let whereFilter: any = {};

    if (req.departmentIds && req.departmentIds.length > 0) {
      // Staff viewing all assigned departments - include products with null departmentId
      whereFilter = {
        OR: [
          { departmentId: { in: req.departmentIds } },
          { departmentId: null }
        ]
      };
    } else if (req.departmentId) {
      // Single department filter (staff or admin with selected department)
      whereFilter = { departmentId: req.departmentId };
    }
    // For superadmin or admin/staff without selected department: no filter (show all)

    const products = await prisma.product.findMany({
      where: whereFilter,
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        categoryId: true,
        category: true,
        departmentId: true,
        department: true,
        unit: true,
        currentStock: true,
        lowStockThreshold: true,
        locationId: true,
        location: true,
        supplier: true,
        unitPrice: true,
        status: true,
        expiryDate: true,
        leadTimeDays: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        categoryId: true,
        category: true,
        departmentId: true,
        department: true,
        unit: true,
        currentStock: true,
        lowStockThreshold: true,
        locationId: true,
        location: true,
        supplier: true,
        unitPrice: true,
        status: true,
        expiryDate: true,
        leadTimeDays: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Check department access if departmentId is set
    if (req.departmentId && product.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create product
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { sku, name, description, categoryId, locationId, unit, currentStock, lowStockThreshold, supplier, unitPrice, status, expiryDate, leadTimeDays, notes } = req.body;

    console.log(`[PRODUCT CREATE] Received request with currentStock: ${currentStock} (type: ${typeof currentStock}), userId: ${req.userId}`);

    if (!sku || !name || !categoryId) {
      return res.status(400).json({ error: 'sku, name, and categoryId are required' });
    }

    // Verify category exists and is accessible
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    if (req.departmentId && category.departmentId !== req.departmentId && category.departmentId !== null) {
      return res.status(403).json({ error: 'Access denied to this category' });
    }

    // Verify location if provided
    if (locationId) {
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }
      if (req.departmentId && location.departmentId !== req.departmentId && location.departmentId !== null) {
        return res.status(403).json({ error: 'Access denied to this location' });
      }
    }

    const product = await prisma.product.create({
      data: {
        sku,
        name,
        description,
        categoryId,
        locationId: locationId || null,
        departmentId: req.departmentId,
        unit: unit || 'pcs',
        currentStock: currentStock || 0,
        lowStockThreshold: lowStockThreshold || 10,
        supplier: supplier || null,
        unitPrice: unitPrice !== null && unitPrice !== undefined && unitPrice !== '' ? parseFloat(unitPrice) : null,
        status: status || 'active',
        expiryDate: expiryDate && expiryDate !== '' ? new Date(expiryDate) : null,
        leadTimeDays: leadTimeDays !== null && leadTimeDays !== undefined && leadTimeDays !== '' ? parseInt(leadTimeDays) : null,
        notes: notes || null,
      },
      include: { category: true, location: true, department: true },
    });

    // Create opening stock movement if currentStock > 0
    const stockValue = parseInt(currentStock) || 0;
    console.log(`[OPENING STOCK] Check: stockValue=${stockValue}, condition=${stockValue > 0}`);

    if (stockValue > 0) {
      try {

        console.log(`[OPENING STOCK] Creating opening stock for product ${product.id} with ${stockValue} units`);

        const movementNo = await generateMovementNo();

        // Create StockDetail entries one at a time so each generateStockId sees the previous record
        const stockDetails = [];
        for (let i = 0; i < stockValue; i++) {
          const stockId = await generateStockId();
          const detail = await prisma.stockDetail.create({
            data: {
              stockId,
              productId: product.id,
              currentStatus: 'active',
              currentLocationId: locationId || null,
            },
          });
          console.log(`[OPENING STOCK] Created stock detail: ${detail.id} with stockId ${detail.stockId}`);
          stockDetails.push(detail);
        }

        // Create opening stock movement
        const movement = await prisma.stockMovement.create({
          data: {
            movementNo,
            movementType: 'opening_stock',
            status: 'pending',
            remarks: 'Opening stock',
            departmentId: req.departmentId || null,
            userId: req.userId!,
            items: {
              create: stockDetails.map((detail) => ({
                stockDetailId: detail.id,
                productId: product.id,
                quantity: 1,
                fromLocationId: null,
                toLocationId: locationId || null,
                reason: 'Opening stock',
              })),
            },
          },
        });
        console.log(`[OPENING STOCK] Created opening stock movement: ${movement.id} with movementNo ${movement.movementNo}`);
      } catch (error: any) {
        console.error('[OPENING STOCK] FAILED:', error.message);
        console.error('[OPENING STOCK] Error code:', error.code);
        console.error('[OPENING STOCK] Full error:', error);
      }
    }

    await logAudit({ userId: req.userId, action: 'CREATE', entityType: 'product', entityId: product.id, changes: { name, sku, currentStock } });

    res.status(201).json({
      ...product,
      _needsOpeningStock: false,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product — currentStock excluded; use stock movements to change stock levels
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Check department access for staff
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    if (req.userRole === 'staff' && existing.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { sku, name, description, categoryId, locationId, unit, lowStockThreshold, supplier, unitPrice, status, expiryDate, leadTimeDays, notes } = req.body;

    if (!categoryId) {
      return res.status(400).json({ error: 'categoryId is required' });
    }

    // Verify category exists and is accessible
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    if (req.departmentId && category.departmentId !== req.departmentId && category.departmentId !== null) {
      return res.status(403).json({ error: 'Access denied to this category' });
    }

    // Verify location if provided
    if (locationId) {
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }
      if (req.departmentId && location.departmentId !== req.departmentId && location.departmentId !== null) {
        return res.status(403).json({ error: 'Access denied to this location' });
      }
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        sku,
        name,
        description,
        categoryId,
        locationId: locationId || null,
        unit,
        lowStockThreshold,
        supplier: supplier || null,
        unitPrice: unitPrice !== null && unitPrice !== undefined && unitPrice !== '' ? parseFloat(unitPrice) : null,
        status: status || 'active',
        expiryDate: expiryDate && expiryDate !== '' ? new Date(expiryDate) : null,
        leadTimeDays: leadTimeDays !== null && leadTimeDays !== undefined && leadTimeDays !== '' ? parseInt(leadTimeDays) : null,
        notes: notes || null,
      },
      include: { category: true, location: true, department: true },
    });

    await logAudit({ userId: req.userId, action: 'UPDATE', entityType: 'product', entityId: product.id, changes: { name, sku } });
    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product (admin only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Staff must submit a delete request instead' });
    }

    await prisma.product.delete({ where: { id: req.params.id } });
    await logAudit({ userId: req.userId, action: 'DELETE', entityType: 'product', entityId: req.params.id });
    res.json({ message: 'Product deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export products as CSV
router.get('/export/csv', async (req: AuthRequest, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        categoryId: true,
        unit: true,
        currentStock: true,
        lowStockThreshold: true,
        locationId: true,
        supplier: true,
        unitPrice: true,
        status: true,
        expiryDate: true,
        leadTimeDays: true,
        notes: true,
      },
    });

    const csv = jsonToCsv(products);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to export products' });
  }
});

// Import products from CSV
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
        const product = await prisma.product.create({
          data: {
            sku: row.sku,
            name: row.name,
            description: row.description || null,
            categoryId: row.categoryId,
            locationId: row.locationId || null,
            departmentId: req.departmentId,
            unit: row.unit || 'pcs',
            currentStock: parseInt(row.currentStock) || 0,
            lowStockThreshold: parseInt(row.lowStockThreshold) || 10,
            supplier: row.supplier || null,
            unitPrice: row.unitPrice ? parseFloat(row.unitPrice) : null,
            status: row.status || 'active',
            expiryDate: row.expiryDate ? new Date(row.expiryDate) : null,
            leadTimeDays: row.leadTimeDays ? parseInt(row.leadTimeDays) : null,
            notes: row.notes || null,
          },
        });
        created.push(product);
      } catch (err: any) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    res.json({
      created: created.length,
      errors: errors,
      message: `Imported ${created.length} products${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to import products' });
  }
});

// DEBUG: Create opening stock for a product (test endpoint)
router.post('/:id/create-opening-stock', async (req: AuthRequest, res: Response) => {
  try {
    const { quantity } = req.body;
    const productId = req.params.id;

    console.log(`[DEBUG] Creating opening stock for product ${productId} with quantity ${quantity}`);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const { generateStockId, generateMovementNo } = await import('../utils/idGenerator.js');

    const stockIds: string[] = [];
    for (let i = 0; i < quantity; i++) {
      stockIds.push(await generateStockId());
    }
    const movementNo = await generateMovementNo();

    console.log(`[DEBUG] Generated movement: ${movementNo}, stocks: ${stockIds.join(',')}`);

    const stockDetails = [];
    for (const stockId of stockIds) {
      const detail = await prisma.stockDetail.create({
        data: {
          stockId,
          productId,
          currentStatus: 'active',
          currentLocationId: product.locationId || null,
        },
      });
      stockDetails.push(detail);
      console.log(`[DEBUG] Created stock detail: ${detail.stockId}`);
    }

    const movement = await prisma.stockMovement.create({
      data: {
        movementNo,
        movementType: 'adjustment',
        status: 'pending',
        remarks: 'Opening stock',
        departmentId: product.departmentId || null,
        userId: req.userId!,
        items: {
          create: stockDetails.map((detail) => ({
            stockDetailId: detail.id,
            productId,
            quantity: 1,
            fromLocationId: null,
            toLocationId: product.locationId || null,
            reason: 'Opening stock',
          })),
        },
      },
      include: { items: true },
    });

    console.log(`[DEBUG] Created movement ${movement.movementNo} with ${movement.items.length} items`);
    res.json({ success: true, movement });
  } catch (error: any) {
    console.error('[DEBUG] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
