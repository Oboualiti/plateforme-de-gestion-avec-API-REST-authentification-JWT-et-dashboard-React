import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Skeleton } from '../components/ui/skeleton'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'

function ProtectedRoute({
  allowedRoles,
  requireAnyPermission,
  requireRequestCreate = false,
  requireReportsPageAccess = false,
  redirectTo = '/requests',
}) {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="min-h-svh flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
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
        <main className="min-h-svh flex items-center justify-center p-8 text-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive font-bold">Access denied</CardTitle>
              <CardDescription>You do not have access to this operational workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Please contact your supervisor or platform administrator if you believe this is an error.
              </p>
            </CardContent>
          </Card>
        </main>
      )
    }
  }

  if (requireAnyPermission?.length) {
    const permissionKeys = new Set(user?.effective_permission_keys || [])
    const allowed = requireAnyPermission.some((permissionKey) => permissionKeys.has(permissionKey))
    if (!allowed) {
      return (
        <main className="min-h-svh flex items-center justify-center p-8 text-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive font-bold">Access denied</CardTitle>
              <CardDescription>You do not have access to this operational workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Please contact your supervisor or platform administrator if you believe this is an error.
              </p>
            </CardContent>
          </Card>
        </main>
      )
    }
  }

  if (requireRequestCreate && !user?.request_creation_allowed) {
    return <Navigate to={redirectTo} replace />
  }

  if (requireReportsPageAccess && !user?.reports_page_access_allowed) {
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}

export default ProtectedRoute
