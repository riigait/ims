import { Router, Response, NextFunction } from 'express';
import type { ItemStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit, getRequestMeta } from '../utils/audit';

const router = Router();

router.post('/danger/delete-data', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmins can delete system data' });
    }

    if (req.body.confirmPhrase !== 'DELETE IMS DATA') {
      return res.status(400).json({ error: 'Confirmation phrase is required' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const counts = {
        deleteRequests: await tx.deleteRequest.count(),
        passwordRequests: await tx.passwordChangeRequest.count(),
        inviteCodes: await tx.inviteCode.count(),
        auditLogs: await tx.auditLog.count(),
        floorPlans: await tx.floorPlan.count(),
        stockMovementItems: await tx.stockMovementItem.count(),
        stockMovements: await tx.stockMovement.count(),
        stockDetails: await tx.stockDetail.count(),
        products: await tx.product.count(),
        categories: await tx.category.count(),
        locations: await tx.location.count(),
      };

      await tx.deleteRequest.deleteMany();
      await tx.passwordChangeRequest.deleteMany();
      await tx.inviteCode.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.floorPlan.deleteMany();
      await tx.stockMovementItem.deleteMany();
      await tx.stockMovement.deleteMany();
      await tx.stockDetail.deleteMany();
      await tx.product.deleteMany();
      await tx.category.deleteMany();
      await tx.location.deleteMany();

      return counts;
    });

    logAudit({ userId: req.userId, action: 'DANGER_DELETE_ALL_DATA', entityType: 'system', entityId: 'global', changes: result, ...getRequestMeta(req) });
    res.json({
      message: 'Operational data deleted. Users, departments, and department assignments were preserved.',
      deleted: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/danger/delete-department-data', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmins can delete department data' });
    }

    const { confirmPhrase, departmentId } = req.body;

    if (confirmPhrase !== 'DELETE DEPT DATA') {
      return res.status(400).json({ error: 'Confirmation phrase is required' });
    }

    if (!departmentId) {
      return res.status(400).json({ error: 'Department ID is required' });
    }

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const counts = {
        floorPlans: await tx.floorPlan.count({ where: { departmentId } }),
        stockMovements: await tx.stockMovement.count({ where: { departmentId } }),
        products: await tx.product.count({ where: { departmentId } }),
        categories: await tx.category.count({ where: { departmentId } }),
        locations: await tx.location.count({ where: { departmentId } }),
      };

      // Delete child records first
      const deptProducts = await tx.product.findMany({ where: { departmentId }, select: { id: true } });
      const productIds = deptProducts.map(p => p.id);

      if (productIds.length > 0) {
        await tx.stockMovementItem.deleteMany({ where: { productId: { in: productIds } } });
        await tx.stockDetail.deleteMany({ where: { productId: { in: productIds } } });
      }

      const deptMovements = await tx.stockMovement.findMany({ where: { departmentId }, select: { id: true } });
      const movementIds = deptMovements.map(m => m.id);
      if (movementIds.length > 0) {
        await tx.stockMovementItem.deleteMany({ where: { movementId: { in: movementIds } } });
      }

      await tx.floorPlan.deleteMany({ where: { departmentId } });
      await tx.stockMovement.deleteMany({ where: { departmentId } });
      await tx.product.deleteMany({ where: { departmentId } });

      // Category has onDelete:Cascade to Product, so deleting a category cascade-deletes
      // any products still referencing it (including products from other departments).
      // Only delete categories that have no remaining products after the dept products are gone.
      const deptCategories = await tx.category.findMany({ where: { departmentId }, select: { id: true } });
      for (const cat of deptCategories) {
        const stillReferenced = await tx.product.count({ where: { categoryId: cat.id } });
        if (stillReferenced === 0) {
          await tx.category.delete({ where: { id: cat.id } });
        }
      }

      await tx.location.deleteMany({ where: { departmentId } });

      return counts;
    });

    logAudit({ userId: req.userId, action: 'DANGER_DELETE_DEPARTMENT_DATA', entityType: 'department', entityId: departmentId, changes: { departmentName: department.name, ...result }, ...getRequestMeta(req) });
    res.json({
      message: `Data for department "${department.name}" has been deleted.`,
      deleted: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/sync-stock-counts', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Superadmin only' });
    }

    const finalStatuses: ItemStatus[] = ['sold', 'disposed', 'lost'];

    const products = await prisma.product.findMany({
      where: { stockDetails: { some: {} } },
      select: { id: true, currentStock: true, _count: { select: { stockDetails: { where: { currentStatus: { notIn: finalStatuses } } } } } },
    });

    let synced = 0;
    for (const p of products) {
      const correct = p._count.stockDetails;
      if (p.currentStock !== correct) {
        await prisma.product.update({ where: { id: p.id }, data: { currentStock: correct } });
        synced++;
      }
    }

    res.json({ message: `Synced stock counts for ${synced} product${synced === 1 ? '' : 's'}.`, synced, total: products.length });
  } catch (error) {
    next(error);
  }
});

export default router;
