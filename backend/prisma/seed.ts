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

  // Create default superadmin for initial setup
  const existingDefault = await prisma.user.findUnique({
    where: { email: 'admin@ims.local' },
  });

  if (!existingDefault) {
    const hashedPassword = await bcrypt.hash('changeme123', 10);
    await prisma.user.create({
      data: {
        name: 'Superadmin',
        email: 'admin@ims.local',
        passwordHash: hashedPassword,
        role: 'superadmin',
        initialSetupComplete: false,
      },
    });
    console.log('Created default superadmin: admin@ims.local (changeme123) - REQUIRES INITIAL SETUP');
  } else {
    console.log('Default superadmin already exists: admin@ims.local');
  }

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
