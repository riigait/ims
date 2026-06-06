import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authMiddleware, requireDepartmentScopedWriteAccess, requireSpecificDepartmentForWrite } from './middleware/auth';
import { authLimiter, dangerLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth';
import productsRoutes from './routes/products';
import categoriesRoutes from './routes/categories';
import locationsRoutes from './routes/locations';
import stockMovementsRoutes from './routes/stockMovements';
import stockDetailsRoutes from './routes/stockDetails';
import floorPlansRoutes from './routes/floorPlans';
import dashboardRoutes from './routes/dashboard';
import auditLogsRoutes from './routes/auditLogs';
import invitesRoutes from './routes/invites';
import usersRoutes from './routes/users';
import departmentsRoutes from './routes/departments';
import deleteRequestsRoutes from './routes/deleteRequests';
import editRequestsRoutes from './routes/editRequests';
import exportRequestsRoutes from './routes/exportRequests';
import notificationsRoutes from './routes/notifications';
import adminDepartmentsRoutes from './routes/adminDepartments';
import staffDepartmentsRoutes from './routes/staffDepartments';
import passwordRequestsRoutes from './routes/passwordRequests';
import settingsRoutes from './routes/settings';
import importRequestsRoutes from './routes/importRequests';
import verifyRequestsRoutes from './routes/verifyRequests';
import mapRoutes from './routes/map';

const app = express();
app.disable('x-powered-by');

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", ...allowedOrigins],
    },
  },
}));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/invites', authLimiter, invitesRoutes);

app.use('/api/products', authMiddleware, requireDepartmentScopedWriteAccess, productsRoutes);
app.use('/api/categories', authMiddleware, requireDepartmentScopedWriteAccess, categoriesRoutes);
app.use('/api/locations', authMiddleware, requireDepartmentScopedWriteAccess, locationsRoutes);
app.use('/api/stock-movements', authMiddleware, requireDepartmentScopedWriteAccess, stockMovementsRoutes);
app.use('/api/stock-details', authMiddleware, requireDepartmentScopedWriteAccess, stockDetailsRoutes);
app.use('/api/floor-plans', authMiddleware, requireSpecificDepartmentForWrite, floorPlansRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/audit-logs', authMiddleware, auditLogsRoutes);
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/departments', authMiddleware, departmentsRoutes);
app.use('/api/delete-requests', authMiddleware, deleteRequestsRoutes);
app.use('/api/edit-requests', authMiddleware, editRequestsRoutes);
app.use('/api/export-requests', authMiddleware, exportRequestsRoutes);
app.use('/api/notifications', authMiddleware, notificationsRoutes);
app.use('/api/admin-departments', authMiddleware, adminDepartmentsRoutes);
app.use('/api/staff-departments', authMiddleware, staffDepartmentsRoutes);
app.use('/api/password-requests', authMiddleware, passwordRequestsRoutes);
app.use('/api/settings', authMiddleware, dangerLimiter, settingsRoutes);
app.use('/api/import-requests', authMiddleware, importRequestsRoutes);
app.use('/api/verify-requests', authMiddleware, verifyRequestsRoutes);
app.use('/api/map', authMiddleware, mapRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const name = err.constructor.name;
  if (name === 'PrismaClientInitializationError' || err.message?.includes("Can't reach database")) {
    return res.status(503).json({ error: 'Database is not available. Please try again later.' });
  }
  const status = (err as any).status || 500;
  const message = process.env.NODE_ENV === 'production' && status >= 500
    ? 'Internal server error'
    : err.message || 'Internal server error';
  res.status(status).json({ error: message });
});

export default app;
