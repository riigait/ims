import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Layout from '@/components/layout/Layout';
import DepartmentGuard from '@/components/DepartmentGuard';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import InitialSetup from '@/pages/InitialSetup';
import Dashboard from '@/pages/Dashboard';
import Products from '@/pages/Products';
import Categories from '@/pages/Categories';
import Locations from '@/pages/Locations';
import StockMovements from '@/pages/StockMovements';
import FloorPlans from '@/pages/FloorPlans';
import ImportPCLSF from '@/pages/ImportPCLSF';
import FloorPlanEditor from '@/pages/FloorPlanEditor';
import Scanner from '@/pages/Scanner';
import AdminUsers from '@/pages/AdminUsers';
import AdminDepartments from '@/pages/AdminDepartments';
import DeleteRequests from '@/pages/DeleteRequests';
import AdminAssignment from '@/pages/AdminAssignment';
import ChangePassword from '@/pages/ChangePassword';
import PasswordRequests from '@/pages/PasswordRequests';
import NotFound from '@/pages/NotFound';
import ErrorBoundary from '@/components/ErrorBoundary';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = !!localStorage.getItem('token');
  const user = localStorage.getItem('user');
  const userObj = user ? JSON.parse(user) : null;

  if (!isLoggedIn) return <Navigate to="/login" />;
  // Only superadmin can be redirected to initial setup
  if (userObj?.role === 'superadmin' && userObj?.initialSetupComplete === false) {
    return <Navigate to="/initial-setup" />;
  }
  return children;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = !!localStorage.getItem('token');
  const user = localStorage.getItem('user');
  const userObj = user ? JSON.parse(user) : null;

  if (!isLoggedIn) return <Navigate to="/login" />;
  if (!['admin', 'superadmin'].includes(userObj?.role)) {
    return <Navigate to="/dashboard" />;
  }
  return children;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/initial-setup" element={<InitialSetup />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Navigate to="/dashboard" />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <DepartmentGuard>
                <Layout>
                  <Dashboard />
                </Layout>
              </DepartmentGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/products"
          element={
            <PrivateRoute>
              <DepartmentGuard>
                <Layout>
                  <Products />
                </Layout>
              </DepartmentGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <PrivateRoute>
              <DepartmentGuard>
                <Layout>
                  <Categories />
                </Layout>
              </DepartmentGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/locations"
          element={
            <PrivateRoute>
              <DepartmentGuard>
                <Layout>
                  <Locations />
                </Layout>
              </DepartmentGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/stock-movements"
          element={
            <PrivateRoute>
              <DepartmentGuard>
                <Layout>
                  <StockMovements />
                </Layout>
              </DepartmentGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/floor-plans"
          element={
            <PrivateRoute>
              <DepartmentGuard>
                <Layout>
                  <FloorPlans />
                </Layout>
              </DepartmentGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/import-pclsf"
          element={
            <PrivateRoute>
              <DepartmentGuard>
                <Layout>
                  <ImportPCLSF />
                </Layout>
              </DepartmentGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/floor-plans/:id/edit"
          element={
            <PrivateRoute>
              <DepartmentGuard>
                <FloorPlanEditor />
              </DepartmentGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/scanner"
          element={
            <PrivateRoute>
              <DepartmentGuard>
                <Layout>
                  <Scanner />
                </Layout>
              </DepartmentGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <Layout>
                <AdminUsers />
              </Layout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/departments"
          element={
            <AdminRoute>
              <Layout>
                <AdminDepartments />
              </Layout>
            </AdminRoute>
          }
        />
        <Route
          path="/delete-requests"
          element={
            <AdminRoute>
              <Layout>
                <DeleteRequests />
              </Layout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/assignment"
          element={
            <AdminRoute>
              <Layout>
                <AdminAssignment />
              </Layout>
            </AdminRoute>
          }
        />
        <Route
          path="/change-password"
          element={
            <PrivateRoute>
              <Layout>
                <ChangePassword />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/password-requests"
          element={
            <AdminRoute>
              <Layout>
                <PasswordRequests />
              </Layout>
            </AdminRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
