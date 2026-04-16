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
  'permissions-catalog': { title: 'Permissions', endpoint: '/admin/permissions/catalog/' },
  'delegation-rules': { title: 'Delegation rules', endpoint: '/admin/delegation-rules/' },
  'audit-logs': { title: 'Audit logs', endpoint: '/admin/audit-logs/' },
  notifications: { title: 'Notifications', endpoint: '/admin/notifications/' },
  reports: { title: 'Reports', endpoint: '/admin/reports/' },
}

function useSectionKey() {
  const location = useLocation()
  const parts = location.pathname.split('/').filter(Boolean)
  return parts[1] || 'dashboard'
}

function AdminControlCenterPage() {
  const navigate = useNavigate()
  const sectionKey = useSectionKey()
  const config = sectionConfig[sectionKey] || sectionConfig.dashboard
  const [state, setState] = useState({
    loading: true,
    error: '',
    data: null,
    sectionKey: 'dashboard',
  })
  const [message, setMessage] = useState('')
  const [companyForm, setCompanyForm] = useState({ name: '', code: '', is_active: true })
  const [entityForm, setEntityForm] = useState({
    name: '',
    code: '',
    entity_type: 'PROD',
    company: '',
    is_active: true,
  })
  const [selectedPermissionUserId, setSelectedPermissionUserId] = useState('')
  const [expandedRowId, setExpandedRowId] = useState(null)

  async function loadSection() {
    setState({ loading: true, error: '', data: null, sectionKey })
    try {
      if (sectionKey === 'companies') {
        const [companiesResponse, hierarchyResponse] = await Promise.all([
          api.get(config.endpoint),
          api.get('/admin/hierarchy/'),
        ])
        setState({
          loading: false,
          error: '',
          data: {
            companies: companiesResponse.data || [],
            senior_options: hierarchyResponse.data.senior_options || [],
          },
          sectionKey,
        })
        setExpandedRowId(null)
        return
      }

      if (sectionKey === 'entities') {
        const [entitiesResponse, companiesResponse, hierarchyResponse] = await Promise.all([
          api.get(config.endpoint),
          api.get('/admin/companies/'),
          api.get('/admin/hierarchy/'),
        ])
        setState({
          loading: false,
          error: '',
          data: {
            entities: entitiesResponse.data,
            companies: companiesResponse.data,
            manager_options: hierarchyResponse.data.manager_options || [],
          },
          sectionKey,
        })
        setExpandedRowId(null)
        return
      }

      const params =
        sectionKey === 'permissions-catalog' && selectedPermissionUserId
          ? { params: { user_id: selectedPermissionUserId } }
          : undefined
      const response = await api.get(config.endpoint, params)
      setState({ loading: false, error: '', data: response.data, sectionKey })
    } catch (error) {
      setState({
        loading: false,
        error: error.response?.data?.detail || 'Could not load admin section.',
        data: null,
        sectionKey,
      })
    }
  }

  useEffect(() => {
    loadSection()
  }, [sectionKey, selectedPermissionUserId])

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

  async function saveDelegation(roleId, permissionKeys) {
    await patchRecord(`/admin/delegation-rules/${roleId}/`, { permission_keys: permissionKeys }, 'Delegation rules updated.')
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
                {entities.map((item) => {
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

    if (sectionKey === 'permissions-catalog') {
      return (
        <>
          <section className="panel">
            <p className="eyebrow">Effective state</p>
            <h2>User permissions</h2>
            <select className="app-select" value={selectedPermissionUserId} onChange={(event) => setSelectedPermissionUserId(event.target.value)}>
              <option value="">Choose user</option>
              {(data.users || []).map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}
            </select>
            {data.selected_user ? (
              <div className="permission-list">
                {data.selected_user.permissions.map((permission) => (
                  <article key={permission.key} className="permission-card">
                    <div>
                      <strong>{permission.name}</strong>
                      <div className="subline">{permission.key}</div>
                    </div>
                    <div className="tag-row">
                      <span className={`status-tag ${permission.inherited ? 'active' : 'muted'}`}>Inherited</span>
                      <span className={`status-tag ${permission.effective ? 'active' : 'danger'}`}>{permission.effective ? 'Allowed' : 'Denied'}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-text">Select a user to inspect inherited and overridden permissions.</p>
            )}
          </section>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Permission</th>
                  <th>Category</th>
                  <th>Roles</th>
                  <th>Overrides</th>
                </tr>
              </thead>
              <tbody>
                {(data.catalog || []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.key}</td>
                    <td>{item.category || '-'}</td>
                    <td>{item.inherited_by_roles.join(', ') || '-'}</td>
                    <td>{item.overridden_users.map((user) => `${user.user__username}:${user.is_allowed ? 'allow' : 'deny'}`).join(', ') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )
    }

    if (sectionKey === 'delegation-rules') {
      return (
        <div className="timeline-list">
          {Object.entries(data.rules || {}).map(([roleKey, item]) => (
            <EditableChecklistCard
              key={roleKey}
              title={item.role_name}
              subtitle={`Can manage: ${item.manageable_target_roles.join(', ') || 'none'}`}
              selectedKeys={item.permissions}
              allItems={data.all_permission_keys || []}
              onSave={(permissionKeys) => saveDelegation(item.role_id, permissionKeys)}
            />
          ))}
        </div>
      )
    }

    if (sectionKey === 'audit-logs') {
      return (
        <div className="timeline-list">
          {data.map((item) => (
            <article key={item.id} className="timeline-card">
              <strong>{item.module} / {item.action}</strong>
              <p>{item.target_label || item.target_model || '-'}</p>
              <p className="muted-text">{item.actor_name || '-'} | {new Date(item.created_at).toLocaleString()}</p>
            </article>
          ))}
        </div>
      )
    }

    if (sectionKey === 'notifications') {
      return (
        <>
          <section className="panel">
            <p className="eyebrow">Telegram</p>
            <h2>Integration readiness</h2>
            <p className="muted-text">{data.telegram_note}</p>
          </section>
          <div className="timeline-list">
            {(data.settings || []).map((item) => (
              <article key={item.id} className="timeline-card">
                <strong>{item.label}</strong>
                <div className="tag-row wrap-row">
                  <button type="button" className="ghost-button" onClick={() => patchRecord(`/admin/notifications/${item.id}/`, { email_enabled: !item.email_enabled }, 'Notification updated.')}>
                    Email: {item.email_enabled ? 'ON' : 'OFF'}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => patchRecord(`/admin/notifications/${item.id}/`, { in_app_enabled: !item.in_app_enabled }, 'Notification updated.')}>
                    In-app: {item.in_app_enabled ? 'ON' : 'OFF'}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => patchRecord(`/admin/notifications/${item.id}/`, { telegram_enabled: !item.telegram_enabled }, 'Notification updated.')}>
                    Telegram: {item.telegram_enabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
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
    selectedPermissionUserId,
    companyForm,
    entityForm,
    expandedRowId,
  ])

  const { user } = useAuth()

  async function handleStartAssignment(request) {
    setAssignmentState({
      active: true,
      request,
      loadingEntities: true,
      entities: [],
      saving: false,
    })

    try {
      // Find company ID - prefer company_id then search by name if needed, 
      // but backend should provide it. Admin summary serializer might need update if ID is missing.
      // For now assume request.id is available and we can fetch companies.
      const response = await api.get('/admin/entities/', {
        params: { company_id: request.company_id },
      })
      setAssignmentState(curr => ({
        ...curr,
        loadingEntities: false,
        entities: response.data.filter(e => e.entity_type !== 'PROD'),
      }))
    } catch (err) {
      setMessage('Failed to load target entities.')
      setAssignmentState(curr => ({ ...curr, loadingEntities: false }))
    }
  }

  async function handleConfirmAssignment(targetEntityId, note) {
    setAssignmentState(curr => ({ ...curr, saving: true }))
    try {
      await api.patch(`/admin/requests/${assignmentState.request.id}/`, {
        target_entity_id: Number(targetEntityId),
        note,
      })
      setMessage('Request reassigned successfully.')
      setAssignmentState({ active: false, request: null, loadingEntities: false, entities: [], saving: false })
      loadSection()
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Failed to reassign request.')
      setAssignmentState(curr => ({ ...curr, saving: false }))
    }
  }

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Administration"
        title={config.title}
        description="Manage structure, access, monitoring, and operational records from a consistent admin workspace."
        actions={null}
      />

      {message && <p className="success-text">{message}</p>}
      {state.loading && <p className="muted-text">Loading section...</p>}
      {state.error && <p className="error-text">{state.error}</p>}

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
