-- CreateTable
CREATE TABLE "VerifyRequest" (
    "id" TEXT NOT NULL,
    "stockDetailIds" TEXT[],
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerifyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerifyRequest_status_idx" ON "VerifyRequest"("status");

-- CreateIndex
CREATE INDEX "VerifyRequest_requestedBy_idx" ON "VerifyRequest"("requestedBy");

-- AddForeignKey
ALTER TABLE "VerifyRequest" ADD CONSTRAINT "VerifyRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifyRequest" ADD CONSTRAINT "VerifyRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
