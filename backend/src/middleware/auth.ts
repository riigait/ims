import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  departmentId?: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

export { getJwtSecret };

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; role: string; departmentId?: string };
    req.userId = decoded.userId;
    req.userRole = decoded.role ?? 'staff';

    // Superadmin sees all data across all departments (no department filter)
    if (req.userRole === 'superadmin') {
      req.departmentId = undefined;
    } else if (req.userRole === 'admin') {
      // For admins, check if X-Department-Id header is provided (from department switcher)
      const headerDeptId = req.headers['x-department-id'] as string;
      req.departmentId = headerDeptId;
    } else {
      // For staff, use departmentId from JWT
      req.departmentId = decoded.departmentId;
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.userRole === 'admin' || req.userRole === 'superadmin') {
    next();
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }
};
