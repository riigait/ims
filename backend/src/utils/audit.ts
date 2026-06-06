import { Request } from 'express';
import prisma from './prisma';

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]) ?? req.ip ?? 'unknown';
}

interface AuditParams {
  userId?: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: object;
  ipAddress?: string;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        changes: params.changes ? JSON.stringify(params.changes) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (err) {
    // Audit failures must never break the main request
    console.error('[audit] Failed to write audit log:', err);
  }
}
