import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { claudeQuery, isClaudeAvailable } from '../utils/claude';

const router = Router();
router.use(authMiddleware);

function requireClaude(res: Response): boolean {
  if (!isClaudeAvailable()) {
    res.status(503).json({ error: 'AI assistant not configured (ANTHROPIC_API_KEY missing)' });
    return false;
  }
  return true;
}

// POST /api/assistant/suggest-category
// Given a product name + optional description, return the best matching category.
// Uses Haiku (cheap, fast) — suitable for high-volume import workflows.
router.post('/suggest-category', async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!requireClaude(res)) return;
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });

    const categories = await prisma.category.findMany({
      where: { OR: [{ departmentId: req.departmentId }, { departmentId: null }] },
      select: { id: true, name: true },
    });
    if (categories.length === 0) return res.json({ categoryId: null, categoryName: null });

    const categoryList = categories.map(c => `${c.id}:${c.name}`).join(', ');
    const productDesc = description ? `. Description: "${String(description).slice(0, 200)}"` : '';

    const answer = await claudeQuery([
      {
        role: 'user',
        content:
          `Product: "${String(name).slice(0, 100)}"${productDesc}\n` +
          `Available categories: ${categoryList}\n` +
          `Reply with JSON only: {"categoryId":"<id>","categoryName":"<name>"}. ` +
          `Use null values if no category fits.`,
      },
    ], 'low', 128);

    try {
      const parsed = JSON.parse(answer.replace(/```json\n?|\n?```/g, '').trim());
      res.json({ categoryId: parsed.categoryId ?? null, categoryName: parsed.categoryName ?? null });
    } catch {
      res.json({ categoryId: null, categoryName: null });
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/assistant/query
// Natural language inventory question answered with live department context.
// Uses Sonnet for reasoning quality.
router.post('/query', async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!requireClaude(res)) return;
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string') return res.status(400).json({ error: 'question is required' });
    if (question.length > 500) return res.status(400).json({ error: 'question too long (max 500 chars)' });

    const deptFilter = { departmentId: req.departmentId, pendingApproval: false };
    const [totalProducts, outOfStock, categories, locations] = await Promise.all([
      prisma.product.count({ where: deptFilter }),
      prisma.product.findMany({
        where: { ...deptFilter, currentStock: 0 },
        select: { name: true, sku: true },
        take: 10,
      }),
      prisma.category.count({ where: { OR: [{ departmentId: req.departmentId }, { departmentId: null }] } }),
      prisma.location.count({ where: { OR: [{ departmentId: req.departmentId }, { departmentId: null }] } }),
    ]);

    const context = {
      totalProducts,
      totalCategories: categories,
      totalLocations: locations,
      outOfStockCount: outOfStock.length,
      outOfStockSamples: outOfStock.slice(0, 5).map(p => p.name),
    };

    const answer = await claudeQuery([
      {
        role: 'user',
        content: `Inventory snapshot:\n${JSON.stringify(context)}\n\nQuestion: ${question}`,
      },
    ], 'medium', 512);

    res.json({ answer });
  } catch (error) {
    next(error);
  }
});

export default router;
