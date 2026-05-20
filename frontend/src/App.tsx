import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/Layout/MainLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Platforms } from './pages/Platforms';
import { Products } from './pages/Products';
import { WhatsApp } from './pages/WhatsApp';
import { Telegram } from './pages/Telegram';
import { Campaigns } from './pages/Campaigns';
import { Logs } from './pages/Logs';
import Users from './pages/Users';
import Metrics from './pages/Metrics';
import GroupConfig from './pages/GroupConfig';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Protected */}
      <Route
        path="/"
        element={
          <AuthGuard>
            <MainLayout />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="platforms" element={<Platforms />} />
        <Route path="products" element={<Products />} />
        <Route path="whatsapp" element={<WhatsApp />} />
        <Route path="telegram" element={<Telegram />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="metrics" element={<Metrics />} />
        <Route path="group-config" element={<GroupConfig />} />
        <Route path="users" element={<Users />} />
        <Route path="logs" element={<Logs />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
