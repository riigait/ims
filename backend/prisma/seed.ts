import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@ims.local';
  const password = process.env.ADMIN_PASSWORD || 'changeme123';
  const name = process.env.ADMIN_NAME || 'System Admin';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: 'admin' },
  });

  console.log(`Admin user created: ${user.email} (id: ${user.id})`);
  console.log('IMPORTANT: Change the password after first login.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
