import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { Select } from '../components/ui/select'
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
      <main className="space-y-6">
        <section className="surface-card p-6">
          <p className="text-sm text-muted-foreground">Loading user...</p>
        </section>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="space-y-6">
        <section className="surface-card p-6">
          <p className="text-sm font-medium text-destructive">{state.error}</p>
        </section>
      </main>
    )
  }

  const messageIsError = message.toLowerCase().includes('could not')

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Permission detail"
        title={user.username}
        description="Review profile, role, and effective permissions."
        actions={
          <Link
            className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted/60"
            to="/admin/users"
          >
            Back
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Email</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{user.email || '-'}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Company</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{user.company_name || '-'}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Entity</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {user.entity_name || '-'} ({user.entity_type || '-'})
          </p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{user.is_active ? 'Active' : 'Inactive'}</p>
        </article>
      </section>

      <section className="surface-card p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Profile</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">User Information</h2>
        {!canEdit && <p className="mt-2 text-sm text-muted-foreground">Read only: same-level users cannot be modified.</p>}
        {message && (
          <p className={`mt-2 text-sm font-medium ${messageIsError ? 'text-destructive' : 'text-success'}`}>
            {message}
          </p>
        )}

        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            saveProfile()
          }}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium text-foreground">Username</label>
              <input
                id="username"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={profileForm.username}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, username: event.target.value }))
                }
                disabled={!canEdit}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
              <input
                id="email"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={profileForm.email}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, email: event.target.value }))
                }
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="phone_number" className="text-sm font-medium text-foreground">Phone Number</label>
              <input
                id="phone_number"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={profileForm.phone_number}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, phone_number: event.target.value }))
                }
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="first_name" className="text-sm font-medium text-foreground">First Name</label>
              <input
                id="first_name"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={profileForm.first_name}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, first_name: event.target.value }))
                }
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="last_name" className="text-sm font-medium text-foreground">Last Name</label>
              <input
                id="last_name"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={profileForm.last_name}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, last_name: event.target.value }))
                }
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="job_title" className="text-sm font-medium text-foreground">Job Title</label>
              <input
                id="job_title"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={profileForm.job_title}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, job_title: event.target.value }))
                }
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Security</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">New Password (Optional)</label>
                <input
                  id="password"
                  type="password"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  value={profileForm.password}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, password: event.target.value }))
                  }
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Organization & Access</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {canShowCompany && (
                <div className="space-y-1.5">
                  <label htmlFor="company_id" className="text-sm font-medium text-foreground">Company</label>
                  <Select
                    id="company_id"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
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
                  </Select>
                </div>
              )}

              {canShowEntity && (
                <div className="space-y-1.5">
                  <label htmlFor="entity_id" className="text-sm font-medium text-foreground">Entity</label>
                  <Select
                    id="entity_id"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
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
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="status_select" className="text-sm font-medium text-foreground">Status</label>
                <Select
                  id="status_select"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  value={profileForm.is_active ? 'active' : 'inactive'}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, is_active: event.target.value === 'active' }))
                  }
                  disabled={!canEdit}
                >
                  <option value="">Select status</option>
                  <option value="active">Activate</option>
                  <option value="inactive">Deactivate</option>
                </Select>
              </div>

              {canShowTeamLeader && (
                <div className="space-y-1.5">
                  <label htmlFor="team_leader_id" className="text-sm font-medium text-foreground">Team Leader</label>
                  <Select
                    id="team_leader_id"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
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
                  </Select>
                </div>
              )}
            </div>
          </div>


          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Roles</p>
            <h3 className="text-sm font-semibold text-foreground">Assigned Role</h3>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {roleOptions.map((role) => (
                <div key={role.key} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border text-lg leading-none transition ${
                      selectedRole === role.key
                        ? 'border-transparent text-emerald-600'
                        : 'border-muted-foreground/40 text-muted-foreground'
                    } ${canEdit ? 'cursor-pointer hover:border-primary hover:text-primary' : 'cursor-not-allowed opacity-80'}`}
                    onClick={() => setSelectedRole(role.key)}
                    disabled={!canEdit}
                    aria-label={`Select ${role.name} role`}
                  >
                    {selectedRole === role.key ? '\u2713' : '-'}
                  </button>
                  <label className="text-sm text-foreground">
                    {role.name} <small className="text-muted-foreground">(level {role.level})</small>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              disabled={!canEdit || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save User'}
            </button>
            <Link
              to="/admin/users"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted/60"
            >
              Cancel
            </Link>
          </div>

          {message && (
            <p className={`text-sm font-medium ${messageIsError ? 'text-destructive' : 'text-success'}`}>
              {message}
            </p>
          )}
        </form>
      </section>

      <section className="surface-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Permissions</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Permission Matrix</h2>
          </div>
          <span className="text-xs text-muted-foreground">{user.permissions.length} permission(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table bg-card">
            <thead>
              <tr>
                <th>Permission</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {user.permissions.map((permission) => (
                <tr key={permission.key} className="bg-card">
                  <td className="px-4 py-3 align-top">
                    <div className="text-base font-bold leading-tight">{permission.name}</div>
                    <div className="text-sm text-muted-foreground">{permission.key}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border text-lg leading-none transition ${
                        permission.effective
                          ? 'border-transparent text-emerald-600'
                          : 'border-muted-foreground/40 text-muted-foreground'
                      } ${canEdit ? 'cursor-pointer hover:border-primary hover:text-primary' : 'cursor-not-allowed opacity-80'}`}
                      onClick={() => updatePermission(permission.key, !permission.effective)}
                      disabled={!canEdit}
                      aria-label={`${permission.effective ? 'Revoke' : 'Grant'} ${permission.name}`}
                    >
                      {permission.effective ? '\u2713' : '-'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

export default PermissionDetailPage
