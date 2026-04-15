import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'

function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="page-shell">
        <section className="panel state-card">
          <h1>Loading</h1>
          <p className="subtitle">Checking your access...</p>
        </section>
      </main>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (allowedRoles?.length) {
    const roleKeys = user?.role_keys || []
    const allowed = allowedRoles.some((role) => roleKeys.includes(role))
    if (!allowed) {
      return (
        <main className="page-shell">
          <section className="panel state-card">
            <h1>Access denied</h1>
            <p className="subtitle">You do not have access to this page.</p>
          </section>
        </main>
      )
    }
  }

  return <Outlet />
}

export default ProtectedRoute
