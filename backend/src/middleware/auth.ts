import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';


export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  departmentId?: string;
  departmentIds?: string[]; // For staff/admin viewing all assigned departments
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

export { getJwtSecret };

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; role: string; departmentId?: string };
    req.userId = decoded.userId;
    req.userRole = decoded.role ?? 'staff';

    // Superadmin sees all data across all departments (no department filter)
    if (req.userRole === 'superadmin') {
      req.departmentId = undefined;
    } else if (req.userRole === 'admin' || req.userRole === 'staff') {
      // For admins and staff, check if X-Department-Id header is provided (from department switcher)
      const headerDeptId = req.headers['x-department-id'] as string;
      if (headerDeptId && headerDeptId !== 'all-departments') {
        // Use the selected department
        req.departmentId = headerDeptId;
      } else if (headerDeptId === 'all-departments') {
        if (req.userRole === 'admin') {
          // Admins can view all departments
          req.departmentId = undefined;
        } else if (req.userRole === 'staff') {
          // Staff viewing "all departments" - get their assigned departments
          const staffDepts = await prisma.staffDepartment.findMany({
            where: { userId: decoded.userId },
            select: { departmentId: true },
          });
          req.departmentIds = staffDepts.map(sd => sd.departmentId);
          req.departmentId = undefined; // No single department filter
        }
      } else {
        // Fallback to JWT departmentId (for single-department users)
        req.departmentId = decoded.departmentId;
      }
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
