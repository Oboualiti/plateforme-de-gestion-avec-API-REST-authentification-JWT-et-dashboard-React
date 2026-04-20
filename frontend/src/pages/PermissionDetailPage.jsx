import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
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
  const [isSaving, setIsSaving] = useState(false)
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

  async function saveProfile() {
    const actorRoleKeys = actor?.role_keys || []
    const actorIsTeamLeader = actorRoleKeys.includes('team_leader')

    if (!selectedRole) {
      setMessage('Select one role before saving.')
      return
    }
    if (selectedRole === 'user' && !actorIsTeamLeader && !profileForm.team_leader_id) {
      setMessage('Select a team leader before saving a user role.')
      return
    }

    setIsSaving(true)
    try {
      const currentRole = user?.roles?.[0]?.key || ''
      if (selectedRole !== currentRole) {
        const rolePayload = { role_keys: [selectedRole] }
        if (selectedRole === 'user') {
          rolePayload.team_leader_id = profileForm.team_leader_id
            ? Number(profileForm.team_leader_id)
            : null
        }
        const roleResponse = await api.patch(`/admin/users/${userId}/`, rolePayload)
        setState((current) => ({ ...current, user: roleResponse.data }))
      }

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
      setMessage('User updated.')
      setProfileForm((current) => ({ ...current, password: '' }))
      navigate('/admin/users', {
        state: { successMessage: 'Saved successfully: user and role updated.' },
      })
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Could not update user.'))
    } finally {
      setIsSaving(false)
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
      <PageHeader
        eyebrow="Permission detail"
        title={user.username}
        description="Review profile, role, and effective permissions."
        actions={
          <Link className="pill-link" to="/admin/users">
            Back
          </Link>
        }
      />

      <section className="summary-grid">
        <div className="summary-card">
          <span>Email</span>
          <strong className="stat-value-small">{user.email || '-'}</strong>
        </div>
        <div className="summary-card">
          <span>Company</span>
          <strong className="stat-value-small">{user.company_name || '-'}</strong>
        </div>
        <div className="summary-card">
          <span>Entity</span>
          <strong className="stat-value-small">
            {user.entity_name || '-'} ({user.entity_type || '-'})
          </strong>
        </div>
        <div className="summary-card">
          <span>Status</span>
          <strong className="stat-value-small">{user.is_active ? 'Active' : 'Inactive'}</strong>
        </div>
      </section>

      <section className="detail-grid">
        <section className="panel" style={{ gridColumn: '1 / -1' }}>
          <p className="eyebrow">Profile</p>
          <h2>User information</h2>
          {!canEdit && <p className="muted-text">Read only: same-level users cannot be modified.</p>}
          {message && (
            <p className={message.toLowerCase().includes('could not') ? 'error-text' : 'muted-text'}>
              {message}
            </p>
          )}
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
            <label className="switch-control" htmlFor="active-user-switch">
              <span>Active user</span>
              <input
                id="active-user-switch"
                type="checkbox"
                className="switch-input"
                checked={profileForm.is_active}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, is_active: event.target.checked }))
                }
                disabled={!canEdit}
              />
              <span className="switch-slider" aria-hidden="true" />
            </label>

            {canShowCompany && (
              <div>
                <label htmlFor="company_id">Company</label>
                <select
                  id="company_id"
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
              </div>
            )}

            {canShowEntity && (
              <div>
                <label htmlFor="entity_id">Entity</label>
                <select
                  id="entity_id"
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
              </div>
            )}

            {canShowTeamLeader && (
              <div>
                <label htmlFor="team_leader_id">Team leader</label>
                <select
                  id="team_leader_id"
                  className="app-select"
                  value={profileForm.team_leader_id}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, team_leader_id: event.target.value }))
                  }
                  disabled={!canEdit}
                >
                  <option value="">Select team leader</option>
                  {filteredTeamLeaders.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <p className="eyebrow">Roles</p>
              <h2 style={{ marginBottom: '0.75rem' }}>Assigned role</h2>
              <div className="check-grid role-options-grid">
                {roleOptions.map((role) => (
                  <label key={role.key} className="role-radio-option" htmlFor={`role-${role.key}`}>
                    <input
                      id={`role-${role.key}`}
                      type="radio"
                      className="role-radio-input"
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
            </div>

            <button type="submit" disabled={!canEdit || isSaving}>
              {isSaving ? 'Saving...' : 'Save user'}
            </button>
            {message && (
              <p className={message.toLowerCase().includes('could not') ? 'error-text' : 'muted-text'}>
                {message}
              </p>
            )}
          </form>
        </section>
      </section>

      <section className="panel">
        <div className="workspace-section-title">
          <div>
            <p className="eyebrow">Permissions</p>
            <h2>Permission matrix</h2>
          </div>
          <span className="muted-text">{user.permissions.length} permission(s)</span>
        </div>
        <div className="permission-list">
          {user.permissions.map((permission) => (
            <article key={permission.key} className="permission-card">
              <div>
                <strong>{permission.name}</strong>
                <div className="subline">{permission.key}</div>
                <div className="tag-row">
                  <span className={`status-tag ${permission.effective ? 'active' : 'danger'}`}>
                    {permission.effective ? 'Allowed' : 'Denied'}
                  </span>
                </div>
              </div>
              <label className="switch-control" htmlFor={`permission-${permission.key}`}>
                <span>{permission.effective ? 'ON' : 'OFF'}</span>
                <input
                  id={`permission-${permission.key}`}
                  type="checkbox"
                  className="switch-input"
                  checked={permission.effective}
                  onChange={(event) => updatePermission(permission.key, event.target.checked)}
                  disabled={!canEdit}
                />
                <span className="switch-slider" aria-hidden="true" />
              </label>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default PermissionDetailPage
