import express, { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Get dashboard stats
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Filter by department for staff/admin with selected department, show all for superadmin
    let departmentFilter: any = {};
    // For multiple departments (staff/admin viewing "all-departments")
    if (req.departmentIds && req.departmentIds.length > 0) {
      // Include items with null departmentId
      departmentFilter = {
        OR: [
          { departmentId: { in: req.departmentIds } },
          { departmentId: null }
        ]
      };
    }
    // For admins: if single department selected, filter by specific department
    else if (req.userRole === 'admin' && req.departmentId && req.departmentId !== 'all-departments') {
      departmentFilter = { departmentId: req.departmentId };
    }
    // For staff: always filter by their assigned department
    else if (req.userRole === 'staff' && req.departmentId) {
      departmentFilter = { departmentId: req.departmentId };
    }
    // For superadmin or admin/staff with "all-departments": no filter, show all

    const [totalProducts, totalStock, totalLocations, totalFloorPlans, allProducts, totalInventoryItems] =
      await Promise.all([
        prisma.product.count({ where: departmentFilter }),
        prisma.product.aggregate({
          _sum: { currentStock: true },
          where: departmentFilter,
        }),
        prisma.location.count({ where: departmentFilter }),
        prisma.floorPlan.count({ where: departmentFilter }),
        prisma.product.findMany({
          where: departmentFilter,
          select: { currentStock: true, lowStockThreshold: true },
        }),
        prisma.stockDetail.count({
          where: Object.keys(departmentFilter).length > 0
            ? { product: departmentFilter }
            : {},
        }),
      ]);

    const lowStockCount  = allProducts.filter(p => p.currentStock > 0 && p.currentStock <= p.lowStockThreshold).length;
    const outOfStockCount    = allProducts.filter(p => p.currentStock === 0).length;
    const negativeStockCount = allProducts.filter(p => p.currentStock < 0).length;
    const goodStockCount     = allProducts.filter(p => p.currentStock > p.lowStockThreshold).length;

    res.json({
      totalProducts,
      totalStock: totalStock._sum.currentStock || 0,
      totalInventoryItems,
      lowStockCount,
      outOfStockCount,
      negativeStockCount,
      goodStockCount,
      totalLocations,
      totalFloorPlans,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent movements
router.get('/recent-movements', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // For admins with "all-departments" or superadmin: no filter. Otherwise filter by specific department
    let departmentFilter: any = {};
    if (req.departmentIds && req.departmentIds.length > 0) {
      // Include movements with null departmentId
      departmentFilter = {
        OR: [
          { departmentId: { in: req.departmentIds } },
          { departmentId: null }
        ]
      };
    } else if (req.userRole === 'admin' && req.departmentId && req.departmentId !== 'all-departments') {
      departmentFilter = { departmentId: req.departmentId };
    } else if (req.userRole === 'staff' && req.departmentId) {
      departmentFilter = { departmentId: req.departmentId };
    }
    // For superadmin or admin/staff with "all-departments": no filter

    const movements = await prisma.stockMovement.findMany({
      include: { items: { include: { product: true } } },
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
