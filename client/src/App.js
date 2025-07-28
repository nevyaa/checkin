import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import Tenants from './pages/Tenants';
import Leases from './pages/Leases';
import Payments from './pages/Payments';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Documents from './pages/Documents';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }
  
  return user ? children : <Navigate to="/login" replace />;
};

// Role-based Route Component
const RoleRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();
  
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      {/* Protected Routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="profile" element={<Profile />} />
        
        {/* Owner-only Routes */}
        <Route path="properties" element={
          <RoleRoute allowedRoles={['owner']}>
            <Properties />
          </RoleRoute>
        } />
        <Route path="tenants" element={
          <RoleRoute allowedRoles={['owner']}>
            <Tenants />
          </RoleRoute>
        } />
        <Route path="leases" element={<Leases />} />
        <Route path="payments" element={<Payments />} />
        <Route path="expenses" element={
          <RoleRoute allowedRoles={['owner']}>
            <Expenses />
          </RoleRoute>
        } />
        <Route path="reports" element={
          <RoleRoute allowedRoles={['owner']}>
            <Reports />
          </RoleRoute>
        } />
        <Route path="documents" element={<Documents />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>
      
      {/* Catch all route */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;