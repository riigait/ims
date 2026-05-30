CREATE TABLE "DeployedStock" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "productId" TEXT,
    "deployedToName" TEXT,
    "deployedToDepartmentId" TEXT,
    "deployedToLocationId" TEXT,
    "deploymentSiteName" TEXT,
    "deploymentAddress" TEXT,
    "deploymentLatitude" DOUBLE PRECISION,
    "deploymentLongitude" DOUBLE PRECISION,
    "deploymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DEPLOYED',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeployedStock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeployedStock_stockId_idx" ON "DeployedStock"("stockId");
CREATE INDEX "DeployedStock_inventoryItemId_idx" ON "DeployedStock"("inventoryItemId");
CREATE INDEX "DeployedStock_status_idx" ON "DeployedStock"("status");
