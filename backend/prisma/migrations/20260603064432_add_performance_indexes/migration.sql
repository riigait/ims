-- CreateIndex
CREATE INDEX "Product_departmentId_idx" ON "Product"("departmentId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_locationId_idx" ON "Product"("locationId");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_pendingApproval_idx" ON "Product"("pendingApproval");

-- CreateIndex
CREATE INDEX "Product_currentStock_idx" ON "Product"("currentStock");

-- CreateIndex
CREATE INDEX "StockDetail_productId_idx" ON "StockDetail"("productId");

-- CreateIndex
CREATE INDEX "StockDetail_currentLocationId_idx" ON "StockDetail"("currentLocationId");

-- CreateIndex
CREATE INDEX "StockDetail_currentStatus_idx" ON "StockDetail"("currentStatus");

-- CreateIndex
CREATE INDEX "StockMovement_departmentId_idx" ON "StockMovement"("departmentId");

-- CreateIndex
CREATE INDEX "StockMovement_status_idx" ON "StockMovement"("status");

-- CreateIndex
CREATE INDEX "StockMovement_movementType_idx" ON "StockMovement"("movementType");
