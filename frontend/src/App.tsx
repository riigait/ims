import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

function App() {
  return (
    <ErrorBoundary>
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
            <PrivateRoute>
              <AdminUsers />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/departments"
          element={
            <PrivateRoute>
              <AdminDepartments />
            </PrivateRoute>
          }
        />
        <Route
          path="/delete-requests"
          element={
            <PrivateRoute>
              <DeleteRequests />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/assignment"
          element={
            <PrivateRoute>
              <AdminAssignment />
            </PrivateRoute>
          }
        />
        <Route
          path="/change-password"
          element={
            <PrivateRoute>
              <ChangePassword />
            </PrivateRoute>
          }
        />
        <Route
          path="/password-requests"
          element={
            <PrivateRoute>
              <PasswordRequests />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
