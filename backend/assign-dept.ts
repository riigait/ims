import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function assignAllProductsToDepartment() {
  try {
    console.log('🔍 Looking for SCADA-office department...');

    // Find the SCADA Office department
    const dept = await prisma.department.findFirst({
      where: { name: 'SCADA Office' }
    });

    if (!dept) {
      console.error('❌ SCADA Office department not found');
      console.log('Available departments:');
      const allDepts = await prisma.department.findMany();
      allDepts.forEach(d => console.log(`   - ${d.name} (${d.id})`));
      process.exit(1);
    }

    console.log(`✓ Found department: ${dept.name} (${dept.id})`);
    console.log(`\n📦 Assigning all products to ${dept.name}...`);

    // Update all products
    const result = await prisma.product.updateMany({
      data: { departmentId: dept.id }
    });

    console.log(`\n✅ Successfully assigned ${result.count} products to ${dept.name}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

assignAllProductsToDepartment();
