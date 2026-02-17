import React from 'react';
import { Routes, Route, Link, Navigate, useNavigate, Outlet } from 'react-router-dom';
import SignupPage from './pages/SignupPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import AdminLoginPage from './pages/AdminLoginPage.jsx';
import { isAdmin } from './utils/auth.js';

function useAuth() {
  const token = localStorage.getItem('token');
  return !!token;
}

function ProtectedRoute({ children }) {
  const isAuthed = useAuth();
  if (!isAuthed) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/** Protects admin routes: requires token with role ADMIN or EMPLOYEE, else redirect to /admin/login */
function ProtectedAdminRoute({ children }) {
  const token = localStorage.getItem('token');
  const user = token ? (() => { try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; } })() : null;
  if (!user || (user.role !== 'ADMIN' && user.role !== 'EMPLOYEE')) {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
}

/** Public layout: MSME portal – Dashboard, Performance, Login/Signup. No Admin link. */
function PublicLayout() {
  const navigate = useNavigate();
  const isAuthed = useAuth();
  const admin = isAdmin();

  const logout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <header className="header">
        <Link to="/dashboard" className="logo">DataNetra MSME Hub</Link>
        <nav className="nav">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/analytics">Performance</Link>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isAuthed && !admin ? (
            <button className="btn-secondary" onClick={logout}>
              Logout
            </button>
          ) : (
            <>
              <Link to="/login" className="btn-secondary">
                Login
              </Link>
              <Link to="/signup" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
          <a href="/admin/login" className="admin-link" title="Staff / Admin sign in">
            Admin
          </a>
        </div>
      </header>
      <main className="main"><Outlet /></main>
    </div>
  );
}

/** Admin layout: for app creators/employees. No Udhayam ID. */
function AdminLayout({ children }) {
  const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/admin/login';
  };

  return (
    <div className="app-shell admin-shell">
      <header className="header admin-header">
        <span className="logo">DataNetra Admin</span>
        <nav className="nav">
          <Link to="/admin">Users &amp; DB</Link>
          <Link to="/" className="nav-link-public">
            Public site
          </Link>
        </nav>
        <div>
          <Link to="/" className="btn-primary" style={{ marginRight: 8 }}>
            Go to MSME portal
          </Link>
          <button className="btn-secondary" onClick={logout}>
            Logout
          </button>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public MSME portal */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Admin area (separate UI; no Udhayam ID) */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedAdminRoute>
            <AdminLayout>
              <AdminPage />
            </AdminLayout>
          </ProtectedAdminRoute>
        }
      />
    </Routes>
  );
}
