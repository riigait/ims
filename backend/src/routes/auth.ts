import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { UserRole } from '@prisma/client';
import prisma from '../utils/prisma';
import { logAudit, getRequestMeta } from '../utils/audit';
import { authLimiter, passwordLimiter } from '../middleware/rateLimiter';
import { authMiddleware, AuthRequest, getJwtSecret } from '../middleware/auth';
import { validatePassword } from '../utils/passwordPolicy';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function validateLogin(body: any): string | null {
  if (typeof body.email !== 'string' || typeof body.password !== 'string') return 'Invalid request body';
  if (!body.email.trim() || !body.password) return 'Missing email or password';
  if (!EMAIL_RE.test(body.email.trim())) return 'Invalid email format';
  if (body.password.length > 128) return 'Password too long';
  return null;
}

function validateRegister(body: any): string | null {
  if (typeof body.name !== 'string' || typeof body.email !== 'string' || typeof body.password !== 'string') return 'Invalid request body';
  if (!body.name.trim() || !body.email.trim() || !body.password) return 'Missing required fields';
  if (!EMAIL_RE.test(body.email.trim())) return 'Invalid email format';
  if (body.name.length > 100) return 'Name too long';
  if (body.password.length > 128) return 'Password too long';
  return null;
}

function signToken(userId: string, role: string, departmentId?: string): string {
  return jwt.sign({ userId, role, departmentId }, getJwtSecret(), { expiresIn: '7d' });
}

function isLocalSetupRequest(req: Request): boolean {
  const address = req.ip || req.socket.remoteAddress || '';
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days — matches JWT expiry

function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

// Check if superadmin exists; create default if not
router.post('/ensure-superadmin', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bootstrapAllowed = process.env.NODE_ENV !== 'production' || process.env.ALLOW_SUPERADMIN_BOOTSTRAP === 'true';
    const remoteBootstrapAllowed = process.env.ALLOW_REMOTE_SUPERADMIN_BOOTSTRAP === 'true';
    if (!bootstrapAllowed || (!remoteBootstrapAllowed && !isLocalSetupRequest(req))) {
      return res.status(403).json({ error: 'Superadmin bootstrap is disabled' });
    }

    const existingSuperadmin = await prisma.user.findFirst({
      where: { role: 'superadmin' },
    });

    if (existingSuperadmin) {
      return res.json({ exists: true });
    }

    // Create default superadmin if none exists
    const temporaryPassword = process.env.DEFAULT_SUPERADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    await prisma.user.create({
      data: {
        name: 'Superadmin',
        email: 'admin@ims.local',
        passwordHash: hashedPassword,
        role: 'superadmin',
        initialSetupComplete: false,
      },
    });

    res.json({
      exists: false,
      created: true,
      email: 'admin@ims.local',
      temporaryPassword,
      message: 'Temporary superadmin created. Complete initial setup immediately.',
    });
  } catch (error) {
    next(error);
  }
});

// Register — use invite code to get role; defaults to staff if no invite
router.post('/register', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationError = validateRegister(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { name, email, password, inviteCode } = req.body;

    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    // Validate invite code if provided
    let role: UserRole = 'staff';
    if (inviteCode) {
      const invite = await prisma.inviteCode.findUnique({ where: { code: inviteCode } });
      if (!invite) return res.status(400).json({ error: 'Invalid invite code' });
      if (invite.usedAt) return res.status(400).json({ error: 'Invite already used' });
      if (new Date() > invite.expiresAt) return res.status(400).json({ error: 'Invite expired' });

      role = invite.role;

      // Mark invite as used
      await prisma.inviteCode.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedBy: 'pending' }, // Will be updated to actual user ID after user creation
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role, initialSetupComplete: true },
    });

    // Update invite code with actual user ID if invite was used
    if (inviteCode) {
      const invite = await prisma.inviteCode.findUnique({ where: { code: inviteCode } });
      if (invite) {
        await prisma.inviteCode.update({
          where: { id: invite.id },
          data: { usedBy: user.id },
        });
      }
    }

    const token = signToken(user.id, user.role, user.departmentId ?? undefined);
    setAuthCookie(res, token);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId, initialSetupComplete: user.initialSetupComplete }
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationError = validateLogin(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      logAudit({ action: 'LOGIN_FAILURE', entityType: 'user', entityId: 'unknown', changes: { email, reason: 'user_not_found' }, ...getRequestMeta(req) });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ error: `Account locked. Try again in ${minutesLeft} minute(s).` });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      const attempts = user.failedLoginAttempts + 1;
      const lockout = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts, ...(lockout ? { lockedUntil: lockout } : {}) },
      });
      logAudit({ userId: user.id, action: 'LOGIN_FAILURE', entityType: 'user', entityId: user.id, changes: { email: user.email, name: user.name, attempts, locked: !!lockout }, ...getRequestMeta(req) });
      const msg = lockout
        ? 'Too many failed attempts. Account locked for 15 minutes.'
        : `Invalid credentials. ${5 - attempts} attempt(s) remaining.`;
      return res.status(401).json({ error: msg });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    logAudit({ userId: user.id, action: 'LOGIN_SUCCESS', entityType: 'user', entityId: user.id, changes: { email: user.email, name: user.name, role: user.role }, ...getRequestMeta(req) });

    const adminDepartments = user.role === 'admin' ? await prisma.adminDepartment.findMany({
      where: { userId: user.id },
      select: { departmentId: true, department: { select: { id: true, name: true, description: true } } },
    }) : [];

    const staffDepartments = user.role === 'staff' ? await prisma.staffDepartment.findMany({
      where: { userId: user.id },
      select: { departmentId: true, department: { select: { id: true, name: true, description: true } } },
    }) : [];

    const token = signToken(user.id, user.role, user.departmentId ?? undefined);
    setAuthCookie(res, token);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        initialSetupComplete: user.initialSetupComplete,
        adminDepartments,
        staffDepartments,
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get current user — protected by authMiddleware
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const adminDepartments = user.role === 'admin' ? await prisma.adminDepartment.findMany({
      where: { userId: user.id },
      select: { departmentId: true, department: { select: { id: true, name: true, description: true } } },
    }) : [];

    const staffDepartments = user.role === 'staff' ? await prisma.staffDepartment.findMany({
      where: { userId: user.id },
      select: { departmentId: true, department: { select: { id: true, name: true, description: true } } },
    }) : [];

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      initialSetupComplete: user.initialSetupComplete,
      adminDepartments,
      staffDepartments,
      isoViewSettings: user.isoViewSettings ? JSON.parse(user.isoViewSettings) : null,
    });
  } catch (error) {
    next(error);
  }
});

// Update the current user's isometric view scale preferences — persisted so
// they follow the user across devices/sessions.
router.patch('/me/iso-view-settings', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { isoTW, isoTH, isoZScale } = req.body;
    const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    if (!isFiniteNumber(isoTW) || !isFiniteNumber(isoTH) || !isFiniteNumber(isoZScale)) {
      return res.status(400).json({ error: 'isoTW, isoTH, and isoZScale must all be numbers' });
    }
    // Keep the projection within a sane range — well outside this and the
    // isometric view becomes unreadable or numerically unstable.
    const inRange = (v: number, min: number, max: number) => v >= min && v <= max;
    if (!inRange(isoTW, 0.5, 8) || !inRange(isoTH, 0.5, 8) || !inRange(isoZScale, 0.2, 5)) {
      return res.status(400).json({ error: 'Value out of allowed range' });
    }

    const isoViewSettings = JSON.stringify({ isoTW, isoTH, isoZScale });
    await prisma.user.update({
      where: { id: req.userId },
      data: { isoViewSettings },
    });
    res.json({ isoViewSettings: { isoTW, isoTH, isoZScale } });
  } catch (error) {
    next(error);
  }
});

// Change own password — all authenticated users
router.post('/change-password', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.userId },
      data: { passwordHash },
    });
    logAudit({ userId: req.userId, action: 'PASSWORD_CHANGE', entityType: 'user', entityId: req.userId!, ...getRequestMeta(req) });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

// Reset user password — superadmin only (set temporary password)
router.post('/reset-password/:userId', passwordLimiter, authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const requester = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!requester || requester.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can reset passwords' });
    }

    const { newPassword } = req.body;
    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    const targetUser = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { passwordHash },
    });
    logAudit({ userId: req.userId, action: 'PASSWORD_RESET', entityType: 'user', entityId: req.params.userId, changes: { targetEmail: targetUser.email }, ...getRequestMeta(req) });

    res.json({ message: `Password reset for ${targetUser.email}` });
  } catch (error) {
    next(error);
  }
});

// Complete initial setup — change default email and password
router.post('/complete-initial-setup', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { newEmail, newPassword, newName } = req.body;

    if (!newEmail || !newPassword || !newName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can complete initial setup' });
    }

    if (user.initialSetupComplete) {
      return res.status(400).json({ error: 'Initial setup already completed' });
    }

    // Check if new email is already taken
    const existingEmail = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existingEmail && existingEmail.id !== user.id) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail,
        passwordHash,
        name: newName,
        initialSetupComplete: true,
      },
    });

    const token = signToken(updatedUser.id, updatedUser.role, updatedUser.departmentId ?? undefined);
    setAuthCookie(res, token);
    res.json({
      token,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        departmentId: updatedUser.departmentId,
        initialSetupComplete: updatedUser.initialSetupComplete,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
});

export default router;
