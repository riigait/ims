import 'dotenv/config';
import app from './app';
import { checkDatabaseConnection, default as prisma } from './utils/prisma';

const PORT = process.env.PORT || 3001;

checkDatabaseConnection().then(() => {
  const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`✅ Database connected`);
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — closing server`);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('Server closed');
      process.exit(0);
    });
    // Force exit if graceful close hangs beyond 10 s
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
});
