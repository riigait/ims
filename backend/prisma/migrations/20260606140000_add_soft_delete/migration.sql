-- AlterTable Product: add soft-delete fields
ALTER TABLE "Product" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "archivedBy" TEXT;
