import request from 'supertest';
import app from '../app';
import { superadmin, sign } from './testHelpers';

// Phase 4b of the floor-plan dedup plan: PUT /floor-plans/:id now enforces
// validateFloorplanObjects unless validationIgnored is sent. These tests pin
// that behavior — a regression here means either a previously-rejected save
// silently starts succeeding, or a previously-fine save starts 422ing.

jest.mock('../utils/prisma', () => ({
  __esModule: true,
  default: {
    user:      { findUnique: jest.fn() },
    auditLog:  { create: jest.fn().mockResolvedValue({}) },
    floorPlan: {
      findUnique: jest.fn(),
      update:     jest.fn(),
    },
  },
  checkDatabaseConnection: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../utils/prisma';

const mockUserFQ = () => prisma.user.findUnique as jest.Mock;
const mockPlanFQ = () => prisma.floorPlan.findUnique as jest.Mock;
const mockPlanUpdate = () => prisma.floorPlan.update as jest.Mock;

const existingPlan = {
  id: 'plan-1', departmentId: null, isApproved: false,
  name: 'Plan', width: 800, height: 600, planJson: '[]', alignmentJson: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUserFQ().mockResolvedValue(superadmin);
  mockPlanFQ().mockResolvedValue(existingPlan);
  mockPlanUpdate().mockImplementation((args: any) => Promise.resolve({ ...existingPlan, ...args.data }));
});

const auth = () => `Bearer ${sign(superadmin.id, 'superadmin')}`;

// A door directly inside its own clearance zone is the cheapest way to
// trigger a real validation error (door_blocked) without depending on
// outdoor-wall-loop or room-containment setup.
const invalidObjects = [
  { id: 'door-1', type: 'door', x: 100, y: 100, width: 40, angle: 0 },
  { id: 'item-1', type: 'shelf', x: 90, y: 90, width: 20, height: 20, linkedLocationId: 'loc-1' },
];

describe('PUT /api/floor-plans/:id — validation enforcement', () => {
  it('rejects with 422 when objects are invalid and validationIgnored is not set', async () => {
    const res = await request(app)
      .put('/api/floor-plans/plan-1')
      .set('Authorization', auth())
      .send({ name: 'Plan', width: 800, height: 600, objects: invalidObjects });

    expect(res.status).toBe(422);
    expect(res.body.errors).toBeInstanceOf(Array);
    expect(res.body.errors.some((e: { code: string }) => e.code === 'door_blocked')).toBe(true);
    expect(mockPlanUpdate()).not.toHaveBeenCalled();
  });

  it('saves successfully when objects are invalid but validationIgnored is true', async () => {
    const res = await request(app)
      .put('/api/floor-plans/plan-1')
      .set('Authorization', auth())
      .send({ name: 'Plan', width: 800, height: 600, objects: invalidObjects, validationIgnored: true });

    expect(res.status).toBe(200);
    expect(mockPlanUpdate()).toHaveBeenCalledTimes(1);
  });

  it('saves successfully when objects are valid', async () => {
    const res = await request(app)
      .put('/api/floor-plans/plan-1')
      .set('Authorization', auth())
      .send({ name: 'Plan', width: 800, height: 600, objects: [] });

    expect(res.status).toBe(200);
    expect(mockPlanUpdate()).toHaveBeenCalledTimes(1);
  });
});
