import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const statusClassMap = {
  NEW: 'status-tag info',
  ACCEPTED: 'status-tag active',
  IN_PROGRESS: 'status-tag warning',
  REJECTED: 'status-tag danger',
  COMPLETED: 'status-tag active',
  CLOSED: 'status-tag muted',
}

const statusLabelMap = {
  NEW: 'New',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
}

const requestTypeOptions = ['INFO', 'SCRIPT', 'TOOL', 'APP_PROJECT']

function OperationalDashboardSection({ data }) {
  if (!data) return null
  const aging = data.aging_summary || {}
  const groups = data.status_groups || {}
  return (
    <section className="detail-grid admin-detail-grid" style={{ marginBottom: '32px' }}>
      <div className="panel stats-panel">
        <p className="eyebrow">Operational health</p>
        <h2>Workload distribution</h2>
        <div className="summary-grid mini-summary-grid">
          <MetricCard title="Under 24h" value={aging.under_24h || 0} />
          <MetricCard title="24h - 48h" value={aging['24h_48h'] || 0} />
          <MetricCard title="Over 48h" value={aging.over_48h || 0} />
        </div>
        
        <h2 style={{ marginTop: '24px' }}>Status Lifecycle</h2>
        <div className="summary-grid mini-summary-grid">
          <MetricCard title="New" value={groups.new || 0} />
          <MetricCard title="Active" value={groups.active || 0} />
          <MetricCard title="Resolved" value={groups.resolved || 0} />
          <MetricCard title="Rejected" value={groups.rejected || 0} />
        </div>
      </div>
    </section>
  )
}

function MetricCard({ title, value }) {
  return (
    <div className="metric-box">
      <span className="muted-text eyebrow">{title}</span>
      <strong>{value}</strong>
    </div>
  )
}

function AssignmentModal({ request, entities, loading, saving, onClose, onConfirm }) {
  const [targetEntityId, setTargetEntityId] = useState('')
  const [note, setNote] = useState('')

  return (
    <div className="modal-overlay">
      <div className="modal-panel">
        <div className="page-intro">
          <p className="eyebrow">Request Assignment</p>
          <h2>Assign Target Team</h2>
          <p>Route this request to the appropriate support or development entity.</p>
        </div>

        <div className="modal-body">
          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label>Request Reference</label>
            <div className="data-row-static">{request?.reference_code || request?.request_number || '-'}</div>
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label>Title</label>
            <div className="data-row-static">{request?.title || '-'}</div>
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label>Company</label>
            <div className="data-row-static">{request?.company_name || '-'}</div>
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="target-team">Target team</label>
            <select
              id="target-team"
              className="app-select full-width"
              value={targetEntityId}
              onChange={(e) => setTargetEntityId(e.target.value)}
              disabled={loading}
            >
              <option value="">— Select support/dev team —</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.entity_type})
                </option>
              ))}
            </select>
          </div>

          <div className="info-stack" style={{ gap: '0.5rem' }}>
            <label htmlFor="assignment-note">Assignment note (Optional)</label>
            <textarea
              id="assignment-note"
              className="app-textarea full-width"
              style={{ minHeight: '80px' }}
              placeholder="Instructions or context for the team..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="ghost-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            onClick={() => onConfirm(targetEntityId, note)}
            disabled={!targetEntityId || saving}
          >
            {saving ? 'Assigning...' : 'Confirm Assignment'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RequestsPage() {
  const { user, refreshUser } = useAuth()
  const [searchParams] = useSearchParams()
  const querySearch = searchParams.get('search') || ''
  const [state, setState] = useState({ loading: true, error: '', requests: [] })
  const [operationalData, setOperationalData] = useState(null)
  const [filters, setFilters] = useState({
    search: querySearch,
    company_id: '',
    source_entity_id: '',
    target_entity_id: '',
    type: '',
    status: '',
    stuck: false,
  })

  const [options, setOptions] = useState({
    companies: [],
    sourceEntities: [],
    targetEntities: [],
  })

  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    count: 0,
    next: null,
    previous: null
  })

  const [assignmentState, setAssignmentState] = useState({
    active: false,
    request: null,
    loadingEntities: false,
    entities: [],
    saving: false,
  })
  const [deletingRequestId, setDeletingRequestId] = useState(null)

  const roleKeys = useMemo(() => user?.role_keys || [], [user?.role_keys])
  const isGlobalAdmin = roleKeys.includes('super_admin')
  const isSenior = roleKeys.includes('senior')
  const isManager = roleKeys.includes('manager')
  const isTeamLeader = roleKeys.includes('team_leader')
  const canDeleteRequests = isGlobalAdmin || isSenior || isManager || isTeamLeader
  const title = isGlobalAdmin
    ? 'All requests'
    : isSenior
      ? `Company requests (${user?.company_name || 'No company'})`
      : user?.entity_type === 'PROD'
        ? 'Your requests'
        : 'Incoming Requests'

  const metrics = useMemo(() => {
    const requests = state.requests || []
    return {
      total: requests.length,
      pending: requests.filter((item) => item.status === 'NEW').length,
      inProgress: requests.filter((item) => item.status === 'IN_PROGRESS').length,
      stuck: requests.filter((item) => item.is_stuck).length,
    }
  }, [state.requests])

  // Load companies for the filter
  useEffect(() => {
    if (!isGlobalAdmin) return
    let active = true
    async function fetchCompanies() {
      try {
        const response = await api.get('/admin/companies/')
        if (!active) return
        const payload = response.data
        const companies = Array.isArray(payload) ? payload : payload?.companies || []
        setOptions((curr) => ({ ...curr, companies }))
      } catch (err) {
        console.error('Failed to fetch companies', err)
      }
    }
    fetchCompanies()
    return () => {
      active = false
    }
  }, [isGlobalAdmin])

  // Load operational metrics for super admin
  useEffect(() => {
    if (!isGlobalAdmin) return
    async function fetchOperationalMetrics() {
      try {
        const response = await api.get('/admin/status-tracking/')
        setOperationalData(response.data)
      } catch (err) {
        console.error('Failed to fetch operational metrics', err)
      }
    }
    fetchOperationalMetrics()
  }, [isGlobalAdmin])

  // Load entities for the current scope
  useEffect(() => {
    const companyId = isGlobalAdmin ? filters.company_id : user?.company_id
    if (!companyId) {
      setOptions((curr) => ({ ...curr, sourceEntities: [], targetEntities: [] }))
      return
    }

    async function fetchEntities() {
      try {
        const response = await api.get('/admin/entities/', {
          params: { company_id: companyId },
        })
        const payload = response.data
        const allEntities = Array.isArray(payload) ? payload : payload?.entities || []
        setOptions((curr) => ({
          ...curr,
          sourceEntities: allEntities,
          targetEntities: allEntities.filter((e) => e.entity_type !== 'PROD'),
        }))
      } catch (err) {
        console.error('Failed to fetch entities', err)
      }
    }
    fetchEntities()
  }, [filters.company_id, isGlobalAdmin, user?.company_id])

  async function loadRequests() {
    try {
      await refreshUser()
      const params = {
        page: pagination.page,
        page_size: pagination.pageSize,
        search: filters.search || undefined,
        company_id: isGlobalAdmin ? filters.company_id || undefined : user?.company_id || undefined,
        source_entity_id: filters.source_entity_id || undefined,
        target_entity_id: filters.target_entity_id || undefined,
        type: filters.type || undefined,
        status: filters.status || undefined,
        stuck: filters.stuck ? 'true' : undefined,
      }
      const response = await api.get('/requests/', { params })
      const { results, count, next, previous } = response.data
      setState({ loading: false, error: '', requests: results })
      setPagination(curr => ({ ...curr, count, next, previous }))
    } catch (error) {
      setState({
        loading: false,
        error: error.response?.data?.detail || 'Could not load requests.',
        requests: [],
      })
    }
  }

  useEffect(() => {
    setState((current) => ({ ...current, loading: true, error: '' }))
    loadRequests()
  }, [filters, pagination.page, refreshUser])

  async function handleStartAssignment(request) {
    const companyId = request.company_id || user.company_id
    setAssignmentState({
      active: true,
      request,
      loadingEntities: true,
      entities: [],
      saving: false,
    })
    try {
      const resp = await api.get('/admin/entities/', {
        params: { company_id: companyId },
      })
      const payload = resp.data
      const entities = Array.isArray(payload) ? payload : payload?.entities || []
      // Rule: Support/Dev only
      const validEntities = entities.filter((e) => e.entity_type !== 'PROD')
      setAssignmentState((s) => ({ ...s, entities: validEntities, loadingEntities: false }))
    } catch (err) {
      console.error('Failed to load target entities', err)
      setAssignmentState((s) => ({ ...s, loadingEntities: false }))
    }
  }

  async function handleConfirmAssignment(targetEntityId, note) {
    setAssignmentState((s) => ({ ...s, saving: true }))
    try {
      await api.patch(`/admin/requests/${assignmentState.request.id}/`, {
        target_entity_id: Number(targetEntityId),
        current_assignee_id: null,
        note,
      })
      setAssignmentState({ active: false, request: null, loadingEntities: false, entities: [], saving: false })
      loadRequests()
    } catch (err) {
      console.error('Assignment failed', err)
      setAssignmentState((s) => ({ ...s, saving: false }))
      alert(err.response?.data?.detail || 'Assignment failed.')
    }
  }

  async function handleDeleteRequest(requestItem) {
    const confirmed = window.confirm(
      `Delete request "${requestItem.reference_code || requestItem.request_number}"?`,
    )
    if (!confirmed) return
    setDeletingRequestId(requestItem.id)
    try {
      await api.delete(`/requests/${requestItem.id}/`)
      await loadRequests()
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not delete request.')
    } finally {
      setDeletingRequestId(null)
    }
  }

  function resetFilters() {
    setFilters({
      search: '',
      company_id: isGlobalAdmin ? '' : user?.company_id ? String(user.company_id) : '',
      source_entity_id: '',
      target_entity_id: '',
      type: '',
      status: '',
      stuck: false,
    })
    setPagination(curr => ({ ...curr, page: 1 }))
  }

  function handleFilterChange(key, value) {
    setFilters((current) => {
      const next = { ...current, [key]: value }
      if (key === 'company_id') {
        next.source_entity_id = ''
        next.target_entity_id = ''
      }
      return next
    })
    setPagination(curr => ({ ...curr, page: 1 }))
  }

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Operations"
        title={title}
        description="Consolidated request workspace for monitoring, assignment, and status management."
        actions={
          user?.request_creation_allowed ? (
            <Link className="pill-link-primary pill-link" to="/requests/create">
              New request
            </Link>
          ) : null
        }
      />

      {isGlobalAdmin && operationalData && (
        <OperationalDashboardSection data={operationalData} />
      )}

      <section className="kpi-grid">
        <article className="summary-card summary-card-emphasis">
          <span>Global workload</span>
          <strong>{metrics.total}</strong>
        </article>
        <article className="summary-card">
          <span>Pending assignment</span>
          <strong>{metrics.pending}</strong>
        </article>
        <article className="summary-card">
          <span>In active lifecycle</span>
          <strong>{metrics.inProgress}</strong>
        </article>
        <article className="summary-card">
          <span>Stalled</span>
          <strong>{metrics.stuck}</strong>
        </article>
      </section>

      <section className="table-wrap">
        <div className="card-toolbar">
          <div>
            <p className="eyebrow">Inventory</p>
            <h2>Workspace filters</h2>
          </div>
          <span className="muted-text">{state.loading ? 'Updating...' : `${metrics.total} result(s)`}</span>
        </div>

        <div className="filter-bar table-caption">
          <input
            placeholder="Search ref, title, creator..."
            value={filters.search}
            onChange={(event) => handleFilterChange('search', event.target.value)}
          />

          {isGlobalAdmin && (
            <select
              className="app-select"
              value={filters.company_id}
              onChange={(event) => handleFilterChange('company_id', event.target.value)}
            >
              <option value="">All companies</option>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <select
            className="app-select"
            value={filters.source_entity_id}
            onChange={(event) => handleFilterChange('source_entity_id', event.target.value)}
            disabled={isGlobalAdmin ? !filters.company_id : !options.sourceEntities.length}
          >
            <option value="">All source entities</option>
            {options.sourceEntities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          <select
            className="app-select"
            value={filters.target_entity_id}
            onChange={(event) => handleFilterChange('target_entity_id', event.target.value)}
            disabled={isGlobalAdmin ? !filters.company_id : !options.targetEntities.length}
          >
            <option value="">All target teams</option>
            {options.targetEntities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          <select
            className="app-select"
            value={filters.status}
            onChange={(event) => handleFilterChange('status', event.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(statusLabelMap).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          
          <button className="ghost-button" type="button" onClick={resetFilters}>
            Clear
          </button>
        </div>

        {state.loading && state.requests.length === 0 && <p className="muted-text" style={{ padding: '20px' }}>Loading requests...</p>}
        {state.error && <p className="error-text" style={{ padding: '20px' }}>{state.error}</p>}
        
        {!state.loading && !state.error && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Status</th>
                <th>Scope</th>
                <th>Ownership</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.requests.map((item) => {
                const isUnassigned = !item.target_entity_name || item.target_entity_name === 'Unassigned'
                
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="caption-grid">
                        <strong>{item.title}</strong>
                        <span className="muted-text">
                          {item.reference_code || item.request_number} · {item.type}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="caption-grid">
                        <span className={statusClassMap[item.status] || 'status-tag'}>
                          {statusLabelMap[item.status] || item.status}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="caption-grid">
                        <span>{item.company_name || '-'}</span>
                        <span className="muted-text">
                          {item.source_entity_name || '-'} {'->'} {item.target_entity_name || '-'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="caption-grid">
                        <span>{item.creator_name || '-'}</span>
                        <span className="muted-text">{item.assignee_name || 'Unassigned'}</span>
                      </div>
                    </td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                    <td>
                      <div className="table-actions">
                        <Link className="ghost-button pill-link" to={`/requests/${item.id}`}>
                          Open
                        </Link>
                        {canDeleteRequests ? (
                          <button
                            type="button"
                            className="ghost-button pill-link"
                            disabled={deletingRequestId === item.id}
                            onClick={() => handleDeleteRequest(item)}
                          >
                            {deletingRequestId === item.id ? 'Deleting...' : 'Delete'}
                          </button>
                        ) : null}
                        {isGlobalAdmin ? (
                          isUnassigned ? (
                            <button 
                              type="button" 
                              className="ghost-button pill-link"
                              onClick={() => handleStartAssignment(item)}
                            >
                              Assign
                            </button>
                          ) : (
                            <div className="caption-grid" style={{ alignItems: 'center' }}>
                              <span className="status-tag active">Assigned</span>
                              <span className="muted-text" style={{ fontSize: '11px' }}>
                                {item.target_entity_name}
                              </span>
                            </div>
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {!state.loading && !state.error && pagination.count > 0 && (
          <div className="pagination-bar">
            <div className="pagination-info">
              Showing <strong>{(pagination.page - 1) * pagination.pageSize + 1}</strong>
              - <strong>{Math.min(pagination.page * pagination.pageSize, pagination.count)}</strong>
              of <strong>{pagination.count}</strong> results
            </div>

            <div className="pagination-actions">
              <button
                className="pagination-button"
                disabled={!pagination.previous || state.loading}
                onClick={() => setPagination(curr => ({ ...curr, page: curr.page - 1 }))}
              >
                Previous
              </button>

              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {Array.from({ length: Math.ceil(pagination.count / pagination.pageSize) }, (_, i) => i + 1)
                  .filter(p => {
                    const total = Math.ceil(pagination.count / pagination.pageSize)
                    if (total <= 7) return true
                    return p === 1 || p === total || Math.abs(p - pagination.page) <= 1
                  })
                  .map((p, i, arr) => (
                    <span key={p} style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      {i > 0 && p - arr[i - 1] > 1 && <span className="muted-text">...</span>}
                      <button
                        className={`pagination-button ${pagination.page === p ? 'pagination-button-active' : ''}`}
                        onClick={() => setPagination(curr => ({ ...curr, page: p }))}
                        disabled={state.loading}
                      >
                        {p}
                      </button>
                    </span>
                  ))}
              </div>

              <button
                className="pagination-button"
                disabled={!pagination.next || state.loading}
                onClick={() => setPagination(curr => ({ ...curr, page: curr.page + 1 }))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {assignmentState.active && (
        <AssignmentModal
          request={assignmentState.request}
          entities={assignmentState.entities}
          loading={assignmentState.loadingEntities}
          saving={assignmentState.saving}
          onClose={() => setAssignmentState({ active: false, request: null, loadingEntities: false, entities: [], saving: false })}
          onConfirm={handleConfirmAssignment}
        />
      )}
    </main>
  )
}

export default RequestsPage
