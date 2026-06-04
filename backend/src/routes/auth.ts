import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../utils/prisma';
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

// Check if superadmin exists; create default if not
router.post('/ensure-superadmin', async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationError = validateRegister(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { name, email, password, inviteCode } = req.body;

    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    // Validate invite code if provided
    let role = 'staff';
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
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId, initialSetupComplete: user.initialSetupComplete }
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationError = validateLogin(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const adminDepartments = user.role === 'admin' ? await prisma.adminDepartment.findMany({
      where: { userId: user.id },
      select: { departmentId: true, department: { select: { id: true, name: true, description: true } } },
    }) : [];

    const staffDepartments = user.role === 'staff' ? await prisma.staffDepartment.findMany({
      where: { userId: user.id },
      select: { departmentId: true, department: { select: { id: true, name: true, description: true } } },
    }) : [];

    const token = signToken(user.id, user.role, user.departmentId ?? undefined);
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
    });
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

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

// Reset user password — superadmin only (set temporary password)
router.post('/reset-password/:userId', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
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

export default router;
