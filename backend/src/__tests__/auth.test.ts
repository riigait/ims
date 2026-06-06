import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';

// Mock the Prisma singleton so no real DB is needed
jest.mock('../utils/prisma', () => ({
  __esModule: true,
  default: {
    user:              { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    auditLog:          { create: jest.fn().mockResolvedValue({}) },
    adminDepartment:   { findMany: jest.fn().mockResolvedValue([]) },
    staffDepartment:   { findMany: jest.fn().mockResolvedValue([]) },
    product:           { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  },
  checkDatabaseConnection: jest.fn().mockResolvedValue(undefined),
}));

// Mock bcryptjs so we control password comparison results
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('$hashed'),
}));

import prisma from '../utils/prisma';
import bcrypt from 'bcryptjs';

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockCompare   = bcrypt.compare   as jest.Mock;

const JWT_SECRET = process.env.JWT_SECRET!;

const staffUser = {
  id: 'user-staff-1',
  email: 'staff@test.local',
  passwordHash: '$hashed',
  name: 'Test Staff',
  role: 'staff',
  initialSetupComplete: true,
  adminDepartments: [],
  staffDepartments: [{ departmentId: 'dept-A' }],
};

function signToken(userId: string, role = 'staff') {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' });
}

beforeEach(() => {
  jest.clearAllMocks();
  // auditLog.create is fire-and-forget in many routes; keep it silent
  (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
});

// ── 1. Login returns a JWT ────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  it('returns a JWT when credentials are valid', async () => {
    mockFindUnique.mockResolvedValue(staffUser);
    mockCompare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'staff@test.local', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    const decoded = jwt.verify(res.body.token, JWT_SECRET) as any;
    expect(decoded.userId).toBe(staffUser.id);
  });

  it('returns 401 when password is wrong', async () => {
    mockFindUnique.mockResolvedValue(staffUser);
    mockCompare.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'staff@test.local', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when user does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: 'password123' });

    expect(res.status).toBe(401);
  });
});

// ── 2. Protected route rejects missing token ──────────────────────────────────
describe('Auth middleware', () => {
  it('returns 401 when no Authorization header is sent', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

// ── 3. Department scope guard ─────────────────────────────────────────────────
describe('Department scope', () => {
  it('returns 403 when staff accesses a department they are not assigned to', async () => {
    mockFindUnique.mockResolvedValue(staffUser); // assigned to dept-A only
    const token = signToken(staffUser.id);

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Department-Id', 'dept-B'); // not in staffDepartments

    expect(res.status).toBe(403);
  });

  it('passes auth when staff accesses their own department', async () => {
    mockFindUnique.mockResolvedValue({
      ...staffUser,
      // products route also calls prisma — let the second call return something safe
    });
    // Second findUnique call comes from the products route handler; return empty list
    mockFindUnique
      .mockResolvedValueOnce(staffUser)           // authMiddleware
      .mockResolvedValueOnce({ count: 0, data: [] }); // products route (if it queries)

    const token = signToken(staffUser.id);

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Department-Id', 'dept-A'); // correct dept

    // Auth passed — any non-401/403 is a win here
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
