import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { csvToJson, jsonToCsv } from '../utils/csv';

const router = Router();
const prisma = new PrismaClient();

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
    if (currentStock && currentStock > 0) {
      try {
        const { generateStockId, generateMovementNo } = await import('../utils/idGenerator.js');

        await prisma.$transaction(async (tx) => {
          // Create StockDetail entries for each unit of opening stock
          const stockDetails = [];
          for (let i = 0; i < currentStock; i++) {
            const stockId = await generateStockId();
            const detail = await tx.stockDetail.create({
              data: {
                stockId,
                productId: product.id,
                currentStatus: 'active',
                currentLocationId: locationId || null,
              },
            });
            stockDetails.push(detail);
          }

          // Create opening stock movement
          const movementNo = await generateMovementNo();
          await tx.stockMovement.create({
            data: {
              movementNo,
              movementType: 'adjustment',
              status: 'completed',
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
        });
      } catch (error) {
        console.error('Failed to create opening stock movement:', error);
      }
    }

    await logAudit({ userId: req.userId, action: 'CREATE', entityType: 'product', entityId: product.id, changes: { name, sku, currentStock } });
    res.status(201).json(product);
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

export default router;
