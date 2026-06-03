import request from 'supertest';
import app from '../app';

// Minimal Prisma mock — validation runs before any DB call
jest.mock('../utils/prisma', () => ({
  __esModule: true,
  default: {
    user:            { findUnique: jest.fn().mockResolvedValue(null) },
    auditLog:        { create: jest.fn().mockResolvedValue({}) },
    adminDepartment: { findMany: jest.fn().mockResolvedValue([]) },
    staffDepartment: { findMany: jest.fn().mockResolvedValue([]) },
    product:         { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    inviteCode:      { findUnique: jest.fn().mockResolvedValue(null) },
  },
  checkDatabaseConnection: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('$hashed'),
}));

beforeEach(() => jest.clearAllMocks());

// ── POST /api/auth/login — input validation ────────────────────────────────────
describe('POST /api/auth/login — input validation', () => {
  const login = (body: object) =>
    request(app).post('/api/auth/login').send(body);

  it('returns 400 when email is missing', async () => {
    const res = await login({ password: 'Password1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when email format is invalid', async () => {
    const res = await login({ email: 'not-an-email', password: 'Password1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('returns 400 when fields are not strings', async () => {
    const res = await login({ email: 123, password: true });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password exceeds 128 characters', async () => {
    const res = await login({ email: 'user@test.local', password: 'A'.repeat(129) });
    expect(res.status).toBe(400);
  });
});

// ── POST /api/auth/register — input validation ────────────────────────────────
describe('POST /api/auth/register — input validation', () => {
  const register = (body: object) =>
    request(app).post('/api/auth/register').send(body);

  it('returns 400 when name is missing', async () => {
    const res = await register({ email: 'u@test.local', password: 'Password1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when email format is invalid', async () => {
    const res = await register({ name: 'Bob', email: 'bad-email', password: 'Password1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('returns 400 when fields are not strings', async () => {
    const res = await register({ name: 99, email: 'u@test.local', password: 'Password1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when name exceeds 100 characters', async () => {
    const res = await register({ name: 'N'.repeat(101), email: 'u@test.local', password: 'Password1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too weak (no uppercase)', async () => {
    const res = await register({ name: 'Bob', email: 'u@test.local', password: 'password1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  it('returns 400 when password is too short', async () => {
    const res = await register({ name: 'Bob', email: 'u@test.local', password: 'Ab1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password exceeds 128 characters', async () => {
    const res = await register({ name: 'Bob', email: 'u@test.local', password: 'Aa1' + 'x'.repeat(126) });
    expect(res.status).toBe(400);
  });
});
