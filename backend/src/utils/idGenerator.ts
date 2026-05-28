import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const year = () => new Date().getFullYear().toString();
const dateStamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

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

  const match = lastStock.stockId.match(/STK-(\d+)/);
  if (!match) return 'STK-000001';

  const nextNum = parseInt(match[1]) + 1;
  return `STK-${String(nextNum).padStart(6, '0')}`;
}

/**
 * Generate next product SKU in format SKU-000001 (globally sequential)
 */
export async function generateSku(): Promise<string> {
  const lastProduct = await prisma.product.findFirst({
    where: { sku: { startsWith: 'SKU-' } },
    orderBy: { sku: 'desc' },
    select: { sku: true },
  });

  let nextNum = 1;
  if (lastProduct?.sku) {
    const match = lastProduct.sku.match(/SKU-(\d{6})$/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }

  return `SKU-${String(nextNum).padStart(6, '0')}`;
}

/**
 * Generate next asset tag in format IMS-YYYY-000001 (resets each year)
 */
export async function generateAssetTag(): Promise<string> {
  const prefix = `IMS-${year()}-`;
  const lastDetail = await prisma.stockDetail.findFirst({
    where: { assetTag: { startsWith: prefix } },
    orderBy: { assetTag: 'desc' },
    select: { assetTag: true },
  });

  let nextNum = 1;
  if (lastDetail?.assetTag) {
    const match = lastDetail.assetTag.match(/IMS-\d{4}-(\d{6})$/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }

  return `${prefix}${String(nextNum).padStart(6, '0')}`;
}

/**
 * Generate next movement number in format MVT-YYYY-000001 (resets each year)
 */
export async function generateMovementNo(): Promise<string> {
  const prefix = `MVT-${year()}-`;
  const lastMovement = await prisma.stockMovement.findFirst({
    where: { movementNo: { startsWith: prefix } },
    orderBy: { movementNo: 'desc' },
    select: { movementNo: true },
  });

  if (!lastMovement || !lastMovement.movementNo) {
    return `${prefix}000001`;
  }

  const match = lastMovement.movementNo.match(/MVT-\d{4}-(\d+)/);
  if (!match) return `${prefix}000001`;

  const nextNum = parseInt(match[1]) + 1;
  return `${prefix}${String(nextNum).padStart(6, '0')}`;
}

/**
 * Generate next request number in format REQ-YYYY-000001 (resets each year)
 */
export async function generateRequestNo(): Promise<string> {
  const prefix = `REQ-${year()}-`;
  const lastRequest = await prisma.importRequest.findFirst({
    where: { requestNo: { startsWith: prefix } },
    orderBy: { requestNo: 'desc' },
    select: { requestNo: true },
  });

  let nextNum = 1;
  if (lastRequest?.requestNo) {
    const match = lastRequest.requestNo.match(/REQ-\d{4}-(\d+)/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }

  return `${prefix}${String(nextNum).padStart(6, '0')}`;
}

/**
 * Generate next import batch ID in format IMP-YYYYMMDD-0001 (resets each day)
 */
export async function generateImportBatchId(): Promise<string> {
  const prefix = `IMP-${dateStamp()}-`;
  const lastRequest = await prisma.importRequest.findFirst({
    where: { csvImportId: { startsWith: prefix } },
    orderBy: { csvImportId: 'desc' },
    select: { csvImportId: true },
  });

  let nextNum = 1;
  if (lastRequest?.csvImportId) {
    const match = lastRequest.csvImportId.match(/IMP-\d{8}-(\d+)/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }

  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}
