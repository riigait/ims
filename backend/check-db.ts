import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const depts = await prisma.department.findMany();
  console.log('Departments:', depts);

  const users = await prisma.user.findMany();
  console.log('\nUsers:', users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })));

  const adminDepts = await prisma.adminDepartment.findMany({ include: { department: true, user: true } });
  console.log('\nAdmin Departments:', adminDepts);

  const staffDepts = await prisma.staffDepartment.findMany({ include: { department: true, user: true } });
  console.log('\nStaff Departments:', staffDepts);
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
