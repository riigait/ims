import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const departments = [
    { name: 'Boss House', description: 'Boss House location' },
    { name: 'Office Accounting', description: 'Office Accounting location' },
    { name: 'SCADA Dorm', description: 'SCADA Dorm location' },
    { name: 'SCADA Office', description: 'SCADA Office location' },
    { name: 'Tenant House', description: 'Tenant House location' },
  ];

  for (const dept of departments) {
    const existing = await prisma.department.findUnique({
      where: { name: dept.name },
    });

    if (!existing) {
      await prisma.department.create({
        data: dept,
      });
      console.log(`Created department: ${dept.name}`);
    } else {
      console.log(`Department already exists: ${dept.name}`);
    }
  }

  // Note: Default superadmin is created automatically on first login via /api/auth/ensure-superadmin
  console.log('Note: Default superadmin will be created on first login attempt if none exists');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
