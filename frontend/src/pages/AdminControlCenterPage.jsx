import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const sectionConfig = {
  dashboard: { title: 'Dashboard', endpoint: '/admin/dashboard/' },
  companies: { title: 'Companies', endpoint: '/admin/companies/' },
  entities: { title: 'Entities', endpoint: '/admin/entities/' },
  users: { title: 'Users', endpoint: '/admin/users/manageable/' },
  roles: { title: 'Roles', endpoint: '/admin/roles/' },
  requests: { title: 'Requests', endpoint: '/admin/requests/' },
  assignments: { title: 'Assignments', endpoint: '/admin/assignments/' },
  'status-tracking': { title: 'Status tracking', endpoint: '/admin/status-tracking/' },
  'audit-logs': { title: 'Audit logs', endpoint: '/admin/audit-logs/' },
  reports: { title: 'Reports', endpoint: '/admin/reports/' },
}

function useSectionKey() {
  const location = useLocation()
  const parts = location.pathname.split('/').filter(Boolean)
  return parts[1] || 'dashboard'
}

const auditGroups = [
  { key: 'requests', title: 'Request logs', modules: ['requests', 'assignments', 'status_tracking'] },
  { key: 'users', title: 'User logs', modules: ['users'] },
  { key: 'access', title: 'Access / role logs', modules: ['permissions', 'roles'] },
  { key: 'organization', title: 'Organization logs', modules: ['companies', 'entities', 'hierarchy'] },
  { key: 'notifications', title: 'Notification logs', modules: ['notifications'] },
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
  const [expandedRowId, setExpandedRowId] = useState(null)
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
  const isSenior = (user?.role_keys || []).includes('senior')

  useEffect(() => {
    if (isSenior && sectionKey === 'companies') {
      navigate('/admin/entities', { replace: true })
    }
  }, [isSenior, sectionKey, navigate])

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
        normalizedData = {
          entities: normalizedData,
          companies:
            user?.company && user?.company_name
              ? [{ id: user.company, name: user.company_name }]
              : [],
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
            <div className="panel">
              <p className="eyebrow">Activity</p>
              <h2>Recent activity</h2>
              <div className="timeline-list">
                {(data.recent_activity || []).map((item) => (
                  <article key={`${item.id}-${item.created_at}`} className="timeline-card">
                    <strong>{item.action}</strong>
                    <p>{item.target_label || item.target_model || 'Platform event'}</p>
                    <p className="muted-text">
                      {item.actor_name || '-'} | {new Date(item.created_at).toLocaleString()}
                    </p>
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
                  const isExpanded = expandedRowId === `company-${item.id}`
                  const companySeniors = seniorOptions.filter((opt) => opt.company_id === item.id)
                  return (
                    <>
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
                            onClick={() => setExpandedRowId(isExpanded ? null : `company-${item.id}`)}
                          >
                            {isExpanded ? 'Close' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => patchRecord(`/admin/companies/${item.id}/`, { is_active: !item.is_active }, 'Company updated.')}
                          >
                            {item.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`company-edit-${item.id}`} className="expanded-edit-row">
                          <td colSpan={7}>
                            <div className="inline-edit-panel">
                              <div className="inline-edit-group">
                                <label className="inline-edit-label">Assign senior</label>
                                <p className="muted-text" style={{ margin: '0 0 8px', fontSize: '12px' }}>
                                  Current: <strong>{item.senior_name || 'None assigned'}</strong>
                                </p>
                                <div className="inline-edit-row">
                                  <select
                                    className="app-select"
                                    defaultValue=""
                                    onChange={(event) => {
                                      if (!event.target.value) return
                                      patchRecord(
                                        `/admin/hierarchy/companies/${item.id}/`,
                                        { senior_user_id: Number(event.target.value) },
                                        'Senior assigned successfully.'
                                      )
                                    }}
                                  >
                                    <option value="">— Select senior —</option>
                                    {companySeniors.map((opt) => (
                                      <option key={opt.id} value={opt.id}>{opt.username}</option>
                                    ))}
                                  </select>
                                  {companySeniors.length === 0 && (
                                    <span className="muted-text" style={{ fontSize: '12px' }}>
                                      No senior-role users found for this company.
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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
                  const isExpanded = expandedRowId === `entity-${item.id}`
                  const entityManagers = managerOptions.filter((opt) => opt.entity_id === item.id)
                  return (
                    <>
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
                            onClick={() => setExpandedRowId(isExpanded ? null : `entity-${item.id}`)}
                          >
                            {isExpanded ? 'Close' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => patchRecord(`/admin/entities/${item.id}/`, { is_active: !item.is_active }, 'Entity updated.')}
                          >
                            {item.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`entity-edit-${item.id}`} className="expanded-edit-row">
                          <td colSpan={7}>
                            <div className="inline-edit-panel">
                              <div className="inline-edit-group">
                                <label className="inline-edit-label">Assign manager</label>
                                <p className="muted-text" style={{ margin: '0 0 8px', fontSize: '12px' }}>
                                  Current: <strong>{item.manager_name || 'None assigned'}</strong>
                                </p>
                                <div className="inline-edit-row">
                                  <select
                                    className="app-select"
                                    defaultValue=""
                                    onChange={(event) => {
                                      if (!event.target.value) return
                                      patchRecord(
                                        `/admin/hierarchy/entities/${item.id}/`,
                                        { manager_user_id: Number(event.target.value) },
                                        'Manager assigned successfully.'
                                      )
                                    }}
                                  >
                                    <option value="">— Select manager —</option>
                                    {entityManagers.map((opt) => (
                                      <option key={opt.id} value={opt.id}>{opt.username}</option>
                                    ))}
                                  </select>
                                  {entityManagers.length === 0 && (
                                    <span className="muted-text" style={{ fontSize: '12px' }}>
                                      No manager-role users found for this entity.
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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

    if (sectionKey === 'hierarchy') {
      return (
        <section className="detail-grid admin-detail-grid">
          <div className="panel">
            <p className="eyebrow">Company chain</p>
            <h2>Seniors by company</h2>
            <div className="timeline-list">
              {(data.companies || []).map((item) => (
                <article key={item.id} className="timeline-card">
                  <strong>{item.name}</strong>
                  <p className="muted-text">Senior: {item.senior || '-'}</p>
                  <select className="app-select" defaultValue="" onChange={(event) => event.target.value && patchRecord(`/admin/hierarchy/companies/${item.id}/`, { senior_user_id: Number(event.target.value) }, 'Senior assignment updated.')}>
                    <option value="">Assign senior</option>
                    {(data.senior_options || []).filter((option) => option.company_id === item.id).map((option) => <option key={option.id} value={option.id}>{option.username}</option>)}
                  </select>
                </article>
              ))}
            </div>
          </div>
          <div className="panel">
            <p className="eyebrow">Entity chain</p>
            <h2>Managers, TLs, users</h2>
            <div className="timeline-list">
              {(data.entities || []).map((item) => (
                <article key={item.id} className="timeline-card">
                  <strong>{item.name}</strong>
                  <p className="muted-text">{item.company_name} | {item.entity_type}</p>
                  <p>Manager: {item.manager || '-'}</p>
                  <select className="app-select" defaultValue="" onChange={(event) => event.target.value && patchRecord(`/admin/hierarchy/entities/${item.id}/`, { manager_user_id: Number(event.target.value) }, 'Manager assignment updated.')}>
                    <option value="">Assign manager</option>
                    {(data.manager_options || []).filter((option) => option.entity_id === item.id).map((option) => <option key={option.id} value={option.id}>{option.username}</option>)}
                  </select>
                  <div className="tag-row wrap-row">
                    {(item.team_leaders || []).map((teamLeader) => (
                      <span key={teamLeader.id} className="status-tag">
                        {teamLeader.username} ({teamLeader.users.length})
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
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

    if (sectionKey === 'status-tracking') {
      return (
        <section className="detail-grid admin-detail-grid">
          <div className="panel">
            <p className="eyebrow">Delayed</p>
            <h2>Stuck requests</h2>
            <RequestSummaryTable rows={data.stuck_requests || []} />
          </div>
          <div className="panel">
            <p className="eyebrow">History</p>
            <h2>Status history</h2>
            <div className="timeline-list">
              {(data.history || []).map((item) => (
                <article key={item.id} className="timeline-card">
                  <strong>{item.request_number}</strong>
                  <p>{item.old_status} {'->'} {item.new_status}</p>
                  <p className="muted-text">{item.changed_by_name} | {new Date(item.changed_at).toLocaleString()}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
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
              <button type="button" className="ghost-button" onClick={() => navigate('/admin/audit-logs/requests')}>
                Open request logs
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
      return (
        <div className="summary-grid">
          <MetricCard title="Open" value={data.open_vs_resolved?.open || 0} />
          <MetricCard title="Resolved" value={data.open_vs_resolved?.resolved || 0} />
          <MetricCard title="Companies" value={(data.request_volume_by_company || []).length} />
          <MetricCard title="Entities" value={(data.request_volume_by_entity || []).length} />
          <MetricCard title="Types" value={(data.requests_by_type || []).length} />
          <MetricCard title="Trend points" value={(data.trend_summaries || []).length} />
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
    expandedRowId,
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
    </main>
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
