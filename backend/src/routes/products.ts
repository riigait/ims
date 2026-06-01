import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { csvToJson, jsonToCsv } from '../utils/csv';
import { generateStockId, generateMovementNo, generateSku, generateRequestNo, generateImportBatchId } from '../utils/idGenerator';

const router = Router();

async function attachLiveProductLocations(products: any[]) {
  const productIds = products.map(product => product.id).filter(Boolean);
  if (productIds.length === 0) return products;

  const activeStockDetails = await prisma.stockDetail.findMany({
    where: {
      productId: { in: productIds },
      currentStatus: 'active',
    },
    select: {
      productId: true,
      currentLocationId: true,
      currentLocation: true,
    },
  });

  const locationsByProduct = new Map<string, Map<string, any>>();
  for (const detail of activeStockDetails) {
    const locationKey = detail.currentLocationId || '__unassigned__';
    if (!locationsByProduct.has(detail.productId)) {
      locationsByProduct.set(detail.productId, new Map());
    }
    locationsByProduct.get(detail.productId)!.set(locationKey, detail.currentLocation);
  }

  return products.map(product => {
    const activeLocations = locationsByProduct.get(product.id);
    if (!activeLocations) return product;

    if (activeLocations.size === 1) {
      const [[locationId, location]] = Array.from(activeLocations.entries());
      return {
        ...product,
        locationId: locationId === '__unassigned__' ? null : locationId,
        location,
      };
    }

    return { ...product, locationId: null, location: null };
  });
}

async function createOpeningStockForProduct(product: any, quantity: number, locationId: string | null, req: AuthRequest) {
  if (quantity <= 0) return;

  const movementNo = await generateMovementNo();
  const stockDetails = [];

  for (let i = 0; i < quantity; i++) {
    const stockId = await generateStockId();
    const detail = await prisma.stockDetail.create({
      data: {
        stockId,
        productId: product.id,
        currentStatus: 'active',
        currentLocationId: locationId || null,
      },
    });
    stockDetails.push(detail);
  }

  await prisma.stockMovement.create({
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
}

async function createDepartmentTransferMovement(
  product: any,
  fromDepartmentId: string | null,
  toDepartmentId: string,
  userId: string,
) {
  const movementNo = await generateMovementNo();
  const stockDetails = await prisma.stockDetail.findMany({ where: { productId: product.id } });
  if (stockDetails.length === 0) return;

  await prisma.stockMovement.create({
    data: {
      movementNo,
      movementType: 'moved_to_department',
      status: 'pending',
      remarks: `CSV re-import: department corrected`,
      departmentId: fromDepartmentId || null,
      toDepartmentId,
      userId,
      items: {
        create: stockDetails.map((detail) => ({
          stockDetailId: detail.id,
          productId: product.id,
          quantity: 1,
          reason: 'Department correction via CSV re-import',
        })),
      },
    },
  });
}

async function resolveImportLocationId(row: any, req: AuthRequest) {
  const rawLocation = row.locationId || row.LocationID || row.locationID || row.location || row.Location;
  const locationValue = typeof rawLocation === 'string' ? rawLocation.trim() : rawLocation;

  if (!locationValue) return null;

  const location = await prisma.location.findFirst({
    where: {
      OR: [
        { id: locationValue },
        { name: { equals: locationValue, mode: 'insensitive' } },
      ],
      ...(req.departmentId ? { departmentId: req.departmentId } : {}),
    },
  });

  if (!location) {
    throw new Error(`Location not found: ${locationValue}`);
  }

  return location.id;
}

async function resolveImportCategoryId(row: any, req: AuthRequest) {
  const rawCategory = row.categoryId || row.CategoryID || row.categoryID || row.category || row.Category;
  const categoryValue = typeof rawCategory === 'string' ? rawCategory.trim() : rawCategory;

  if (!categoryValue) {
    throw new Error('Category is required');
  }

  const category = await prisma.category.findFirst({
    where: {
      OR: [
        { id: categoryValue },
        { name: { equals: categoryValue, mode: 'insensitive' } },
      ],
      ...(req.departmentId ? { departmentId: req.departmentId } : {}),
    },
  });

  if (!category) {
    throw new Error(`Category not found: ${categoryValue}`);
  }

  return category.id;
}

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
        source: true,
        csvImportId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(await attachLiveProductLocations(products));
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
        source: true,
        csvImportId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Check department access if departmentId is set
    if (req.departmentId && product.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [productWithLiveLocation] = await attachLiveProductLocations([product]);
    res.json(productWithLiveLocation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get movement history for a product
router.get('/:id/movements', async (req: AuthRequest, res: Response) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    if (req.departmentId && product.departmentId !== req.departmentId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const movements = await prisma.stockMovementItem.findMany({
      where: { productId: req.params.id },
      include: {
        movement: { include: { user: { select: { name: true } } } },
        fromLocation: true,
        toLocation: true,
        stockDetail: { select: { stockId: true, assetTag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(movements);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk create products
router.post('/bulk', async (req: AuthRequest, res: Response) => {
  const { products: rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No products provided' });
  }

  const results: Array<{ index: number; success: boolean; name?: string; error?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = (row.name || '').trim();
      if (!name) {
        results.push({ index: i, success: false, error: 'Product name is required' });
        continue;
      }

      let sku = (row.sku || '').trim();
      if (!sku) {
        sku = await generateSku();
      } else {
        const existing = await prisma.product.findFirst({ where: { sku } });
        if (existing) {
          results.push({ index: i, success: false, name, error: `SKU "${sku}" already exists` });
          continue;
        }
      }

      const quantity = Math.max(0, parseInt(row.quantity) || 0);

      const product = await prisma.product.create({
        data: {
          sku,
          name,
          description: row.description || null,
          categoryId: row.categoryId || null,
          unit: row.unit || 'pcs',
          currentStock: quantity,
          lowStockThreshold: parseInt(row.lowStockThreshold) || 10,
          supplier: row.supplier || null,
          unitPrice: parseFloat(row.unitPrice) || 0,
          status: 'active',
          notes: row.notes || null,
          departmentId: req.departmentId || null,
        },
      });

      if (quantity > 0) {
        await createOpeningStockForProduct(product, quantity, row.locationId || null, req);
      }

      await logAudit({
        userId: req.userId,
        action: 'CREATE',
        entityType: 'product',
        entityId: product.id,
        changes: { sku, name, quantity },
      });

      results.push({ index: i, success: true, name });
    } catch (err: any) {
      results.push({ index: i, success: false, error: err?.message || 'Unexpected error' });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  res.json({ successCount, errorCount, results });
});

// Create product
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { sku, name, description, categoryId, locationId, unit, currentStock, lowStockThreshold, supplier, unitPrice, status, expiryDate, leadTimeDays, notes } = req.body;

    console.log(`[PRODUCT CREATE] Received request with currentStock: ${currentStock} (type: ${typeof currentStock}), userId: ${req.userId}`);

    if (!name || !categoryId) {
      return res.status(400).json({ error: 'name and categoryId are required' });
    }
    const generatedSku = sku || await generateSku();

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
        sku: generatedSku,
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
        source: 'manual',
      },
      include: { category: true, location: true, department: true },
    });

    // Create opening stock movement if currentStock > 0
    const stockValue = parseInt(currentStock) || 0;
    console.log(`[OPENING STOCK] Check: stockValue=${stockValue}, condition=${stockValue > 0}`);

    if (stockValue > 0) {
      try {

        console.log(`[OPENING STOCK] Creating opening stock for product ${product.id} with ${stockValue} units`);
        await createOpeningStockForProduct(product, stockValue, locationId || null, req);
      } catch (error: any) {
        console.error('[OPENING STOCK] FAILED:', error.message);
        console.error('[OPENING STOCK] Error code:', error.code);
        console.error('[OPENING STOCK] Full error:', error);
      }
    }

    await logAudit({ userId: req.userId, action: 'CREATE', entityType: 'product', entityId: product.id, changes: { name, sku, currentStock } });

    const requestNo = await generateRequestNo();
    await prisma.importRequest.create({
      data: {
        requestNo,
        type: 'product_add',
        status: 'pending',
        productIds: [product.id],
        label: `Added product: ${product.name} (${product.sku})`,
        submittedBy: req.userId!,
        departmentId: req.departmentId || null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

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
    const fileName = req.body.fileName || null;
    const created = [];
    const errors = [];

    const now = new Date();
    const csvImportId = await generateImportBatchId();

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const locationId = await resolveImportLocationId(row, req);
        const categoryId = await resolveImportCategoryId(row, req);
        const data = {
            sku: row.sku,
            name: row.name,
            description: row.description || null,
            categoryId,
            locationId,
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
            source: 'csv_import',
            csvImportId,
          } as any;
        // Match existing product: by id first, then by SKU, then by exact name
        const existing = row.id
          ? await prisma.product.findUnique({ where: { id: row.id } })
          : row.sku
          ? await prisma.product.findFirst({ where: { sku: row.sku } })
          : row.name
          ? await prisma.product.findFirst({ where: { name: { equals: row.name, mode: 'insensitive' } } })
          : null;
        const product = existing
          ? await prisma.product.update({ where: { id: existing.id }, data })
          : await prisma.product.create({ data: { ...(row.id ? { id: row.id } : {}), ...data } });

        if (!existing) {
          await createOpeningStockForProduct(product, data.currentStock, data.locationId, req);
        } else if (req.departmentId && existing.departmentId !== req.departmentId) {
          // Department changed on re-import — create a moved_to_department movement
          await createDepartmentTransferMovement(product, existing.departmentId, req.departmentId, req.userId!);
        }

        await logAudit({
          userId: req.userId,
          action: existing ? (req.departmentId && existing.departmentId !== req.departmentId ? 'MOVED_TO_DEPARTMENT' : 'UPDATE') : 'CREATE',
          entityType: 'product',
          entityId: product.id,
          changes: { name: row.name, sku: row.sku, currentStock: data.currentStock, source: 'csv_import', ...(existing && req.departmentId && existing.departmentId !== req.departmentId ? { fromDepartmentId: existing.departmentId, toDepartmentId: req.departmentId } : {}) },
        });

        created.push(product);
      } catch (err: any) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    const newProducts = created.filter((p: any) => p._isNew !== false);
    if (created.length > 0) {
      const batchRequestNo = await generateRequestNo();
      await prisma.importRequest.create({
        data: {
          requestNo: batchRequestNo,
          type: 'csv_import',
          status: 'pending',
          productIds: created.map((p: any) => p.id),
          csvImportId,
          label: `Item Imported CSV — ${fileName || 'import'} — ${now.toISOString().slice(0, 10)}`,
          submittedBy: req.userId!,
          departmentId: req.departmentId,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    res.json({
      created: created.length,
      csvImportId,
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
