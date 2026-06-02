import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Create export request (admin only)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admin users can create export requests' });
    }

    const { type, label, csvData } = req.body;
    if (!type || !label || !csvData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const exportRequest = await prisma.exportRequest.create({
      data: {
        type,
        label,
        csvData,
        requestedBy: req.userId!,
        departmentId: req.departmentId || null,
        status: 'pending',
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true } },
      },
    });

    res.status(201).json(exportRequest);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List export requests
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    let where: any = {};
    if (req.userRole === 'admin') {
      where = { requestedBy: req.userId };
    } else if (req.userRole === 'staff') {
      where = { requestedBy: req.userId };
    }
    // superadmin sees all

    const requests = await prisma.exportRequest.findMany({
      where,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Strip csvData from list (only send on download)
    const sanitized = requests.map(({ csvData: _, ...r }) => r);
    res.json(sanitized);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve (superadmin only)
router.patch('/:id/approve', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can approve export requests' });
    }

    const exportRequest = await prisma.exportRequest.findUnique({ where: { id: req.params.id } });
    if (!exportRequest) return res.status(404).json({ error: 'Export request not found' });
    if (exportRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Request already reviewed' });
    }

    const updated = await prisma.exportRequest.update({
      where: { id: req.params.id },
      data: { status: 'approved', reviewedBy: req.userId, reviewedAt: new Date() },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    const { csvData: _, ...sanitized } = updated;
    res.json(sanitized);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject (superadmin only)
router.patch('/:id/reject', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can reject export requests' });
    }

    const { rejectionReason } = req.body;
    const exportRequest = await prisma.exportRequest.findUnique({ where: { id: req.params.id } });
    if (!exportRequest) return res.status(404).json({ error: 'Export request not found' });
    if (exportRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Request already reviewed' });
    }

    const updated = await prisma.exportRequest.update({
      where: { id: req.params.id },
      data: { status: 'rejected', rejectionReason: rejectionReason || null, reviewedBy: req.userId, reviewedAt: new Date() },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    const { csvData: _, ...sanitized } = updated;
    res.json(sanitized);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download CSV (approved only, requester or superadmin)
router.get('/:id/download', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const exportRequest = await prisma.exportRequest.findUnique({ where: { id: req.params.id } });
    if (!exportRequest) return res.status(404).json({ error: 'Export request not found' });

    if (req.userRole !== 'superadmin' && exportRequest.requestedBy !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (exportRequest.status !== 'approved') {
      return res.status(400).json({ error: 'Export not yet approved' });
    }

    const filename = `${exportRequest.type}-export-${exportRequest.id.slice(0, 8)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportRequest.csvData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
