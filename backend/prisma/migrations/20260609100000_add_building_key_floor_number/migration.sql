-- AddColumn buildingKey and floorNumber to FloorPlan
ALTER TABLE "FloorPlan" ADD COLUMN "buildingKey" TEXT;
ALTER TABLE "FloorPlan" ADD COLUMN "floorNumber" INTEGER;
