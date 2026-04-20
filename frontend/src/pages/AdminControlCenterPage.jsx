import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

function CompanyEditModal({ editState, onClose, onFieldChange, onSubmit }) {
  if (!editState.open) return null

  return (
    <div className="modal-overlay" onClick={editState.saving ? undefined : onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="page-intro">
          <p className="eyebrow">Company edit</p>
          <h2>Edit company</h2>
          <p>Update company details and senior assignment.</p>
        </div>

        <form className="modal-body" onSubmit={onSubmit}>
          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="edit-company-name">Company name</label>
            <input
              id="edit-company-name"
              value={editState.form.name}
              onChange={(event) => onFieldChange('name', event.target.value)}
              required
            />
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="edit-company-code">Code</label>
            <input
              id="edit-company-code"
              value={editState.form.code}
              onChange={(event) => onFieldChange('code', event.target.value)}
              required
            />
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label>Current senior</label>
            <div className="data-row-static">{editState.currentSeniorName || 'None assigned'}</div>
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="edit-company-senior">Assign senior</label>
            <select
              id="edit-company-senior"
              className="app-select full-width"
              value={editState.form.senior_user_id}
              onChange={(event) => onFieldChange('senior_user_id', event.target.value)}
            >
              <option value="">Keep current senior</option>
              {editState.seniorOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.username}
                </option>
              ))}
            </select>
            {editState.seniorOptions.length === 0 && (
              <p className="muted-text" style={{ margin: 0, fontSize: '12px' }}>
                No senior-role users found for this company.
              </p>
            )}
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="edit-company-status">Status</label>
            <select
              id="edit-company-status"
              className="app-select full-width"
              value={String(editState.form.is_active)}
              onChange={(event) => onFieldChange('is_active', event.target.value === 'true')}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div className="modal-footer">
            <button type="button" className="ghost-button" onClick={onClose} disabled={editState.saving}>
              Cancel
            </button>
            <button type="submit" disabled={editState.saving}>
              {editState.saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EntityEditModal({ editState, companies, onClose, onFieldChange, onSubmit }) {
  if (!editState.open) return null

  return (
    <div className="modal-overlay" onClick={editState.saving ? undefined : onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="page-intro">
          <p className="eyebrow">Entity edit</p>
          <h2>Edit entity</h2>
          <p>Update core fields and manager assignment for this entity.</p>
        </div>

        <form className="modal-body" onSubmit={onSubmit}>
          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="edit-entity-name">Entity name</label>
            <input
              id="edit-entity-name"
              value={editState.form.name}
              onChange={(event) => onFieldChange('name', event.target.value)}
              required
            />
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="edit-entity-code">Code</label>
            <input
              id="edit-entity-code"
              value={editState.form.code}
              onChange={(event) => onFieldChange('code', event.target.value)}
              required
            />
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="edit-entity-type">Entity type</label>
            <select
              id="edit-entity-type"
              className="app-select full-width"
              value={editState.form.entity_type}
              onChange={(event) => onFieldChange('entity_type', event.target.value)}
            >
              <option value="PROD">Prod</option>
              <option value="SUPPORT">Support</option>
              <option value="TDEV">T.Dev</option>
            </select>
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="edit-entity-company">Company</label>
            <select
              id="edit-entity-company"
              className="app-select full-width"
              value={editState.form.company}
              onChange={(event) => onFieldChange('company', event.target.value)}
              required
            >
              <option value="">Select company</option>
              {companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label>Current manager</label>
            <div className="data-row-static">{editState.currentManagerName || 'None assigned'}</div>
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="edit-entity-manager">Assign manager</label>
            <select
              id="edit-entity-manager"
              className="app-select full-width"
              value={editState.form.manager_user_id}
              onChange={(event) => onFieldChange('manager_user_id', event.target.value)}
            >
              <option value="">Keep current manager</option>
              {editState.managerOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.username}
                </option>
              ))}
            </select>
            {editState.managerOptions.length === 0 && (
              <p className="muted-text" style={{ margin: 0, fontSize: '12px' }}>
                No manager-role users found for this entity.
              </p>
            )}
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="edit-entity-status">Status</label>
            <select
              id="edit-entity-status"
              className="app-select full-width"
              value={String(editState.form.is_active)}
              onChange={(event) => onFieldChange('is_active', event.target.value === 'true')}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div className="modal-footer">
            <button type="button" className="ghost-button" onClick={onClose} disabled={editState.saving}>
              Cancel
            </button>
            <button type="submit" disabled={editState.saving}>
              {editState.saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
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
  const roleKeys = user?.role_keys || []
  const isSuperAdmin = roleKeys.includes('super_admin')
  const isSenior = roleKeys.includes('senior')
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
      const params = undefined
      const response = await api.get(config.endpoint, params)
      let normalizedData = response.data

      if (sectionKey === 'companies' && Array.isArray(normalizedData)) {
        normalizedData = { companies: normalizedData, senior_options: [] }
      }

      if (sectionKey === 'entities' && Array.isArray(normalizedData)) {
        let companyOptions = []
        try {
          const hierarchyResponse = await api.get('/admin/hierarchy/')
          companyOptions = hierarchyResponse.data?.companies || []
        } catch {
          companyOptions = []
        }
        if (!companyOptions.length) {
          companyOptions = buildCompanyOptionsFromEntities(normalizedData)
        }
        normalizedData = {
          entities: normalizedData,
          companies: companyOptions,
          manager_options: [],
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
  }, [sectionKey, auditCategoryKey])

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
    await patchRecord(`/admin/roles/${roleId}/`, { permission_keys: permissionKeys }, 'Role permissions updated.')
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
        <>
          <div className="summary-grid">
            {Object.entries(data.totals || {}).map(([key, value]) => (
              <article key={key} className="summary-card">
                <span>{key.replaceAll('_', ' ')}</span>
                <strong>{value}</strong>
              </article>
            ))}
            {Object.entries(data.queue || {}).map(([key, value]) => (
              <article key={key} className="summary-card">
                <span>{key.replaceAll('_', ' ')}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <section className="detail-grid admin-detail-grid">
            <div className="panel">
              <p className="eyebrow">Requests</p>
              <h2>Requests by status</h2>
              <div className="thread-list">
                {(data.requests_by_status || []).map((item) => (
                  <article key={item.status} className="thread-card">
                    <strong>{item.status}</strong>
                    <p className="muted-text">{item.total} requests</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </>
      )
    }

    if (sectionKey === 'companies') {
      const companies = data.companies || []
      const seniorOptions = data.senior_options || []
      return (
        <>
          <section className="panel">
            <p className="eyebrow">New company</p>
            <h2>Add company</h2>
            <form className="filter-bar" onSubmit={submitCompany}>
              <input value={companyForm.name} onChange={(event) => setCompanyForm((current) => ({ ...current, name: event.target.value }))} placeholder="Company name" required />
              <input value={companyForm.code} onChange={(event) => setCompanyForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" required />
              <select className="app-select" value={String(companyForm.is_active)} onChange={(event) => setCompanyForm((current) => ({ ...current, is_active: event.target.value === 'true' }))}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
              <button type="submit">Create</button>
            </form>
          </section>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Senior</th>
                  <th>Entities</th>
                  <th>Users</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((item) => {
                  const canEditCompany = isSuperAdmin || (isSenior && actorCompanyId === Number(item.id))
                  const companySeniors = seniorOptions.filter((opt) => opt.company_id === item.id)
                  return (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong></td>
                      <td>{item.code}</td>
                      <td>
                        <span className={`status-tag ${item.senior_name ? 'active' : 'muted'}`}>
                          {item.senior_name || 'None'}
                        </span>
                      </td>
                      <td>{item.entity_count}</td>
                      <td>{item.user_count}</td>
                      <td>
                        <span className={`status-tag ${item.is_active ? 'active' : 'danger'}`}>
                          {item.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={!canEditCompany}
                          onClick={() => {
                            if (!canEditCompany) return
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
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={!canEditCompany}
                          onClick={() => {
                            if (!canEditCompany) return
                            patchRecord(`/admin/companies/${item.id}/`, { is_active: !item.is_active }, 'Company updated.')
                          }}
                        >
                          {item.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )
    }

    if (sectionKey === 'entities') {
      const entities = data.entities || []
      const companies = data.companies || []
      const managerOptions = data.manager_options || []
      const filteredEntities = entities.filter((item) => {
        const matchesCompany =
          entityCompanyFilter === 'all' || String(item.company) === entityCompanyFilter
        const matchesType =
          entityTypeFilter === 'all' || item.entity_type === entityTypeFilter
        const matchesStatus =
          entityStatusFilter === 'all' ||
          (entityStatusFilter === 'active' ? item.is_active : !item.is_active)
        return matchesCompany && matchesType && matchesStatus
      })

      return (
        <>
          <section className="panel">
            <p className="eyebrow">New entity</p>
            <h2>Add entity</h2>
            <form className="filter-bar" onSubmit={submitEntity}>
              <input value={entityForm.name} onChange={(event) => setEntityForm((current) => ({ ...current, name: event.target.value }))} placeholder="Entity name" required />
              <input value={entityForm.code} onChange={(event) => setEntityForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" required />
              <select className="app-select" value={entityForm.entity_type} onChange={(event) => setEntityForm((current) => ({ ...current, entity_type: event.target.value }))}>
                <option value="PROD">Prod</option>
                <option value="SUPPORT">Support</option>
                <option value="TDEV">Dev</option>
              </select>
              <select className="app-select" value={entityForm.company} onChange={(event) => setEntityForm((current) => ({ ...current, company: event.target.value }))} required>
                <option value="">Select company</option>
                {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <button type="submit">Create</button>
            </form>
          </section>
          <div className="table-wrap">
            <div className="card-toolbar">
              <div>
                <p className="eyebrow">Filters</p>
                <h2>Entity directory</h2>
              </div>
              <span className="muted-text">{filteredEntities.length} result(s)</span>
            </div>
            <div className="filter-bar table-caption">
              <select
                className="app-select"
                value={entityCompanyFilter}
                onChange={(event) => setEntityCompanyFilter(event.target.value)}
              >
                <option value="all">All companies</option>
                {companies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                className="app-select"
                value={entityTypeFilter}
                onChange={(event) => setEntityTypeFilter(event.target.value)}
              >
                <option value="all">All entity types</option>
                <option value="PROD">Prod</option>
                <option value="SUPPORT">Support</option>
                <option value="TDEV">T.Dev</option>
              </select>
              <select
                className="app-select"
                value={entityStatusFilter}
                onChange={(event) => setEntityStatusFilter(event.target.value)}
              >
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setEntityCompanyFilter('all')
                  setEntityTypeFilter('all')
                  setEntityStatusFilter('all')
                }}
              >
                Clear
              </button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Type</th>
                  <th>Manager</th>
                  <th>Users</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntities.map((item) => {
                  const canEditEntity =
                    isSuperAdmin || (isSenior && actorCompanyId && Number(item.company) === actorCompanyId)
                  const entityManagers = managerOptions.filter((opt) => opt.entity_id === item.id)
                  return (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong></td>
                      <td>{item.company_name}</td>
                      <td>
                        <span className="status-tag info">{item.entity_type}</span>
                      </td>
                      <td>
                        <span className={`status-tag ${item.manager_name ? 'active' : 'muted'}`}>
                          {item.manager_name || 'None'}
                        </span>
                      </td>
                      <td>{item.user_count}</td>
                      <td>
                        <span className={`status-tag ${item.is_active ? 'active' : 'danger'}`}>
                          {item.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={!canEditEntity}
                          onClick={() => {
                            if (!canEditEntity) return
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
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={!canEditEntity}
                          onClick={() => {
                            if (!canEditEntity) return
                            patchRecord(`/admin/entities/${item.id}/`, { is_active: !item.is_active }, 'Entity updated.')
                          }}
                        >
                          {item.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!filteredEntities.length && (
              <p className="muted-text" style={{ padding: '20px' }}>
                No entities match the selected filters.
              </p>
            )}
          </div>
        </>
      )
    }

    if (sectionKey === 'users') {
      return (
        <div className="table-wrap">
          <div className="filter-bar">
            <Link className="pill-link" to="/admin/users/create">Add user</Link>
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
                    <Link className="table-action" to={`/admin/permissions/${item.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (sectionKey === 'roles') {
      return (
        <div className="timeline-list">
          {(data.roles || []).map((item) => (
            <EditableChecklistCard
              key={item.id}
              title={item.name}
              subtitle={`Level ${item.level} | ${item.user_count} users`}
              selectedKeys={item.default_permissions}
              allItems={data.all_permission_keys || []}
              onSave={(permissionKeys) => saveRolePermissions(item.id, permissionKeys)}
            />
          ))}
        </div>
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
          acc[groupKey] = {
            key: groupKey,
            title: groupConfig?.title || 'Other logs',
            rows: [],
          }
        }
        acc[groupKey].rows.push(item)
        return acc
      }, {})

      const selectedGroup =
        auditCategoryKey === 'all'
          ? { key: 'all', title: 'All audit logs', rows: allRows }
          : auditCategoryKey
          ? grouped[auditCategoryKey]
          : null

      if (!selectedGroup) {
        return (
          <section className="timeline-list">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Audit logs</p>
                  <h2>Unknown category</h2>
                </div>
              </div>
              <p className="muted-text">The selected log category does not exist.</p>
              <button type="button" className="ghost-button" onClick={() => navigate('/admin/audit-logs/users')}>
                Open user logs
              </button>
            </article>
          </section>
        )
      }

      const group = selectedGroup
      const totalPages = Math.max(1, Math.ceil(group.rows.length / pageSize))
      const currentPage = Math.min(auditGroupPages[group.key] || 1, totalPages)
      const pagedRows = group.rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      const userActionCounts =
        group.key === 'users'
          ? pagedRows.reduce((acc, row) => {
              const action = formatAuditAction(row.action)
              acc[action] = (acc[action] || 0) + 1
              return acc
            }, {})
          : null

      return (
        <section className="timeline-list">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Audit category</p>
                <h2>{group.title}</h2>
              </div>
              <div className="panel-actions">
                <span className="status-tag info">{group.rows.length} log(s)</span>
              </div>
            </div>
            {group.key === 'users' && (
              <div className="tag-row wrap-row">
                {Object.entries(userActionCounts || {}).map(([action, total]) => (
                  <span key={action} className="status-tag">
                    {action}: {total}
                  </span>
                ))}
              </div>
            )}
            <div className="timeline-list">
              {pagedRows.map((item) => (
                <article key={item.id} className="timeline-card">
                  <strong>{item.module} / {formatAuditAction(item.action)}</strong>
                  <p>{item.target_label || item.target_model || '-'}</p>
                  <p className="muted-text">
                    {item.actor_name || '-'} | {new Date(item.created_at).toLocaleString()}
                  </p>
                </article>
              ))}
            </div>
            <div className="page-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setAuditGroupPage(group.key, Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                Previous
              </button>
              <span className="muted-text">
                Page {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setAuditGroupPage(group.key, Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
              </button>
            </div>
          </article>
        </section>
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
      const topTrend = trendStats.slice(-8)
      const maxCompanyValue = Math.max(1, ...topCompanies.map((item) => item.value))
      const maxTypeValue = Math.max(1, ...topTypes.map((item) => item.value))
      const maxTrendValue = Math.max(1, ...topTrend.map((item) => item.value))

      return (
        <section className="reports-layout">
          <div className="summary-grid reports-kpi-grid">
            <MetricCard title="Open" value={openCount} />
            <MetricCard title="Resolved" value={resolvedCount} />
            <MetricCard title="Companies" value={companyStats.length} />
            <MetricCard title="Entities" value={(data.request_volume_by_entity || []).length} />
            <MetricCard title="Types" value={typeStats.length} />
            <MetricCard title="Trend points" value={trendStats.length} />
            <article className="summary-card reports-rate-card">
              <span>Resolution rate</span>
              <strong>{resolutionRate}%</strong>
              <div className="reports-progress">
                <span style={{ width: `${resolutionRate}%` }} />
              </div>
              <p className="muted-text">{resolvedCount} resolved out of {totalTracked}</p>
            </article>
          </div>

          <div className="detail-grid admin-detail-grid reports-panels-grid">
            <article className="panel reports-panel">
              <p className="eyebrow">Workload split</p>
              <h2>Top companies</h2>
              <div className="reports-bar-list">
                {topCompanies.length === 0 ? (
                  <p className="muted-text">No company data.</p>
                ) : (
                  topCompanies.map((item) => (
                    <div key={item.label} className="reports-bar-row">
                      <div className="reports-bar-head">
                        <strong>{item.label}</strong>
                        <span>{item.value}</span>
                      </div>
                      <div className="reports-bar-track">
                        <span style={{ width: `${Math.max(8, Math.round((item.value / maxCompanyValue) * 100))}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="panel reports-panel">
              <p className="eyebrow">Demand mix</p>
              <h2>Request types</h2>
              <div className="reports-bar-list">
                {topTypes.length === 0 ? (
                  <p className="muted-text">No type data.</p>
                ) : (
                  topTypes.map((item) => (
                    <div key={item.label} className="reports-bar-row">
                      <div className="reports-bar-head">
                        <strong>{item.label}</strong>
                        <span>{item.value}</span>
                      </div>
                      <div className="reports-bar-track">
                        <span style={{ width: `${Math.max(8, Math.round((item.value / maxTypeValue) * 100))}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          </div>

          <article className="panel reports-panel reports-panel-wide">
            <p className="eyebrow">Activity pulse</p>
            <h2>Trend snapshot</h2>
            <div className="reports-sparkline">
              {topTrend.length === 0 ? (
                <p className="muted-text">No trend data.</p>
              ) : (
                topTrend.map((item) => (
                  <div key={`${item.label}-${item.value}`} className="reports-sparkline-item">
                    <div className="reports-sparkline-column">
                      <span style={{ height: `${Math.max(12, Math.round((item.value / maxTrendValue) * 100))}%` }} />
                    </div>
                    <strong>{item.value}</strong>
                    <small>{item.label}</small>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>
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
    isSuperAdmin,
    isSenior,
    actorCompanyId,
    navigate,
  ])

  return (
    <main className="page-content">
      <section className="workspace-header">
        <div className="panel-header">
          <div className="page-intro">
            <p className="eyebrow">Administration</p>
            <h1>{config.title}</h1>
            <p>Manage structure, access, monitoring, and operational records from a consistent admin workspace.</p>
          </div>
          {sectionKey === 'requests' && (
            <button type="button" className="ghost-button" onClick={() => navigate('/requests')}>
              Open request workspace
            </button>
          )}
        </div>
        {message && <p className="success-text">{message}</p>}
        {state.loading && <p className="muted-text">Loading section...</p>}
        {state.error && <p className="error-text">{state.error}</p>}
      </section>

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
    </main>
  )
}

function RequestSummaryTable({ rows = [] }) {
  if (!rows.length) {
    return <p className="muted-text">No requests found.</p>
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Status</th>
            <th>Company</th>
            <th>Source</th>
            <th>Target</th>
            <th>Assignee</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id || item.request_number}>
              <td>
                <strong>{item.request_number || '-'}</strong>
                <div className="muted-text">{item.title || '-'}</div>
              </td>
              <td>{item.status || '-'}</td>
              <td>{item.company_name || '-'}</td>
              <td>{item.source_entity_name || '-'}</td>
              <td>{item.target_entity_name || '-'}</td>
              <td>{item.assignee_name || 'Unassigned'}</td>
              <td>{item.created_at ? new Date(item.created_at).toLocaleString() : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EditableChecklistCard({ title, subtitle, selectedKeys, allItems, onSave }) {
  const [localKeys, setLocalKeys] = useState(selectedKeys)

  useEffect(() => {
    setLocalKeys(selectedKeys)
  }, [selectedKeys])

  function toggleKey(key) {
    setLocalKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : current.concat(key),
    )
  }

  return (
    <article className="panel">
      <p className="eyebrow">Policy</p>
      <h2>{title}</h2>
      <p className="muted-text">{subtitle}</p>
      <div className="check-grid admin-check-grid">
        {allItems.map((item) => (
          <label key={item} className="checkbox-row">
            <input type="checkbox" checked={localKeys.includes(item)} onChange={() => toggleKey(item)} />
            <span>{item}</span>
          </label>
        ))}
      </div>
      <button type="button" onClick={() => onSave(localKeys)}>Save</button>
    </article>
  )
}


function MetricCard({ title, value }) {
  return (
    <article className="summary-card">
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  )
}

export default AdminControlCenterPage
