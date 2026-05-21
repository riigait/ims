import express, { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all products
router.get('/', async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      include: { category: true, location: true },
    });
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { category: true, location: true },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create product
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sku, name, description, categoryId, locationId, unit, currentStock, lowStockThreshold } = req.body;

    if (!sku || !name || !categoryId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const product = await prisma.product.create({
      data: {
        sku,
        name,
        description,
        categoryId,
        locationId: locationId || null,
        unit: unit || 'pcs',
        currentStock: currentStock || 0,
        lowStockThreshold: lowStockThreshold || 10,
      },
      include: { category: true, location: true },
    });

    res.status(201).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { sku, name, description, categoryId, locationId, unit, currentStock, lowStockThreshold } = req.body;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        sku,
        name,
        description,
        categoryId,
        locationId: locationId || null,
        unit,
        currentStock,
        lowStockThreshold,
      },
      include: { category: true, location: true },
    });

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.product.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Product deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
