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

  // Create or update superadmin user
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'noc.voxptech@gmail.com' },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Kx9$mL2@pQ7!vN5b', 10);
    await prisma.user.create({
      data: {
        name: 'Superadmin',
        email: 'noc.voxptech@gmail.com',
        passwordHash: hashedPassword,
        role: 'superadmin',
      },
    });
    console.log('Created superadmin user: noc.voxptech@gmail.com');
  } else if (existingAdmin.role !== 'superadmin') {
    await prisma.user.update({
      where: { email: 'noc.voxptech@gmail.com' },
      data: { role: 'superadmin' },
    });
    console.log('Updated noc.voxptech@gmail.com to superadmin role');
  } else {
    console.log('Superadmin user already exists: noc.voxptech@gmail.com');
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
