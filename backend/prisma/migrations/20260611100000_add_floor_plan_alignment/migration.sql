-- Persist merge-floor alignment metadata on each floor plan.
ALTER TABLE "FloorPlan" ADD COLUMN "isAligned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FloorPlan" ADD COLUMN "alignmentJson" TEXT;
ALTER TABLE "FloorPlan" ADD COLUMN "alignedAt" TIMESTAMP(3);
