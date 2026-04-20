import { useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'

import MainLayout from '../components/layout/MainLayout'
import { useAuth } from '../context/AuthContext'
import Dashboard from '../pages/Dashboard'
import CreateRequestPage from '../pages/CreateRequestPage'
import CreateManagedUserPage from '../pages/CreateManagedUserPage'
import AdminControlCenterPage from '../pages/AdminControlCenterPage'
import PermissionDetailPage from '../pages/PermissionDetailPage'
import PermissionManagementPage from '../pages/PermissionManagementPage'
import NotificationsPage from '../pages/NotificationsPage'
import ProfilePage from '../pages/ProfilePage'
import RequestDetailsPage from '../pages/RequestDetailsPage'
import RequestsPage from '../pages/RequestsPage'
import ProtectedRoute from './ProtectedRoute'

function LoginPage() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuth()
  const [form, setForm] = useState({ username: 'prod', password: 'test12345' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(form)
      navigate('/dashboard', { replace: true })
    } catch (nextError) {
      setError(nextError.response?.data?.detail || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page-shell login-shell">
      <section className="login-stack">
        <div className="login-brand">
          <div className="login-logo-mark" aria-hidden="true">
            <svg fill="none" height="44" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 64 24" width="118">
              <circle cx="10" cy="8" r="4.5" />
              <path d="M10 12.5c3 0 5.5 2.4 5.5 5.5" />
              <path d="M15 10.5c9 0 18 .1 31 .1" />
              <path d="m40 8 12 2-12 2" />
            </svg>
          </div>
          <div className="login-wordmark">W-Service</div>
          <h1>Enterprise request operations</h1>
          <p className="login-subtitle">
            Manage requests, approvals, assignments, and team activity from one role-based workspace.
          </p>
          <div className="login-meta">
            <span className="status-tag info">Secure access</span>
            <span className="status-tag active">Role-based</span>
          </div>
        </div>

        <form className="panel form-panel login-panel login-panel-centered" onSubmit={handleSubmit}>
          <div className="page-intro">
            <p className="eyebrow">Authentication</p>
            <h2>Sign in to continue</h2>
            <p>Use your workspace credentials to access the platform.</p>
          </div>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            placeholder="name@w-service.com"
            value={form.username}
            onChange={(event) =>
              setForm((current) => ({ ...current, username: event.target.value }))
            }
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(event) =>
              setForm((current) => ({ ...current, password: event.target.value }))
            }
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      </section>
    </main>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/:requestId" element={<RequestDetailsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute requireRequestCreate redirectTo="/requests" />}>
        <Route element={<MainLayout />}>
          <Route path="/requests/create" element={<CreateRequestPage />} />
        </Route>
      </Route>

      <Route
        element={
          <ProtectedRoute allowedRoles={['super_admin', 'senior', 'manager', 'team_leader']} />
        }
      >
        <Route element={<MainLayout />}>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/notifications" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/hierarchy" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/status-tracking" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/audit-logs" element={<Navigate to="/admin/audit-logs/requests" replace />} />
          <Route path="/admin/audit-logs/:category" element={<AdminControlCenterPage />} />
          <Route path="/admin/:section" element={<AdminControlCenterPage />} />
          <Route path="/admin/users/create" element={<CreateManagedUserPage />} />
          <Route path="/admin/users" element={<PermissionManagementPage />} />
          <Route path="/admin/users/:userId" element={<PermissionDetailPage />} />
          <Route path="/admin/permissions" element={<PermissionManagementPage />} />
          <Route path="/admin/permissions/:userId" element={<PermissionDetailPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default AppRoutes
