import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateStockMovements() {
  try {
    console.log('Starting stock movements migration...');

    // Find all stock movements with null departmentId
    const movementsWithoutDept = await prisma.stockMovement.findMany({
      where: { departmentId: null },
      include: { product: true },
    });

    console.log(`Found ${movementsWithoutDept.length} stock movements without departmentId`);

    if (movementsWithoutDept.length === 0) {
      console.log('No migrations needed');
      await prisma.$disconnect();
      return;
    }

    // Update each movement with product's departmentId
    let updated = 0;
    for (const movement of movementsWithoutDept) {
      if (movement.product.departmentId) {
        await prisma.stockMovement.update({
          where: { id: movement.id },
          data: { departmentId: movement.product.departmentId },
        });
        updated++;
      }
    }

    console.log(`✓ Successfully updated ${updated} stock movements`);
    await prisma.$disconnect();
  } catch (error) {
    console.error('Migration failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

migrateStockMovements();
