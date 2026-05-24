import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Generate next stock ID in format STK-000001
 */
export async function generateStockId(): Promise<string> {
  const lastStock = await prisma.stockDetail.findFirst({
    where: { stockId: { not: null } },
    orderBy: { createdAt: 'desc' },
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
