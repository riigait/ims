import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function checkDatabaseConnection(): Promise<void> {
  try {
    await prisma.$connect();
  } catch {
    console.error('\n❌ Database is not running.');
    console.error('   Start it with: docker-compose up -d');
    console.error('   Then restart the backend.\n');
    process.exit(1);
  }
}

export default prisma;
