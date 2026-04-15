import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { api } from '../lib/api'

function getApiErrorMessage(error, fallback) {
  const payload = error?.response?.data
  if (!payload) {
    return fallback
  }
  if (typeof payload.detail === 'string' && payload.detail) {
    return payload.detail
  }
  if (Array.isArray(payload.role_keys) && payload.role_keys.length) {
    return payload.role_keys.join(' ')
  }
  if (typeof payload.role_keys === 'string') {
    return payload.role_keys
  }
  if (payload && typeof payload === 'object') {
    const firstKey = Object.keys(payload)[0]
    const firstValue = payload[firstKey]
    if (Array.isArray(firstValue) && firstValue.length) {
      return String(firstValue[0])
    }
    if (typeof firstValue === 'string' && firstValue) {
      return firstValue
    }
  }
  return fallback
}

function PermissionDetailPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, error: '', user: null })
  const [selectedRole, setSelectedRole] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function loadDetail() {
      try {
        const response = await api.get(`/admin/users/${userId}/`)
        if (active) {
          setState({ loading: false, error: '', user: response.data })
          setSelectedRole(response.data.roles[0]?.key || '')
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
    if (!selectedRole) {
      setMessage('Select one role before saving.')
      return
    }
    try {
      const response = await api.patch(`/admin/users/${userId}/`, { role_keys: [selectedRole] })
      setState((current) => ({ ...current, user: response.data }))
      setSelectedRole(response.data.roles[0]?.key || '')
      setMessage('Roles updated.')
      navigate('/admin/permissions')
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Could not save roles.'))
    }
  }

  async function updatePermission(permissionKey, shouldAllow) {
    try {
      const response = shouldAllow
        ? await api.post(`/admin/users/${userId}/permissions/`, { permission_key: permissionKey })
        : await api.delete(`/admin/users/${userId}/permissions/`, {
            data: { permission_key: permissionKey },
          })
      setState((current) => ({ ...current, user: response.data }))
      setMessage(`${permissionKey} updated.`)
    } catch (error) {
      setMessage(getApiErrorMessage(error, `Could not update ${permissionKey}.`))
    }
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
  const canEdit = Boolean(user.can_edit)
  const roleOptions = canEdit ? user.available_roles : user.roles

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
            <strong>
              {user.entity_name || '-'} ({user.entity_type || '-'})
            </strong>
          </div>
        </div>
      </section>

      <section className="detail-grid">
        <section className="panel">
          <p className="eyebrow">Roles</p>
          <h2>Assigned role</h2>
          {!canEdit && <p className="muted-text">Read only: same-level users cannot be modified.</p>}
          <div className="check-grid">
            {roleOptions.map((role) => (
              <label key={role.key} className="checkbox-row">
                <input
                  type="radio"
                  name="role-selection"
                  checked={selectedRole === role.key}
                  onChange={() => setSelectedRole(role.key)}
                  disabled={!canEdit}
                />
                <span>
                  {role.name} <small>(level {role.level})</small>
                </span>
              </label>
            ))}
          </div>
          <button type="button" onClick={saveRoles} disabled={!canEdit}>
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
                  <label className="switch-row">
                    <span>{permission.effective ? 'ON' : 'OFF'}</span>
                    <input
                      type="checkbox"
                      className="permission-switch"
                      checked={permission.effective}
                      onChange={(event) => updatePermission(permission.key, event.target.checked)}
                      disabled={!canEdit}
                    />
                  </label>
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
