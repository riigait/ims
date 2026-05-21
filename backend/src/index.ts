import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import productsRoutes from './routes/products';
import categoriesRoutes from './routes/categories';
import locationsRoutes from './routes/locations';
import stockMovementsRoutes from './routes/stockMovements';
import floorPlansRoutes from './routes/floorPlans';
import dashboardRoutes from './routes/dashboard';
import auditLogsRoutes from './routes/auditLogs';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/products', authMiddleware, productsRoutes);
app.use('/api/categories', authMiddleware, categoriesRoutes);
app.use('/api/locations', authMiddleware, locationsRoutes);
app.use('/api/stock-movements', authMiddleware, stockMovementsRoutes);
app.use('/api/floor-plans', authMiddleware, floorPlansRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/audit-logs', authMiddleware, auditLogsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
