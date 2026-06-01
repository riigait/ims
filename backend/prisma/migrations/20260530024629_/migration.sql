/*
  Warnings:

  - You are about to drop the column `locationId` on the `StockMovement` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `StockMovement` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `StockMovement` table. All the data in the column will be lost.
  - You are about to drop the column `reason` on the `StockMovement` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[requestNo]` on the table `ImportRequest` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[movementNo]` on the table `StockMovement` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `StockMovement` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_locationId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_productId_fkey";

-- AlterTable
ALTER TABLE "FloorPlan" ADD COLUMN     "generationScore" INTEGER,
ADD COLUMN     "isApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ImportRequest" ADD COLUMN     "requestNo" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "csvImportId" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" DROP COLUMN "locationId",
DROP COLUMN "productId",
DROP COLUMN "quantity",
DROP COLUMN "reason",
ADD COLUMN     "movementNo" TEXT,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "toDepartmentId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "StockMovementItem" (
    "id" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "stockDetailId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDetail" (
    "id" TEXT NOT NULL,
    "stockId" TEXT,
    "assetTag" TEXT,
    "barcode" TEXT,
    "productId" TEXT NOT NULL,
    "modelNumber" TEXT,
    "serialNumber" TEXT,
    "macId" TEXT,
    "dateStock" TIMESTAMP(3),
    "brand" TEXT,
    "itemType" TEXT,
    "condition" TEXT DEFAULT 'new',
    "warrantyExpiry" TIMESTAMP(3),
    "warrantyNotes" TEXT,
    "currentStatus" TEXT NOT NULL DEFAULT 'active',
    "currentLocationId" TEXT,
    "custodian" TEXT,
    "lastCheckedDate" TIMESTAMP(3),
    "checkedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlanRoomType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "minWidth" INTEGER NOT NULL DEFAULT 120,
    "minHeight" INTEGER NOT NULL DEFAULT 80,
    "defaultColor" TEXT NOT NULL DEFAULT '#dbeafe',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorPlanRoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlanRule" (
    "id" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "sourceRoomType" TEXT NOT NULL,
    "targetRoomType" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorPlanRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlanExample" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "originalData" TEXT NOT NULL,
    "correctedData" TEXT,
    "feedback" TEXT,
    "rating" INTEGER,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorPlanExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlanGenerationLog" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "templateUsed" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "validationResult" TEXT,
    "userFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorPlanGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockDetail_stockId_key" ON "StockDetail"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "StockDetail_assetTag_key" ON "StockDetail"("assetTag");

-- CreateIndex
CREATE INDEX "StockDetail_stockId_idx" ON "StockDetail"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "FloorPlanRoomType_name_templateType_key" ON "FloorPlanRoomType"("name", "templateType");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRequest_requestNo_key" ON "ImportRequest"("requestNo");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_movementNo_key" ON "StockMovement"("movementNo");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementItem" ADD CONSTRAINT "StockMovementItem_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementItem" ADD CONSTRAINT "StockMovementItem_stockDetailId_fkey" FOREIGN KEY ("stockDetailId") REFERENCES "StockDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementItem" ADD CONSTRAINT "StockMovementItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementItem" ADD CONSTRAINT "StockMovementItem_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementItem" ADD CONSTRAINT "StockMovementItem_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDetail" ADD CONSTRAINT "StockDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDetail" ADD CONSTRAINT "StockDetail_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlanExample" ADD CONSTRAINT "FloorPlanExample_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlanGenerationLog" ADD CONSTRAINT "FloorPlanGenerationLog_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
