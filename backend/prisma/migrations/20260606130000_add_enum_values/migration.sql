-- Add missing MovementType values discovered in application code
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'lost';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'found';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'pre_deployment';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'post_deployment';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'repair_out';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'repair_return';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'defective';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'disposal';

-- Add missing ItemStatus value
ALTER TYPE "ItemStatus" ADD VALUE IF NOT EXISTS 'defective';
