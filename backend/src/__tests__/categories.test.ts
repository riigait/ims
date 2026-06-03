import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';

jest.mock('../utils/prisma', () => ({
  __esModule: true,
  default: {
    user:            { findUnique: jest.fn() },
    auditLog:        { create: jest.fn().mockResolvedValue({}) },
    adminDepartment: { findMany: jest.fn().mockResolvedValue([]) },
    staffDepartment: { findMany: jest.fn().mockResolvedValue([]) },
    product:         { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    category: {
      findMany:   jest.fn().mockResolvedValue([]),
      count:      jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      delete:     jest.fn(),
    },
  },
  checkDatabaseConnection: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET!;

const superadmin = {
  id: 'user-sa-1', role: 'superadmin', initialSetupComplete: true,
  adminDepartments: [], staffDepartments: [],
};
const adminUser = {
  id: 'user-admin-1', role: 'admin', initialSetupComplete: true,
  adminDepartments: [{ departmentId: 'dept-1' }], staffDepartments: [],
};

const DEPT = 'dept-1';

function sign(userId: string, role: string) {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' });
}

const mockUserFQ    = () => prisma.user.findUnique as jest.Mock;
const mockCatFQ     = () => prisma.category.findUnique as jest.Mock;
const mockCatCreate = () => prisma.category.create as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  (prisma.category.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.category.count as jest.Mock).mockResolvedValue(0);
});

// ── GET /api/categories ───────────────────────────────────────────────────────
describe('GET /api/categories', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty list for superadmin', async () => {
    mockUserFQ().mockResolvedValue(superadmin);
    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${sign(superadmin.id, 'superadmin')}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });
});

// ── GET /api/categories/:id ───────────────────────────────────────────────────
describe('GET /api/categories/:id', () => {
  it('returns 404 when category does not exist', async () => {
    mockUserFQ().mockResolvedValue(superadmin);
    mockCatFQ().mockResolvedValue(null);
    const res = await request(app)
      .get('/api/categories/no-such-id')
      .set('Authorization', `Bearer ${sign(superadmin.id, 'superadmin')}`);
    expect(res.status).toBe(404);
  });

  it('returns 200 for an existing category', async () => {
    mockUserFQ().mockResolvedValue(superadmin);
    mockCatFQ().mockResolvedValue({ id: 'cat-1', name: 'Supplies', departmentId: null });
    const res = await request(app)
      .get('/api/categories/cat-1')
      .set('Authorization', `Bearer ${sign(superadmin.id, 'superadmin')}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Supplies');
  });
});

// ── POST /api/categories — validation ────────────────────────────────────────
describe('POST /api/categories — validation', () => {
  beforeEach(() => mockUserFQ().mockResolvedValue(adminUser));

  const post = (body: object) =>
    request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${sign(adminUser.id, 'admin')}`)
      .set('X-Department-Id', DEPT)
      .send(body);

  it('returns 400 when name is missing', async () => {
    const res = await post({ description: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('returns 400 when name is not a string', async () => {
    const res = await post({ name: 123 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when name exceeds 255 characters', async () => {
    const res = await post({ name: 'A'.repeat(256) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when description is not a string', async () => {
    const res = await post({ name: 'Supplies', description: 99 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when description exceeds 1000 characters', async () => {
    const res = await post({ name: 'Supplies', description: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
  });

  it('returns 201 with valid body', async () => {
    mockCatCreate().mockResolvedValue({ id: 'cat-new', name: 'Supplies', departmentId: DEPT });
    const res = await post({ name: 'Supplies', description: 'Office supplies' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Supplies');
  });
});

// ── PUT /api/categories/:id — validation ─────────────────────────────────────
describe('PUT /api/categories/:id — validation', () => {
  beforeEach(() => mockUserFQ().mockResolvedValue(adminUser));

  const put = (body: object) =>
    request(app)
      .put('/api/categories/cat-1')
      .set('Authorization', `Bearer ${sign(adminUser.id, 'admin')}`)
      .set('X-Department-Id', DEPT)
      .send(body);

  it('returns 404 when category does not exist', async () => {
    mockCatFQ().mockResolvedValue(null);
    const res = await put({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when name exceeds 255 characters', async () => {
    mockCatFQ().mockResolvedValue({ id: 'cat-1', name: 'Old', departmentId: DEPT });
    const res = await put({ name: 'A'.repeat(256) });
    expect(res.status).toBe(400);
  });

  it('returns 403 when superadmin attempts a write', async () => {
    mockUserFQ().mockResolvedValue(superadmin);
    const res = await request(app)
      .put('/api/categories/cat-1')
      .set('Authorization', `Bearer ${sign(superadmin.id, 'superadmin')}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/categories/:id ────────────────────────────────────────────────
describe('DELETE /api/categories/:id', () => {
  it('returns 404 when category does not exist', async () => {
    mockUserFQ().mockResolvedValue(adminUser);
    mockCatFQ().mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/categories/no-such-id')
      .set('Authorization', `Bearer ${sign(adminUser.id, 'admin')}`)
      .set('X-Department-Id', DEPT);
    expect(res.status).toBe(404);
  });

  it('returns 403 when staff tries to delete', async () => {
    const staffUser = { ...adminUser, id: 'user-staff-1', role: 'staff', adminDepartments: [], staffDepartments: [{ departmentId: DEPT }] };
    mockUserFQ().mockResolvedValue(staffUser);
    mockCatFQ().mockResolvedValue({ id: 'cat-1', name: 'Supplies', departmentId: DEPT });
    const res = await request(app)
      .delete('/api/categories/cat-1')
      .set('Authorization', `Bearer ${sign(staffUser.id, 'staff')}`)
      .set('X-Department-Id', DEPT);
    expect(res.status).toBe(403);
  });
});
