import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';


export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  departmentId?: string;
  accessibleDepartmentIds?: string[];
  departmentIds?: string[]; // For staff/admin viewing all assigned departments
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

export { getJwtSecret };

const NO_DEPARTMENT_ACCESS_ID = '__no_department_access__';

function asHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function setAllAssignedDepartments(req: AuthRequest, departmentIds: string[]) {
  req.departmentId = undefined;
  req.departmentIds = departmentIds.length > 0 ? departmentIds : [NO_DEPARTMENT_ACCESS_ID];
}

export function canAccessDepartment(req: AuthRequest, departmentId?: string | null, allowUnassigned = false): boolean {
  if (req.userRole === 'superadmin') return true;
  if (!departmentId) return allowUnassigned;
  if (req.departmentId) return departmentId === req.departmentId;
  if (req.departmentIds) return req.departmentIds.includes(departmentId);
  return false;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        role: true,
        initialSetupComplete: true,
        adminDepartments: { select: { departmentId: true } },
        staffDepartments: { select: { departmentId: true } },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.userId = user.id;
    req.userRole = user.role ?? 'staff';
    req.departmentId = undefined;
    req.departmentIds = undefined;
    req.accessibleDepartmentIds = undefined;

    if (user.role === 'superadmin' && !user.initialSetupComplete) {
      const isSetupRoute = req.originalUrl.startsWith('/api/auth/complete-initial-setup')
        || req.originalUrl.startsWith('/api/auth/me');
      if (!isSetupRoute) {
        return res.status(403).json({ error: 'Complete initial setup before continuing' });
      }
    }

    // Superadmin sees all data across all departments (no department filter)
    if (req.userRole === 'superadmin') {
      req.departmentId = undefined;
    } else if (req.userRole === 'admin' || req.userRole === 'staff') {
      const assignedDepartmentIds = req.userRole === 'admin'
        ? user.adminDepartments.map(dept => dept.departmentId)
        : user.staffDepartments.map(dept => dept.departmentId);
      req.accessibleDepartmentIds = assignedDepartmentIds;

      const headerDeptId = asHeaderValue(req.headers['x-department-id']);
      if (headerDeptId && headerDeptId !== 'all-departments') {
        if (!assignedDepartmentIds.includes(headerDeptId)) {
          return res.status(403).json({ error: 'Access denied for selected department' });
        }
        req.departmentId = headerDeptId;
      } else if (headerDeptId === 'all-departments') {
        setAllAssignedDepartments(req, assignedDepartmentIds);
      } else if (assignedDepartmentIds.length === 1) {
        req.departmentId = assignedDepartmentIds[0];
      } else {
        setAllAssignedDepartments(req, assignedDepartmentIds);
      }
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const requireSpecificDepartmentForWrite = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!WRITE_METHODS.has(req.method)) {
    return next();
  }

  if ((req.userRole === 'admin' || req.userRole === 'staff') && !req.departmentId) {
    return res.status(403).json({
      error: 'Select a specific department before creating or modifying records',
    });
  }

  return next();
};

export const requireDepartmentScopedWriteAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!WRITE_METHODS.has(req.method)) {
    return next();
  }

  if (req.userRole === 'superadmin') {
    return res.status(403).json({
      error: 'Superadmin access is view and report only for this page',
    });
  }

  return requireSpecificDepartmentForWrite(req, res, next);
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.userRole === 'admin' || req.userRole === 'superadmin') {
    next();
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }
};
