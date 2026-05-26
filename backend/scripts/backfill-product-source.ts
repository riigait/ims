import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Finding CSV-imported products via audit logs...');

  // Find all audit logs for product CREATE/UPDATE where changes contain source: csv_import
  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: 'product',
      action: { in: ['CREATE', 'UPDATE'] },
      changes: { contains: 'csv_import' },
    },
    select: { entityId: true, changes: true },
  });

  console.log(`Found ${logs.length} audit log entries with csv_import source.`);

  // Collect unique product IDs
  const productIds = [...new Set(logs.map(l => l.entityId))];
  console.log(`Unique products to back-fill: ${productIds.length}`);

  if (productIds.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  // Only update products that still have no source set
  const updated = await prisma.product.updateMany({
    where: {
      id: { in: productIds },
      source: null,
    },
    data: { source: 'csv_import' },
  });

  console.log(`Updated ${updated.count} products with source = 'csv_import'.`);
  console.log('Done. Products with an existing source were left unchanged.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
