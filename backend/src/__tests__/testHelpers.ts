import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export const superadmin = {
  id: 'user-sa-1', role: 'superadmin', initialSetupComplete: true,
  adminDepartments: [], staffDepartments: [],
};

export const adminUser = {
  id: 'user-admin-1', role: 'admin', initialSetupComplete: true,
  adminDepartments: [{ departmentId: 'dept-1' }], staffDepartments: [],
};

export const DEPT = 'dept-1';

export function sign(userId: string, role: string) {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' });
}
