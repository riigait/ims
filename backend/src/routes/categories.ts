import express, { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all categories
router.get('/', async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany();
    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get category by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create category
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const category = await prisma.category.create({
      data: { name, description },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update category
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { name, description },
    });

    res.json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete category
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.category.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
