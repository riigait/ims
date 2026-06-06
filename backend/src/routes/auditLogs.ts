import { Router, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, adminMiddleware } from '../middleware/auth';

const router = Router();

router.get('/', adminMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      entityType,
      entityId,
      action,
      userId,
      limit = '100',
      page  = '1',
    } = req.query as Record<string, string>;

    const take = Math.min(Number.parseInt(limit) || 100, 500);
    const skip = (Math.max(Number.parseInt(page) || 1, 1) - 1) * take;

    const where = {
      ...(entityType ? { entityType } : {}),
      ...(entityId   ? { entityId }   : {}),
      ...(action     ? { action }     : {}),
      ...(userId     ? { userId }     : {}),
    };

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
    ]);

    // Attach user name + email without a schema relation
    const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))] as string[];
    const userMap: Record<string, { id: string; name: string; email: string }> = {};
    if (userIds.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
      for (const u of users) userMap[u.id] = u;
    }

    const data = logs.map(log => ({
      ...log,
      user: log.userId ? (userMap[log.userId] ?? null) : null,
    }));

    res.json({ data, total, page: Math.max(Number.parseInt(page) || 1, 1), limit: take });
  } catch (error) {
    next(error);
  }
});

export default router;
