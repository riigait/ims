import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { BellProvider } from '@/contexts/BellContext';
import Layout from '@/components/layout/Layout';
import DepartmentGuard from '@/components/DepartmentGuard';
import ErrorBoundary from '@/components/ErrorBoundary';

const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const InitialSetup = lazy(() => import('@/pages/InitialSetup'));
const Landing = lazy(() => import('@/pages/Landing'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Products = lazy(() => import('@/pages/Products'));
const BulkAddProducts = lazy(() => import('@/pages/BulkAddProducts'));
const Categories = lazy(() => import('@/pages/Categories'));
const Locations = lazy(() => import('@/pages/Locations'));
const StockMovements = lazy(() => import('@/pages/StockMovements'));
const InventoryItems = lazy(() => import('@/pages/InventoryItems'));
const AdminUsers = lazy(() => import('@/pages/AdminUsers'));
const AdminDepartments = lazy(() => import('@/pages/AdminDepartments'));
const DeleteRequests = lazy(() => import('@/pages/DeleteRequests'));
const Requests = lazy(() => import('@/pages/Requests'));
const AdminAssignment = lazy(() => import('@/pages/AdminAssignment'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword'));
const PasswordRequests = lazy(() => import('@/pages/PasswordRequests'));
const SuperadminSettings = lazy(() => import('@/pages/SuperadminSettings'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const FloorPlans = lazy(() => import('@/pages/FloorPlans'));
const ImportPCLSF = lazy(() => import('@/pages/ImportPCLSF'));
const FloorPlanEditor = lazy(() => import('@/pages/FloorPlanEditor'));
const Scanner = lazy(() => import('@/pages/Scanner'));

function useAuth() {
  const user = localStorage.getItem('user');
  const userObj = user ? JSON.parse(user) : null;
  return { isLoggedIn: !!user, role: userObj?.role, initialSetupComplete: userObj?.initialSetupComplete };
}

function PrivateGuard() {
  const { isLoggedIn, role, initialSetupComplete } = useAuth();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (role === 'superadmin' && initialSetupComplete === false) return <Navigate to="/initial-setup" replace />;
  return <Outlet />;
}

function AdminGuard() {
  const { isLoggedIn, role } = useAuth();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (!['admin', 'superadmin'].includes(role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function SuperadminGuard() {
  const { isLoggedIn, role } = useAuth();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (role !== 'superadmin') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function PageSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full py-20 text-[var(--text-muted)]">Loading...</div>}>
      {children}
    </Suspense>
  );
}

// Shared layout shell — mounts once, never remounts on navigation
function AppShell() {
  return (
    <DepartmentGuard>
      <Layout>
        <PageSuspense>
          <Outlet />
        </PageSuspense>
      </Layout>
    </DepartmentGuard>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BellProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<PageSuspense><Login /></PageSuspense>} />
              <Route path="/register" element={<PageSuspense><Register /></PageSuspense>} />
              <Route path="/initial-setup" element={<PageSuspense><InitialSetup /></PageSuspense>} />
              <Route path="/" element={<PageSuspense><Landing /></PageSuspense>} />

              {/* Floor plan editor — no sidebar */}
              <Route element={<PrivateGuard />}>
                <Route element={<DepartmentGuard><PageSuspense><Outlet /></PageSuspense></DepartmentGuard>}>
                  <Route path="/floor-plans/:id/edit" element={<FloorPlanEditor />} />
                </Route>
              </Route>

              {/* All routes with sidebar layout — Layout mounts once here */}
              <Route element={<PrivateGuard />}>
                <Route element={<AppShell />}>
                  {/* Any logged-in user */}
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/products/bulk-add" element={<BulkAddProducts />} />
                  <Route path="/categories" element={<Categories />} />
                  <Route path="/locations" element={<Locations />} />
                  <Route path="/inventory-items" element={<InventoryItems />} />
                  <Route path="/stock-movements" element={<StockMovements />} />
                  <Route path="/floor-plans" element={<FloorPlans />} />
                  <Route path="/import-pclsf" element={<ImportPCLSF />} />
                  <Route path="/scanner" element={<Scanner />} />
                  <Route path="/admin/requests" element={<Requests />} />
                  <Route path="/change-password" element={<ChangePassword />} />

                  {/* Admin + superadmin only */}
                  <Route element={<AdminGuard />}>
                    <Route path="/admin/users" element={<AdminUsers />} />
                    <Route path="/admin/departments" element={<AdminDepartments />} />
                    <Route path="/delete-requests" element={<DeleteRequests />} />
                    <Route path="/admin/assignment" element={<AdminAssignment />} />
                    <Route path="/password-requests" element={<PasswordRequests />} />
                  </Route>

                  {/* Superadmin only */}
                  <Route element={<SuperadminGuard />}>
                    <Route path="/admin/settings" element={<SuperadminSettings />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<PageSuspense><NotFound /></PageSuspense>} />
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </BellProvider>
    </ErrorBoundary>
  );
}

export default App;
