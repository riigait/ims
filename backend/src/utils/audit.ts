import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
