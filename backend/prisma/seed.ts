import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SEED_EMAIL = 'admin@ims.local';
const SEED_PASSWORD = 'seed1234';

async function main() {
  // ── Superadmin ──────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const superadmin = await prisma.user.upsert({
    where: { email: SEED_EMAIL },
    update: {},
    create: {
      name: 'Seed Admin',
      email: SEED_EMAIL,
      passwordHash,
      role: 'superadmin',
      initialSetupComplete: true,
    },
  });
  console.log(`Superadmin ready — email: ${SEED_EMAIL}  password: ${SEED_PASSWORD}`);

  // ── Departments ──────────────────────────────────────────────────────────────
  const deptNames = [
    { name: 'Main Warehouse', description: 'Main warehouse and inventory management' },
    { name: 'Headquarters',   description: 'Central headquarters location' },
    { name: 'Central Office', description: 'Professional central office' },
    { name: 'Operations',     description: 'Operational inventory management' },
    { name: 'Main Store',     description: 'Main retail store location' },
  ];

  const departments: Record<string, string> = {};
  for (const d of deptNames) {
    const dept = await prisma.department.upsert({
      where: { name: d.name },
      update: {},
      create: d,
    });
    departments[d.name] = dept.id;
    console.log(`Department: ${d.name}`);
  }

  const primaryDeptId = departments['Main Warehouse'];

  // ── Categories ───────────────────────────────────────────────────────────────
  const category = await prisma.category.upsert({
    where: { name_departmentId: { name: 'General Supplies', departmentId: primaryDeptId } },
    update: {},
    create: {
      name: 'General Supplies',
      description: 'Everyday office and warehouse supplies',
      departmentId: primaryDeptId,
    },
  });
  console.log(`Category: ${category.name}`);

  // ── Products ─────────────────────────────────────────────────────────────────
  const products = [
    { sku: 'SKU-000001', name: 'A4 Bond Paper (Ream)',    unit: 'pack',   currentStock: 50, lowStockThreshold: 10 },
    { sku: 'SKU-000002', name: 'Ballpen (Black)',          unit: 'dozen',  currentStock: 24, lowStockThreshold: 5  },
    { sku: 'SKU-000003', name: 'Whiteboard Marker Set',    unit: 'pack',   currentStock: 8,  lowStockThreshold: 3  },
    { sku: 'SKU-000004', name: 'Stapler',                  unit: 'pcs',    currentStock: 6,  lowStockThreshold: 2  },
    { sku: 'SKU-000005', name: 'Manila Folder (Short)',    unit: 'pack',   currentStock: 30, lowStockThreshold: 10 },
    { sku: 'SKU-000006', name: 'Tape Dispenser',           unit: 'pcs',    currentStock: 4,  lowStockThreshold: 2  },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        ...p,
        categoryId: category.id,
        departmentId: primaryDeptId,
        source: 'manual',
      },
    });
    console.log(`Product: ${p.name} (${p.sku})`);
  }

  console.log('\nSeeding complete!');
  console.log(`\nLogin at http://localhost:5173`);
  console.log(`  Email:    ${SEED_EMAIL}`);
  console.log(`  Password: ${SEED_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
