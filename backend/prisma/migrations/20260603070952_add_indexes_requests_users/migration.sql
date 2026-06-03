-- CreateIndex
CREATE INDEX "Category_departmentId_idx" ON "Category"("departmentId");

-- CreateIndex
CREATE INDEX "DeleteRequest_status_idx" ON "DeleteRequest"("status");

-- CreateIndex
CREATE INDEX "DeleteRequest_requestedBy_idx" ON "DeleteRequest"("requestedBy");

-- CreateIndex
CREATE INDEX "EditRequest_status_idx" ON "EditRequest"("status");

-- CreateIndex
CREATE INDEX "EditRequest_requestedBy_idx" ON "EditRequest"("requestedBy");

-- CreateIndex
CREATE INDEX "EditRequest_productId_idx" ON "EditRequest"("productId");

-- CreateIndex
CREATE INDEX "ExportRequest_status_idx" ON "ExportRequest"("status");

-- CreateIndex
CREATE INDEX "ExportRequest_requestedBy_idx" ON "ExportRequest"("requestedBy");

-- CreateIndex
CREATE INDEX "ImportRequest_status_idx" ON "ImportRequest"("status");

-- CreateIndex
CREATE INDEX "ImportRequest_submittedBy_idx" ON "ImportRequest"("submittedBy");

-- CreateIndex
CREATE INDEX "ImportRequest_departmentId_idx" ON "ImportRequest"("departmentId");

-- CreateIndex
CREATE INDEX "Location_departmentId_idx" ON "Location"("departmentId");

-- CreateIndex
CREATE INDEX "Location_parentId_idx" ON "Location"("parentId");

-- CreateIndex
CREATE INDEX "PasswordChangeRequest_status_idx" ON "PasswordChangeRequest"("status");

-- CreateIndex
CREATE INDEX "PasswordChangeRequest_requestedBy_idx" ON "PasswordChangeRequest"("requestedBy");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
