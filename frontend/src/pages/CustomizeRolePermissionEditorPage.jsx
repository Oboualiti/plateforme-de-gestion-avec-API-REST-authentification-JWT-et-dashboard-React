import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { 
  Building2, 
  ShieldCheck, 
  ClipboardList, 
  Activity, 
  LayoutGrid 
} from 'lucide-react'

const SECTION_ORDER = ['organization', 'access_control', 'requests', 'monitoring', 'other']
const SECTION_TITLE = {
  organization: 'Organization',
  access_control: 'Access Control',
  requests: 'Requests',
  monitoring: 'Monitoring',
  other: 'Other',
}

const LOG_PERMISSION_ORDER = [
  'view_audit_logs',
  'view_logs_scope_global',
  'view_logs_scope_company',
  'view_logs_scope_entity',
  'view_logs_scope_team',
  'view_org_audit_logs',
  'view_access_audit_logs',
  'view_user_audit_logs',
]

const REQUEST_PERMISSION_ORDER = [
  'close_request',
  'resolve_request',
  'edit_request_deadline',
  'comment_request',
  'view_request_discussion',
]

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
  view_all_requests: ['view_company_requests', 'view_entity_requests', 'view_own_requests', 'view_team_requests'],
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
    if (!accumulator[child]) accumulator[child] = []
    accumulator[child].push(parent)
  })
  return accumulator
}, {})

const ROLE_LEVEL_FALLBACK = {
  super_admin: 7,
  senior: 6,
  manager: 5,
  team_leader: 4,
  handler: 3,
  user: 2,
}

const PERMISSION_META_BY_KEY = {
  manage_companies: { title: 'Manage Companies', description: 'Create / edit / disable companies', section: 'organization' },
  view_all_companies: { title: 'View All Companies', description: 'View all companies', section: 'organization' },
  manage_entities: { title: 'Manage Entities', description: 'Create / edit / disable entities', section: 'organization' },
  view_company_entities: { title: 'View Company Entities', description: 'View company entities', section: 'organization' },
  manage_users_global: { title: 'Manage Users Global', description: 'Invite / deactivate globally', section: 'access_control' },
  manage_users_company: { title: 'Manage Users Company', description: 'Invite / deactivate within company', section: 'access_control' },
  manage_users_entity: { title: 'Manage Users Entity', description: 'Invite / deactivate within entity', section: 'access_control' },
  create_request: { title: 'Create Request', description: 'Create new requests', section: 'requests' },
  view_all_requests: { title: 'View All Requests', description: 'View all requests', section: 'requests' },
  view_company_requests: { title: 'View Company Requests', description: 'View company requests', section: 'requests' },
  view_entity_requests: { title: 'View Entity Requests', description: 'View entity requests', section: 'requests' },
  view_team_requests: { title: 'View Team Requests', description: 'View team requests', section: 'requests' },
  view_own_requests: { title: 'View Own Requests', description: 'View own submitted requests', section: 'requests' },
  approve_request: { title: 'Approve Request', description: 'Approve requests in pending workflow', section: 'requests' },
  assign_request: { title: 'Assign Request', description: 'Assign request owner', section: 'requests' },
  resolve_request: { title: 'Update Request Status', description: 'Control status changes (accepted / in progress / rejected / completed)', section: 'requests' },
  close_request: { title: 'Close Request', description: 'Close completed requests', section: 'requests' },
  edit_request_deadline: { title: 'Edit Request Deadline', description: 'Set and update approximate request deadlines', section: 'requests' },
  view_global_reports: { title: 'View Global Reports', description: 'Access global reporting', section: 'monitoring' },
  view_company_reports: { title: 'View Company Reports', description: 'Access company reporting', section: 'monitoring' },
  view_entity_reports: { title: 'View Entity Reports', description: 'Access entity reporting', section: 'monitoring' },
  export_data: { title: 'Export Data', description: 'Export monitoring data', section: 'monitoring' },
  view_user_audit_logs: { title: 'View User Logs', description: 'View user management audit logs', section: 'monitoring' },
  view_access_audit_logs: { title: 'View Access Logs', description: 'View role and permission change logs', section: 'monitoring' },
  view_org_audit_logs: { title: 'View Organization Logs', description: 'View company and entity change logs', section: 'monitoring' },
  view_logs_scope_team: { title: 'Team Log Scope', description: 'Logs limited to team scope', section: 'monitoring' },
  view_logs_scope_entity: { title: 'Entity Log Scope', description: 'Logs limited to entity scope', section: 'monitoring' },
  view_logs_scope_company: { title: 'Company Log Scope', description: 'Logs limited to company scope', section: 'monitoring' },
  view_logs_scope_global: { title: 'Global Log Scope', description: 'Logs visible across all companies', section: 'monitoring' },
}

const SECTION_ICON = {
  organization: Building2,
  access_control: ShieldCheck,
  requests: ClipboardList,
  monitoring: Activity,
  other: LayoutGrid,
}

function toScopePayload(searchParams) {
  const payload = {}
  const company_id = searchParams.get('company_id')
  const entity_id = searchParams.get('entity_id')
  const entity_type = searchParams.get('entity_type')
  if (company_id) payload.company_id = Number(company_id)
  if (entity_id) payload.entity_id = Number(entity_id)
  if (entity_type) payload.entity_type = entity_type
  return payload
}

function toTitleCaseFromKey(key) {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function collectImpliedPermissions(permissionKey, visited = new Set()) {
  if (visited.has(permissionKey)) return []
  visited.add(permissionKey)
  const directChildren = PERMISSION_IMPLICATIONS[permissionKey] || []
  const nestedChildren = directChildren.flatMap((child) => collectImpliedPermissions(child, visited))
  return [...new Set([...directChildren, ...nestedChildren])]
}

function applyLogScopePolicyForRole(roleKey, permissionKeys) {
  const next = new Set(permissionKeys || [])

  if (next.has('view_logs_scope_global')) {
    next.add('view_logs_scope_company')
    next.add('view_logs_scope_entity')
    next.add('view_logs_scope_team')
  } else if (next.has('view_logs_scope_company')) {
    next.add('view_logs_scope_entity')
    next.add('view_logs_scope_team')
  } else if (next.has('view_logs_scope_entity')) {
    next.add('view_logs_scope_team')
  }

  if (roleKey === 'senior' && (next.has('view_logs_scope_entity') || next.has('view_logs_scope_team'))) {
    next.add('view_logs_scope_company')
  }
  if (roleKey === 'manager' && next.has('view_logs_scope_team')) {
    next.add('view_logs_scope_entity')
  }

  return Array.from(next)
}

function applyRequestStatusPolicy(permissionKeys) {
  const next = new Set(permissionKeys || [])
  if (!next.has('resolve_request')) {
    next.delete('close_request')
  }
  return Array.from(next)
}

function buildPermissionRows(permissionKeys) {
  const sectionIndex = (section) => {
    const idx = SECTION_ORDER.indexOf(section)
    return idx === -1 ? SECTION_ORDER.length : idx
  }

  return (permissionKeys || [])
    .map((key) => {
      const metadata = PERMISSION_META_BY_KEY[key]
      return {
        key,
        title: metadata?.title || toTitleCaseFromKey(key),
        description: metadata?.description || key.replaceAll('_', ' '),
        section: metadata?.section || 'other',
      }
    })
    .sort((a, b) => {
      if (a.section !== b.section) return sectionIndex(a.section) - sectionIndex(b.section)
      if (a.section === 'requests') {
        const ai = REQUEST_PERMISSION_ORDER.indexOf(a.key)
        const bi = REQUEST_PERMISSION_ORDER.indexOf(b.key)
        const aOrder = ai === -1 ? 999 : ai
        const bOrder = bi === -1 ? 999 : bi
        if (aOrder !== bOrder) return aOrder - bOrder
      }
      if (a.section === 'monitoring') {
        const ai = LOG_PERMISSION_ORDER.indexOf(a.key)
        const bi = LOG_PERMISSION_ORDER.indexOf(b.key)
        const aOrder = ai === -1 ? 999 : ai
        const bOrder = bi === -1 ? 999 : bi
        if (aOrder !== bOrder) return aOrder - bOrder
      }
      return a.title.localeCompare(b.title)
    })
}

function groupRowsBySection(rows) {
  const grouped = {}
  rows.forEach((row) => {
    if (!grouped[row.section]) grouped[row.section] = []
    grouped[row.section].push(row)
  })
  return grouped
}

function CustomizeRolePermissionEditorPage() {
  const { roleId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  const roleKeys = user?.role_keys || []
  const isSuperAdmin = roleKeys.includes('super_admin')
  const effectivePermissionKeys = useMemo(() => new Set(user?.effective_permission_keys || []), [user?.effective_permission_keys])

  const [state, setState] = useState({ loading: true, error: '', roles: [], allPermissionKeys: [] })
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState([])
  const [saved, setSaved] = useState([])
  const [saving, setSaving] = useState(false)

  const numericRoleId = Number(roleId)
  const scopePayload = useMemo(() => toScopePayload(searchParams), [searchParams])
  const backQuery = searchParams.toString()

  useEffect(() => {
    let active = true

    async function loadData() {
      setState((current) => ({ ...current, loading: true, error: '' }))
      try {
        const response = await api.get('/admin/roles/', { params: scopePayload })
        if (!active) return
        const payload = response.data || {}
        const roles = payload.roles || []
        const selected = roles.find((item) => item.id === numericRoleId)
        const selectedKeys = selected?.custom_default_permissions || selected?.default_permissions || []
        setState({ loading: false, error: '', roles, allPermissionKeys: payload.all_permission_keys || [] })
        setDraft([...selectedKeys])
        setSaved([...selectedKeys])
      } catch (error) {
        if (!active) return
        setState({ loading: false, error: error.response?.data?.detail || 'Could not load role permissions.', roles: [], allPermissionKeys: [] })
      }
    }

    loadData()
    return () => {
      active = false
    }
  }, [numericRoleId, scopePayload])

  const selectedRole = useMemo(
    () => state.roles.find((item) => item.id === numericRoleId) || null,
    [state.roles, numericRoleId],
  )

  const roleLevelByKey = useMemo(() => {
    const map = { ...ROLE_LEVEL_FALLBACK }
    state.roles.forEach((role) => {
      map[role.key] = role.level || 0
    })
    return map
  }, [state.roles])

  const actorRoleLevel = useMemo(
    () => roleKeys.reduce((highest, roleKey) => Math.max(highest, roleLevelByKey[roleKey] || 0), 0),
    [roleKeys, roleLevelByKey],
  )

  const canEditRole = useMemo(() => {
    if (!selectedRole) return false
    if (isSuperAdmin) return true
    const targetLevel = roleLevelByKey[selectedRole.key] || 0
    return actorRoleLevel > 0 && targetLevel > 0 && actorRoleLevel > targetLevel
  }, [actorRoleLevel, isSuperAdmin, roleLevelByKey, selectedRole])

  const allowedPermissionSet = useMemo(() => new Set(state.allPermissionKeys || []), [state.allPermissionKeys])
  const permissionRows = useMemo(() => buildPermissionRows(state.allPermissionKeys), [state.allPermissionKeys])
  const rowsBySection = useMemo(() => groupRowsBySection(permissionRows), [permissionRows])

  function getBlockReason(permissionKey) {
    if (!canEditRole) return 'You can only manage users below your role'
    if (!isSuperAdmin && !effectivePermissionKeys.has(permissionKey)) return 'You can only assign permissions you already have'
    return ''
  }

  function togglePermission(permissionKey) {
    const blockReason = getBlockReason(permissionKey)
    if (blockReason || saving) return

    setDraft((current) => {
      const nextSet = new Set(current)
      if (nextSet.has(permissionKey)) {
        nextSet.delete(permissionKey)
        ;(IMPLIED_BY[permissionKey] || []).forEach((parent) => nextSet.delete(parent))
      } else {
        nextSet.add(permissionKey)
        collectImpliedPermissions(permissionKey).forEach((childKey) => {
          if (!getBlockReason(childKey)) nextSet.add(childKey)
        })
      }
      return applyRequestStatusPolicy(applyLogScopePolicyForRole(selectedRole?.key, Array.from(nextSet)))
    })
  }

  async function saveChanges() {
    if (!selectedRole) return
    setSaving(true)
    setMessage('')
    try {
      const selected = applyRequestStatusPolicy(applyLogScopePolicyForRole(selectedRole?.key, draft)).filter((key) => allowedPermissionSet.has(key))
      const safeSelection = isSuperAdmin ? selected : selected.filter((key) => effectivePermissionKeys.has(key))
      await api.patch(`/admin/roles/${selectedRole.id}/defaults/`, { permission_keys: safeSelection })
      setSaved(safeSelection)
      setDraft(safeSelection)
      navigate(`/admin/roles/customize${backQuery ? `?${backQuery}` : ''}`)
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Could not update role permissions.')
    } finally {
      setSaving(false)
    }
  }

  function cancelChanges() {
    navigate(`/admin/roles/customize${backQuery ? `?${backQuery}` : ''}`)
  }

  if (state.loading) {
    return (
      <main className="space-y-6">
        <Skeleton className="h-20 w-full rounded-md" />
        <Skeleton className="h-96 w-full rounded-md" />
      </main>
    )
  }

  if (state.error) {
    return (
      <main>
        <Card className="shadow-none">
          <CardContent className="p-6 text-center text-sm font-bold text-destructive">{state.error}</CardContent>
        </Card>
      </main>
    )
  }

  if (!selectedRole) {
    return (
      <main className="space-y-4">
        <PageHeader
          eyebrow="Administration"
          title="Role Not Available"
          description="This role is not available in the selected scope."
          actions={(
            <Link to={`/admin/roles/customize${backQuery ? `?${backQuery}` : ''}`}>
              <Button variant="outline">Back</Button>
            </Link>
          )}
        />
      </main>
    )
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title={`Edit ${selectedRole.name} Permissions`}
        description="Simple editor for saved default role permissions."
        actions={(
          <Link to={`/admin/roles/customize${backQuery ? `?${backQuery}` : ''}`}>
            <Button variant="outline">Back</Button>
          </Link>
        )}
        meta={(
          <>
            <Badge variant="outline">Level {selectedRole.level || 0}</Badge>
            <Badge variant="secondary">{selectedRole.user_count || 0} users</Badge>
          </>
        )}
      />

      {message && (
        <Card className="shadow-none">
          <CardContent className="py-3">
            <p className="text-sm font-medium">{message}</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-2 shadow-none">
        <CardContent className="space-y-4 p-4">
          {SECTION_ORDER.map((section) => {
            const rows = rowsBySection[section] || []
            if (!rows.length) return null
            return (
              <section key={section} className="rounded-sm border border-border/80 bg-card">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-surface-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const Icon = SECTION_ICON[section] || SECTION_ICON.other
                      return <Icon className="h-4 w-4 text-muted-foreground" />
                    })()}
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">
                      {SECTION_TITLE[section] || section}
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground/60">
                       · {rows.length} permissions
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-border/60">
                  {rows.map((row) => {
                    const checked = draft.includes(row.key)
                    const blockReason = getBlockReason(row.key)
                    const editable = !blockReason && !saving
                    return (
                      <div key={row.key} className="flex items-start justify-between gap-3 bg-card px-3 py-2">
                        <div>
                          <p className="text-sm font-bold">{row.title}</p>
                          <p className="text-xs text-muted-foreground">{row.description}</p>
                        </div>
                        <button
                          type="button"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border text-base leading-none ${
                            checked ? 'border-transparent text-emerald-600' : 'border-muted-foreground/40 text-muted-foreground'
                          } ${editable ? 'cursor-pointer hover:border-primary hover:text-primary' : 'cursor-not-allowed opacity-80'}`}
                          onClick={() => togglePermission(row.key)}
                          disabled={!editable}
                          title={blockReason || undefined}
                          aria-label={`${checked ? 'Revoke' : 'Grant'} ${row.title}`}
                        >
                          {checked ? '\u2713' : '-'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={cancelChanges} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={saveChanges} disabled={!canEditRole || saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

export default CustomizeRolePermissionEditorPage
