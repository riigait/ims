import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    let departmentFilter: any = {};
    if (req.departmentIds && req.departmentIds.length > 0) {
      departmentFilter = {
        OR: [
          { departmentId: { in: req.departmentIds } },
          { departmentId: null },
        ],
      };
    } else if (req.userRole === 'admin' && req.departmentId && req.departmentId !== 'all-departments') {
      departmentFilter = { departmentId: req.departmentId };
    } else if (req.userRole === 'staff' && req.departmentId) {
      departmentFilter = { departmentId: req.departmentId };
    }

    const stockDetailFilter = Object.keys(departmentFilter).length > 0
      ? { product: departmentFilter }
      : {};

    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const unassignedLocation = await prisma.location.findFirst({
      where: { name: { contains: 'unassigned', mode: 'insensitive' } },
      select: { id: true },
    });

    const [
      totalProducts, totalStock, totalLocations, totalFloorPlans,
      allProducts, totalInventoryItems,
      itemStatusGroups, warrantyExpiringSoon,
      categoryGroups, locationGroups,
      missingDetailsCount,
    ] = await Promise.all([
      prisma.product.count({ where: departmentFilter }),
      prisma.product.aggregate({ _sum: { currentStock: true }, where: departmentFilter }),
      prisma.location.count({ where: departmentFilter }),
      prisma.floorPlan.count({ where: departmentFilter }),
      prisma.product.findMany({
        where: departmentFilter,
        select: { currentStock: true, lowStockThreshold: true, unitPrice: true, locationId: true },
      }),
      prisma.stockDetail.count({ where: stockDetailFilter }),
      prisma.stockDetail.groupBy({
        by: ['currentStatus'],
        where: stockDetailFilter,
        _count: { id: true },
      }),
      prisma.stockDetail.count({
        where: {
          ...stockDetailFilter,
          warrantyExpiry: { gte: now, lte: thirtyDaysFromNow },
          currentStatus: { notIn: ['sold', 'disposed', 'lost'] },
        },
      }),
      prisma.product.groupBy({
        by: ['categoryId'],
        where: departmentFilter,
        _count: { id: true },
        _sum: { currentStock: true },
        orderBy: { _count: { id: 'desc' } },
        take: 6,
      }),
      prisma.stockDetail.groupBy({
        by: ['currentLocationId'],
        where: { ...stockDetailFilter, currentLocationId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 6,
      }),
      prisma.stockDetail.count({
        where: {
          ...stockDetailFilter,
          currentStatus: { notIn: ['sold', 'disposed', 'lost'] },
          OR: [
            { assetTag: null },
            { assetTag: '' },
            { barcode: null },
            { barcode: '' },
            { serialNumber: null },
            { serialNumber: '' },
            { modelNumber: null },
            { modelNumber: '' },
            { warrantyExpiry: null },
            { currentLocationId: null },
            { macId: null },
            { macId: '' },
          ],
        },
      }),
    ]);

    const unassignedLocationCount = unassignedLocation
      ? allProducts.filter(p => p.locationId === unassignedLocation.id || !p.locationId).length
      : allProducts.filter(p => !p.locationId).length;
    const lowStockCount     = allProducts.filter(p => p.currentStock > 0 && p.currentStock <= p.lowStockThreshold).length;
    const outOfStockCount   = allProducts.filter(p => p.currentStock === 0).length;
    const negativeStockCount = allProducts.filter(p => p.currentStock < 0).length;
    const goodStockCount    = allProducts.filter(p => p.currentStock > p.lowStockThreshold).length;

    const totalInventoryValue = allProducts.reduce((sum, p) => {
      return sum + (p.currentStock > 0 && p.unitPrice ? p.currentStock * p.unitPrice : 0);
    }, 0);

    const statusMap: Record<string, number> = {};
    for (const g of itemStatusGroups) statusMap[g.currentStatus] = g._count.id;
    const itemsAvailable = statusMap['active'] || 0;
    const itemsInUse     = (statusMap['deployed'] || 0) + (statusMap['borrowed'] || 0);
    const itemsForRepair = (statusMap['under-repair'] || 0) + (statusMap['repair'] || 0) + (statusMap['damaged'] || 0);
    const itemsLost      = statusMap['lost'] || 0;

    const categoryIds = categoryGroups.map(c => c.categoryId);
    const categoryNames = categoryIds.length > 0
      ? await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
      : [];
    const categoryMap = Object.fromEntries(categoryNames.map(c => [c.id, c.name]));
    const categoryBreakdown = categoryGroups.map(g => ({
      name: categoryMap[g.categoryId] || 'Unknown',
      count: g._count.id,
      stock: g._sum.currentStock || 0,
    }));

    const locationIds = locationGroups
      .map(l => l.currentLocationId)
      .filter((id): id is string => id !== null);
    const locationNames = locationIds.length > 0
      ? await prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true } })
      : [];
    const locationMap = Object.fromEntries(locationNames.map(l => [l.id, l.name]));
    const locationBreakdown = locationGroups
      .filter(g => g.currentLocationId !== null)
      .map(g => ({
        name: locationMap[g.currentLocationId!] || 'Unknown',
        count: g._count.id,
      }));

    res.json({
      totalProducts,
      totalStock: totalStock._sum.currentStock || 0,
      totalInventoryItems,
      lowStockCount, outOfStockCount, negativeStockCount, goodStockCount,
      totalLocations, totalFloorPlans,
      unassignedLocationCount,
      unassignedLocationId: unassignedLocation?.id ?? null,
      missingDetailsCount,
      totalInventoryValue,
      itemsAvailable, itemsInUse, itemsForRepair, itemsLost,
      warrantyExpiringSoon,
      categoryBreakdown,
      locationBreakdown,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/recent-movements', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    let departmentFilter: any = {};
    if (req.departmentIds && req.departmentIds.length > 0) {
      departmentFilter = {
        OR: [
          { departmentId: { in: req.departmentIds } },
          { departmentId: null },
        ],
      };
    } else if (req.userRole === 'admin' && req.departmentId && req.departmentId !== 'all-departments') {
      departmentFilter = { departmentId: req.departmentId };
    } else if (req.userRole === 'staff' && req.departmentId) {
      departmentFilter = { departmentId: req.departmentId };
    }

    const movements = await prisma.stockMovement.findMany({
      include: {
        items: { include: { product: true } },
        user: { select: { name: true } },
      },
      where: departmentFilter,
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const formatted = movements.map((m) => ({
      ...m,
      products: m.items.map(item => item.product.name).join(', '),
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
