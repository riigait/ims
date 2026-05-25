import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/danger/delete-data', async (req: AuthRequest, res: Response) => {
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

    res.json({
      message: 'Operational data deleted. Users, departments, and department assignments were preserved.',
      deleted: result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete system data' });
  }
});

export default router;
