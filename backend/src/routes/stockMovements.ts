import express, { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all stock movements
router.get('/', async (req: Request, res: Response) => {
  try {
    const movements = await prisma.stockMovement.findMany({
      include: { product: true, location: true, user: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(movements);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stock movement by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const movement = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: { product: true, location: true, user: true },
    });

    if (!movement) {
      return res.status(404).json({ error: 'Stock movement not found' });
    }

    res.json(movement);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create stock movement
router.post('/', async (req: Request, res: Response) => {
  try {
    const { productId, movementType, quantity, reason, locationId } = req.body;
    const userId = (req as any).userId;

    if (!productId || !movementType || !quantity || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create movement
    const movement = await prisma.stockMovement.create({
      data: {
        productId,
        movementType,
        quantity,
        reason,
        locationId: locationId || null,
        userId,
      },
      include: { product: true },
    });

    // Update product stock
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (product) {
      const newStock =
        movementType === 'stock_in'
          ? product.currentStock + quantity
          : Math.max(0, product.currentStock - quantity);

      await prisma.product.update({
        where: { id: productId },
        data: { currentStock: newStock },
      });
    }

    res.status(201).json(movement);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
