import { useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import MainLayout from '../components/layout/MainLayout'
import { useAuth } from '../context/AuthContext'
import Dashboard from '../pages/Dashboard'
import CreateRequestPage from '../pages/CreateRequestPage'
import PermissionDetailPage from '../pages/PermissionDetailPage'
import PermissionManagementPage from '../pages/PermissionManagementPage'
import RequestDetailsPage from '../pages/RequestDetailsPage'
import RequestsPage from '../pages/RequestsPage'
import ProtectedRoute from './ProtectedRoute'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
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
    <main className="page-shell">
      <section className="hero-panel">
        <p className="eyebrow">JWT Login</p>
        <h1>Sign in to the operations portal</h1>
        <p className="subtitle">
          Authentication is handled with the API token flow and persists across refresh.
        </p>
      </section>

      <form className="panel form-panel" onSubmit={handleSubmit}>
        <h2>Login</h2>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          value={form.username}
          onChange={(event) =>
            setForm((current) => ({ ...current, username: event.target.value }))
          }
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={form.password}
          onChange={(event) =>
            setForm((current) => ({ ...current, password: event.target.value }))
          }
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Login'}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
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
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/create" element={<CreateRequestPage />} />
          <Route path="/requests/:requestId" element={<RequestDetailsPage />} />
        </Route>
      </Route>

      <Route
        element={
          <ProtectedRoute allowedRoles={['super_admin', 'senior', 'manager', 'team_leader']} />
        }
      >
        <Route element={<MainLayout />}>
          <Route path="/admin/permissions" element={<PermissionManagementPage />} />
          <Route
            path="/admin/permissions/:userId"
            element={<PermissionDetailPage />}
          />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default AppRoutes
