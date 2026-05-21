import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const secret = process.env.JWT_SECRET || 'secret';
    const decoded = jwt.verify(token, secret) as { userId: string };
    req.userId = decoded.userId;

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Simplified - in production, check user role from database
  if (req.userId) {
    next();
  } else {
    return res.status(403).json({ error: 'Forbidden' });
  }
};
