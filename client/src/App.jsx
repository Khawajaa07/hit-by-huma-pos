import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import PageLoader from './components/PageLoader';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import Reports from './pages/Reports';
import Shifts from './pages/Shifts';
import Settings from './pages/Settings';

// Protected Route wrapper - requires authentication
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Role-based route protection
const RoleProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const userRole = user?.role?.toLowerCase() || 'salesman';

  if (!allowedRoles.includes(userRole)) {
    // Redirect salesmen to POS, others to dashboard
    const redirectPath = userRole === 'salesman' ? '/pos' : '/dashboard';
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

// Salesman redirect - redirects salesmen to POS on default route
const SalesmanRedirect = () => {
  const { user } = useAuthStore();
  const userRole = user?.role?.toLowerCase();

  if (userRole === 'salesman') {
    return <Navigate to="/pos" replace />;
  }

  return <Navigate to="/dashboard" replace />;
};

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />

        {/* Protected routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          {/* Default redirect based on role */}
          <Route index element={<SalesmanRedirect />} />

          {/* Dashboard - Admin/Manager only */}
          <Route path="dashboard" element={
            <RoleProtectedRoute allowedRoles={['admin', 'manager']}>
              <Dashboard />
            </RoleProtectedRoute>
          } />

          {/* POS - All roles */}
          <Route path="pos" element={<POS />} />

          {/* Products - All roles but view-only for salesman */}
          <Route path="products" element={<Products />} />

          {/* Inventory - Admin/Manager/Inventory/Salesman (view-only for salesman) */}
          <Route path="inventory" element={<Inventory />} />

          {/* Customers - All roles */}
          <Route path="customers" element={<Customers />} />

          {/* Reports - Admin/Manager only */}
          <Route path="reports" element={
            <RoleProtectedRoute allowedRoles={['admin', 'manager']}>
              <Reports />
            </RoleProtectedRoute>
          } />

          {/* Shifts - Admin/Manager only */}
          <Route path="shifts" element={
            <RoleProtectedRoute allowedRoles={['admin', 'manager']}>
              <Shifts />
            </RoleProtectedRoute>
          } />

          {/* Settings - Admin only */}
          <Route path="settings" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <Settings />
            </RoleProtectedRoute>
          } />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
