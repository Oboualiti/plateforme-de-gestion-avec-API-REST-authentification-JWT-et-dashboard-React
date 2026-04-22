import { useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'

import MainLayout from '../components/layout/MainLayout'
import { useAuth } from '../context/AuthContext'
import Dashboard from '../pages/Dashboard'
import CreateRequestPage from '../pages/CreateRequestPage'
import CreateManagedUserPage from '../pages/CreateManagedUserPage'
import AdminControlCenterPage from '../pages/AdminControlCenterPage'
import HierarchyPage from '../pages/HierarchyPage'
import UsersPage from '../pages/UsersPage'
import ReportsPage from '../pages/ReportsPage'
import PermissionDetailPage from '../pages/PermissionDetailPage'
import PermissionManagementPage from '../pages/PermissionManagementPage'
import NotificationsPage from '../pages/NotificationsPage'
import ProfilePage from '../pages/ProfilePage'
import RequestDetailsPage from '../pages/RequestDetailsPage'
import RequestsPage from '../pages/RequestsPage'
import ProtectedRoute from './ProtectedRoute'

import wServiceLogo from '../assets/logo.png'

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
    <main className="min-h-svh flex items-center justify-center bg-background p-4 sm:p-8">
      <section className="flex w-full max-w-4xl flex-col gap-12 lg:flex-row lg:items-center">
        <div className="flex-1 space-y-6">
          <div className="flex items-center gap-4">
            <img
              src={wServiceLogo}
              alt="W-Service logo"
              className="h-20 w-auto object-contain sm:h-24"
              loading="lazy"
              width={1080}
              height={458}
            />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Enterprise request operations
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Manage requests, approvals, assignments, and team activity from one role-based workspace.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-sm font-bold leading-none text-primary">Secure access</span>
            <span className="inline-flex items-center rounded-full border border-success/25 bg-success/10 px-3 py-1 text-sm font-bold leading-none text-success">Role-based</span>
          </div>
        </div>

        <form className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Authentication</p>
            <h2 className="text-2xl font-semibold text-foreground">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">Use your workspace credentials to access the platform.</p>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-foreground">Username</label>
              <input
                id="username"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="name@w-service.com"
                value={form.username}
                onChange={(event) =>
                  setForm((current) => ({ ...current, username: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
              <input
                id="password"
                type="password"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          
          {error && <p className="text-center text-sm font-medium text-destructive">{error}</p>}
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
          <Route path="/team" element={<PermissionManagementPage />} />
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
          <ProtectedRoute
            requireAnyPermission={[
              'manage_companies',
              'view_all_companies',
              'manage_entities',
              'view_company_entities',
              'manage_users_global',
              'manage_users_company',
              'manage_users_entity',
              'view_all_requests',
              'view_company_requests',
              'view_entity_requests',
              'view_team_requests',
              'view_global_reports',
              'view_company_reports',
              'view_entity_reports',
            ]}
          />
        }
      >
<Route element={<MainLayout />}>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/notifications" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/hierarchy" element={<HierarchyPage />} />
          <Route path="/admin/status-tracking" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/audit-logs" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/audit-logs/:category" element={<AdminControlCenterPage />} />
          <Route path="/admin/users/create" element={<CreateManagedUserPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/users/:userId" element={<PermissionDetailPage />} />
          <Route path="/admin/dashboard" element={<Navigate to="/admin/reports" replace />} />
          <Route path="/admin/monitoring" element={<Navigate to="/admin/reports" replace />} />
          <Route path="/admin/reports" element={<ReportsPage />} />
          <Route path="/admin/:section" element={<AdminControlCenterPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default AppRoutes



