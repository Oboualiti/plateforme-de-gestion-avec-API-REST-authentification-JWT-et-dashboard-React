import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { api, clearTokens, getStoredTokens, saveTokens } from './lib/api'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

function AppShell() {
  const [tokens, setTokens] = useState(() => getStoredTokens())
  const [me, setMe] = useState(null)
  const [booting, setBooting] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let active = true

    async function loadMe() {
      setBooting(true)
      setAuthError('')

      if (!tokens.access) {
        if (active) {
          setMe(null)
          setBooting(false)
        }
        return
      }

      try {
        const response = await api.get('/auth/me/')
        if (active) {
          setMe(response.data)
        }
      } catch (error) {
        clearTokens()
        if (active) {
          setTokens({ access: '', refresh: '' })
          setMe(null)
          setAuthError(error.response?.data?.detail || 'Session expired.')
        }
      } finally {
        if (active) {
          setBooting(false)
        }
      }
    }

    loadMe()
    return () => {
      active = false
    }
  }, [tokens.access])

  function handleAuth(tokensPayload) {
    saveTokens(tokensPayload)
    setTokens(tokensPayload)
  }

  function handleLogout() {
    clearTokens()
    setTokens({ access: '', refresh: '' })
    setMe(null)
  }

  const canManageUsers = me?.effective_permission_keys?.some((permissionKey) =>
    permissionKey.startsWith('manage_users_'),
  )

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <LoginPage
            authError={authError}
            isAuthenticated={Boolean(tokens.access)}
            onAuth={handleAuth}
          />
        }
      />
      <Route
        path="/admin/permissions"
        element={
          <ProtectedRoute
            booting={booting}
            isAuthenticated={Boolean(tokens.access)}
            canManageUsers={canManageUsers}
          >
            <PermissionsListPage me={me} onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/permissions/:userId"
        element={
          <ProtectedRoute
            booting={booting}
            isAuthenticated={Boolean(tokens.access)}
            canManageUsers={canManageUsers}
          >
            <PermissionDetailPage me={me} onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />
      <Route
        path="*"
        element={
          <Navigate
            to={tokens.access ? '/admin/permissions' : '/login'}
            replace
          />
        }
      />
    </Routes>
  )
}

function ProtectedRoute({ booting, isAuthenticated, canManageUsers, children }) {
  if (booting) {
    return <StateCard title="Loading" message="Checking your access..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!canManageUsers) {
    return (
      <StateCard
        title="Access denied"
        message="This page uses JWT auth and manage_users permissions. Your account cannot open it."
      />
    )
  }

  return children
}

function LoginPage({ authError, isAuthenticated, onAuth }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: 'prod', password: 'test12345' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(authError)

  useEffect(() => {
    setError(authError)
  }, [authError])

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/admin/permissions', { replace: true })
    }
  }, [isAuthenticated, navigate])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await api.post('/auth/login/', form)
      onAuth(response.data)
      navigate('/admin/permissions', { replace: true })
    } catch (nextError) {
      setError(nextError.response?.data?.detail || 'Login failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <p className="eyebrow">Admin Permissions</p>
        <h1>Manage user roles and overrides with JWT access</h1>
        <p className="subtitle">
          This page is not tied to Django admin login. It uses the API roles and permission hierarchy.
        </p>
      </section>

      <form className="panel form-panel" onSubmit={handleSubmit}>
        <h2>Sign in</h2>
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
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Login'}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </main>
  )
}

function PermissionsListPage({ me, onLogout }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    results: [],
    scope: '',
    current_user_level: 0,
  })

  useEffect(() => {
    let active = true
    async function loadUsers() {
      setState((current) => ({ ...current, loading: true, error: '' }))
      try {
        const response = await api.get('/admin/users/manageable/')
        if (active) {
          setState({
            loading: false,
            error: '',
            results: response.data.results,
            scope: response.data.scope,
            current_user_level: response.data.current_user_level,
          })
        }
      } catch (error) {
        if (active) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error.response?.data?.detail || 'Could not load users.',
          }))
        }
      }
    }
    loadUsers()
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="page-shell">
      <Header me={me} onLogout={onLogout} />

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Permissions landing</p>
            <h2>You can manage these users</h2>
          </div>
          <Link className="pill-link" to="/admin/permissions">
            Refresh
          </Link>
        </div>

        <div className="summary-grid">
          <div className="summary-card">
            <span>Scope</span>
            <strong>{state.scope || 'No scope'}</strong>
          </div>
          <div className="summary-card">
            <span>Your level</span>
            <strong>{state.current_user_level}</strong>
          </div>
          <div className="summary-card">
            <span>Your roles</span>
            <strong>{me?.role_keys?.join(', ') || '-'}</strong>
          </div>
        </div>

        <p className="muted-text">
          Users at your level or above are not listed because you cannot modify them.
        </p>

        {state.loading && <p className="muted-text">Loading users...</p>}
        {state.error && <p className="error-text">{state.error}</p>}

        {!state.loading && !state.error && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Roles</th>
                  <th>Company / Entity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.results.length === 0 && (
                  <tr>
                    <td colSpan="4">No manageable users found.</td>
                  </tr>
                )}
                {state.results.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.username}</strong>
                      <div className="subline">{user.email}</div>
                    </td>
                    <td>{user.roles.map((role) => role.name).join(', ') || 'No roles'}</td>
                    <td>
                      {user.company_name || '-'} / {user.entity_name || '-'}
                    </td>
                    <td>
                      <Link className="table-action" to={`/admin/permissions/${user.id}`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

function PermissionDetailPage({ me, onLogout }) {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, error: '', user: null })
  const [savingRoles, setSavingRoles] = useState(false)
  const [selectedRoles, setSelectedRoles] = useState([])
  const [actionMessage, setActionMessage] = useState('')

  useEffect(() => {
    let active = true
    async function loadDetail() {
      setState({ loading: true, error: '', user: null })
      try {
        const response = await api.get(`/admin/users/${userId}/`)
        if (active) {
          setState({ loading: false, error: '', user: response.data })
          setSelectedRoles(response.data.roles.map((role) => role.key))
        }
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error.response?.data?.detail || 'Could not load user detail.',
            user: null,
          })
        }
      }
    }
    loadDetail()
    return () => {
      active = false
    }
  }, [userId])

  async function saveRoles() {
    setSavingRoles(true)
    setActionMessage('')
    try {
      const response = await api.patch(`/admin/users/${userId}/`, {
        role_keys: selectedRoles,
      })
      setState((current) => ({ ...current, user: response.data }))
      setSelectedRoles(response.data.roles.map((role) => role.key))
      setActionMessage('Roles updated.')
    } catch (error) {
      setActionMessage(error.response?.data?.role_keys?.[0] || error.response?.data?.detail || 'Could not update roles.')
    } finally {
      setSavingRoles(false)
    }
  }

  async function togglePermission(permissionKey, shouldAllow) {
    setActionMessage('')
    try {
      const response = shouldAllow
        ? await api.post(`/admin/users/${userId}/permissions/`, {
            permission_key: permissionKey,
          })
        : await api.delete(`/admin/users/${userId}/permissions/`, {
            data: { permission_key: permissionKey },
          })
      setState((current) => ({ ...current, user: response.data }))
      setActionMessage(`${permissionKey} updated.`)
    } catch (error) {
      setActionMessage(error.response?.data?.detail || 'Could not update permission.')
    }
  }

  if (state.loading) {
    return <StateCard title="Loading" message="Fetching user permissions..." />
  }

  if (state.error) {
    return <StateCard title="Unavailable" message={state.error} />
  }

  const user = state.user

  return (
    <main className="page-shell">
      <Header me={me} onLogout={onLogout} />

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">User detail</p>
            <h2>{user.username}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={() => navigate('/admin/permissions')}>
            Back
          </button>
        </div>

        <div className="summary-grid">
          <div className="summary-card">
            <span>Current roles</span>
            <strong>{user.roles.map((role) => role.name).join(', ') || 'No roles'}</strong>
          </div>
          <div className="summary-card">
            <span>Company</span>
            <strong>{user.company_name || '-'}</strong>
          </div>
          <div className="summary-card">
            <span>Entity</span>
            <strong>{user.entity_name || '-'}</strong>
          </div>
        </div>
      </section>

      <section className="detail-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Roles</p>
              <h2>Manage role hierarchy</h2>
            </div>
          </div>
          <p className="muted-text">
            You can only assign roles below your own level.
          </p>
          <div className="check-grid">
            {user.available_roles.map((role) => (
              <label key={role.key} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(role.key)}
                  onChange={(event) => {
                    setSelectedRoles((current) =>
                      event.target.checked
                        ? [...current, role.key]
                        : current.filter((item) => item !== role.key),
                    )
                  }}
                />
                <span>
                  {role.name} <small>(level {role.level})</small>
                </span>
              </label>
            ))}
          </div>
          <button type="button" onClick={saveRoles} disabled={savingRoles}>
            {savingRoles ? 'Saving...' : 'Save roles'}
          </button>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Overrides</p>
              <h2>Permission toggles</h2>
            </div>
          </div>
          <p className="muted-text">
            Inherited permissions come from roles. Override lets you explicitly allow or deny them.
          </p>
          <div className="permission-list">
            {user.permissions.map((permission) => (
              <article key={permission.key} className="permission-card">
                <div>
                  <strong>{permission.name}</strong>
                  <div className="subline">{permission.key}</div>
                  <div className="tag-row">
                    <span className={`status-tag ${permission.inherited ? 'active' : ''}`}>
                      inherited: {permission.inherited ? 'yes' : 'no'}
                    </span>
                    <span className={`status-tag ${permission.effective ? 'active' : 'muted'}`}>
                      effective: {permission.effective ? 'allowed' : 'denied'}
                    </span>
                    <span className="status-tag">
                      override: {permission.override === null ? 'none' : permission.override ? 'allow' : 'deny'}
                    </span>
                  </div>
                </div>
                <div className="button-stack">
                  <button type="button" onClick={() => togglePermission(permission.key, true)}>
                    Allow
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => togglePermission(permission.key, false)}
                  >
                    Deny
                  </button>
                </div>
              </article>
            ))}
          </div>
          {actionMessage && <p className="muted-text">{actionMessage}</p>}
        </section>
      </section>
    </main>
  )
}

function Header({ me, onLogout }) {
  return (
    <header className="panel topbar">
      <div>
        <p className="eyebrow">Signed in</p>
        <h2>{me?.username}</h2>
        <p className="muted-text">{me?.role_keys?.join(', ') || 'No roles'}</p>
      </div>
      <div className="topbar-actions">
        <Link className="pill-link" to="/admin/permissions">
          Users
        </Link>
        <button className="ghost-button" type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}

function StateCard({ title, message }) {
  return (
    <main className="page-shell">
      <section className="panel state-card">
        <h1>{title}</h1>
        <p className="subtitle">{message}</p>
      </section>
    </main>
  )
}

export default App
