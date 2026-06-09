import 'dotenv/config';
import app from './app';
import prisma, { checkDatabaseConnection } from './utils/prisma';

const INSECURE_DEFAULTS = [
  'change-this-before-deploying',
  'change-this-to-a-long-random-secret',
  'secret',
  'password',
  'changeme',
];

function validateEnv() {
  const errors: string[] = [];
  const { JWT_SECRET, POSTGRES_PASSWORD, NODE_ENV } = process.env;

  if (!JWT_SECRET) errors.push('JWT_SECRET is not set');
  else if (JWT_SECRET.length < 32) errors.push('JWT_SECRET must be at least 32 characters');
  else if (NODE_ENV === 'production' && INSECURE_DEFAULTS.some(d => JWT_SECRET.includes(d)))
    errors.push('JWT_SECRET is set to an insecure default value');

  if (NODE_ENV === 'production') {
    if (!POSTGRES_PASSWORD) errors.push('POSTGRES_PASSWORD is not set');
    else if (INSECURE_DEFAULTS.some(d => POSTGRES_PASSWORD.includes(d)))
      errors.push('POSTGRES_PASSWORD is set to an insecure default value');

    if (!process.env.ALLOWED_ORIGINS)
      errors.push('ALLOWED_ORIGINS is not set — CORS will fall back to localhost only');
  }

  if (errors.length > 0) {
    console.error('❌ Environment validation failed:\n' + errors.map(e => `  • ${e}`).join('\n'));
    process.exit(1);
  }
}

validateEnv();

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
