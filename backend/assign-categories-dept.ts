import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function assignAllCategoriesToDepartment() {
  try {
    console.log('🔍 Looking for SCADA Office department...');

    // Find the SCADA Office department
    const dept = await prisma.department.findFirst({
      where: { name: 'SCADA Office' }
    });

    if (!dept) {
      console.error('❌ SCADA Office department not found');
      process.exit(1);
    }

    console.log(`✓ Found department: ${dept.name} (${dept.id})`);
    console.log(`\n📂 Assigning all categories to ${dept.name}...`);

    // Update all categories
    const result = await prisma.category.updateMany({
      data: { departmentId: dept.id }
    });

    console.log(`\n✅ Successfully assigned ${result.count} categories to ${dept.name}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

assignAllCategoriesToDepartment();
