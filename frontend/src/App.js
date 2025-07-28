import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './contexts/AuthContext';

// Auth components
import Login from './components/auth/Login';
import Register from './components/auth/Register';

// Layout components
import Layout from './components/layout/Layout';

// Page components
import Dashboard from './components/pages/Dashboard';
import Properties from './components/pages/Properties';
import PropertyDetail from './components/pages/PropertyDetail';
import Tenants from './components/pages/Tenants';
import TenantDetail from './components/pages/TenantDetail';
import Transactions from './components/pages/Transactions';
import Expenses from './components/pages/Expenses';
import Reports from './components/pages/Reports';
import Documents from './components/pages/Documents';
import Notifications from './components/pages/Notifications';
import Profile from './components/pages/Profile';

// Protected Route component
const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Public Route component (redirect if already authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function App() {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Routes>
        {/* Public routes */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } 
        />
        <Route 
          path="/register" 
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          } 
        />

        {/* Protected routes */}
        <Route 
          path="/*" 
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/dashboard" element={<Dashboard />} />
                  
                  {/* Owner-only routes */}
                  <Route 
                    path="/properties" 
                    element={
                      <ProtectedRoute allowedRoles={['owner']}>
                        <Properties />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/properties/:id" 
                    element={
                      <ProtectedRoute allowedRoles={['owner']}>
                        <PropertyDetail />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/tenants" 
                    element={
                      <ProtectedRoute allowedRoles={['owner']}>
                        <Tenants />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/expenses" 
                    element={
                      <ProtectedRoute allowedRoles={['owner']}>
                        <Expenses />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/reports" 
                    element={
                      <ProtectedRoute allowedRoles={['owner']}>
                        <Reports />
                      </ProtectedRoute>
                    } 
                  />

                  {/* Routes for both owner and tenant */}
                  <Route path="/tenants/:id" element={<TenantDetail />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/documents" element={<Documents />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/profile" element={<Profile />} />

                  {/* Default redirect */}
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Box>
  );
}

export default App;