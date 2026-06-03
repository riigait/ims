import { Router, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, canAccessDepartment } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { csvToJson, jsonToCsv } from '../utils/csv';
import { generateStockId, generateMovementNo, generateSku, generateRequestNo, generateImportBatchId } from '../utils/idGenerator';

const router = Router();

interface ProductWriteBody {
  sku?: string;
  name?: string;
  description?: string | null;
  categoryId?: string;
  locationId?: string | null;
  unit?: string;
  currentStock?: number | string;
  lowStockThreshold?: number | string;
  supplier?: string | null;
  unitPrice?: number | string | null;
  status?: string;
  expiryDate?: string | null;
  leadTimeDays?: number | string | null;
  notes?: string | null;
}

function validateProductWrite(body: ProductWriteBody, isCreate: boolean): string | null {
  if (isCreate && (typeof body.name !== 'string' || !body.name.trim())) return 'name is required';
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 200)) return 'name must be a string under 200 characters';
  if (typeof body.categoryId !== 'string' || !body.categoryId.trim()) return 'categoryId is required';
  if (body.currentStock !== undefined && (isNaN(Number(body.currentStock)) || Number(body.currentStock) < 0)) return 'currentStock must be a non-negative number';
  if (body.lowStockThreshold !== undefined && (isNaN(Number(body.lowStockThreshold)) || Number(body.lowStockThreshold) < 0)) return 'lowStockThreshold must be a non-negative number';
  if (body.unitPrice !== undefined && body.unitPrice !== null && body.unitPrice !== '' && isNaN(Number(body.unitPrice))) return 'unitPrice must be a number';
  return null;
}

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
      status: 'committed',
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
      status: 'committed',
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

  // Clear old-department locations from all items so they don't remain linked to stale locations
  await prisma.stockDetail.updateMany({
    where: { productId: product.id },
    data: { currentLocationId: null },
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
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 200);
    const skip = (page - 1) * limit;
    const search = (req.query.search as string)?.trim();
    const categoryId = req.query.categoryId as string;
    const qLocationId = req.query.locationId as string;
    const status = req.query.status as string;
    const unit = req.query.unit as string;
    const source = req.query.source as string;
    const csvImportId = req.query.csvImportId as string;
    const stockStatus = req.query.stockStatus as string;
    const qDepartmentId = req.query.departmentId as string;
    const orderByField = req.query.orderBy as string || 'createdAt';
    const orderDir: 'asc' | 'desc' = (req.query.orderDir as string) === 'asc' ? 'asc' : 'desc';

    // Base department scope (from token)
    let baseFilter: any = { pendingApproval: false };
    if (req.departmentIds && req.departmentIds.length > 0) {
      baseFilter = { pendingApproval: false, OR: [{ departmentId: { in: req.departmentIds } }, { departmentId: null }] };
    } else if (req.departmentId) {
      baseFilter = { pendingApproval: false, departmentId: req.departmentId };
    }
    if (qDepartmentId && !req.departmentId) baseFilter = { ...baseFilter, departmentId: qDepartmentId };

    // Build field filters on top of base
    let whereFilter: any = { ...baseFilter };
    if (search) whereFilter.AND = [{ OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] }];
    if (categoryId) whereFilter.categoryId = categoryId;
    if (qLocationId === '__UNASSIGNED__') whereFilter.locationId = null;
    else if (qLocationId) whereFilter.locationId = qLocationId;
    if (status) whereFilter.status = status;
    if (unit) whereFilter.unit = unit;
    if (source) whereFilter.source = source;
    if (csvImportId) whereFilter.csvImportId = csvImportId;
    if (stockStatus === 'out-of-stock') whereFilter.currentStock = 0;
    if (stockStatus === 'negative-stock') whereFilter.currentStock = { lt: 0 };

    const orderByMap: Record<string, any> = {
      name: { name: orderDir }, sku: { sku: orderDir }, stock: { currentStock: orderDir },
      date: { createdAt: orderDir }, createdAt: { createdAt: orderDir }, 'low-stock': { currentStock: 'asc' },
    };
    const orderBy = orderByMap[orderByField] || { createdAt: 'desc' };

    const selectFields = {
      id: true, sku: true, name: true, description: true, categoryId: true, category: true,
      departmentId: true, department: true, unit: true, currentStock: true, lowStockThreshold: true,
      locationId: true, location: true, supplier: true, unitPrice: true, status: true,
      expiryDate: true, leadTimeDays: true, notes: true, source: true, csvImportId: true,
      createdAt: true, updatedAt: true,
    };

    const [total, products, activeCount, discontinuedCount, obsoleteCount, backorderCount, outOfStockCount, negativeStockCount] = await Promise.all([
      prisma.product.count({ where: whereFilter }),
      prisma.product.findMany({ where: whereFilter, select: selectFields, orderBy, skip, take: limit }),
      prisma.product.count({ where: { ...baseFilter, status: 'active' } }),
      prisma.product.count({ where: { ...baseFilter, status: 'discontinued' } }),
      prisma.product.count({ where: { ...baseFilter, status: 'obsolete' } }),
      prisma.product.count({ where: { ...baseFilter, status: 'on-backorder' } }),
      prisma.product.count({ where: { ...baseFilter, currentStock: 0 } }),
      prisma.product.count({ where: { ...baseFilter, currentStock: { lt: 0 } } }),
    ]);

    res.json({
      data: await attachLiveProductLocations(products),
      total,
      page,
      limit,
      stats: { active: activeCount, discontinued: discontinuedCount, obsolete: obsoleteCount, backorder: backorderCount, outOfStock: outOfStockCount, negativeStock: negativeStockCount },
    });
  } catch (error) {
    next(error);
  }
});

// Get product by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id, pendingApproval: false },
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

    if (!canAccessDepartment(req, product.departmentId, true)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [productWithLiveLocation] = await attachLiveProductLocations([product]);
    res.json(productWithLiveLocation);
  } catch (error) {
    next(error);
  }
});

// Get movement history for a product
router.get('/:id/movements', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    if (!canAccessDepartment(req, product.departmentId, true)) {
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
    next(error);
  }
});

// Bulk create products
router.post('/bulk', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const validationError = validateProductWrite(req.body as ProductWriteBody, true);
    const { sku, name, description, categoryId, locationId, unit, currentStock, lowStockThreshold, supplier, unitPrice, status, expiryDate, leadTimeDays, notes } = req.body;
    if (validationError) return res.status(400).json({ error: validationError });
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

    if (stockValue > 0) {
      try {
        await createOpeningStockForProduct(product, stockValue, locationId || null, req);
      } catch {
        // Opening stock failure does not abort product creation
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
    next(error);
  }
});

// Update product — currentStock excluded; use stock movements to change stock levels
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    if (!canAccessDepartment(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const validationError = validateProductWrite(req.body as ProductWriteBody, false);
    const { sku, name, description, categoryId, locationId, unit, lowStockThreshold, supplier, unitPrice, status, expiryDate, leadTimeDays, notes } = req.body;
    if (validationError) return res.status(400).json({ error: validationError });

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
    next(error);
  }
});

// Delete product (admin only)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Staff must submit a delete request instead' });
    }

    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    if (!canAccessDepartment(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.product.delete({ where: { id: req.params.id } });
    await logAudit({ userId: req.userId, action: 'DELETE', entityType: 'product', entityId: req.params.id });
    res.json({ message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
});

// Export products as CSV
router.get('/export/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    next(error);
  }
});

// Import products from CSV
router.post('/import/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
            pendingApproval: true,
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
    next(error);
  }
});

// DEBUG: Create opening stock for a product (test endpoint)
router.post('/:id/create-opening-stock', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { quantity } = req.body;
    const productId = req.params.id;

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
    }

    const movement = await prisma.stockMovement.create({
      data: {
        movementNo,
        movementType: 'adjustment',
        status: 'committed',
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

    res.json({ success: true, movement });
  } catch (error: any) {
    next(error);
  }
});

export default router;
