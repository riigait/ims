import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import 'dotenv/config';
import { authMiddleware } from './middleware/auth';
import { checkDatabaseConnection } from './utils/prisma';
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
import adminDepartmentsRoutes from './routes/adminDepartments';
import staffDepartmentsRoutes from './routes/staffDepartments';
import passwordRequestsRoutes from './routes/passwordRequests';
import settingsRoutes from './routes/settings';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/invites', invitesRoutes);

// Protected routes
app.use('/api/products', authMiddleware, productsRoutes);
app.use('/api/categories', authMiddleware, categoriesRoutes);
app.use('/api/locations', authMiddleware, locationsRoutes);
app.use('/api/stock-movements', authMiddleware, stockMovementsRoutes);
app.use('/api/stock-details', authMiddleware, stockDetailsRoutes);
app.use('/api/floor-plans', authMiddleware, floorPlansRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/audit-logs', authMiddleware, auditLogsRoutes);
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/departments', authMiddleware, departmentsRoutes);
app.use('/api/delete-requests', authMiddleware, deleteRequestsRoutes);
app.use('/api/admin-departments', authMiddleware, adminDepartmentsRoutes);
app.use('/api/staff-departments', authMiddleware, staffDepartmentsRoutes);
app.use('/api/password-requests', authMiddleware, passwordRequestsRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use((err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
  const name = err.constructor.name;
  if (name === 'PrismaClientInitializationError' || (err.message && err.message.includes("Can't reach database"))) {
    console.error('❌ Database is not running. Start it with: docker-compose up -d');
    return res.status(503).json({ error: 'Database is not available. Please try again later.' });
  }
  console.error(err);
  res.status((err as any).status || 500).json({ error: err.message || 'Internal server error' });
});

checkDatabaseConnection().then(() => {
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`✅ Database connected`);
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  });
});
