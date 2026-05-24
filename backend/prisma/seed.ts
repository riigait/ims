import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const departments = [
    { name: 'Main Warehouse', description: 'Main warehouse and inventory management' },
    { name: 'Headquarters', description: 'Central headquarters location' },
    { name: 'Central Office', description: 'Professional central office' },
    { name: 'Operations', description: 'Operational inventory management' },
    { name: 'Main Store', description: 'Main retail store location' },
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
