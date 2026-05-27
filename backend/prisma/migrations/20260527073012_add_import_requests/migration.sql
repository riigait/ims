-- CreateTable
CREATE TABLE "ImportRequest" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "productIds" TEXT[],
    "csvImportId" TEXT,
    "label" TEXT,
    "submittedBy" TEXT NOT NULL,
    "departmentId" TEXT,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ImportRequest" ADD CONSTRAINT "ImportRequest_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRequest" ADD CONSTRAINT "ImportRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRequest" ADD CONSTRAINT "ImportRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
