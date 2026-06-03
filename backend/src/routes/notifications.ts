import { Router, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type Category = 'inventory' | 'request' | 'warranty' | 'expiry' | 'data_quality' | 'movement' | 'admin' | 'security';

interface Notification {
  key: string;
  category: Category;
  severity: Severity;
  title: string;
  message: string;
  count: number;
  actionPath: string;
  actionTab?: string;
  actionFilter?: string;
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
  const in30    = new Date(now); in30.setDate(in30.getDate() + 30);
  const in3     = new Date(now); in3.setDate(in3.getDate() + 3);
  const ago7    = new Date(now); ago7.setDate(ago7.getDate() - 7);
  const ago14   = new Date(now); ago14.setDate(ago14.getDate() - 14);
  const ago30   = new Date(now); ago30.setDate(ago30.getDate() - 30);
  const ago6mo  = new Date(now); ago6mo.setMonth(ago6mo.getMonth() - 6);

  const deptFilter    = getDeptFilter(req);
  const productFilter = { ...deptFilter, pendingApproval: false };
  const itemFilter    = { product: { ...deptFilter, pendingApproval: false } };
  const finalStatuses = ['sold', 'disposed', 'lost'];

  // ── PRODUCTS ─────────────────────────────────────────────────────────────
  const products = await prisma.product.findMany({
    where: productFilter,
    select: {
      id: true, currentStock: true, lowStockThreshold: true,
      locationId: true, expiryDate: true, status: true, unitPrice: true,
    },
  });

  const unassignedLoc = await prisma.location.findFirst({
    where: { name: { contains: 'unassigned', mode: 'insensitive' } },
    select: { id: true },
  });

  const negCount              = products.filter(p => p.currentStock < 0).length;
  const outCount              = products.filter(p => p.currentStock === 0).length;
  const lowCount              = products.filter(p => p.currentStock > 0 && p.currentStock <= p.lowStockThreshold && p.lowStockThreshold > 0).length;
  const noLocCount            = products.filter(p => !p.locationId || (unassignedLoc && p.locationId === unassignedLoc.id)).length;
  const expiredCount          = products.filter(p => p.expiryDate && new Date(p.expiryDate) < now && p.status === 'active').length;
  const expiringSoonCount     = products.filter(p => p.expiryDate && new Date(p.expiryDate) >= now && new Date(p.expiryDate) <= in30).length;
  const backorderCount        = products.filter(p => p.status === 'on-backorder').length;
  const discontinuedWithStock = products.filter(p => ['discontinued', 'obsolete'].includes(p.status) && p.currentStock > 0).length;
  const noThresholdCount      = products.filter(p => p.lowStockThreshold === 0).length;

  if (negCount > 0)
    alerts.push({ key: 'inventory:negative_stock', category: 'inventory', severity: 'critical', title: 'Negative Stock', message: `${negCount} product${negCount > 1 ? 's have' : ' has'} negative stock — possible data inconsistency`, count: negCount, actionPath: '/products', actionFilter: 'product:negative-stock' });
  if (outCount > 0)
    alerts.push({ key: 'inventory:out_of_stock', category: 'inventory', severity: 'high', title: 'Out of Stock', message: `${outCount} product${outCount > 1 ? 's are' : ' is'} out of stock`, count: outCount, actionPath: '/products', actionFilter: 'product:out-of-stock' });
  if (lowCount > 0)
    alerts.push({ key: 'inventory:low_stock', category: 'inventory', severity: 'medium', title: 'Low Stock', message: `${lowCount} product${lowCount > 1 ? 's are' : ' is'} below the low stock threshold`, count: lowCount, actionPath: '/products', actionFilter: 'product:low-stock' });
  if (noLocCount > 0)
    alerts.push({ key: 'inventory:no_location', category: 'inventory', severity: 'medium', title: 'No Location Assigned', message: `${noLocCount} product${noLocCount > 1 ? 's have' : ' has'} no storage location assigned`, count: noLocCount, actionPath: '/products', actionFilter: 'product:no-location' });
  if (expiredCount > 0)
    alerts.push({ key: 'expiry:expired_product', category: 'expiry', severity: 'high', title: 'Expired Products', message: `${expiredCount} product${expiredCount > 1 ? 's have' : ' has'} passed their expiry date`, count: expiredCount, actionPath: '/products', actionFilter: 'product:expired' });
  if (expiringSoonCount > 0)
    alerts.push({ key: 'expiry:expiring_soon', category: 'expiry', severity: 'medium', title: 'Expiring Soon', message: `${expiringSoonCount} product${expiringSoonCount > 1 ? 's expire' : ' expires'} within 30 days`, count: expiringSoonCount, actionPath: '/products', actionFilter: 'product:expiring-soon' });
  if (backorderCount > 0)
    alerts.push({ key: 'inventory:on_backorder', category: 'inventory', severity: 'low', title: 'On Backorder', message: `${backorderCount} product${backorderCount > 1 ? 's are' : ' is'} on backorder`, count: backorderCount, actionPath: '/products', actionFilter: 'product:backorder' });
  if (discontinuedWithStock > 0)
    alerts.push({ key: 'product:discontinued_with_stock', category: 'inventory', severity: 'medium', title: 'Discontinued with Remaining Stock', message: `${discontinuedWithStock} discontinued or obsolete product${discontinuedWithStock > 1 ? 's still have' : ' still has'} remaining stock`, count: discontinuedWithStock, actionPath: '/products', actionFilter: 'product:discontinued-with-stock' });
  if (noThresholdCount > 0)
    alerts.push({ key: 'inventory:threshold_not_set', category: 'data_quality', severity: 'medium', title: 'Low Stock Threshold Not Set', message: `${noThresholdCount} product${noThresholdCount > 1 ? 's have' : ' has'} no low stock threshold — low stock alerts won't trigger`, count: noThresholdCount, actionPath: '/products', actionFilter: 'product:no-threshold' });

  // ── STOCK MISMATCH (tracked products only) ────────────────────────────────
  // Only applies to products that have at least one individual item record
  const trackedProducts = await prisma.product.findMany({
    where: { ...productFilter, stockDetails: { some: {} } },
    select: {
      currentStock: true,
      _count: { select: { stockDetails: { where: { currentStatus: { notIn: finalStatuses } } } } },
    },
  });
  const stockMismatchCount = trackedProducts.filter(p => p._count.stockDetails !== p.currentStock).length;
  if (stockMismatchCount > 0)
    alerts.push({ key: 'inventory:stock_mismatch', category: 'inventory', severity: 'critical', title: 'Stock Count Mismatch', message: `${stockMismatchCount} product${stockMismatchCount > 1 ? 's have' : ' has'} a stock quantity that does not match actual item records`, count: stockMismatchCount, actionPath: '/inventory-items', actionFilter: 'item:stock-mismatch' });

  // ── DUPLICATE SERIAL NUMBERS ──────────────────────────────────────────────
  // serialNumber is not @unique in schema, duplicates are possible
  const allSerials = await prisma.stockDetail.findMany({
    where: { serialNumber: { not: null } },
    select: { serialNumber: true },
  });
  const serialMap = new Map<string, number>();
  for (const i of allSerials) { const s = i.serialNumber!; serialMap.set(s, (serialMap.get(s) || 0) + 1); }
  const dupeSerialCount = [...serialMap.values()].filter(c => c > 1).length;
  if (dupeSerialCount > 0)
    alerts.push({ key: 'items:duplicate_serial', category: 'data_quality', severity: 'high', title: 'Duplicate Serial Numbers', message: `${dupeSerialCount} serial number${dupeSerialCount > 1 ? 's are' : ' is'} shared by multiple inventory items`, count: dupeSerialCount, actionPath: '/inventory-items', actionFilter: 'item:duplicate-serial' });

  // ── INVENTORY ITEMS (STOCK DETAILS) ──────────────────────────────────────
  const items = await prisma.stockDetail.findMany({
    where: itemFilter,
    select: {
      id: true, currentStatus: true, warrantyExpiry: true,
      assetTag: true, serialNumber: true, currentLocationId: true,
      condition: true, custodian: true, lastCheckedDate: true, updatedAt: true,
    },
  });

  const activeItems           = items.filter(i => !finalStatuses.includes(i.currentStatus || ''));
  const warrantyExpiredCount  = activeItems.filter(i => i.warrantyExpiry && new Date(i.warrantyExpiry) < now).length;
  const warrantyExpiringSoon  = activeItems.filter(i => i.warrantyExpiry && new Date(i.warrantyExpiry) >= now && new Date(i.warrantyExpiry) <= in30).length;
  const missingWarrantyCount  = activeItems.filter(i => !i.warrantyExpiry).length;
  const lostCount             = items.filter(i => i.currentStatus === 'lost').length;
  const repairCount           = items.filter(i => ['under-repair', 'repair'].includes(i.currentStatus || '')).length;
  const damagedCount          = items.filter(i => ['damaged', 'defective'].includes(i.currentStatus || '')).length;
  const borrowedCount         = items.filter(i => i.currentStatus === 'borrowed').length;
  const deployedCount         = items.filter(i => i.currentStatus === 'deployed').length;
  const poorConditionCount    = activeItems.filter(i => i.condition === 'poor').length;
  const missingDetailsCount   = activeItems.filter(i => !i.assetTag && !i.serialNumber && !i.currentLocationId).length;
  const noIdCount             = activeItems.filter(i => !i.assetTag && !i.serialNumber).length - missingDetailsCount;
  // Overdue: use updatedAt as proxy for when the status was last set
  const overdueRepairCount    = items.filter(i => ['repair', 'under-repair'].includes(i.currentStatus || '') && i.updatedAt < ago14).length;
  const overdueBorrowedCount  = items.filter(i => i.currentStatus === 'borrowed' && i.updatedAt < ago30).length;
  // Unresolved lost/damaged (no status change in 30+ days)
  const unresolvedLostDamage  = items.filter(i => ['lost', 'damaged', 'defective'].includes(i.currentStatus || '') && i.updatedAt < ago30).length;
  // Missing custodian on deployed/borrowed items
  const missingCustodianCount = items.filter(i => ['deployed', 'borrowed'].includes(i.currentStatus || '') && !i.custodian).length;
  // Not physically verified in 6+ months
  const oldUnverifiedCount    = activeItems.filter(i => !i.lastCheckedDate || new Date(i.lastCheckedDate) < ago6mo).length;

  if (poorConditionCount > 0)
    alerts.push({ key: 'items:poor_condition', category: 'inventory', severity: 'high', title: 'Poor Condition Items', message: `${poorConditionCount} item${poorConditionCount > 1 ? 's are' : ' is'} in poor condition and may need replacement`, count: poorConditionCount, actionPath: '/inventory-items', actionFilter: 'item:poor-condition' });
  if (overdueRepairCount > 0)
    alerts.push({ key: 'movement:overdue_repair', category: 'movement', severity: 'high', title: 'Overdue Repair', message: `${overdueRepairCount} item${overdueRepairCount > 1 ? 's have' : ' has'} been under repair for more than 14 days`, count: overdueRepairCount, actionPath: '/inventory-items', actionFilter: 'item:overdue-repair' });
  if (overdueBorrowedCount > 0)
    alerts.push({ key: 'movement:overdue_borrowed', category: 'movement', severity: 'high', title: 'Overdue Borrowed Items', message: `${overdueBorrowedCount} borrowed item${overdueBorrowedCount > 1 ? 's have' : ' has'} not been returned in over 30 days`, count: overdueBorrowedCount, actionPath: '/inventory-items', actionFilter: 'item:overdue-borrowed' });
  if (warrantyExpiredCount > 0)
    alerts.push({ key: 'warranty:expired', category: 'warranty', severity: 'medium', title: 'Warranty Expired', message: `${warrantyExpiredCount} item${warrantyExpiredCount > 1 ? 's have' : ' has'} an expired warranty`, count: warrantyExpiredCount, actionPath: '/inventory-items', actionFilter: 'item:warranty-expired' });
  if (warrantyExpiringSoon > 0)
    alerts.push({ key: 'warranty:expiring_soon', category: 'warranty', severity: 'medium', title: 'Warranty Expiring Soon', message: `${warrantyExpiringSoon} item warranty${warrantyExpiringSoon > 1 ? 's expire' : ' expires'} within 30 days`, count: warrantyExpiringSoon, actionPath: '/inventory-items', actionFilter: 'item:warranty-expiring-soon' });
  if (lostCount > 0)
    alerts.push({ key: 'movement:lost_items', category: 'movement', severity: 'high', title: 'Lost Items', message: `${lostCount} item${lostCount > 1 ? 's are' : ' is'} marked as lost`, count: lostCount, actionPath: '/inventory-items', actionFilter: 'item:lost' });
  if (damagedCount > 0)
    alerts.push({ key: 'movement:damaged', category: 'movement', severity: 'high', title: 'Damaged / Defective', message: `${damagedCount} item${damagedCount > 1 ? 's are' : ' is'} damaged or defective`, count: damagedCount, actionPath: '/inventory-items', actionFilter: 'item:damaged' });
  if (unresolvedLostDamage > 0)
    alerts.push({ key: 'movement:unresolved_lost_damage', category: 'movement', severity: 'medium', title: 'Unresolved Lost / Damage', message: `${unresolvedLostDamage} lost or damaged item${unresolvedLostDamage > 1 ? 's have' : ' has'} had no update in over 30 days — needs resolution`, count: unresolvedLostDamage, actionPath: '/inventory-items', actionFilter: 'item:unresolved-lost-damage' });
  if (repairCount > 0)
    alerts.push({ key: 'movement:for_repair', category: 'movement', severity: 'medium', title: 'Items for Repair', message: `${repairCount} item${repairCount > 1 ? 's are' : ' is'} currently under repair`, count: repairCount, actionPath: '/inventory-items', actionFilter: 'item:repair' });
  if (borrowedCount > 0)
    alerts.push({ key: 'movement:borrowed', category: 'movement', severity: 'medium', title: 'Borrowed Items', message: `${borrowedCount} item${borrowedCount > 1 ? 's are' : ' is'} currently on loan`, count: borrowedCount, actionPath: '/inventory-items', actionFilter: 'item:borrowed' });
  if (missingCustodianCount > 0)
    alerts.push({ key: 'items:missing_custodian', category: 'data_quality', severity: 'medium', title: 'Missing Custodian', message: `${missingCustodianCount} deployed or borrowed item${missingCustodianCount > 1 ? 's have' : ' has'} no assigned custodian — accountability gap`, count: missingCustodianCount, actionPath: '/inventory-items', actionFilter: 'item:missing-custodian' });
  if (deployedCount > 0)
    alerts.push({ key: 'movement:deployed', category: 'movement', severity: 'low', title: 'Deployed Items', message: `${deployedCount} item${deployedCount > 1 ? 's are' : ' is'} currently deployed`, count: deployedCount, actionPath: '/inventory-items', actionFilter: 'item:deployed' });
  if (missingDetailsCount > 0)
    alerts.push({ key: 'data_quality:missing_details', category: 'data_quality', severity: 'medium', title: 'Incomplete Item Records', message: `${missingDetailsCount} item${missingDetailsCount > 1 ? 's are' : ' is'} missing asset tag, serial number, and location`, count: missingDetailsCount, actionPath: '/inventory-items', actionFilter: 'item:missing-all-details' });
  if (noIdCount > 0)
    alerts.push({ key: 'data_quality:no_identification', category: 'data_quality', severity: 'low', title: 'No Asset Tag or Serial', message: `${noIdCount} active item${noIdCount > 1 ? 's have' : ' has'} no asset tag or serial number`, count: noIdCount, actionPath: '/inventory-items', actionFilter: 'item:no-identification' });
  if (missingWarrantyCount > 0)
    alerts.push({ key: 'warranty:missing_info', category: 'warranty', severity: 'low', title: 'Missing Warranty Info', message: `${missingWarrantyCount} active item${missingWarrantyCount > 1 ? 's have' : ' has'} no warranty information recorded`, count: missingWarrantyCount, actionPath: '/inventory-items', actionFilter: 'item:warranty-missing' });
  if (oldUnverifiedCount > 0)
    alerts.push({ key: 'data_quality:old_unverified', category: 'data_quality', severity: 'low', title: 'Items Not Recently Verified', message: `${oldUnverifiedCount} active item${oldUnverifiedCount > 1 ? 's have' : ' has'} not been physically verified in over 6 months`, count: oldUnverifiedCount, actionPath: '/inventory-items', actionFilter: 'item:old-unverified' });

  // ── OVERDUE DEPLOYMENTS (DeployedStock model) ─────────────────────────────
  if (role !== 'staff') {
    const overdueDeployed = await prisma.deployedStock.count({
      where: { status: 'DEPLOYED', returnedDate: null, deploymentDate: { lte: ago30 } },
    });
    if (overdueDeployed > 0)
      alerts.push({ key: 'deployed:overdue', category: 'movement', severity: 'medium', title: 'Overdue Deployments', message: `${overdueDeployed} deployed item${overdueDeployed > 1 ? 's have' : ' has'} not been returned in over 30 days`, count: overdueDeployed, actionPath: '/inventory-items', actionFilter: 'item:overdue-deployed' });
  }

  // ── PENDING STOCK MOVEMENTS ───────────────────────────────────────────────
  if (role !== 'staff') {
    const pendingMovements = await prisma.stockMovement.count({
      where: { ...deptFilter, status: 'pending' },
    });
    if (pendingMovements > 0)
      alerts.push({ key: 'movement:pending', category: 'movement', severity: 'low', title: 'Uncommitted Movements', message: `${pendingMovements} stock movement${pendingMovements > 1 ? 's are' : ' is'} still pending — not yet committed or cancelled`, count: pendingMovements, actionPath: '/stock-movements', actionFilter: 'movement:pending' });
  }

  // ── EMPTY LOCATIONS ───────────────────────────────────────────────────────
  if (role !== 'staff') {
    const emptyLocations = await prisma.location.count({
      where: { ...deptFilter, products: { none: {} }, stockDetails: { none: {} } },
    });
    if (emptyLocations > 0)
      alerts.push({ key: 'location:empty', category: 'data_quality', severity: 'low', title: 'Empty Locations', message: `${emptyLocations} location${emptyLocations > 1 ? 's have' : ' has'} no products or items assigned`, count: emptyLocations, actionPath: '/locations', actionFilter: 'location:empty' });
  }

  // ── INVITE CODES EXPIRING (admin / superadmin) ────────────────────────────
  if (role !== 'staff') {
    const expiringCodes = await prisma.inviteCode.count({
      where: { usedBy: null, expiresAt: { lte: in3 } },
    });
    if (expiringCodes > 0)
      alerts.push({ key: 'admin:invite_expiring', category: 'admin', severity: 'low', title: 'Invite Codes Expiring', message: `${expiringCodes} unused invite code${expiringCodes > 1 ? 's expire' : ' expires'} within 3 days`, count: expiringCodes, actionPath: '/admin/users' });
  }

  // ── SUPERADMIN: UNAPPROVED FLOOR PLANS ───────────────────────────────────
  if (role === 'superadmin') {
    const unapprovedPlans = await prisma.floorPlan.count({ where: { isApproved: false } });
    if (unapprovedPlans > 0)
      alerts.push({ key: 'admin:unapproved_floor_plans', category: 'admin', severity: 'info', title: 'Unapproved Floor Plans', message: `${unapprovedPlans} floor plan${unapprovedPlans > 1 ? 's are' : ' is'} not yet approved`, count: unapprovedPlans, actionPath: '/floor-plans' });
  }

  // ── REQUEST ALERTS ───────────────────────────────────────────────────────
  if (role === 'superadmin') {
    const [pendingImport, pendingExport, pendingDelete, pendingEdit, pendingPass] = await Promise.all([
      prisma.importRequest.count({ where: { status: 'pending' } }),
      prisma.exportRequest.count({ where: { status: 'pending' } }),
      prisma.deleteRequest.count({ where: { status: 'pending' } }),
      prisma.editRequest.count({ where: { status: 'pending' } }),
      prisma.passwordChangeRequest.count({ where: { status: 'pending' } }),
    ]);
    const expiringImports = await prisma.importRequest.count({
      where: { status: 'pending', expiresAt: { lte: in3 } },
    });
    // Stale: pending for more than 7 days
    const [staleDelete, staleEdit, stalePass] = await Promise.all([
      prisma.deleteRequest.count({ where: { status: 'pending', createdAt: { lte: ago7 } } }),
      prisma.editRequest.count({ where: { status: 'pending', createdAt: { lte: ago7 } } }),
      prisma.passwordChangeRequest.count({ where: { status: 'pending', createdAt: { lte: ago7 } } }),
    ]);
    const totalStale = staleDelete + staleEdit + stalePass;

    if (expiringImports > 0)
      alerts.push({ key: 'request:import_expiring', category: 'request', severity: 'critical', title: 'Import Expiring', message: `${expiringImports} import request${expiringImports > 1 ? 's expire' : ' expires'} within 3 days and will auto-approve`, count: expiringImports, actionPath: '/admin/requests', actionTab: 'import' });
    if (pendingImport > 0)
      alerts.push({ key: 'request:pending_import', category: 'request', severity: 'high', title: 'Pending Imports', message: `${pendingImport} import request${pendingImport > 1 ? 's need' : ' needs'} approval`, count: pendingImport, actionPath: '/admin/requests', actionTab: 'import' });
    if (pendingExport > 0)
      alerts.push({ key: 'request:pending_export', category: 'request', severity: 'high', title: 'Pending Exports', message: `${pendingExport} export request${pendingExport > 1 ? 's need' : ' needs'} approval`, count: pendingExport, actionPath: '/admin/requests', actionTab: 'export' });
    if (pendingDelete > 0)
      alerts.push({ key: 'request:pending_delete', category: 'request', severity: 'medium', title: 'Pending Delete Requests', message: `${pendingDelete} delete request${pendingDelete > 1 ? 's need' : ' needs'} review`, count: pendingDelete, actionPath: '/admin/requests', actionTab: 'delete' });
    if (pendingEdit > 0)
      alerts.push({ key: 'request:pending_edit', category: 'request', severity: 'medium', title: 'Pending Edit Requests', message: `${pendingEdit} edit request${pendingEdit > 1 ? 's need' : ' needs'} review`, count: pendingEdit, actionPath: '/admin/requests', actionTab: 'edit' });
    if (pendingPass > 0)
      alerts.push({ key: 'request:pending_password', category: 'request', severity: 'medium', title: 'Password Requests', message: `${pendingPass} password request${pendingPass > 1 ? 's need' : ' needs'} review`, count: pendingPass, actionPath: '/admin/requests', actionTab: 'password' });
    if (totalStale > 0)
      alerts.push({ key: 'request:stale_pending', category: 'request', severity: 'high', title: 'Stale Pending Requests', message: `${totalStale} request${totalStale > 1 ? 's have' : ' has'} been pending for over 7 days without a decision`, count: totalStale, actionPath: '/admin/requests' });

  } else if (role === 'admin') {
    const [pendingDelete, pendingEdit, pendingPass] = await Promise.all([
      prisma.deleteRequest.count({ where: { status: 'pending' } }),
      prisma.editRequest.count({ where: { status: 'pending' } }),
      prisma.passwordChangeRequest.count({ where: { status: 'pending' } }),
    ]);
    const [staleDelete, staleEdit, stalePass] = await Promise.all([
      prisma.deleteRequest.count({ where: { status: 'pending', createdAt: { lte: ago7 } } }),
      prisma.editRequest.count({ where: { status: 'pending', createdAt: { lte: ago7 } } }),
      prisma.passwordChangeRequest.count({ where: { status: 'pending', createdAt: { lte: ago7 } } }),
    ]);
    const totalStale = staleDelete + staleEdit + stalePass;

    if (pendingDelete > 0)
      alerts.push({ key: 'request:pending_delete', category: 'request', severity: 'high', title: 'Pending Delete Requests', message: `${pendingDelete} delete request${pendingDelete > 1 ? 's need' : ' needs'} review`, count: pendingDelete, actionPath: '/admin/requests', actionTab: 'delete' });
    if (pendingEdit > 0)
      alerts.push({ key: 'request:pending_edit', category: 'request', severity: 'medium', title: 'Pending Edit Requests', message: `${pendingEdit} edit request${pendingEdit > 1 ? 's need' : ' needs'} review`, count: pendingEdit, actionPath: '/admin/requests', actionTab: 'edit' });
    if (pendingPass > 0)
      alerts.push({ key: 'request:pending_password', category: 'request', severity: 'medium', title: 'Password Requests', message: `${pendingPass} password request${pendingPass > 1 ? 's need' : ' needs'} review`, count: pendingPass, actionPath: '/admin/requests', actionTab: 'password' });
    if (totalStale > 0)
      alerts.push({ key: 'request:stale_pending', category: 'request', severity: 'high', title: 'Stale Pending Requests', message: `${totalStale} request${totalStale > 1 ? 's have' : ' has'} been pending for over 7 days without a decision`, count: totalStale, actionPath: '/admin/requests' });

  } else {
    // Staff: own rejected AND approved requests
    const [rejectedDelete, rejectedEdit, rejectedPass, approvedDelete, approvedEdit] = await Promise.all([
      prisma.deleteRequest.count({ where: { requestedBy: req.userId!, status: 'rejected' } }),
      prisma.editRequest.count({ where: { requestedBy: req.userId!, status: 'rejected' } }),
      prisma.passwordChangeRequest.count({ where: { requestedBy: req.userId!, status: 'rejected' } }),
      prisma.deleteRequest.count({ where: { requestedBy: req.userId!, status: 'approved' } }),
      prisma.editRequest.count({ where: { requestedBy: req.userId!, status: 'approved' } }),
    ]);

    if (rejectedDelete > 0)
      alerts.push({ key: 'request:rejected_delete', category: 'request', severity: 'info', title: 'Delete Request Rejected', message: `${rejectedDelete} of your delete request${rejectedDelete > 1 ? 's were' : ' was'} rejected`, count: rejectedDelete, actionPath: '/admin/requests', actionTab: 'delete' });
    if (rejectedEdit > 0)
      alerts.push({ key: 'request:rejected_edit', category: 'request', severity: 'info', title: 'Edit Request Rejected', message: `${rejectedEdit} of your edit request${rejectedEdit > 1 ? 's were' : ' was'} rejected`, count: rejectedEdit, actionPath: '/admin/requests', actionTab: 'edit' });
    if (rejectedPass > 0)
      alerts.push({ key: 'request:rejected_password', category: 'request', severity: 'info', title: 'Password Request Rejected', message: `${rejectedPass} of your password request${rejectedPass > 1 ? 's were' : ' was'} rejected`, count: rejectedPass, actionPath: '/admin/requests', actionTab: 'password' });
    if (approvedDelete > 0)
      alerts.push({ key: 'request:approved_delete', category: 'request', severity: 'info', title: 'Delete Request Approved', message: `${approvedDelete} of your delete request${approvedDelete > 1 ? 's were' : ' was'} approved`, count: approvedDelete, actionPath: '/admin/requests', actionTab: 'delete' });
    if (approvedEdit > 0)
      alerts.push({ key: 'request:approved_edit', category: 'request', severity: 'info', title: 'Edit Request Approved', message: `${approvedEdit} of your edit request${approvedEdit > 1 ? 's were' : ' was'} approved`, count: approvedEdit, actionPath: '/admin/requests', actionTab: 'edit' });
  }

  alerts.sort((a, b) => (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0));
  return alerts;
}

// GET /api/notifications
router.get('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const alerts = await computeNotifications(req);
    res.json(alerts);
  } catch (error) {
    next(error);
  }
});

// GET /api/notifications/summary — badge count only
router.get('/summary', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const alerts = await computeNotifications(req);
    const total = alerts.length;
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const a of alerts) bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
    res.json({ total, alerts: alerts.length, ...bySeverity });
  } catch (error) {
    next(error);
  }
});

export default router;
