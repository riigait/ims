import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
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
import NotFound from '@/pages/NotFound';
import ErrorBoundary from '@/components/ErrorBoundary';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = !!localStorage.getItem('token');
  return isLoggedIn ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
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
              <Layout>
                <Dashboard />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/products"
          element={
            <PrivateRoute>
              <Layout>
                <Products />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <PrivateRoute>
              <Layout>
                <Categories />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/locations"
          element={
            <PrivateRoute>
              <Layout>
                <Locations />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/stock-movements"
          element={
            <PrivateRoute>
              <Layout>
                <StockMovements />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/floor-plans"
          element={
            <PrivateRoute>
              <Layout>
                <FloorPlans />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/floor-plans/:id/edit"
          element={
            <PrivateRoute>
              <FloorPlanEditor />
            </PrivateRoute>
          }
        />
        <Route
          path="/scanner"
          element={
            <PrivateRoute>
              <Layout>
                <Scanner />
              </Layout>
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
        <Route path="*" element={<NotFound />} />
      </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
