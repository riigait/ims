import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function assignAllLocationsToDepartment() {
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
    console.log(`\n📍 Assigning all locations to ${dept.name}...`);

    // Update all locations
    const result = await prisma.location.updateMany({
      data: { departmentId: dept.id }
    });

    console.log(`\n✅ Successfully assigned ${result.count} locations to ${dept.name}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

assignAllLocationsToDepartment();
