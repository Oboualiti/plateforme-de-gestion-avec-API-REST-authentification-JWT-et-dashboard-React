import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Separator } from '../components/ui/separator'
import { Skeleton } from '../components/ui/skeleton'

function CompanyEditModal({ editState, onClose, onFieldChange, onSubmit }) {
  if (!editState.open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
        <CardHeader>
          <CardTitle>Edit company</CardTitle>
          <CardDescription>Update company details and senior assignment.</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground" htmlFor="edit-company-name">Company name</label>
              <Input
                id="edit-company-name"
                value={editState.form.name}
                onChange={(event) => onFieldChange('name', event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground" htmlFor="edit-company-code">Code</label>
              <Input
                id="edit-company-code"
                value={editState.form.code}
                onChange={(event) => onFieldChange('code', event.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Current senior</label>
                <div className="h-9 flex items-center text-sm font-medium text-muted-foreground italic px-3 rounded-md bg-muted/30">
                  {editState.currentSeniorName || 'None assigned'}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground" htmlFor="edit-company-senior">Assign senior</label>
                <Select
                  id="edit-company-senior"
                  className="app-select w-full"
                  value={editState.form.senior_user_id}
                  onChange={(event) => onFieldChange('senior_user_id', event.target.value)}
                >
                  <option value="">Keep current senior</option>
                  {editState.seniorOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.username}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground" htmlFor="edit-company-status">Status</label>
              <Select
                id="edit-company-status"
                className="app-select w-full"
                value={String(editState.form.is_active)}
                onChange={(event) => onFieldChange('is_active', event.target.value === 'true')}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </div>
          </CardContent>
          <div className="flex justify-end gap-2 p-6 pt-2 border-t mt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={editState.saving}>Cancel</Button>
            <Button type="submit" disabled={editState.saving}>
              {editState.saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

function EntityEditModal({ editState, companies, onClose, onFieldChange, onSubmit }) {
  if (!editState.open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
        <CardHeader>
          <CardTitle>Edit entity</CardTitle>
          <CardDescription>Update core fields and manager assignment for this entity.</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground" htmlFor="edit-entity-name">Entity name</label>
                <Input
                  id="edit-entity-name"
                  value={editState.form.name}
                  onChange={(event) => onFieldChange('name', event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground" htmlFor="edit-entity-code">Code</label>
                <Input
                  id="edit-entity-code"
                  value={editState.form.code}
                  onChange={(event) => onFieldChange('code', event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground" htmlFor="edit-entity-type">Entity type</label>
                <Select
                  id="edit-entity-type"
                  className="app-select w-full"
                  value={editState.form.entity_type}
                  onChange={(event) => onFieldChange('entity_type', event.target.value)}
                >
                  <option value="PROD">Prod</option>
                  <option value="SUPPORT">Support</option>
                  <option value="TDEV">T.Dev</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground" htmlFor="edit-entity-company">Company</label>
                <Select
                  id="edit-entity-company"
                  className="app-select w-full"
                  value={editState.form.company}
                  onChange={(event) => onFieldChange('company', event.target.value)}
                  required
                >
                  <option value="">Select company</option>
                  {companies.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Current manager</label>
                <div className="h-9 flex items-center text-sm font-medium text-muted-foreground italic px-3 rounded-md bg-muted/30">
                  {editState.currentManagerName || 'None assigned'}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground" htmlFor="edit-entity-manager">Assign manager</label>
                <Select
                  id="edit-entity-manager"
                  className="app-select w-full"
                  value={editState.form.manager_user_id}
                  onChange={(event) => onFieldChange('manager_user_id', event.target.value)}
                >
                  <option value="">Keep current manager</option>
                  {editState.managerOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.username}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground" htmlFor="edit-entity-status">Status</label>
              <Select
                id="edit-entity-status"
                className="app-select w-full"
                value={String(editState.form.is_active)}
                onChange={(event) => onFieldChange('is_active', event.target.value === 'true')}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </div>
          </CardContent>
          <div className="flex justify-end gap-2 p-6 pt-2 border-t mt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={editState.saving}>Cancel</Button>
            <Button type="submit" disabled={editState.saving}>
              {editState.saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

const sectionConfig = {
  dashboard: { title: 'Dashboard', endpoint: '/admin/dashboard/' },
  companies: { title: 'Companies', endpoint: '/admin/companies/' },
  entities: { title: 'Entities', endpoint: '/admin/entities/' },
  users: { title: 'Users', endpoint: '/admin/users/manageable/' },
  roles: { title: 'Roles', endpoint: '/admin/roles/' },
  requests: { title: 'Requests', endpoint: '/admin/requests/' },
  assignments: { title: 'Assignments', endpoint: '/admin/assignments/' },
  'audit-logs': { title: 'Audit logs', endpoint: '/admin/audit-logs/' },
  reports: { title: 'Reports', endpoint: '/admin/reports/' },
}

function useSectionKey() {
  const location = useLocation()
  const parts = location.pathname.split('/').filter(Boolean)
  return parts[1] || 'dashboard'
}

const auditGroups = [
  { key: 'users', title: 'User logs', modules: ['users'] },
  { key: 'access', title: 'Access / role logs', modules: ['permissions', 'roles'] },
  { key: 'organization', title: 'Organization logs', modules: ['companies', 'entities', 'hierarchy'] },
]

function resolveAuditGroupKey(module) {
  const matched = auditGroups.find((group) => group.modules.includes(module))
  return matched ? matched.key : 'other'
}

function formatAuditAction(action) {
  const labelMap = {
    create: 'created',
    update: 'edited',
    delete: 'removed',
    assign: 'assigned',
    update_permissions: 'updated permissions',
    allow_override: 'allowed override',
    deny_override: 'denied override',
    assign_senior: 'assigned senior',
    assign_manager: 'assigned manager',
  }
  return labelMap[action] || action.replaceAll('_', ' ')
}

function buildCompanyOptionsFromEntities(entities) {
  const byId = new Map()
  ;(entities || []).forEach((item) => {
    if (!item) return
    const id = Number(item.company)
    if (!id || byId.has(id)) return
    byId.set(id, {
      id,
      name: item.company_name || `Company ${id}`,
    })
  })
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function AdminControlCenterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const sectionKey = useSectionKey()
  const config = sectionConfig[sectionKey] || sectionConfig.dashboard
  const [state, setState] = useState({
    loading: true,
    error: '',
    data: null,
    sectionKey: 'dashboard',
  })
  const [message, setMessage] = useState('')
  const [auditGroupPages, setAuditGroupPages] = useState({})
  const [companyForm, setCompanyForm] = useState({ name: '', code: '', is_active: true })
  const [entityForm, setEntityForm] = useState({
    name: '',
    code: '',
    entity_type: 'PROD',
    company: '',
    is_active: true,
  })
  const [entityCompanyFilter, setEntityCompanyFilter] = useState('all')
  const [entityTypeFilter, setEntityTypeFilter] = useState('all')
  const [entityStatusFilter, setEntityStatusFilter] = useState('all')
  const [roleScopeFilter, setRoleScopeFilter] = useState({ company_id: '', entity_id: '', entity_type: '' })
  const roleKeys = user?.role_keys || []
  const effectivePermissionKeys = new Set(user?.effective_permission_keys || [])
  const isSuperAdmin = roleKeys.includes('super_admin')
  const isSenior = roleKeys.includes('senior')
  const isManager = roleKeys.includes('manager')
  const isTeamLeader = roleKeys.includes('team_leader')
  const canManageCompanies = effectivePermissionKeys.has('manage_companies')
  const canManageEntities = effectivePermissionKeys.has('manage_entities')
  const actorCompanyId = Number(user?.company_id ?? user?.company ?? 0) || null
  const [companyEditState, setCompanyEditState] = useState({
    open: false,
    saving: false,
    companyId: null,
    currentSeniorName: '',
    seniorOptions: [],
    form: {
      name: '',
      code: '',
      senior_user_id: '',
      is_active: true,
    },
  })
  const [entityEditState, setEntityEditState] = useState({
    open: false,
    saving: false,
    entityId: null,
    currentManagerName: '',
    managerOptions: [],
    form: {
      name: '',
      code: '',
      entity_type: 'PROD',
      company: '',
      manager_user_id: '',
      is_active: true,
    },
  })

  async function loadSection() {
    setState({ loading: true, error: '', data: null, sectionKey })
    try {
      let requestConfig
      if (sectionKey === 'roles') {
        const params = {}
        if (isSuperAdmin && roleScopeFilter.company_id) {
          params.company_id = Number(roleScopeFilter.company_id)
        }
        if ((isSuperAdmin || isSenior) && roleScopeFilter.entity_id) {
          params.entity_id = Number(roleScopeFilter.entity_id)
        }
        if ((isSuperAdmin || isSenior) && roleScopeFilter.entity_type) {
          params.entity_type = roleScopeFilter.entity_type
        }
        requestConfig = Object.keys(params).length ? { params } : undefined
      }
      const response = await api.get(config.endpoint, requestConfig)
      let normalizedData = response.data

      if (sectionKey === 'companies' && Array.isArray(normalizedData)) {
        normalizedData = { companies: normalizedData, senior_options: [] }
      }

      if (sectionKey === 'entities' && Array.isArray(normalizedData)) {
        let companyOptions = []
        let managerOptions = []
        try {
          const hierarchyResponse = await api.get('/admin/hierarchy/')
          companyOptions = hierarchyResponse.data?.companies || []
          managerOptions = hierarchyResponse.data?.manager_options || []
        } catch {
          companyOptions = []
          managerOptions = []
        }
        if (!companyOptions.length) {
          companyOptions = buildCompanyOptionsFromEntities(normalizedData)
        }
        normalizedData = {
          entities: normalizedData,
          companies: companyOptions,
          manager_options: managerOptions,
        }
      }

      if (sectionKey === 'entities' && !Array.isArray(normalizedData)) {
        if (!Array.isArray(normalizedData?.manager_options) || !normalizedData.manager_options.length) {
          try {
            const hierarchyResponse = await api.get('/admin/hierarchy/')
            normalizedData = {
              ...normalizedData,
              manager_options: hierarchyResponse.data?.manager_options || [],
            }
          } catch {
          }
        }
      }

      setState({ loading: false, error: '', data: normalizedData, sectionKey })
    } catch (error) {
      setState({
        loading: false,
        error: error.response?.data?.detail || 'Could not load admin section.',
        data: null,
        sectionKey,
      })
    }
  }

  const auditCategoryKey = useMemo(() => {
    const parts = location.pathname.split('/').filter(Boolean)
    return parts[0] === 'admin' && parts[1] === 'audit-logs' ? parts[2] || null : null
  }, [location.pathname])

  useEffect(() => {
    setAuditGroupPages({})
    loadSection()
  }, [sectionKey, auditCategoryKey, roleScopeFilter.company_id, roleScopeFilter.entity_id])

  function setAuditGroupPage(groupKey, nextPage) {
    setAuditGroupPages((current) => ({ ...current, [groupKey]: nextPage }))
  }

  useEffect(() => {
    setMessage('')
    setCompanyEditState({
      open: false,
      saving: false,
      companyId: null,
      currentSeniorName: '',
      seniorOptions: [],
      form: {
        name: '',
        code: '',
        senior_user_id: '',
        is_active: true,
      },
    })
    setEntityEditState({
      open: false,
      saving: false,
      entityId: null,
      currentManagerName: '',
      managerOptions: [],
      form: {
        name: '',
        code: '',
        entity_type: 'PROD',
        company: '',
        manager_user_id: '',
        is_active: true,
      },
    })
  }, [sectionKey])

  async function submitCompany(event) {
    event.preventDefault()
    try {
      await api.post('/admin/companies/', companyForm)
      setCompanyForm({ name: '', code: '', is_active: true })
      setMessage('Company created.')
      loadSection()
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Could not create company.')
    }
  }

  async function submitEntity(event) {
    event.preventDefault()
    try {
      await api.post('/admin/entities/', {
        ...entityForm,
        company: Number(entityForm.company),
      })
      setEntityForm({ name: '', code: '', entity_type: 'PROD', company: '', is_active: true })
      setMessage('Entity created.')
      loadSection()
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Could not create entity.')
    }
  }

  async function patchRecord(endpoint, payload, successMessage) {
    try {
      await api.patch(endpoint, payload)
      setMessage(successMessage)
      loadSection()
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Could not save changes.')
    }
  }

  async function saveRolePermissions(roleId, permissionKeys) {
    const scopePayload = {}
    if (isSuperAdmin && roleScopeFilter.company_id) {
      scopePayload.company_id = Number(roleScopeFilter.company_id)
    }
    if ((isSuperAdmin || isSenior) && roleScopeFilter.entity_id) {
      scopePayload.entity_id = Number(roleScopeFilter.entity_id)
    }
    if ((isSuperAdmin || isSenior) && roleScopeFilter.entity_type) {
      scopePayload.entity_type = roleScopeFilter.entity_type
    }
    try {
      await api.patch(`/admin/roles/${roleId}/`, { permission_keys: permissionKeys, ...scopePayload })
      setMessage('Role permissions updated.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Could not save changes.')
      throw error
    }
  }

  async function restoreRolePermissions(roleId) {
    try {
      const scopePayload = {}
      if (isSuperAdmin && roleScopeFilter.company_id) {
        scopePayload.company_id = Number(roleScopeFilter.company_id)
      }
      if ((isSuperAdmin || isSenior) && roleScopeFilter.entity_id) {
        scopePayload.entity_id = Number(roleScopeFilter.entity_id)
      }
      if ((isSuperAdmin || isSenior) && roleScopeFilter.entity_type) {
        scopePayload.entity_type = roleScopeFilter.entity_type
      }
      const response = await api.post(`/admin/roles/${roleId}/`, scopePayload)
      setMessage(response.data?.detail || 'Role defaults restored.')
      loadSection()
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Could not restore role defaults.')
    }
  }

  function updateCompanyEditField(field, value) {
    setCompanyEditState((current) => ({
      ...current,
      form: {
        ...current.form,
        [field]: value,
      },
    }))
  }

  function closeCompanyEditModal() {
    setCompanyEditState({
      open: false,
      saving: false,
      companyId: null,
      currentSeniorName: '',
      seniorOptions: [],
      form: {
        name: '',
        code: '',
        senior_user_id: '',
        is_active: true,
      },
    })
  }

  async function submitCompanyEdit(event) {
    event.preventDefault()
    if (!companyEditState.companyId) return

    setCompanyEditState((current) => ({ ...current, saving: true }))

    try {
      await api.patch(`/admin/companies/${companyEditState.companyId}/`, {
        name: companyEditState.form.name,
        code: companyEditState.form.code,
        is_active: Boolean(companyEditState.form.is_active),
      })

      if (companyEditState.form.senior_user_id) {
        await api.patch(`/admin/hierarchy/companies/${companyEditState.companyId}/`, {
          senior_user_id: Number(companyEditState.form.senior_user_id),
        })
      }

      setMessage('Company updated.')
      closeCompanyEditModal()
      loadSection()
    } catch (error) {
      setCompanyEditState((current) => ({ ...current, saving: false }))
      setMessage(error.response?.data?.detail || 'Could not update company.')
    }
  }

  function updateEntityEditField(field, value) {
    setEntityEditState((current) => ({
      ...current,
      form: {
        ...current.form,
        [field]: value,
      },
    }))
  }

  function closeEntityEditModal() {
    setEntityEditState({
      open: false,
      saving: false,
      entityId: null,
      currentManagerName: '',
      managerOptions: [],
      form: {
        name: '',
        code: '',
        entity_type: 'PROD',
        company: '',
        manager_user_id: '',
        is_active: true,
      },
    })
  }

  async function submitEntityEdit(event) {
    event.preventDefault()
    if (!entityEditState.entityId) return

    setEntityEditState((current) => ({ ...current, saving: true }))

    try {
      await api.patch(`/admin/entities/${entityEditState.entityId}/`, {
        name: entityEditState.form.name,
        code: entityEditState.form.code,
        entity_type: entityEditState.form.entity_type,
        company: Number(entityEditState.form.company),
        is_active: Boolean(entityEditState.form.is_active),
      })

      if (entityEditState.form.manager_user_id) {
        await api.patch(`/admin/hierarchy/entities/${entityEditState.entityId}/`, {
          manager_user_id: Number(entityEditState.form.manager_user_id),
        })
      }

      setMessage('Entity updated.')
      closeEntityEditModal()
      loadSection()
    } catch (error) {
      setEntityEditState((current) => ({ ...current, saving: false }))
      setMessage(error.response?.data?.detail || 'Could not update entity.')
    }
  }

  const sectionBody = useMemo(() => {
    const data = state.sectionKey === sectionKey ? state.data : null
    if (!data) return null

    if (sectionKey === 'dashboard') {
      return (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(data.totals || {}).map(([key, value]) => (
              <MetricCard key={key} title={key.replaceAll('_', ' ')} value={value} />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Queue status</CardTitle>
                <CardDescription>Current state of the request lifecycle.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Object.entries(data.queue || {}).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{key.replaceAll('_', ' ')}</p>
                      <p className="text-2xl font-bold">{value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Requests by status</CardTitle>
                <CardDescription>Frequency distribution.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(data.requests_by_status || []).map((item) => (
                  <div key={item.status} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.status}</span>
                    <Badge variant="secondary">{item.total}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )
    }

    if (sectionKey === 'companies') {
      const companies = data.companies || []
      const seniorOptions = data.senior_options || []
      return (
        <div className="space-y-6">
          {canManageCompanies && (
            <Card>
              <CardHeader>
                <CardTitle>Add company</CardTitle>
                <CardDescription>Register a new legal entity in the platform.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="flex flex-wrap items-end gap-3" onSubmit={submitCompany}>
                  <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Name</label>
                    <Input value={companyForm.name} onChange={(e) => setCompanyForm({...companyForm, name: e.target.value})} placeholder="e.g. Acme Corp" required />
                  </div>
                  <div className="space-y-1.5 w-32">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Code</label>
                    <Input value={companyForm.code} onChange={(e) => setCompanyForm({...companyForm, code: e.target.value})} placeholder="ACM" required />
                  </div>
                  <div className="space-y-1.5 w-32">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Status</label>
                    <Select className="app-select w-full" value={String(companyForm.is_active)} onChange={(e) => setCompanyForm({...companyForm, is_active: e.target.value === 'true'})}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </Select>
                  </div>
                  <Button type="submit">Create company</Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card className="surface-card">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Senior</th>
                    <th className="text-center">Entities</th>
                    <th className="text-center">Users</th>
                    <th>Status</th>
                    {canManageCompanies && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {companies.map((item) => {
                    const canEditCompany = canManageCompanies
                    const companySeniors = seniorOptions.filter((opt) => opt.company_id === item.id)
                    return (
                      <tr key={item.id}>
                        <td><div className="font-bold">{item.name}</div></td>
                        <td><Badge variant="outline" className="font-mono">{item.code}</Badge></td>
                        <td>
                          {item.senior_name ? (
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                              <span className="text-sm">{item.senior_name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Unassigned</span>
                          )}
                        </td>
                        <td className="text-center"><span className="text-sm font-medium">{item.entity_count}</span></td>
                        <td className="text-center"><span className="text-sm font-medium">{item.user_count}</span></td>
                        <td>
                          <Badge variant={item.is_active ? "success" : "destructive"}>
                            {item.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        {canManageCompanies && (
                          <td className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!canEditCompany}
                                onClick={() => {
                                  setCompanyEditState({
                                    open: true,
                                    saving: false,
                                    companyId: item.id,
                                    currentSeniorName: item.senior_name || '',
                                    seniorOptions: companySeniors,
                                    form: {
                                      name: item.name || '',
                                      code: item.code || '',
                                      senior_user_id: '',
                                      is_active: Boolean(item.is_active),
                                    },
                                  })
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!canEditCompany}
                                onClick={() => patchRecord(`/admin/companies/${item.id}/`, { is_active: !item.is_active }, 'Company updated.')}
                              >
                                {item.is_active ? 'Deactivate' : 'Activate'}
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!companies.length && <div className="py-20 text-center text-sm text-muted-foreground italic">No companies registered yet.</div>}
            </div>
          </Card>
        </div>
      )
    }

    if (sectionKey === 'entities') {
      const entities = data.entities || []
      const companies = data.companies || []
      const managerOptions = data.manager_options || []
      const filteredEntities = entities.filter((item) => {
        const matchesCompany = entityCompanyFilter === 'all' || String(item.company) === entityCompanyFilter
        const matchesType = entityTypeFilter === 'all' || item.entity_type === entityTypeFilter
        const matchesStatus = entityStatusFilter === 'all' || (entityStatusFilter === 'active' ? item.is_active : !item.is_active)
        return matchesCompany && matchesType && matchesStatus
      })

      return (
        <div className="space-y-6">
          {canManageEntities && (
            <Card>
              <CardHeader>
                <CardTitle>Add entity</CardTitle>
                <CardDescription>Assign and configure a new operating entity within a company.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid grid-cols-1 md:grid-cols-5 items-end gap-3" onSubmit={submitEntity}>
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Name</label>
                  <Input value={entityForm.name} onChange={(e) => setEntityForm({...entityForm, name: e.target.value})} placeholder="e.g. London Office" required />
                </div>
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Code</label>
                  <Input value={entityForm.code} onChange={(e) => setEntityForm({...entityForm, code: e.target.value})} placeholder="LON" required />
                </div>
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Type</label>
                  <Select className="app-select w-full" value={entityForm.entity_type} onChange={(e) => setEntityForm({...entityForm, entity_type: e.target.value})}>
                    {['PROD', 'SUPPORT', 'TDEV'].map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Company</label>
                  <Select className="app-select w-full" value={entityForm.company} onChange={(e) => setEntityForm({...entityForm, company: e.target.value})} required>
                    <option value="">Select company</option>
                    {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select>
                </div>
                  <Button type="submit">Create</Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card className="surface-card">
            <div className="filter-bar">
              <div className="flex-1 px-4 py-2 flex items-center gap-2">
                 <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Entity directory</h2>
                 <Badge variant="outline">{filteredEntities.length} results</Badge>
              </div>
              <div className="flex gap-2">
                <Select className="app-select" value={entityCompanyFilter} onChange={(e) => setEntityCompanyFilter(e.target.value)}>
                  <option value="all">All companies</option>
                  {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
                <Select className="app-select" value={entityTypeFilter} onChange={(e) => setEntityTypeFilter(e.target.value)}>
                  <option value="all">All types</option>
                  {['PROD', 'SUPPORT', 'TDEV'].map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
                <Select className="app-select" value={entityStatusFilter} onChange={(e) => setEntityStatusFilter(e.target.value)}>
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => { setEntityCompanyFilter('all'); setEntityTypeFilter('all'); setEntityStatusFilter('all'); }}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Company</th>
                    <th>Type</th>
                    <th>Manager</th>
                    <th className="text-center">Users</th>
                    <th>Status</th>
                    {canManageEntities && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredEntities.map((item) => {
                    const canEditEntity = canManageEntities
                    const entityManagers = managerOptions.filter((opt) => Number(opt.company_id) === Number(item.company))
                    return (
                      <tr key={item.id}>
                        <td><div className="font-bold">{item.name}</div></td>
                        <td><div className="text-sm">{item.company_name}</div></td>
                        <td><Badge variant="outline">{item.entity_type}</Badge></td>
                        <td>
                          {item.manager_name ? (
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                              <span className="text-sm">{item.manager_name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">None</span>
                          )}
                        </td>
                        <td className="text-center"><span className="text-sm font-medium">{item.user_count}</span></td>
                        <td>
                          <Badge variant={item.is_active ? "success" : "destructive"}>
                            {item.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        {canManageEntities && (
                          <td className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!canEditEntity}
                                onClick={() => {
                                  setEntityEditState({
                                    open: true,
                                    saving: false,
                                    entityId: item.id,
                                    currentManagerName: item.manager_name || '',
                                    managerOptions: entityManagers,
                                    form: {
                                      name: item.name || '',
                                      code: item.code || '',
                                      entity_type: item.entity_type || 'PROD',
                                      company: String(item.company || ''),
                                      manager_user_id: '',
                                      is_active: Boolean(item.is_active),
                                    },
                                  })
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!canEditEntity}
                                onClick={() => patchRecord(`/admin/entities/${item.id}/`, { is_active: !item.is_active }, 'Entity updated.')}
                              >
                                {item.is_active ? 'Deactivate' : 'Activate'}
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!filteredEntities.length && <div className="py-20 text-center text-sm text-muted-foreground italic">No entities match these constraints.</div>}
            </div>
          </Card>
        </div>
      )
    }

    if (sectionKey === 'users') {
      return (
        <div className="table-wrap">
          <div className="filter-bar justify-end">
            <Button asChild>
              <Link to="/admin/users/create">Add user</Link>
            </Button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Company</th>
                <th>Entity</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data.results || []).map((item) => (
                <tr key={item.id}>
                  <td>{item.username}</td>
                  <td>{item.roles.map((role) => role.name).join(', ') || '-'}</td>
                  <td>{item.company_name || '-'}</td>
                  <td>{item.entity_label || '-'}</td>
                  <td>{item.is_active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <Link className="table-action" to={`/admin/users/${item.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (sectionKey === 'roles') {
      const roleDisplayOrder = {
        super_admin: 0,
        senior: 1,
        manager: 2,
        team_leader: 3,
        user: 4,
      }
      const roleHierarchy = {
        super_admin: 7,
        senior: 6,
        manager: 5,
        team_leader: 4,
        handler: 3,
        user: 2,
      }
      const actorRoleLevel = roleKeys.reduce((highest, roleKey) => {
        const level = roleHierarchy[roleKey] || 0
        return level > highest ? level : highest
      }, 0)
      const companyOptions = data.company_options || []
      const entityOptions = data.entity_options || []
      const filteredEntityOptions = entityOptions.filter(
        (item) => !roleScopeFilter.entity_type || item.entity_type === roleScopeFilter.entity_type,
      )
      const sortedRoles = [...(data.roles || [])].sort((a, b) => {
        const aOrder = roleDisplayOrder[a.key] ?? 99
        const bOrder = roleDisplayOrder[b.key] ?? 99
        if (aOrder !== bOrder) {
          return aOrder - bOrder
        }
        return (a.name || '').localeCompare(b.name || '')
      })
      const canEditRole = (roleKey) => {
        if (isSuperAdmin) return true
        const targetRoleLevel = roleHierarchy[roleKey] || 0
        return actorRoleLevel > 0 && targetRoleLevel > 0 && actorRoleLevel > targetRoleLevel
      }
      return (
        <>
          <section className="panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Default role policy</p>
                <h2>Need card-based editing?</h2>
                <p className="muted-text">Open the dedicated screen to customize default permissions by role.</p>
              </div>
              <Link to="/admin/roles/customize">
                <Button variant="outline">Customize Default Permissions</Button>
              </Link>
            </div>
          </section>
          {(isSuperAdmin || isSenior) && (
            <section className="panel">
              <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
                {isSuperAdmin && (
                  <Select
                    className="app-select min-w-[230px] flex-1"
                    value={roleScopeFilter.company_id}
                    onChange={(event) =>
                      setRoleScopeFilter({
                        company_id: event.target.value,
                        entity_id: '',
                        entity_type: roleScopeFilter.entity_type,
                      })
                    }
                  >
                    <option value="">General (all companies)</option>
                    {companyOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                )}
                <Select
                  className="app-select min-w-[210px] flex-1"
                  value={roleScopeFilter.entity_type}
                  onChange={(event) =>
                    setRoleScopeFilter((current) => ({
                      ...current,
                      entity_type: event.target.value,
                      entity_id: '',
                    }))
                  }
                >
                  <option value="">All entity types</option>
                  <option value="PROD">Prod</option>
                  <option value="SUPPORT">Support</option>
                  <option value="TDEV">Dev</option>
                </Select>
                <Select
                  className="app-select min-w-[230px] flex-1"
                  value={roleScopeFilter.entity_id}
                  onChange={(event) =>
                    setRoleScopeFilter((current) => ({
                      ...current,
                      entity_id: event.target.value,
                    }))
                  }
                >
                  <option value="">General (all entities)</option>
                  {filteredEntityOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label || item.name}
                    </option>
                  ))}
                </Select>
              </div>
            </section>
          )}
          <RolesPermissionMatrix
            roles={sortedRoles}
            allPermissionKeys={data.all_permission_keys || []}
            canEditRole={canEditRole}
            actorPermissionKeys={effectivePermissionKeys}
            isSuperAdmin={isSuperAdmin}
            onSaveRole={saveRolePermissions}
            onRestoreRole={restoreRolePermissions}
          />
        </>
      )
    }

    if (sectionKey === 'requests') {
      return <RequestSummaryTable rows={data} />
    }

    if (sectionKey === 'assignments') {
      return (
        <>
          <section className="panel">
            <p className="eyebrow">Current</p>
            <h2>Assigned requests</h2>
            <RequestSummaryTable rows={data.current_assignments || []} />
          </section>
          <section className="panel">
            <p className="eyebrow">Unassigned</p>
            <h2>Needs assignment</h2>
            <RequestSummaryTable rows={data.unassigned_requests || []} />
          </section>
        </>
      )
    }

    if (sectionKey === 'audit-logs') {
      const pageSize = 10
      const allRows = data || []
      const grouped = allRows.reduce((acc, item) => {
        const groupKey = resolveAuditGroupKey(item.module)
        if (!acc[groupKey]) {
          const groupConfig = auditGroups.find((group) => group.key === groupKey)
          acc[groupKey] = { key: groupKey, title: groupConfig?.title || 'Other logs', rows: [] }
        }
        acc[groupKey].rows.push(item)
        return acc
      }, {})

      const selectedGroup = auditCategoryKey === 'all' ? { key: 'all', title: 'All audit logs', rows: allRows } : auditCategoryKey ? grouped[auditCategoryKey] : null

      if (!selectedGroup) {
        return (
          <Card className="p-8 text-center bg-muted/20 border-dashed">
            <CardTitle>Category not found</CardTitle>
            <CardDescription className="mt-2">The selected log category does not exist in this scope.</CardDescription>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/audit-logs/users')}>Open user logs</Button>
          </Card>
        )
      }

      const group = selectedGroup
      const totalPages = Math.max(1, Math.ceil(group.rows.length / pageSize))
      const currentPage = Math.min(auditGroupPages[group.key] || 1, totalPages)
      const pagedRows = group.rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      const userActionCounts = group.key === 'users' ? pagedRows.reduce((acc, row) => {
        const action = formatAuditAction(row.action)
        acc[action] = (acc[action] || 0) + 1
        return acc
      }, {}) : null

      return (
        <Card className="surface-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b bg-muted/10">
            <div>
              <CardTitle className="text-lg">{group.title}</CardTitle>
              <CardDescription>Historical record of system activities.</CardDescription>
            </div>
            <Badge variant="secondary">{group.rows.length} logs total</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {group.key === 'users' && (
              <div className="p-4 flex flex-wrap gap-2 border-b bg-muted/5">
                {Object.entries(userActionCounts || {}).map(([action, total]) => (
                  <Badge key={action} variant="outline" className="bg-background">{action}: {total}</Badge>
                ))}
              </div>
            )}
            <div className="divide-y divide-border">
              {pagedRows.map((item) => (
                <div key={item.id} className="p-4 hover:bg-muted/30 transition-colors animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="text-[10px] px-1.5 py-0 uppercase font-bold tracking-wider">{item.module}</Badge>
                    <span className="font-bold text-sm">{formatAuditAction(item.action)}</span>
                  </div>
                  <div className="text-sm font-medium mb-1">{item.target_label || item.target_model || '-'}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span className="font-semibold text-foreground/70">{item.actor_name || '-'}</span>
                    <Separator orientation="vertical" className="h-3" />
                    <span>{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
            {!pagedRows.length && <div className="py-20 text-center text-sm text-muted-foreground italic">No logs found in this category.</div>}
          </CardContent>
          <div className="flex items-center justify-between p-4 border-t bg-muted/5">
             <Button variant="outline" size="sm" onClick={() => setAuditGroupPage(group.key, Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>Previous</Button>
             <span className="text-xs font-medium text-muted-foreground">Page {currentPage} of {totalPages}</span>
             <Button variant="outline" size="sm" onClick={() => setAuditGroupPage(group.key, Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}>Next</Button>
          </div>
        </Card>
      )
    }

    if (sectionKey === 'reports') {
      const openCount = data.open_vs_resolved?.open || 0
      const resolvedCount = data.open_vs_resolved?.resolved || 0
      const totalTracked = openCount + resolvedCount
      const resolutionRate = totalTracked ? Math.round((resolvedCount / totalTracked) * 100) : 0

      const companyStats = (data.request_volume_by_company || []).map((item) => ({
        label: item.company_name || item['company__name'] || item.company || item.label || 'Unknown company',
        value: Number(item.total ?? item.count ?? item.value ?? 0),
      }))
      const typeStats = (data.requests_by_type || []).map((item) => ({
        label: item.type || item.request_type || item.category || item.label || 'Unknown type',
        value: Number(item.total ?? item.count ?? item.value ?? 0),
      }))
      const trendStats = (data.trend_summaries || []).map((item) => ({
        label: item.period || item.label || item.date || item.day || 'Point',
        value: Number(item.total ?? item.count ?? item.value ?? 0),
      }))

      const topCompanies = companyStats.slice(0, 5)
      const topTypes = typeStats.slice(0, 5)
      const topTrend = trendStats.slice(-10)
      const maxCompanyValue = Math.max(1, ...topCompanies.map((item) => item.value))
      const maxTypeValue = Math.max(1, ...topTypes.map((item) => item.value))
      const maxTrendValue = Math.max(1, ...topTrend.map((item) => item.value))

      return (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Total Open" value={openCount} />
            <MetricCard title="Total Resolved" value={resolvedCount} />
            <MetricCard title="Companies" value={companyStats.length} />
            <MetricCard title="Types tracked" value={typeStats.length} />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
               <div>
                 <CardTitle>Resolution efficiency</CardTitle>
                 <CardDescription>{resolvedCount} resolved out of {totalTracked} total tracked.</CardDescription>
               </div>
               <div className="text-2xl font-bold text-primary">{resolutionRate}%</div>
            </CardHeader>
            <CardContent>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${resolutionRate}%` }} />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top companies</CardTitle>
                <CardDescription>Volume distribution by organization.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {topCompanies.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground italic">No company data.</p>
                ) : (
                  topCompanies.map((item) => (
                    <div key={item.label} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span>{item.label}</span>
                        <span>{item.value}</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary/60" style={{ width: `${Math.round((item.value / maxCompanyValue) * 100)}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Request categories</CardTitle>
                <CardDescription>Demand mix by type.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {topTypes.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground italic">No category data.</p>
                ) : (
                  topTypes.map((item) => (
                    <div key={item.label} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span>{item.label}</span>
                        <span>{item.value}</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary/40" style={{ width: `${Math.round((item.value / maxTypeValue) * 100)}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Activity pulse</CardTitle>
              <CardDescription>Volume trend over time.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between h-32 gap-1 pt-4">
                {topTrend.map((item, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="w-full bg-primary/20 rounded-t-sm transition-all hover:bg-primary/40 relative" style={{ height: `${Math.max(10, Math.round((item.value / maxTrendValue) * 100))}%` }}>
                       <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-md border">
                         {item.value}
                       </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">{item.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return <p className="muted-text">This section is ready for expansion.</p>
  }, [
    sectionKey,
    state.data,
    state.sectionKey,
    auditGroupPages,
    auditCategoryKey,
    companyForm,
    entityForm,
    entityCompanyFilter,
    entityTypeFilter,
    entityStatusFilter,
    roleScopeFilter.company_id,
    roleScopeFilter.entity_id,
    roleScopeFilter.entity_type,
    isSuperAdmin,
    isSenior,
    isManager,
    isTeamLeader,
    canManageCompanies,
    canManageEntities,
    actorCompanyId,
    navigate,
  ])

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title={config.title}
        description="Manage structure, access, monitoring, and operational records from a consistent admin workspace."
        actions={
          <div className="flex gap-2">
            {sectionKey === 'requests' && (
              <Button variant="outline" onClick={() => navigate('/requests')}>
                Open request workspace
              </Button>
            )}
            {/* Add section specific actions here if needed */}
          </div>
        }
        meta={
          message && (
            <Badge variant={message.toLowerCase().includes('error') || message.toLowerCase().includes('could not') ? "destructive" : "success"}>
              {message}
            </Badge>
          )
        }
      />

      {state.loading && (
        <div className="space-y-4">
          {(sectionKey === 'users' || sectionKey === 'entities' || sectionKey === 'companies') ? (
            <AdminTableSkeleton rows={8} cols={6} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={`admin-metric-skeleton-${index}`}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-9 w-16" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
      
      {state.error && (
        <Card className="bg-destructive/5 border-destructive/20 text-destructive p-4 text-sm font-medium">
          {state.error}
        </Card>
      )}

      {!state.loading && !state.error && sectionBody}

      <CompanyEditModal
        editState={companyEditState}
        onClose={closeCompanyEditModal}
        onFieldChange={updateCompanyEditField}
        onSubmit={submitCompanyEdit}
      />

      <EntityEditModal
        editState={entityEditState}
        companies={state.data?.companies || []}
        onClose={closeEntityEditModal}
        onFieldChange={updateEntityEditField}
        onSubmit={submitEntityEdit}
      />
    </div>
  )
}

function RequestSummaryTable({ rows = [] }) {
  if (!rows.length) {
    return <Card className="py-20 text-center text-sm text-muted-foreground italic">No requests found.</Card>
  }

  return (
    <Card className="surface-card">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Status</th>
              <th>Company</th>
              <th>Source</th>
              <th>Target</th>
              <th>Assignee</th>
              <th className="text-right">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id || item.request_number}>
                <td>
                  <div className="font-bold">{item.request_number || '-'}</div>
                  <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{item.title || '-'}</div>
                </td>
                <td>
                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest bg-primary/5">
                    {item.status || '-'}
                  </Badge>
                </td>
                <td><div className="text-sm font-medium">{item.company_name || '-'}</div></td>
                <td><div className="text-xs">{item.source_entity_name || '-'}</div></td>
                <td><div className="text-xs">{item.target_entity_name || '-'}</div></td>
                <td>
                   <div className="flex items-center gap-2">
                     <div className={`w-1.5 h-1.5 rounded-full ${item.assignee_name ? 'bg-primary' : 'bg-muted'}`} />
                     <span className="text-xs">{item.assignee_name || 'Unassigned'}</span>
                   </div>
                </td>
                <td className="text-right text-[11px] text-muted-foreground tabular-nums">
                  {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

const permissionMetaByKey = {
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
  resolve_request: { title: 'Resolve Request', description: 'Mark as resolved', section: 'requests' },
  close_request: { title: 'Close Request', description: 'Close completed requests', section: 'requests' },
  view_global_reports: { title: 'View Global Reports', description: 'Access global reporting', section: 'monitoring' },
  view_company_reports: { title: 'View Company Reports', description: 'Access company reporting', section: 'monitoring' },
  view_entity_reports: { title: 'View Entity Reports', description: 'Access entity reporting', section: 'monitoring' },
  export_data: { title: 'Export Data', description: 'Export monitoring data', section: 'monitoring' },
  view_audit_logs: { title: 'View All Logs', description: 'View all system audit logs', section: 'monitoring' },
  view_user_audit_logs: { title: 'View User Logs', description: 'View user management audit logs', section: 'monitoring' },
  view_access_audit_logs: { title: 'View Access Logs', description: 'View role and permission change logs', section: 'monitoring' },
  view_org_audit_logs: { title: 'View Organization Logs', description: 'View company and entity change logs', section: 'monitoring' },
}

const permissionSectionOrder = ['organization', 'access_control', 'requests', 'monitoring', 'other']
const permissionSectionTitle = {
  organization: 'Organization',
  access_control: 'Access Control',
  requests: 'Requests',
  monitoring: 'Logs',
  other: 'Other',
}

function toTitleCaseFromKey(key) {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildPermissionRows(allPermissionKeys) {
  return (allPermissionKeys || []).map((key) => {
    const metadata = permissionMetaByKey[key]
    return {
      key,
      title: metadata?.title || toTitleCaseFromKey(key),
      description: metadata?.description || key.replaceAll('_', ' '),
      section: metadata?.section || 'other',
    }
  })
}

function RolesPermissionMatrix({ roles, allPermissionKeys, canEditRole, actorPermissionKeys, isSuperAdmin, onSaveRole, onRestoreRole }) {
  const [draftByRoleId, setDraftByRoleId] = useState({})
  const [savingByRoleId, setSavingByRoleId] = useState({})
  const allowedPermissionKeySet = useMemo(
    () => new Set(allPermissionKeys || []),
    [allPermissionKeys],
  )

  useEffect(() => {
    const next = {}
    roles.forEach((role) => {
      next[role.id] = [...(role.default_permissions || [])].filter((key) =>
        allowedPermissionKeySet.has(key),
      )
    })
    setDraftByRoleId(next)
  }, [roles, allowedPermissionKeySet])

  const permissionRows = useMemo(() => buildPermissionRows(allPermissionKeys), [allPermissionKeys])
  const rowsBySection = useMemo(() => {
    const grouped = {}
    permissionRows.forEach((row) => {
      if (!grouped[row.section]) grouped[row.section] = []
      grouped[row.section].push(row)
    })
    return grouped
  }, [permissionRows])

  function isChecked(roleId, permissionKey) {
    const selected = draftByRoleId[roleId] || []
    return selected.includes(permissionKey)
  }

  function getPermissionBlockReason(roleKey, permissionKey) {
    if (!canEditRole(roleKey)) return 'You can only manage users below your role'
    if (!isSuperAdmin && !actorPermissionKeys?.has(permissionKey)) {
      return 'You can only assign permissions you already have'
    }
    return ''
  }

  function buildSavePayload(role, permissionKeys) {
    if (isSuperAdmin) {
      return permissionKeys.filter((key) => allowedPermissionKeySet.has(key))
    }
    return permissionKeys.filter(
      (key) => allowedPermissionKeySet.has(key) && !getPermissionBlockReason(role.key, key),
    )
  }

  async function togglePermission(role, permissionKey) {
    if (getPermissionBlockReason(role.key, permissionKey)) return
    if (savingByRoleId[role.id]) return

    const selected = (draftByRoleId[role.id] || []).filter((key) =>
      allowedPermissionKeySet.has(key),
    )
    const next = selected.includes(permissionKey)
      ? selected.filter((item) => item !== permissionKey)
      : selected.concat(permissionKey)

    setDraftByRoleId((current) => ({ ...current, [role.id]: next }))
    setSavingByRoleId((current) => ({ ...current, [role.id]: true }))
    try {
      await onSaveRole(role.id, buildSavePayload(role, next))
    } catch {
      setDraftByRoleId((current) => ({ ...current, [role.id]: selected }))
    } finally {
      setSavingByRoleId((current) => ({ ...current, [role.id]: false }))
    }
  }

  return (
    <Card className="overflow-hidden border-2 border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/10 px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Restore defaults</span>
        <div className="flex flex-wrap items-center gap-2">
          {roles.map((role) => {
            const restoreBlockReason = canEditRole(role.key) ? '' : 'You can only manage users below your role'
            const editable = !restoreBlockReason
            const saving = Boolean(savingByRoleId[role.id])
            return (
              <Button
                key={`restore-${role.id}`}
                variant="ghost"
                size="sm"
                onClick={() => onRestoreRole(role.id)}
                disabled={!editable || saving}
                title={restoreBlockReason || undefined}
              >
                Restore {role.name}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse">
          <thead>
            <tr className="bg-[#e9e7db] text-foreground">
              <th className="border-b-2 border-foreground/90 px-4 py-3 text-left text-xs font-bold uppercase tracking-widest">Permission</th>
              {roles.map((role) => (
                <th key={role.id} className="border-b-2 border-foreground/90 px-4 py-3 text-center text-xs font-bold uppercase tracking-widest">
                  {role.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissionSectionOrder.map((section) => {
              const rows = rowsBySection[section] || []
              if (!rows.length) return null
              return (
                <Fragment key={section}>
                  <tr className="bg-[#f4f0dc]">
                    <td colSpan={roles.length + 1} className="border-y-2 border-foreground/90 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em]">
                      {permissionSectionTitle[section] || section}
                    </td>
                  </tr>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-border/80">
                      <td className="px-4 py-3 align-top">
                        <div className="text-base font-bold leading-tight">{row.title}</div>
                        <div className="text-sm text-muted-foreground">{row.description}</div>
                      </td>
                      {roles.map((role) => {
                        const checked = isChecked(role.id, row.key)
                        const blockReason = getPermissionBlockReason(role.key, row.key)
                        const editable = !blockReason
                        const saving = Boolean(savingByRoleId[role.id])
                        return (
                          <td key={`${row.key}-${role.id}`} className="px-4 py-3 text-center">
                            <button
                              type="button"
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border text-lg leading-none transition ${
                                checked
                                  ? 'border-transparent text-emerald-600'
                                  : 'border-muted-foreground/40 text-muted-foreground'
                              } ${editable && !saving ? 'cursor-pointer hover:border-primary hover:text-primary' : 'cursor-not-allowed opacity-80'}`}
                              onClick={() => togglePermission(role, row.key)}
                              disabled={!editable || saving}
                              title={blockReason || undefined}
                              aria-label={`${checked ? 'Revoke' : 'Grant'} ${row.title} for ${role.name}`}
                            >
                              {checked ? '\u2713' : '-'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
function MetricCard({ title, value }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="uppercase text-[10px] font-bold tracking-widest">{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function AdminTableSkeleton({ rows = 8, cols = 6 }) {
  return (
    <Card className="surface-card">
      <div className="overflow-x-auto p-4">
        <table className="data-table">
          <thead>
            <tr>
              {Array.from({ length: cols }).map((_, idx) => (
                <th key={`admin-skeleton-head-${idx}`}>
                  <Skeleton className="h-3 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <tr key={`admin-skeleton-row-${rowIdx}`}>
                {Array.from({ length: cols }).map((__, colIdx) => (
                  <td key={`admin-skeleton-cell-${rowIdx}-${colIdx}`}>
                    <Skeleton className="h-4 w-full max-w-[160px]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default AdminControlCenterPage

