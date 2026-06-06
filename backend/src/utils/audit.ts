import { Request } from 'express';
import prisma from './prisma';

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]) ?? req.ip ?? 'unknown';
}

export function getRequestMeta(req: Request): { ipAddress: string; userAgent: string; requestId: string } {
  return {
    ipAddress: getClientIp(req),
    userAgent: (req.headers['user-agent'] ?? 'unknown').slice(0, 500),
    requestId: req.requestId ?? '',
  };
}

interface AuditParams {
  userId?: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: object;
  oldValues?: object;
  newValues?: object;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId:    params.userId    ?? null,
        action:    params.action,
        entityType: params.entityType,
        entityId:  params.entityId,
        changes:   params.changes   ? JSON.stringify(params.changes)   : null,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        requestId: params.requestId ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err);
  }
}
