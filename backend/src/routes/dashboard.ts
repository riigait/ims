import express, { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get dashboard stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [totalProducts, totalStock, lowStockCount, totalLocations, totalFloorPlans] =
      await Promise.all([
        prisma.product.count(),
        prisma.product.aggregate({
          _sum: { currentStock: true },
        }),
        prisma.product.count({
          where: {
            currentStock: {
              lte: prisma.product.fields.lowStockThreshold,
            },
          },
        }),
        prisma.location.count(),
        prisma.floorPlan.count(),
      ]);

    // Count low stock items manually
    const lowStockProducts = await prisma.product.findMany({
      where: {},
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
router.get('/recent-movements', async (req: Request, res: Response) => {
  try {
    const movements = await prisma.stockMovement.findMany({
      include: { product: true },
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
