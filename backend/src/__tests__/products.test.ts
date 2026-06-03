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
    product: {
      findMany:   jest.fn().mockResolvedValue([]),
      count:      jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      delete:     jest.fn(),
    },
    category:      { findUnique: jest.fn().mockResolvedValue(null) },
    location:      { findUnique: jest.fn().mockResolvedValue(null) },
    importRequest: { create: jest.fn().mockResolvedValue({}) },
    stockDetail:   { findMany: jest.fn().mockResolvedValue([]) },
  },
  checkDatabaseConnection: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET!;

// Superadmin: read-only on department-scoped write routes
const superadmin = {
  id: 'user-sa-1',
  role: 'superadmin',
  initialSetupComplete: true,
  adminDepartments: [],
  staffDepartments: [],
};

// Admin with one dept: can write with X-Department-Id header
const adminUser = {
  id: 'user-admin-1',
  role: 'admin',
  initialSetupComplete: true,
  adminDepartments: [{ departmentId: 'dept-1' }],
  staffDepartments: [],
};

const DEPT = 'dept-1';

function signToken(userId: string, role: string) {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' });
}

const mockUserFQ     = () => prisma.user.findUnique as jest.Mock;
const mockProductFQ  = () => prisma.product.findUnique as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  (prisma.importRequest.create as jest.Mock).mockResolvedValue({});
  (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.product.count as jest.Mock).mockResolvedValue(0);
  (prisma.stockDetail.findMany as jest.Mock).mockResolvedValue([]);
});

// ── GET /api/products ─────────────────────────────────────────────────────────
describe('GET /api/products', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  it('returns 200 for a superadmin', async () => {
    mockUserFQ().mockResolvedValue(superadmin);
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${signToken(superadmin.id, 'superadmin')}`);
    expect(res.status).toBe(200);
  });
});

// ── GET /api/products/:id ─────────────────────────────────────────────────────
describe('GET /api/products/:id', () => {
  it('returns 404 when product does not exist', async () => {
    mockUserFQ().mockResolvedValue(superadmin);
    mockProductFQ().mockResolvedValue(null);
    const res = await request(app)
      .get('/api/products/no-such-id')
      .set('Authorization', `Bearer ${signToken(superadmin.id, 'superadmin')}`);
    expect(res.status).toBe(404);
  });
});

// ── POST /api/products — input validation ─────────────────────────────────────
describe('POST /api/products — validation', () => {
  beforeEach(() => { mockUserFQ().mockResolvedValue(adminUser); });

  const post = (body: object) =>
    request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${signToken(adminUser.id, 'admin')}`)
      .set('X-Department-Id', DEPT)
      .send(body);

  it('returns 400 when name is missing', async () => {
    const res = await post({ categoryId: 'cat-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('returns 400 when categoryId is missing', async () => {
    const res = await post({ name: 'Widget' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/categoryId/i);
  });

  it('returns 400 when name exceeds 200 characters', async () => {
    const res = await post({ name: 'A'.repeat(201), categoryId: 'cat-1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when currentStock is negative', async () => {
    const res = await post({ name: 'Widget', categoryId: 'cat-1', currentStock: -1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when unitPrice is not a number', async () => {
    const res = await post({ name: 'Widget', categoryId: 'cat-1', unitPrice: 'free' });
    expect(res.status).toBe(400);
  });

  it('returns 403 when superadmin attempts a write', async () => {
    mockUserFQ().mockResolvedValue(superadmin);
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${signToken(superadmin.id, 'superadmin')}`)
      .send({ name: 'Widget', categoryId: 'cat-1' });
    expect(res.status).toBe(403);
  });
});

// ── PUT /api/products/:id ─────────────────────────────────────────────────────
describe('PUT /api/products/:id', () => {
  it('returns 404 when product does not exist', async () => {
    mockUserFQ().mockResolvedValue(adminUser);
    mockProductFQ().mockResolvedValue(null);
    const res = await request(app)
      .put('/api/products/no-such-id')
      .set('Authorization', `Bearer ${signToken(adminUser.id, 'admin')}`)
      .set('X-Department-Id', DEPT)
      .send({ name: 'Updated', categoryId: 'cat-1' });
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/products/:id ──────────────────────────────────────────────────
describe('DELETE /api/products/:id', () => {
  it('returns 404 when product does not exist', async () => {
    mockUserFQ().mockResolvedValue(adminUser);
    mockProductFQ().mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/products/no-such-id')
      .set('Authorization', `Bearer ${signToken(adminUser.id, 'admin')}`)
      .set('X-Department-Id', DEPT);
    expect(res.status).toBe(404);
  });
});
