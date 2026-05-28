import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Generate next stock ID in format STK-000001
 */
export async function generateStockId(): Promise<string> {
  const lastStock = await prisma.stockDetail.findFirst({
    where: { stockId: { not: null } },
    orderBy: { stockId: 'desc' },
  });

  if (!lastStock || !lastStock.stockId) {
    return 'STK-000001';
  }

  // Extract number from STK-000001
  const match = lastStock.stockId.match(/STK-(\d+)/);
  if (!match) return 'STK-000001';

  const nextNum = parseInt(match[1]) + 1;
  return `STK-${String(nextNum).padStart(6, '0')}`;
}

/**
 * Generate next product SKU in format AAA-000001
 * Prefix = first 3 alpha chars of product name (uppercased, padded with X)
 * Number = globally sequential across all products
 */
export async function generateProductSKU(name: string): Promise<string> {
  const prefix = (name.replace(/[^a-zA-Z]/g, '').toUpperCase() + 'XXX').slice(0, 3);

  const lastProduct = await prisma.product.findFirst({
    where: { sku: { contains: '-' } },
    orderBy: { sku: 'desc' },
    select: { sku: true },
  });

  let nextNum = 1;
  if (lastProduct?.sku) {
    const match = lastProduct.sku.match(/-(\d{6})$/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }

  return `${prefix}-${String(nextNum).padStart(6, '0')}`;
}

/**
 * Generate next movement number in format MVT-000001
 */
export async function generateMovementNo(): Promise<string> {
  const lastMovement = await prisma.stockMovement.findFirst({
    where: { movementNo: { not: null } },
    orderBy: { createdAt: 'desc' },
  });

  if (!lastMovement || !lastMovement.movementNo) {
    return 'MVT-000001';
  }

  // Extract number from MVT-000001
  const match = lastMovement.movementNo.match(/MVT-(\d+)/);
  if (!match) return 'MVT-000001';

  const nextNum = parseInt(match[1]) + 1;
  return `MVT-${String(nextNum).padStart(6, '0')}`;
}
