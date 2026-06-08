-- ROLLBACK NOTE: ALTER TYPE ... ADD VALUE cannot be rolled back in PostgreSQL without
-- removing all rows that reference the new value and then dropping/recreating the enum.
-- Safe rollback steps: (1) remove or recast all rows using the added values,
-- (2) rerun the enum migration without the unwanted values.

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
