import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
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
  const { user: actor } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', user: null })
  const [selectedRole, setSelectedRole] = useState('')
  const [message, setMessage] = useState('')
  const [options, setOptions] = useState({
    company_options: [],
    entity_options: [],
    team_leader_options: [],
  })
  const [profileForm, setProfileForm] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    job_title: '',
    phone_number: '',
    password: '',
    is_active: true,
    company_id: '',
    entity_id: '',
    team_leader_id: '',
  })

  useEffect(() => {
    let active = true
    async function loadDetail() {
      try {
        const [detailResponse, optionsResponse] = await Promise.all([
          api.get(`/admin/users/${userId}/`),
          api.get('/admin/users/manageable/options/'),
        ])
        if (active) {
          const detail = detailResponse.data
          setState({ loading: false, error: '', user: detail })
          setOptions(optionsResponse.data || options)
          setSelectedRole(detail.roles[0]?.key || '')
          setProfileForm({
            username: detail.username || '',
            email: detail.email || '',
            first_name: detail.first_name || '',
            last_name: detail.last_name || '',
            job_title: detail.job_title || '',
            phone_number: detail.phone_number || '',
            password: '',
            is_active: detail.is_active !== false,
            company_id: detail.company || '',
            entity_id: detail.entity || '',
            team_leader_id: detail.team_leader || '',
          })
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
      navigate('/admin/permissions', {
        state: { successMessage: 'Saved successfully: roles updated.' },
      })
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Could not save roles.'))
    }
  }

  async function saveProfile() {
    try {
      const payload = {
        username: profileForm.username,
        email: profileForm.email,
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        job_title: profileForm.job_title,
        phone_number: profileForm.phone_number,
        is_active: profileForm.is_active,
      }
      if (profileForm.password.trim()) {
        payload.password = profileForm.password
      }
      if (canShowCompany && profileForm.company_id) {
        payload.company_id = Number(profileForm.company_id)
      }
      if (canShowEntity) {
        payload.entity_id = profileForm.entity_id ? Number(profileForm.entity_id) : null
      }
      if (canShowTeamLeader) {
        payload.team_leader_id = profileForm.team_leader_id
          ? Number(profileForm.team_leader_id)
          : null
      }
      await api.patch(`/admin/users/manageable/${userId}/`, payload)
      setMessage('User profile updated.')
      setProfileForm((current) => ({ ...current, password: '' }))
      navigate('/admin/permissions', {
        state: { successMessage: 'Saved successfully: user updated.' },
      })
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Could not update user profile.'))
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

  const user = state.user
  const canEdit = Boolean(user?.can_edit)
  const roleOptions = canEdit ? user?.available_roles || [] : user?.roles || []
  const targetRole = selectedRole || user?.roles?.[0]?.key || ''
  const isSuperAdmin = (actor?.role_keys || []).includes('super_admin')
  const canShowCompany = isSuperAdmin
  const canShowEntity = ['manager', 'team_leader', 'user'].includes(targetRole)
  const canShowTeamLeader = targetRole === 'user'

  const companyId = Number(profileForm.company_id)
  const entityId = Number(profileForm.entity_id)
  const filteredEntities = !companyId
    ? options.entity_options
    : options.entity_options.filter((item) => item.company_id === companyId)
  const filteredTeamLeaders = !canShowTeamLeader
    ? []
    : options.team_leader_options.filter(
        (item) =>
          (!companyId || item.company_id === companyId) &&
          (!entityId || item.entity_id === entityId),
      )

  useEffect(() => {
    if (!canShowTeamLeader && profileForm.team_leader_id) {
      setProfileForm((current) => ({ ...current, team_leader_id: '' }))
    }
  }, [canShowTeamLeader, profileForm.team_leader_id])

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
          <p className="eyebrow">User profile</p>
          <h2>Edit user data</h2>
          {!canEdit && <p className="muted-text">Read only: same-level users cannot be modified.</p>}
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault()
              saveProfile()
            }}
          >
            <input
              value={profileForm.username}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, username: event.target.value }))
              }
              placeholder="Username"
              disabled={!canEdit}
              required
            />
            <input
              value={profileForm.email}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="Email"
              disabled={!canEdit}
            />
            <input
              value={profileForm.first_name}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, first_name: event.target.value }))
              }
              placeholder="First name"
              disabled={!canEdit}
            />
            <input
              value={profileForm.last_name}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, last_name: event.target.value }))
              }
              placeholder="Last name"
              disabled={!canEdit}
            />
            <input
              value={profileForm.job_title}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, job_title: event.target.value }))
              }
              placeholder="Job title"
              disabled={!canEdit}
            />
            <input
              value={profileForm.phone_number}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, phone_number: event.target.value }))
              }
              placeholder="Phone number"
              disabled={!canEdit}
            />
            <input
              type="password"
              value={profileForm.password}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="New password (optional)"
              disabled={!canEdit}
            />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={profileForm.is_active}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, is_active: event.target.checked }))
                }
                disabled={!canEdit}
              />
              <span>Active user</span>
            </label>

            {canShowCompany && (
              <select
                className="app-select"
                value={profileForm.company_id}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    company_id: event.target.value,
                    entity_id: '',
                    team_leader_id: '',
                  }))
                }
                disabled={!canEdit}
                required
              >
                <option value="">Select company</option>
                {options.company_options.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}

            {canShowEntity && (
              <select
                className="app-select"
                value={profileForm.entity_id}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    entity_id: event.target.value,
                    team_leader_id: '',
                  }))
                }
                disabled={!canEdit}
                required
              >
                <option value="">Select entity</option>
                {filteredEntities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}

            {canShowTeamLeader && (
              <select
                className="app-select"
                value={profileForm.team_leader_id}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, team_leader_id: event.target.value }))
                }
                disabled={!canEdit}
              >
                <option value="">Select Team Leader</option>
                {filteredTeamLeaders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}

            <button type="submit" disabled={!canEdit}>
              Save user
            </button>
          </form>
        </section>

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

      {message && (
        <section className="panel">
          <p className="muted-text">{message}</p>
        </section>
      )}
    </main>
  )
}

export default PermissionDetailPage
