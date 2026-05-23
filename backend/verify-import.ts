import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  const totalProducts = await prisma.product.count();
  const productsWithoutLocation = await prisma.product.count({
    where: { locationId: null }
  });
  const productsWithLocation = totalProducts - productsWithoutLocation;

  const categories = await prisma.category.count();
  const locations = await prisma.location.count();

  console.log('📊 Import Verification:');
  console.log(`   Total Products: ${totalProducts}`);
  console.log(`   Products with location: ${productsWithLocation}`);
  console.log(`   Products without location (NULL): ${productsWithoutLocation}`);
  console.log(`   Total Categories: ${categories}`);
  console.log(`   Total Locations: ${locations}`);

  if (productsWithoutLocation > 0) {
    console.log(`\n⚠️  ${productsWithoutLocation} products have no location assigned.`);
    console.log('   These products came from CSV rows with empty location field.');
    console.log('   They can still be filtered and managed, but have no physical location.');
  }

  await prisma.$disconnect();
}

verify();
