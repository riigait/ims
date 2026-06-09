-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "newValues" TEXT,
ADD COLUMN     "oldValues" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "userAgent" TEXT;
