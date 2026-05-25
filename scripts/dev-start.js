const { execSync, spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function log(msg)  { console.log(`[IMS] ${msg}`); }
function warn(msg) { console.warn(`[IMS] WARNING: ${msg}`); }
function fail(msg) { console.error(`[IMS] ERROR: ${msg}`); }

// ── 1. Check Docker daemon ────────────────────────────────────────────────────
log('Checking Docker...');
try {
  execSync('docker info', { stdio: 'ignore' });
  log('Docker is running.');
} catch {
  fail('Docker Desktop is not running.');
  fail('Please start Docker Desktop, then run: npm run dev\n');
  process.exit(1);
}

// ── 2. Start database container ───────────────────────────────────────────────
log('Starting database container...');
try {
  const out = execSync('docker-compose up -d', { cwd: ROOT, encoding: 'utf8', stderr: 'pipe' });
  if (out && out.trim()) log(out.trim());
} catch (err) {
  fail('Failed to start the database container.');
  fail('Run manually: docker-compose up -d\n');
  process.exit(1);
}

// ── 3. Wait for PostgreSQL to be ready ───────────────────────────────────────
log('Waiting for database to be ready...');
let ready = false;
for (let i = 1; i <= 15; i++) {
  try {
    execSync('docker exec ims_postgres pg_isready -U ims_user -d ims_db', { stdio: 'ignore' });
    ready = true;
    break;
  } catch {
    process.stdout.write(i === 1 ? '[IMS] ' : '');
    process.stdout.write('.');
    sleep(2000);
  }
}

if (!ready) {
  console.log('');
  fail('Database did not become ready in time.');
  fail('Check logs with: docker-compose logs postgres\n');
  process.exit(1);
}

console.log('');
log('Database is ready.');
log('Starting backend and frontend...\n');

// ── 4. Spawn concurrently (cross-platform, no bash script issues) ─────────────
const concurrentlyBin = path.join(ROOT, 'node_modules/concurrently/dist/bin/concurrently.js');

const child = spawn(
  process.execPath,
  [
    '--no-deprecation',
    concurrentlyBin,
    '-n', 'frontend,backend',
    '-c', 'cyan,yellow',
    'npm run --silent frontend:dev',
    'npm run --silent backend:dev',
  ],
  { stdio: 'inherit', cwd: ROOT }
);

child.on('exit', (code) => process.exit(code ?? 0));
