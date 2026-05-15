import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import PageHeader from '../components/layout/PageHeader'
import { Select } from '../components/ui/select'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { 
  Building2, 
  ShieldCheck, 
  ClipboardList, 
  Activity, 
  FileSearch,
  LayoutGrid,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Mail,
  MapPinned,
  CircleDot,
  Eye,
  EyeOff
} from 'lucide-react'

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

const PERMISSION_SECTION_ORDER = ['organization', 'access_control', 'requests', 'reports', 'logs']

const PERMISSION_SECTION_LABELS = {
  organization: 'Organization',
  access_control: 'Access Control',
  requests: 'Requests',
  reports: 'Reports',
  logs: 'Logs',
}

const PERMISSION_SECTION_ICON = {
  organization: Building2,
  access_control: ShieldCheck,
  requests: ClipboardList,
  reports: Activity,
  logs: FileSearch,
  other: LayoutGrid,
}

const PERMISSION_SECTION_BY_KEY = {
  manage_companies: 'organization',
  view_all_companies: 'organization',
  manage_entities: 'organization',
  manage_company_entities: 'organization',
  view_company_entities: 'organization',
  view_all_entities: 'organization',
  manage_users_global: 'access_control',
  manage_users_company: 'access_control',
  manage_users_entity: 'access_control',
  manage_assigned_users: 'access_control',
  permission_management: 'access_control',
  view_users_global: 'access_control',
  view_users_company: 'access_control',
  view_users_entity: 'access_control',
  create_request: 'requests',
  view_all_requests: 'requests',
  view_company_requests: 'requests',
  view_entity_requests: 'requests',
  view_team_requests: 'requests',
  view_own_requests: 'requests',
  approve_request: 'requests',
  approve_completed_result: 'requests',
  assign_request: 'requests',
  invite_request_members: 'requests',
  resolve_request: 'requests',
  view_request_discussion: 'requests',
  comment_request: 'requests',
  view_global_reports: 'reports',
  view_company_reports: 'reports',
  view_entity_reports: 'reports',
  export_data: 'reports',
  view_audit_logs: 'logs',
  view_user_audit_logs: 'logs',
  view_access_audit_logs: 'logs',
  view_org_audit_logs: 'logs',
  view_logs_scope_team: 'logs',
  view_logs_scope_entity: 'logs',
  view_logs_scope_company: 'logs',
  view_logs_scope_global: 'logs',
}

const PERMISSION_IMPLICATIONS = {
  manage_companies: [
    'manage_entities',
    'manage_company_entities',
    'view_all_companies',
    'view_all_entities',
    'view_company_entities',
  ],
  manage_company_entities: ['view_company_entities'],
  manage_users_global: ['view_users_global', 'manage_users_company', 'manage_users_entity'],
  manage_users_company: ['view_users_company', 'manage_users_entity'],
  manage_users_entity: ['view_users_entity'],
  view_users_global: ['view_users_company', 'view_users_entity'],
  view_users_company: ['view_users_entity'],
  manage_entities: ['manage_company_entities'],
  view_all_companies: ['view_all_entities', 'view_company_entities'],
  view_all_entities: ['view_company_entities'],
  view_all_requests: [
    'view_company_requests',
    'view_entity_requests',
    'view_own_requests',
    'view_team_requests',
  ],
  view_company_requests: ['view_entity_requests'],
  view_global_reports: ['view_company_reports', 'view_entity_reports'],
  view_company_reports: ['view_entity_reports'],
  comment_request: ['view_request_discussion'],
  view_logs_scope_global: ['view_logs_scope_company', 'view_logs_scope_entity', 'view_logs_scope_team'],
  view_logs_scope_company: ['view_logs_scope_entity', 'view_logs_scope_team'],
  view_logs_scope_entity: ['view_logs_scope_team'],
}

const IMPLIED_BY = Object.entries(PERMISSION_IMPLICATIONS).reduce((accumulator, [parent, children]) => {
  children.forEach((child) => {
    if (!accumulator[child]) {
      accumulator[child] = []
    }
    accumulator[child].push(parent)
  })
  return accumulator
}, {})

function collectImpliedPermissions(permissionKey, visited = new Set()) {
  if (visited.has(permissionKey)) {
    return []
  }
  visited.add(permissionKey)
  const directChildren = PERMISSION_IMPLICATIONS[permissionKey] || []
  const nestedChildren = directChildren.flatMap((child) => collectImpliedPermissions(child, visited))
  return [...new Set([...directChildren, ...nestedChildren])]
}

function getPermissionSection(permissionKey) {
  return PERMISSION_SECTION_BY_KEY[permissionKey] || 'requests'
}
function PermissionDetailPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user: actor } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', user: null })
  const [selectedRole, setSelectedRole] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState({})
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
    confirm_password: '',
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
            confirm_password: '',
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
    if (profileForm.password.trim() && profileForm.password !== profileForm.confirm_password) {
      setMessage('Password confirmation does not match.')
      return
    }

    setIsSaving(true)
    try {
      const currentRole = user?.roles?.[0]?.key || ''
      let roleUpdated = false
      if (selectedRole !== currentRole) {
        if (!canManagePermissions) {
          setMessage('You do not have permission to change user role.')
          return
        }
        const rolePayload = { role_keys: [selectedRole] }
        if (selectedRole === 'user') {
          rolePayload.team_leader_id = profileForm.team_leader_id
            ? Number(profileForm.team_leader_id)
            : null
        }
        const roleResponse = await api.patch(`/admin/users/${userId}/`, rolePayload)
        setState((current) => ({ ...current, user: roleResponse.data }))
        roleUpdated = true
      }

      let infoUpdated = false
      if (canEditProfile) {
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
          payload.confirm_password = profileForm.confirm_password
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
        infoUpdated = true
      }

      if (roleUpdated || infoUpdated) {
        setMessage('User updated.')
        setProfileForm((current) => ({ ...current, password: '' }))
        navigate('/admin/users', {
          state: { successMessage: 'Saved successfully.' },
        })
      } else {
        setMessage('No changes to save.')
      }
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Could not update user.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function updatePermission(permissionKey, shouldAllow) {
    try {
      const effectiveSet = new Set(
        (state.user?.permissions || [])
          .filter((permission) => permission.effective)
          .map((permission) => permission.key),
      )

      const keysToApply = shouldAllow
        ? [permissionKey, ...collectImpliedPermissions(permissionKey)]
        : [permissionKey, ...(IMPLIED_BY[permissionKey] || [])]

      const dedupedKeys = [...new Set(keysToApply)]
      const validPermissionKeys = new Set((state.user?.permissions || []).map((permission) => permission.key))

      let latestResponseData = null
      for (const key of dedupedKeys) {
        if (!validPermissionKeys.has(key)) continue
        if (shouldAllow && effectiveSet.has(key)) continue
        if (!shouldAllow && !effectiveSet.has(key)) continue

        const response = shouldAllow
          ? await api.post(`/admin/users/${userId}/permissions/`, { permission_key: key })
          : await api.delete(`/admin/users/${userId}/permissions/`, {
              data: { permission_key: key },
            })

        latestResponseData = response.data
        if (shouldAllow) effectiveSet.add(key)
        else effectiveSet.delete(key)
      }

      if (latestResponseData) {
        setState((current) => ({ ...current, user: latestResponseData }))
      }
      setMessage(`${permissionKey} updated.`)
    } catch (error) {
      setMessage(getApiErrorMessage(error, `Could not update ${permissionKey}.`))
    }
  }

  const user = state.user
  const canEditProfile = Boolean(user?.can_edit)
  const canManagePermissions = Boolean(user?.can_manage_permissions)
  const roleOptions = canManagePermissions ? user?.available_roles || [] : user?.roles || []
  const targetRole = selectedRole || user?.roles?.[0]?.key || ''
  const isSuperAdmin = (actor?.role_keys || []).includes('super_admin')
  const canShowCompany = isSuperAdmin
  const canShowEntity = ['manager', 'team_leader', 'user'].includes(targetRole)
  const canShowTeamLeader = targetRole === 'user'
  const selectedEntity = options.entity_options.find((item) => Number(item.id) === Number(profileForm.entity_id))
  const activeEntityType = String(selectedEntity?.entity_type || user?.entity_type || '').toUpperCase()
  const isProdEntity = activeEntityType === 'PROD'
  const isTargetedEntity = ['SUPPORT', 'TDEV'].includes(activeEntityType)
  const prodOnlyRequestPermissions = new Set(['create_request', 'approve_request', 'approve_completed_result'])
  const targetedOnlyRequestPermissions = new Set(['assign_request', 'resolve_request', 'edit_request_deadline'])

  function canShowPermissionForEntity(permissionKey) {
    if (!prodOnlyRequestPermissions.has(permissionKey) && !targetedOnlyRequestPermissions.has(permissionKey)) {
      return true
    }
    if (prodOnlyRequestPermissions.has(permissionKey)) return isProdEntity
    if (targetedOnlyRequestPermissions.has(permissionKey)) return isTargetedEntity
    return true
  }

  const visiblePermissions = useMemo(() => {
    const byKey = new Map()
    for (const permission of user?.permissions || []) {
      if (permission.key === 'close_request') continue
      if (!canShowPermissionForEntity(permission.key)) continue
      const existing = byKey.get(permission.key)
      if (!existing) {
        byKey.set(permission.key, permission)
      } else if (!existing.effective && permission.effective) {
        byKey.set(permission.key, { ...existing, effective: true })
      }
    }
    return [...byKey.values()]
  }, [user?.permissions, isProdEntity, isTargetedEntity])

  const groupedPermissions = PERMISSION_SECTION_ORDER.map((sectionKey) => ({
    sectionKey,
    sectionLabel: PERMISSION_SECTION_LABELS[sectionKey],
    items: visiblePermissions.filter((permission) => getPermissionSection(permission.key) === sectionKey),
  })).filter((group) => group.items.length > 0)
  const visiblePermissionsCount = groupedPermissions.reduce((sum, group) => sum + group.items.length, 0)
  const isSectionCollapsed = (sectionKey) => collapsedSections[sectionKey] ?? true
  const allSectionsCollapsed = groupedPermissions.length > 0
    && groupedPermissions.every((group) => isSectionCollapsed(group.sectionKey))

  function setAllSectionsCollapsed(collapsed) {
    setCollapsedSections(
      groupedPermissions.reduce((accumulator, group) => {
        accumulator[group.sectionKey] = collapsed
        return accumulator
      }, {}),
    )
  }

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
        <section className="surface-card shadow-none p-6">
          <p className="text-sm text-muted-foreground">Loading user...</p>
        </section>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="space-y-6">
        <section className="surface-card shadow-none p-6">
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
          <div className="flex items-center gap-2">
            <button
              type="submit"
              form="user-detail-form"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              disabled={(!canEditProfile && !canManagePermissions) || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted/60"
              to="/admin/users"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="surface-card border-ink/10 shadow-none p-5">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <p className="eyebrow">Email</p>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground">{user.email || '-'}</p>
          <p className="mt-1 text-sm text-muted-foreground">Primary login email</p>
        </article>
        <article className="surface-card border-ink/10 shadow-none p-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <p className="eyebrow">Company</p>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground">{user.company_name || '-'}</p>
          <p className="mt-1 text-sm text-muted-foreground">Assigned company scope</p>
        </article>
        <article className="surface-card border-ink/10 shadow-none p-5">
          <div className="flex items-center gap-2">
            <MapPinned className="h-4 w-4 text-primary" />
            <p className="eyebrow">Entity</p>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground">
            {user.entity_name || '-'} ({user.entity_type || '-'})
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Current operational unit</p>
        </article>
        <article className="surface-card border-ink/10 shadow-none p-5">
          <div className="flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-primary" />
            <p className="eyebrow">Status</p>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground">{user.is_active ? 'Active' : 'Inactive'}</p>
          <p className="mt-1 text-sm text-muted-foreground">Account availability</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">
        <article className="surface-card shadow-none h-full max-h-[750px] p-5 overflow-y-auto">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Profile</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">User Information</h2>
          {!canEditProfile && <p className="mt-2 text-sm text-muted-foreground">Read only: same-level users cannot be modified.</p>}
          {message && (
            <p className={`mt-2 text-sm font-medium ${messageIsError ? 'text-destructive' : 'text-success'}`}>
              {message}
            </p>
          )}

          <form
            id="user-detail-form"
            className="mt-5 space-y-6"
            onSubmit={(event) => {
              event.preventDefault()
              saveProfile()
            }}
          >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium text-foreground">Username</label>
              <input
                id="username"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={profileForm.username}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, username: event.target.value }))
                }
                disabled={!canEditProfile}
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
                disabled={!canEditProfile}
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
                disabled={!canEditProfile}
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
                disabled={!canEditProfile}
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
                disabled={!canEditProfile}
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
                disabled={!canEditProfile}
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-border/70 pt-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Security</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">New Password (Optional)</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    value={profileForm.password}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, password: event.target.value }))
                    }
                    disabled={!canEditProfile}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-60"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    disabled={!canEditProfile}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirm_password" className="text-sm font-medium text-foreground">Confirm New Password</label>
                <div className="relative">
                  <input
                    id="confirm_password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    value={profileForm.confirm_password}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, confirm_password: event.target.value }))
                    }
                    disabled={!canEditProfile}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-60"
                    aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                    disabled={!canEditProfile}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-border/70 pt-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Organization & Access</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                    disabled={!canEditProfile}
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
                    disabled={!canEditProfile}
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
                  disabled={!canEditProfile}
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
                    disabled={!canEditProfile}
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


          {canManagePermissions && (
            <div className="space-y-3 border-t border-border/70 pt-4">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Roles</p>
              <h3 className="text-sm font-semibold text-foreground">Assigned Role</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {roleOptions.map((role) => (
                  <div key={role.key} className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border text-lg leading-none transition ${
                        selectedRole === role.key
                          ? 'border-transparent text-emerald-600'
                          : 'border-muted-foreground/40 text-muted-foreground'
                      } ${canManagePermissions ? 'cursor-pointer hover:border-primary hover:text-primary' : 'cursor-not-allowed opacity-80'}`}
                      onClick={() => setSelectedRole(role.key)}
                      disabled={!canManagePermissions}
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
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              disabled={(!canEditProfile && !canManagePermissions) || isSaving}
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
          </form>
        </article>

        <article className="surface-card shadow-none flex h-full max-h-[750px] flex-col p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Permissions</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">Permission Matrix</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-7 items-center rounded-md border border-border px-2 text-[11px] font-semibold text-foreground transition hover:bg-muted/60"
                onClick={() => setAllSectionsCollapsed(!allSectionsCollapsed)}
              >
                {allSectionsCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
              <span className="text-xs text-muted-foreground">{visiblePermissionsCount} permission(s)</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
            <table className="data-table bg-card">
              <thead>
                <tr>
                  <th>Permission</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {groupedPermissions.map((group) => (
                  <Fragment key={group.sectionKey}>
                    <tr className="sticky top-0 z-10 bg-surface-2">
                      <td colSpan={2} className="border-y border-ink/10 px-4 py-3">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 text-left"
                          onClick={() =>
                            setCollapsedSections((current) => ({
                              ...current,
                              [group.sectionKey]: !isSectionCollapsed(group.sectionKey),
                            }))
                          }
                          aria-label={`${isSectionCollapsed(group.sectionKey) ? 'Expand' : 'Collapse'} ${group.sectionLabel} section`}
                        >
                          {isSectionCollapsed(group.sectionKey)
                            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          {(() => {
                            const Icon = PERMISSION_SECTION_ICON[group.sectionKey] || PERMISSION_SECTION_ICON.other
                            return <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          })()}
                          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
                            {group.sectionLabel}
                          </span>
                          <span className="text-[10px] font-medium text-muted-foreground/60">
                            - {group.items.length} permissions
                          </span>
                        </button>
                      </td>
                    </tr>
                    {!isSectionCollapsed(group.sectionKey) && group.items.map((permission) => (
                      <tr key={permission.key} className="bg-card">
                        <td className="px-4 py-3 align-top">
                          <div className="text-base font-bold leading-tight">{permission.name}</div>
                          <div className="text-sm text-muted-foreground">{permission.description || permission.key}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border text-lg leading-none transition ${
                              permission.effective
                                ? 'border-transparent text-emerald-600'
                                : 'border-muted-foreground/40 text-muted-foreground'
                            } ${canManagePermissions ? 'cursor-pointer hover:border-primary hover:text-primary' : 'cursor-not-allowed opacity-80'}`}
                            onClick={() => updatePermission(permission.key, !permission.effective)}
                            disabled={!canManagePermissions}
                            aria-label={`${permission.effective ? 'Revoke' : 'Grant'} ${permission.name}`}
                          >
                            {permission.effective ? '\u2713' : '-'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  )
}

export default PermissionDetailPage

