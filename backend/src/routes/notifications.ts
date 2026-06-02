import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type Category = 'inventory' | 'request' | 'warranty' | 'expiry' | 'data_quality' | 'movement' | 'admin';

interface Notification {
  key: string;
  category: Category;
  severity: Severity;
  title: string;
  message: string;
  count: number;
  actionPath: string;
  actionTab?: string;
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 5, high: 4, medium: 3, low: 2, info: 1,
};

function getDeptFilter(req: AuthRequest): any {
  if (req.userRole === 'superadmin') return {};
  if (req.departmentIds && req.departmentIds.length > 0) {
    return {
      OR: [
        { departmentId: { in: req.departmentIds } },
        { departmentId: null },
      ],
    };
  }
  if (req.departmentId && req.departmentId !== 'all-departments') {
    return { departmentId: req.departmentId };
  }
  return {};
}

async function computeNotifications(req: AuthRequest): Promise<Notification[]> {
  const role = req.userRole || 'staff';
  const alerts: Notification[] = [];
  const now = new Date();
  const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
  const in3  = new Date(now); in3.setDate(in3.getDate() + 3);

  const deptFilter = getDeptFilter(req);
  const productFilter = { ...deptFilter, pendingApproval: false };
  const itemFilter = { product: { ...deptFilter, pendingApproval: false } };
  const finalStatuses = ['sold', 'disposed', 'lost'];

  // ── PRODUCT ALERTS (admin, superadmin, staff) ────────────────────────────
  if (role !== 'staff' || true) {
    const products = await prisma.product.findMany({
      where: productFilter,
      select: {
        id: true, currentStock: true, lowStockThreshold: true,
        locationId: true, expiryDate: true, status: true,
      },
    });

    const unassignedLoc = await prisma.location.findFirst({
      where: { name: { contains: 'unassigned', mode: 'insensitive' } },
      select: { id: true },
    });

    const negCount = products.filter(p => p.currentStock < 0).length;
    const outCount = products.filter(p => p.currentStock === 0).length;
    const lowCount = products.filter(p => p.currentStock > 0 && p.currentStock <= p.lowStockThreshold).length;
    const noLocCount = products.filter(p =>
      !p.locationId || (unassignedLoc && p.locationId === unassignedLoc.id)
    ).length;
    const expiredCount = products.filter(p =>
      p.expiryDate && new Date(p.expiryDate) < now && p.status === 'active'
    ).length;
    const expiringSoonCount = products.filter(p =>
      p.expiryDate && new Date(p.expiryDate) >= now && new Date(p.expiryDate) <= in30
    ).length;
    const backorderCount = products.filter(p => p.status === 'on-backorder').length;

    if (negCount > 0)
      alerts.push({ key: 'inventory:negative_stock', category: 'inventory', severity: 'critical', title: 'Negative Stock', message: `${negCount} product${negCount > 1 ? 's have' : ' has'} negative stock quantity`, count: negCount, actionPath: '/products', actionTab: 'negative-stock' });
    if (outCount > 0)
      alerts.push({ key: 'inventory:out_of_stock', category: 'inventory', severity: 'high', title: 'Out of Stock', message: `${outCount} product${outCount > 1 ? 's are' : ' is'} out of stock`, count: outCount, actionPath: '/products', actionTab: 'out-of-stock' });
    if (lowCount > 0)
      alerts.push({ key: 'inventory:low_stock', category: 'inventory', severity: 'medium', title: 'Low Stock', message: `${lowCount} product${lowCount > 1 ? 's are' : ' is'} running low`, count: lowCount, actionPath: '/products', actionTab: 'low-stock' });
    if (noLocCount > 0)
      alerts.push({ key: 'inventory:no_location', category: 'inventory', severity: 'medium', title: 'No Location', message: `${noLocCount} product${noLocCount > 1 ? 's have' : ' has'} no location assigned`, count: noLocCount, actionPath: '/products' });
    if (expiredCount > 0)
      alerts.push({ key: 'expiry:expired_product', category: 'expiry', severity: 'high', title: 'Expired Products', message: `${expiredCount} product${expiredCount > 1 ? 's have' : ' has'} passed expiry date`, count: expiredCount, actionPath: '/products' });
    if (expiringSoonCount > 0)
      alerts.push({ key: 'expiry:expiring_soon', category: 'expiry', severity: 'medium', title: 'Expiring Soon', message: `${expiringSoonCount} product${expiringSoonCount > 1 ? 's expire' : ' expires'} within 30 days`, count: expiringSoonCount, actionPath: '/products' });
    if (backorderCount > 0)
      alerts.push({ key: 'inventory:on_backorder', category: 'inventory', severity: 'low', title: 'On Backorder', message: `${backorderCount} product${backorderCount > 1 ? 's are' : ' is'} on backorder`, count: backorderCount, actionPath: '/products' });
  }

  // ── INVENTORY ITEM ALERTS ────────────────────────────────────────────────
  const items = await prisma.stockDetail.findMany({
    where: itemFilter,
    select: {
      id: true, currentStatus: true, warrantyExpiry: true,
      assetTag: true, serialNumber: true, currentLocationId: true,
    },
  });

  const activeItems = items.filter(i => !finalStatuses.includes(i.currentStatus || ''));
  const warrantyExpiredCount = activeItems.filter(i =>
    i.warrantyExpiry && new Date(i.warrantyExpiry) < now
  ).length;
  const warrantyExpiringSoonCount = activeItems.filter(i =>
    i.warrantyExpiry && new Date(i.warrantyExpiry) >= now && new Date(i.warrantyExpiry) <= in30
  ).length;
  const lostCount = items.filter(i => i.currentStatus === 'lost').length;
  const repairCount = items.filter(i => ['under-repair', 'repair'].includes(i.currentStatus || '')).length;
  const damagedCount = items.filter(i => ['damaged', 'defective'].includes(i.currentStatus || '')).length;
  const missingDetailsCount = activeItems.filter(i =>
    !i.assetTag && !i.serialNumber && !i.currentLocationId
  ).length;

  if (warrantyExpiredCount > 0)
    alerts.push({ key: 'warranty:expired', category: 'warranty', severity: 'medium', title: 'Warranty Expired', message: `${warrantyExpiredCount} item${warrantyExpiredCount > 1 ? 's have' : ' has'} expired warranty`, count: warrantyExpiredCount, actionPath: '/inventory-items' });
  if (warrantyExpiringSoonCount > 0)
    alerts.push({ key: 'warranty:expiring_soon', category: 'warranty', severity: 'medium', title: 'Warranty Expiring', message: `${warrantyExpiringSoonCount} item warranty${warrantyExpiringSoonCount > 1 ? 's expire' : ' expires'} within 30 days`, count: warrantyExpiringSoonCount, actionPath: '/inventory-items' });
  if (lostCount > 0)
    alerts.push({ key: 'movement:lost_items', category: 'movement', severity: 'high', title: 'Lost Items', message: `${lostCount} item${lostCount > 1 ? 's are' : ' is'} marked as lost`, count: lostCount, actionPath: '/inventory-items' });
  if (repairCount > 0)
    alerts.push({ key: 'movement:for_repair', category: 'movement', severity: 'medium', title: 'Items for Repair', message: `${repairCount} item${repairCount > 1 ? 's are' : ' is'} under repair`, count: repairCount, actionPath: '/inventory-items' });
  if (damagedCount > 0)
    alerts.push({ key: 'movement:damaged', category: 'movement', severity: 'high', title: 'Damaged / Defective', message: `${damagedCount} item${damagedCount > 1 ? 's are' : ' is'} damaged or defective`, count: damagedCount, actionPath: '/inventory-items' });
  if (missingDetailsCount > 0)
    alerts.push({ key: 'data_quality:missing_details', category: 'data_quality', severity: 'medium', title: 'Incomplete Records', message: `${missingDetailsCount} inventory item${missingDetailsCount > 1 ? 's are' : ' is'} missing key details`, count: missingDetailsCount, actionPath: '/inventory-items' });

  // ── REQUEST ALERTS ───────────────────────────────────────────────────────
  if (role === 'superadmin') {
    const [pendingImport, pendingExport, pendingDelete, pendingEdit, pendingPass] = await Promise.all([
      prisma.importRequest.count({ where: { status: 'pending' } }),
      prisma.exportRequest.count({ where: { status: 'pending' } }),
      prisma.deleteRequest.count({ where: { status: 'pending' } }),
      prisma.editRequest.count({ where: { status: 'pending' } }),
      prisma.passwordChangeRequest.count({ where: { status: 'pending' } }),
    ]);
    // Expiring import requests
    const expiringImports = await prisma.importRequest.count({
      where: { status: 'pending', expiresAt: { lte: in3 } },
    });
    if (expiringImports > 0)
      alerts.push({ key: 'request:import_expiring', category: 'request', severity: 'critical', title: 'Import Expiring', message: `${expiringImports} import request${expiringImports > 1 ? 's expire' : ' expires'} within 3 days`, count: expiringImports, actionPath: '/admin/requests', actionTab: 'import' });
    if (pendingImport > 0)
      alerts.push({ key: 'request:pending_import', category: 'request', severity: 'high', title: 'Pending Imports', message: `${pendingImport} import request${pendingImport > 1 ? 's need' : ' needs'} approval`, count: pendingImport, actionPath: '/admin/requests', actionTab: 'import' });
    if (pendingExport > 0)
      alerts.push({ key: 'request:pending_export', category: 'request', severity: 'high', title: 'Pending Exports', message: `${pendingExport} export request${pendingExport > 1 ? 's need' : ' needs'} approval`, count: pendingExport, actionPath: '/admin/requests', actionTab: 'export' });
    if (pendingDelete > 0)
      alerts.push({ key: 'request:pending_delete', category: 'request', severity: 'medium', title: 'Pending Deletes', message: `${pendingDelete} delete request${pendingDelete > 1 ? 's need' : ' needs'} review`, count: pendingDelete, actionPath: '/admin/requests', actionTab: 'delete' });
    if (pendingEdit > 0)
      alerts.push({ key: 'request:pending_edit', category: 'request', severity: 'medium', title: 'Pending Edits', message: `${pendingEdit} edit request${pendingEdit > 1 ? 's need' : ' needs'} review`, count: pendingEdit, actionPath: '/admin/requests', actionTab: 'edit' });
    if (pendingPass > 0)
      alerts.push({ key: 'request:pending_password', category: 'request', severity: 'medium', title: 'Password Requests', message: `${pendingPass} password request${pendingPass > 1 ? 's need' : ' needs'} review`, count: pendingPass, actionPath: '/admin/requests', actionTab: 'password' });
  } else if (role === 'admin') {
    const [pendingDelete, pendingEdit, pendingPass] = await Promise.all([
      prisma.deleteRequest.count({ where: { status: 'pending' } }),
      prisma.editRequest.count({ where: { status: 'pending' } }),
      prisma.passwordChangeRequest.count({ where: { status: 'pending' } }),
    ]);
    if (pendingDelete > 0)
      alerts.push({ key: 'request:pending_delete', category: 'request', severity: 'high', title: 'Pending Deletes', message: `${pendingDelete} delete request${pendingDelete > 1 ? 's need' : ' needs'} review`, count: pendingDelete, actionPath: '/admin/requests', actionTab: 'delete' });
    if (pendingEdit > 0)
      alerts.push({ key: 'request:pending_edit', category: 'request', severity: 'medium', title: 'Pending Edits', message: `${pendingEdit} edit request${pendingEdit > 1 ? 's need' : ' needs'} review`, count: pendingEdit, actionPath: '/admin/requests', actionTab: 'edit' });
    if (pendingPass > 0)
      alerts.push({ key: 'request:pending_password', category: 'request', severity: 'medium', title: 'Password Requests', message: `${pendingPass} password request${pendingPass > 1 ? 's need' : ' needs'} review`, count: pendingPass, actionPath: '/admin/requests', actionTab: 'password' });
  } else {
    // Staff — own rejected requests
    const [rejectedDelete, rejectedEdit, rejectedPass] = await Promise.all([
      prisma.deleteRequest.count({ where: { requestedBy: req.userId!, status: 'rejected' } }),
      prisma.editRequest.count({ where: { requestedBy: req.userId!, status: 'rejected' } }),
      prisma.passwordChangeRequest.count({ where: { requestedBy: req.userId!, status: 'rejected' } }),
    ]);
    if (rejectedDelete > 0)
      alerts.push({ key: 'request:rejected_delete', category: 'request', severity: 'info', title: 'Delete Request Rejected', message: `${rejectedDelete} of your delete request${rejectedDelete > 1 ? 's were' : ' was'} rejected`, count: rejectedDelete, actionPath: '/admin/requests', actionTab: 'delete' });
    if (rejectedEdit > 0)
      alerts.push({ key: 'request:rejected_edit', category: 'request', severity: 'info', title: 'Edit Request Rejected', message: `${rejectedEdit} of your edit request${rejectedEdit > 1 ? 's were' : ' was'} rejected`, count: rejectedEdit, actionPath: '/admin/requests', actionTab: 'edit' });
    if (rejectedPass > 0)
      alerts.push({ key: 'request:rejected_password', category: 'request', severity: 'info', title: 'Password Request Rejected', message: `${rejectedPass} of your password request${rejectedPass > 1 ? 's were' : ' was'} rejected`, count: rejectedPass, actionPath: '/admin/requests', actionTab: 'password' });
  }

  // ── SORT ─────────────────────────────────────────────────────────────────
  alerts.sort((a, b) => (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0));
  return alerts;
}

// GET /api/notifications
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const alerts = await computeNotifications(req);
    res.json(alerts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notifications/summary — for badge count
router.get('/summary', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const alerts = await computeNotifications(req);
    const total = alerts.reduce((sum, a) => sum + a.count, 0);
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const a of alerts) bySeverity[a.severity] = (bySeverity[a.severity] || 0) + a.count;
    res.json({ total, alerts: alerts.length, ...bySeverity });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
