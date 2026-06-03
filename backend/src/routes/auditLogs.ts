import { Router, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, adminMiddleware } from '../middleware/auth';

const router = Router();

// Only admins can view audit logs
router.get('/', adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    next(error);
  }
});

export default router;
