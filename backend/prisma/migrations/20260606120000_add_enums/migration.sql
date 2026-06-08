-- ROLLBACK NOTE: Enum type conversions (ALTER COLUMN ... TYPE ... USING) are not automatically
-- reversible. To roll back, run a compensating migration that casts the enum column back to TEXT:
--   ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING "role"::text;
-- then DROP TYPE for each enum, and restore the original DEFAULT string values.
-- Ensure all column data matches enum values before applying; mismatches will cause migration failure.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('superadmin', 'admin', 'staff');
CREATE TYPE "ProductStatus" AS ENUM ('active', 'discontinued', 'obsolete', 'on-backorder');
CREATE TYPE "LocationType" AS ENUM ('branch', 'building', 'floor', 'room', 'rack', 'shelf');
CREATE TYPE "MovementType" AS ENUM ('stock_in', 'stock_out', 'adjustment', 'transfer', 'damaged', 'returned', 'opening_stock', 'moved_to_department', 'borrowed', 'lost', 'found', 'pre_deployment', 'post_deployment', 'repair_out', 'repair_return', 'defective', 'disposal');
CREATE TYPE "MovementStatus" AS ENUM ('pending', 'committed', 'cancelled');
CREATE TYPE "ItemCondition" AS ENUM ('new', 'good', 'fair', 'poor');
CREATE TYPE "ItemStatus" AS ENUM ('active', 'damaged', 'sold', 'lost', 'returned', 'deployed', 'borrowed', 'disposed', 'repair');
CREATE TYPE "RequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable User: role String -> UserRole
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING "role"::text::"UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'staff'::"UserRole";

-- AlterTable InviteCode: role String -> UserRole
ALTER TABLE "InviteCode" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "InviteCode" ALTER COLUMN "role" TYPE "UserRole" USING "role"::text::"UserRole";
ALTER TABLE "InviteCode" ALTER COLUMN "role" SET DEFAULT 'staff'::"UserRole";

-- AlterTable Product: status String -> ProductStatus
ALTER TABLE "Product" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "status" TYPE "ProductStatus" USING "status"::text::"ProductStatus";
ALTER TABLE "Product" ALTER COLUMN "status" SET DEFAULT 'active'::"ProductStatus";

-- AlterTable Location: type String -> LocationType
ALTER TABLE "Location" ALTER COLUMN "type" TYPE "LocationType" USING "type"::text::"LocationType";

-- AlterTable StockMovement: movementType String -> MovementType, status String -> MovementStatus
ALTER TABLE "StockMovement" ALTER COLUMN "movementType" TYPE "MovementType" USING "movementType"::text::"MovementType";
ALTER TABLE "StockMovement" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "StockMovement" ALTER COLUMN "status" TYPE "MovementStatus" USING "status"::text::"MovementStatus";
ALTER TABLE "StockMovement" ALTER COLUMN "status" SET DEFAULT 'pending'::"MovementStatus";

-- AlterTable StockDetail: condition String? -> ItemCondition?, currentStatus String -> ItemStatus
ALTER TABLE "StockDetail" ALTER COLUMN "condition" DROP DEFAULT;
ALTER TABLE "StockDetail" ALTER COLUMN "condition" TYPE "ItemCondition" USING "condition"::text::"ItemCondition";
ALTER TABLE "StockDetail" ALTER COLUMN "condition" SET DEFAULT 'new'::"ItemCondition";
ALTER TABLE "StockDetail" ALTER COLUMN "currentStatus" DROP DEFAULT;
ALTER TABLE "StockDetail" ALTER COLUMN "currentStatus" TYPE "ItemStatus" USING "currentStatus"::text::"ItemStatus";
ALTER TABLE "StockDetail" ALTER COLUMN "currentStatus" SET DEFAULT 'active'::"ItemStatus";

-- AlterTable DeleteRequest: status String -> RequestStatus
ALTER TABLE "DeleteRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DeleteRequest" ALTER COLUMN "status" TYPE "RequestStatus" USING "status"::text::"RequestStatus";
ALTER TABLE "DeleteRequest" ALTER COLUMN "status" SET DEFAULT 'pending'::"RequestStatus";

-- AlterTable PasswordChangeRequest: status String -> RequestStatus
ALTER TABLE "PasswordChangeRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PasswordChangeRequest" ALTER COLUMN "status" TYPE "RequestStatus" USING "status"::text::"RequestStatus";
ALTER TABLE "PasswordChangeRequest" ALTER COLUMN "status" SET DEFAULT 'pending'::"RequestStatus";

-- AlterTable EditRequest: status String -> RequestStatus
ALTER TABLE "EditRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EditRequest" ALTER COLUMN "status" TYPE "RequestStatus" USING "status"::text::"RequestStatus";
ALTER TABLE "EditRequest" ALTER COLUMN "status" SET DEFAULT 'pending'::"RequestStatus";

-- AlterTable ImportRequest: status String -> RequestStatus
ALTER TABLE "ImportRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ImportRequest" ALTER COLUMN "status" TYPE "RequestStatus" USING "status"::text::"RequestStatus";
ALTER TABLE "ImportRequest" ALTER COLUMN "status" SET DEFAULT 'pending'::"RequestStatus";

-- AlterTable ExportRequest: status String -> RequestStatus
ALTER TABLE "ExportRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ExportRequest" ALTER COLUMN "status" TYPE "RequestStatus" USING "status"::text::"RequestStatus";
ALTER TABLE "ExportRequest" ALTER COLUMN "status" SET DEFAULT 'pending'::"RequestStatus";

-- AlterTable VerifyRequest: status String -> RequestStatus
ALTER TABLE "VerifyRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "VerifyRequest" ALTER COLUMN "status" TYPE "RequestStatus" USING "status"::text::"RequestStatus";
ALTER TABLE "VerifyRequest" ALTER COLUMN "status" SET DEFAULT 'pending'::"RequestStatus";
