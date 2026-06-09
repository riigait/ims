import request from 'supertest';
import app from '../app';
import { superadmin, adminUser, DEPT, sign } from './testHelpers';

jest.mock('../utils/prisma', () => ({
  __esModule: true,
  default: {
    user:            { findUnique: jest.fn() },
    auditLog:        { create: jest.fn().mockResolvedValue({}) },
    adminDepartment: { findMany: jest.fn().mockResolvedValue([]) },
    staffDepartment: { findMany: jest.fn().mockResolvedValue([]) },
    product:         { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    location: {
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

const mockUserFQ  = () => prisma.user.findUnique as jest.Mock;
const mockLocFQ   = () => prisma.location.findUnique as jest.Mock;
const mockLocCreate = () => prisma.location.create as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  (prisma.location.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.location.count as jest.Mock).mockResolvedValue(0);
});

// ── GET /api/locations ────────────────────────────────────────────────────────
describe('GET /api/locations', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/locations');
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty list for superadmin', async () => {
    mockUserFQ().mockResolvedValue(superadmin);
    const res = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${sign(superadmin.id, 'superadmin')}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });
});

// ── GET /api/locations/:id ────────────────────────────────────────────────────
describe('GET /api/locations/:id', () => {
  it('returns 404 when location does not exist', async () => {
    mockUserFQ().mockResolvedValue(superadmin);
    mockLocFQ().mockResolvedValue(null);
    const res = await request(app)
      .get('/api/locations/no-such-id')
      .set('Authorization', `Bearer ${sign(superadmin.id, 'superadmin')}`);
    expect(res.status).toBe(404);
  });

  it('returns 200 for an existing location', async () => {
    mockUserFQ().mockResolvedValue(superadmin);
    mockLocFQ().mockResolvedValue({ id: 'loc-1', name: 'Room A', type: 'room', departmentId: null, parent: null, children: [] });
    const res = await request(app)
      .get('/api/locations/loc-1')
      .set('Authorization', `Bearer ${sign(superadmin.id, 'superadmin')}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Room A');
  });
});

// ── POST /api/locations — validation ─────────────────────────────────────────
describe('POST /api/locations — validation', () => {
  beforeEach(() => mockUserFQ().mockResolvedValue(adminUser));

  const post = (body: object) =>
    request(app)
      .post('/api/locations')
      .set('Authorization', `Bearer ${sign(adminUser.id, 'admin')}`)
      .set('X-Department-Id', DEPT)
      .send(body);

  it('returns 400 when name is missing', async () => {
    const res = await post({ type: 'room' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('returns 400 when type is missing', async () => {
    const res = await post({ name: 'Room A' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type/i);
  });

  it('returns 400 when type is not a valid enum value', async () => {
    const res = await post({ name: 'Room A', type: 'hangar' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type must be one of/i);
  });

  it('returns 400 when name exceeds 255 characters', async () => {
    const res = await post({ name: 'A'.repeat(256), type: 'room' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when notes is not a string', async () => {
    const res = await post({ name: 'Room A', type: 'room', notes: 42 });
    expect(res.status).toBe(400);
  });

  it('returns 201 with valid body', async () => {
    mockLocCreate().mockResolvedValue({ id: 'loc-new', name: 'Room A', type: 'room', departmentId: DEPT });
    const res = await post({ name: 'Room A', type: 'room', notes: 'Ground floor' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Room A');
  });

  it('accepts all valid location types', async () => {
    const types = ['branch', 'building', 'floor', 'room', 'rack', 'shelf'];
    for (const type of types) {
      mockLocCreate().mockResolvedValue({ id: 'loc-new', name: 'X', type, departmentId: DEPT });
      const res = await post({ name: 'X', type });
      expect(res.status).toBe(201);
    }
  });
});

// ── PUT /api/locations/:id — validation ──────────────────────────────────────
describe('PUT /api/locations/:id — validation', () => {
  beforeEach(() => mockUserFQ().mockResolvedValue(adminUser));

  const put = (body: object) =>
    request(app)
      .put('/api/locations/loc-1')
      .set('Authorization', `Bearer ${sign(adminUser.id, 'admin')}`)
      .set('X-Department-Id', DEPT)
      .send(body);

  it('returns 404 when location does not exist', async () => {
    mockLocFQ().mockResolvedValue(null);
    const res = await put({ name: 'Updated', type: 'room' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when type is invalid', async () => {
    mockLocFQ().mockResolvedValue({ id: 'loc-1', name: 'Room A', type: 'room', departmentId: DEPT });
    const res = await put({ name: 'Room A', type: 'moonbase' });
    expect(res.status).toBe(400);
  });

  it('returns 403 when superadmin attempts a write', async () => {
    mockUserFQ().mockResolvedValue(superadmin);
    const res = await request(app)
      .put('/api/locations/loc-1')
      .set('Authorization', `Bearer ${sign(superadmin.id, 'superadmin')}`)
      .send({ name: 'Updated', type: 'room' });
    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/locations/:id ─────────────────────────────────────────────────
describe('DELETE /api/locations/:id', () => {
  it('returns 404 when location does not exist', async () => {
    mockUserFQ().mockResolvedValue(adminUser);
    mockLocFQ().mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/locations/no-such-id')
      .set('Authorization', `Bearer ${sign(adminUser.id, 'admin')}`)
      .set('X-Department-Id', DEPT);
    expect(res.status).toBe(404);
  });

  it('returns 403 when staff tries to delete', async () => {
    const staffUser = { ...adminUser, id: 'user-staff-1', role: 'staff', adminDepartments: [], staffDepartments: [{ departmentId: DEPT }] };
    mockUserFQ().mockResolvedValue(staffUser);
    mockLocFQ().mockResolvedValue({ id: 'loc-1', name: 'Room A', type: 'room', departmentId: DEPT });
    const res = await request(app)
      .delete('/api/locations/loc-1')
      .set('Authorization', `Bearer ${sign(staffUser.id, 'staff')}`)
      .set('X-Department-Id', DEPT);
    expect(res.status).toBe(403);
  });
});
