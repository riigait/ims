import express, { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get dashboard stats
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Filter by department for staff/admin with selected department, show all for superadmin
    let departmentFilter: any = {};
    if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
      departmentFilter = { departmentId: req.departmentId };
    }

    const [totalProducts, totalStock, lowStockCount, totalLocations, totalFloorPlans] =
      await Promise.all([
        prisma.product.count({ where: departmentFilter }),
        prisma.product.aggregate({
          _sum: { currentStock: true },
          where: departmentFilter,
        }),
        prisma.product.count({
          where: departmentFilter,
        }),
        prisma.location.count({ where: departmentFilter }),
        prisma.floorPlan.count({ where: departmentFilter }),
      ]);

    // Count low stock items manually
    const lowStockProducts = await prisma.product.findMany({
      where: departmentFilter,
    });
    const lowStockItems = lowStockProducts.filter(
      (p) => p.currentStock <= p.lowStockThreshold
    ).length;

    res.json({
      totalProducts,
      totalStock: totalStock._sum.currentStock || 0,
      lowStockCount: lowStockItems,
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
    const departmentFilter = req.departmentId ? { departmentId: req.departmentId } : {};

    const movements = await prisma.stockMovement.findMany({
      include: { product: true },
      where: departmentFilter,
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const formatted = movements.map((m) => ({
      ...m,
      productName: m.product.name,
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
