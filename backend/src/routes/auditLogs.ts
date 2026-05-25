import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, adminMiddleware } from '../middleware/auth';

const router = Router();

// Only admins can view audit logs
router.get('/', adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { entityType, entityId, limit = '100' } = req.query as Record<string, string>;

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit) || 100, 500),
    });

    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
