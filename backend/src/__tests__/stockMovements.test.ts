import request from 'supertest';
import jwt from 'jsonwebtoken';

// ── Prisma mock ───────────────────────────────────────────────────────────────
jest.mock('../utils/prisma', () => {
  const mock: any = {
    user:          { findUnique: jest.fn() },
    auditLog:      { create: jest.fn().mockResolvedValue({}) },
    stockMovement: {
      findUnique: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn().mockResolvedValue({}),
      findMany:   jest.fn().mockResolvedValue([]),
      count:      jest.fn().mockResolvedValue(0),
    },
    stockDetail: {
      update:     jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    stockMovementItem: {
      create: jest.fn().mockResolvedValue({}),
    },
    product: {
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn: any) => fn(mock));
  return { __esModule: true, default: mock, checkDatabaseConnection: jest.fn().mockResolvedValue(undefined) };
});

// ── idGenerator mock ──────────────────────────────────────────────────────────
jest.mock('../utils/idGenerator', () => ({
  generateMovementNo: jest.fn().mockResolvedValue('MVT-TEST-000001'),
  generateStockId:    jest.fn().mockResolvedValue('STK-000001'),
  generateSku:        jest.fn().mockResolvedValue('SKU-000001'),
  generateRequestNo:  jest.fn().mockResolvedValue('REQ-000001'),
  generateImportBatchId: jest.fn().mockResolvedValue('BATCH-000001'),
}));

import app from '../app';
import prisma from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET!;
const DEPT = 'dept-1';

function signToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

const adminUser = {
  id: 'user-admin-1',
  role: 'admin',
  initialSetupComplete: true,
  adminDepartments: [{ departmentId: DEPT }],
  staffDepartments: [],
};

const superadminUser = {
  id: 'user-sa-1',
  role: 'superadmin',
  initialSetupComplete: true,
  adminDepartments: [],
  staffDepartments: [],
};

// ── Movement fixtures ─────────────────────────────────────────────────────────
function makeMovement(status: 'pending' | 'committed' | 'cancelled', overrides: object = {}) {
  return {
    id: `mvt-${status}-1`,
    movementNo: 'MVT-2026-000001',
    movementType: 'stock_in',
    status,
    remarks: null,
    departmentId: DEPT,
    toDepartmentId: null,
    userId: adminUser.id,
    createdAt: new Date(),
    updatedAt: new Date(),
    department: { id: DEPT, name: 'Test Dept' },
    items: [],
    ...overrides,
  };
}

const mockUser    = () => prisma.user.findUnique as jest.Mock;
const mockMovFQ   = () => prisma.stockMovement.findUnique as jest.Mock;
const mockMovUp   = () => prisma.stockMovement.update as jest.Mock;
const mockMovCr   = () => prisma.stockMovement.create as jest.Mock;
const mockAudit   = () => prisma.auditLog.create as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockAudit().mockResolvedValue({});
  mockMovUp().mockResolvedValue({});
  (prisma.stockDetail.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  (prisma.stockDetail.update as jest.Mock).mockResolvedValue({});
  (prisma.stockMovementItem.create as jest.Mock).mockResolvedValue({});
  (prisma.product.update as jest.Mock).mockResolvedValue({});
  (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(prisma));
});

// ── Auth guards ───────────────────────────────────────────────────────────────
describe('GET /api/stock-movements — auth', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/stock-movements');
    expect(res.status).toBe(401);
  });

  it('returns 403 for superadmin write attempts', async () => {
    mockUser().mockResolvedValue(superadminUser);
    const res = await request(app)
      .post('/api/stock-movements')
      .set('Authorization', `Bearer ${signToken(superadminUser.id)}`)
      .set('X-Department-Id', DEPT)
      .send({});
    expect(res.status).toBe(403);
  });
});

// ── PUT /:id — lifecycle state guards ─────────────────────────────────────────
describe('PUT /api/stock-movements/:id — lifecycle guards', () => {
  const put = (id: string, body: object) =>
    request(app)
      .put(`/api/stock-movements/${id}`)
      .set('Authorization', `Bearer ${signToken(adminUser.id)}`)
      .set('X-Department-Id', DEPT)
      .send(body);

  beforeEach(() => { mockUser().mockResolvedValue(adminUser); });

  it('returns 409 when movement is committed', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('committed'));
    const res = await put('mvt-committed-1', { remarks: 'update' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/committed/i);
  });

  it('returns 409 when movement is cancelled', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('cancelled'));
    const res = await put('mvt-cancelled-1', { remarks: 'update' });
    expect(res.status).toBe(409);
  });

  it('returns 200 and updates remarks on a pending movement', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('pending'));
    mockMovUp().mockResolvedValue({ ...makeMovement('pending'), remarks: 'new remark' });
    const res = await put('mvt-pending-1', { remarks: 'new remark' });
    expect(res.status).toBe(200);
    expect(prisma.stockMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ remarks: 'new remark' }) })
    );
  });

  it('allows pending → committed status transition', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('pending'));
    mockMovUp().mockResolvedValue({ ...makeMovement('committed') });
    const res = await put('mvt-pending-1', { status: 'committed' });
    expect(res.status).toBe(200);
  });

  it('allows pending → cancelled status transition', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('pending'));
    mockMovUp().mockResolvedValue({ ...makeMovement('cancelled') });
    const res = await put('mvt-pending-1', { status: 'cancelled' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid status value', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('pending'));
    const res = await put('mvt-pending-1', { status: 'invalid-status' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when movement does not exist', async () => {
    mockMovFQ().mockResolvedValue(null);
    const res = await put('no-such-id', { remarks: 'x' });
    expect(res.status).toBe(404);
  });
});

// ── DELETE /:id — lifecycle state guards ──────────────────────────────────────
describe('DELETE /api/stock-movements/:id — lifecycle guards', () => {
  const del = (id: string, body: object = {}) =>
    request(app)
      .delete(`/api/stock-movements/${id}`)
      .set('Authorization', `Bearer ${signToken(adminUser.id)}`)
      .set('X-Department-Id', DEPT)
      .send(body);

  beforeEach(() => { mockUser().mockResolvedValue(adminUser); });

  it('returns 409 when movement is committed', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('committed'));
    const res = await del('mvt-committed-1');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/committed/i);
  });

  it('returns 409 when movement is cancelled', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('cancelled'));
    const res = await del('mvt-cancelled-1');
    expect(res.status).toBe(409);
  });

  it('cancels a pending movement with no items', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('pending', { items: [] }));
    const res = await del('mvt-pending-1', { reason: 'wrong entry' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cancelled/i);
    expect(prisma.stockMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'cancelled' }),
      })
    );
  });

  it('reverses stock counts for each affected product when cancelling', async () => {
    const movement = makeMovement('pending', {
      movementType: 'stock_in',
      items: [{
        stockDetailId: 'sd-1',
        productId: 'prod-1',
        quantity: 3,
        stockDetail: { _count: { movementItems: 1 } },
      }],
    });
    mockMovFQ().mockResolvedValue(movement);
    const res = await del('mvt-pending-1');
    expect(res.status).toBe(200);
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-1' },
        data: { currentStock: { increment: -3 } },
      })
    );
  });

  it('soft-disposes orphaned stock details when cancelling', async () => {
    const movement = makeMovement('pending', {
      movementType: 'stock_in',
      items: [{
        stockDetailId: 'sd-orphan',
        productId: 'prod-1',
        quantity: 1,
        // _count.movementItems === 1 means created by this movement only
        stockDetail: { _count: { movementItems: 1 } },
      }],
    });
    mockMovFQ().mockResolvedValue(movement);
    const res = await del('mvt-pending-1');
    expect(res.status).toBe(200);
    expect(prisma.stockDetail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['sd-orphan'] } },
        data: { currentStatus: 'disposed' },
      })
    );
  });

  it('returns 404 when movement does not exist', async () => {
    mockMovFQ().mockResolvedValue(null);
    const res = await del('no-such-id');
    expect(res.status).toBe(404);
  });
});

// ── POST /:id/reverse — lifecycle state guards ────────────────────────────────
describe('POST /api/stock-movements/:id/reverse — lifecycle guards', () => {
  const reverse = (id: string, body: object = {}) =>
    request(app)
      .post(`/api/stock-movements/${id}/reverse`)
      .set('Authorization', `Bearer ${signToken(adminUser.id)}`)
      .set('X-Department-Id', DEPT)
      .send(body);

  beforeEach(() => {
    mockUser().mockResolvedValue(adminUser);
    mockMovCr().mockResolvedValue({ id: 'rev-1', movementNo: 'MVT-TEST-000001' });
  });

  it('returns 409 when movement is pending', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('pending'));
    const res = await reverse('mvt-pending-1');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/committed/i);
  });

  it('returns 409 when movement is cancelled', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('cancelled'));
    const res = await reverse('mvt-cancelled-1');
    expect(res.status).toBe(409);
  });

  it('returns 201 and creates a reversal for a committed movement', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('committed'));
    const res = await reverse('mvt-committed-1', { reason: 'entered wrong product' });
    expect(res.status).toBe(201);
    expect(res.body.reversalMovementNo).toBe('MVT-TEST-000001');
  });

  it('creates a reversal movement with adjustment type and references original', async () => {
    mockMovFQ().mockResolvedValue(makeMovement('committed', { movementNo: 'MVT-2026-000001' }));
    await reverse('mvt-committed-1', { reason: 'test' });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'adjustment',
          status: 'committed',
          remarks: expect.stringContaining('MVT-2026-000001'),
        }),
      })
    );
  });

  it('reverses stock and restores status for deducting-type movements', async () => {
    const movement = makeMovement('committed', {
      movementType: 'borrowed',
      items: [{
        stockDetailId: 'sd-borrowed',
        productId: 'prod-1',
        quantity: 2,
        fromLocationId: null,
        toLocationId: null,
        stockDetail: { _count: { movementItems: 2 } },
      }],
    });
    mockMovFQ().mockResolvedValue(movement);
    await reverse('mvt-committed-1');
    // borrowed is a DEDUCTING_TYPE: stock was decremented, so reversal increments by +2
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-1' },
        data: { currentStock: { increment: 2 } },
      })
    );
    // status was changed to 'borrowed', reversal restores to 'active'
    expect(prisma.stockDetail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sd-borrowed' },
        data: expect.objectContaining({ currentStatus: 'active' }),
      })
    );
  });

  it('marks items as disposed when reversing an adding-type movement with single movement link', async () => {
    const movement = makeMovement('committed', {
      movementType: 'stock_in',
      items: [{
        stockDetailId: 'sd-new',
        productId: 'prod-1',
        quantity: 1,
        fromLocationId: null,
        toLocationId: null,
        stockDetail: { _count: { movementItems: 1 } },
      }],
    });
    mockMovFQ().mockResolvedValue(movement);
    await reverse('mvt-committed-1');
    // stock_in is ADDING_TYPE: stock was incremented, reversal decrements by -1
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { currentStock: { increment: -1 } },
      })
    );
    // item only has 1 movement link → mark disposed
    expect(prisma.stockDetail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sd-new' },
        data: expect.objectContaining({ currentStatus: 'disposed' }),
      })
    );
  });

  it('returns 404 when movement does not exist', async () => {
    mockMovFQ().mockResolvedValue(null);
    const res = await reverse('no-such-id');
    expect(res.status).toBe(404);
  });
});
