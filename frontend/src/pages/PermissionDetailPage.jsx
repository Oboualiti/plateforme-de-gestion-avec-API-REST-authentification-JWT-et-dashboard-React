import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api } from '../lib/api'

function PermissionDetailPage() {
  const { userId } = useParams()
  const [state, setState] = useState({ loading: true, error: '', user: null })
  const [selectedRoles, setSelectedRoles] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function loadDetail() {
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
    const response = await api.patch(`/admin/users/${userId}/`, { role_keys: selectedRoles })
    setState((current) => ({ ...current, user: response.data }))
    setMessage('Roles updated.')
  }

  async function updatePermission(permissionKey, shouldAllow) {
    const response = shouldAllow
      ? await api.post(`/admin/users/${userId}/permissions/`, { permission_key: permissionKey })
      : await api.delete(`/admin/users/${userId}/permissions/`, {
          data: { permission_key: permissionKey },
        })
    setState((current) => ({ ...current, user: response.data }))
    setMessage(`${permissionKey} updated.`)
  }

  if (state.loading) {
    return (
      <main className="page-content">
        <section className="panel">
          <p className="muted-text">Loading user...</p>
        </section>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="page-content">
        <section className="panel">
          <p className="error-text">{state.error}</p>
        </section>
      </main>
    )
  }

  const user = state.user

  return (
    <main className="page-content">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Permission detail</p>
            <h1>{user.username}</h1>
          </div>
          <Link className="pill-link" to="/admin/permissions">
            Back
          </Link>
        </div>

        <div className="summary-grid">
          <div className="summary-card">
            <span>Email</span>
            <strong>{user.email}</strong>
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
          <p className="eyebrow">Roles</p>
          <h2>Assigned roles</h2>
          <div className="check-grid">
            {user.available_roles.map((role) => (
              <label key={role.key} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(role.key)}
                  onChange={(event) =>
                    setSelectedRoles((current) =>
                      event.target.checked
                        ? [...current, role.key]
                        : current.filter((item) => item !== role.key),
                    )
                  }
                />
                <span>
                  {role.name} <small>(level {role.level})</small>
                </span>
              </label>
            ))}
          </div>
          <button type="button" onClick={saveRoles}>
            Save roles
          </button>
        </section>

        <section className="panel">
          <p className="eyebrow">Permissions</p>
          <h2>Permission matrix</h2>
          <div className="permission-list">
            {user.permissions.map((permission) => (
              <article key={permission.key} className="permission-card">
                <div>
                  <strong>{permission.name}</strong>
                  <div className="subline">{permission.key}</div>
                  <div className="tag-row">
                    <span className={`status-tag ${permission.inherited ? 'active' : 'muted'}`}>
                      role: {permission.inherited ? 'inherited' : 'not inherited'}
                    </span>
                    <span className={`status-tag ${permission.effective ? 'active' : 'danger'}`}>
                      current: {permission.effective ? 'allowed' : 'denied'}
                    </span>
                  </div>
                </div>
                <div className="button-stack">
                  <button type="button" onClick={() => updatePermission(permission.key, true)}>
                    Allow
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => updatePermission(permission.key, false)}
                  >
                    Deny
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      {message && (
        <section className="panel">
          <p className="muted-text">{message}</p>
        </section>
      )}
    </main>
  )
}

export default PermissionDetailPage
