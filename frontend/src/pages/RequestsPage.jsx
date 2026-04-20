import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const statusLabelMap = {
  NEW: 'New',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
}

const statusToneMap = {
  NEW: 'bg-slate-100 text-slate-700 border-slate-200',
  ACCEPTED: 'bg-blue-100 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 border-amber-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-slate-200 text-slate-700 border-slate-300',
}

function statusPillClass(status) {
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusToneMap[status] || 'bg-slate-100 text-slate-700 border-slate-200'}`
}

function typePillClass(type) {
  if (type === 'SCRIPT') return 'bg-indigo-100 text-indigo-700 border-indigo-200'
  if (type === 'TOOL') return 'bg-cyan-100 text-cyan-700 border-cyan-200'
  if (type === 'APP_PROJECT') return 'bg-purple-100 text-purple-700 border-purple-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function AssignmentModal({ request, entities, loading, saving, onClose, onConfirm }) {
  const [targetEntityId, setTargetEntityId] = useState('')
  const [note, setNote] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-xl">
        <div className="border-b border-border px-6 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Request Assignment</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Assign Target Team</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Route this request to the appropriate support or development entity.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Request Reference</label>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
              {request?.reference_code || request?.request_number || '-'}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Title</label>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
              {request?.title || '-'}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Company</label>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
              {request?.company_name || '-'}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="target-team" className="text-sm font-medium text-foreground">Target team</label>
            <select
              id="target-team"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              value={targetEntityId}
              onChange={(e) => setTargetEntityId(e.target.value)}
              disabled={loading}
            >
              <option value="">Select support/dev team</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.entity_type})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="assignment-note" className="text-sm font-medium text-foreground">Assignment note (optional)</label>
            <textarea
              id="assignment-note"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Instructions or context for the team..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted/60 disabled:opacity-60"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
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
    <main className="space-y-6">
      <PageHeader
        eyebrow={null}
        title={title}
        description="Browse, filter, and manage requests across your scope."
        actions={
          user?.request_creation_allowed ? (
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              to="/requests/create"
            >
              New request
            </Link>
          ) : null
        }
      />

      <section className="space-y-4">
        <div className="surface-card p-4">
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Search title, reference, description..."
                value={filters.search}
                onChange={(event) => handleFilterChange('search', event.target.value)}
              />
            </div>

            {isGlobalAdmin && (
              <select
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:col-span-2"
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
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:col-span-2"
              value={filters.source_entity_id}
              onChange={(event) => handleFilterChange('source_entity_id', event.target.value)}
              disabled={isGlobalAdmin ? !filters.company_id : !options.sourceEntities.length}
            >
              <option value="">All sources</option>
              {options.sourceEntities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>

            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:col-span-2"
              value={filters.target_entity_id}
              onChange={(event) => handleFilterChange('target_entity_id', event.target.value)}
              disabled={isGlobalAdmin ? !filters.company_id : !options.targetEntities.length}
            >
              <option value="">All targets</option>
              {options.targetEntities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>

            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:col-span-2"
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
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {state.loading ? 'Updating...' : `${pagination.count || 0} result(s)`}
            </p>
            <button
              className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition hover:bg-muted/60"
              type="button"
              onClick={resetFilters}
            >
              Clear filters
            </button>
          </div>
        </div>

        <div className="surface-card overflow-hidden">
          {state.loading && state.requests.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading requests...</p>
          )}
          {state.error && <p className="px-4 py-6 text-sm font-medium text-destructive">{state.error}</p>}

          {!state.loading && !state.error && (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Title</th>
                    <th>Source → Target</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.requests.map((item) => {
                    const isUnassigned = !item.target_entity_name || item.target_entity_name === 'Unassigned'
                    return (
                      <tr key={item.id}>
                        <td className="font-mono text-xs text-muted-foreground">
                          {item.reference_code || item.request_number}
                        </td>
                        <td>
                          <Link className="font-medium text-foreground hover:text-primary" to={`/requests/${item.id}`}>
                            {item.title}
                          </Link>
                        </td>
                        <td className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{item.source_entity_name || '-'}</span>
                          <span className="mx-1">→</span>
                          <span className="font-medium text-foreground">{item.target_entity_name || '-'}</span>
                        </td>
                        <td>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${typePillClass(item.type)}`}>
                            {item.type || 'INFO'}
                          </span>
                        </td>
                        <td>
                          <span className={statusPillClass(item.status)}>
                            {statusLabelMap[item.status] || item.status}
                          </span>
                        </td>
                        <td className="text-sm text-muted-foreground">
                          {item.assignee_name || 'Unassigned'}
                        </td>
                        <td className="text-sm text-muted-foreground">
                          {new Date(item.updated_at || item.created_at).toLocaleString()}
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60"
                              to={`/requests/${item.id}`}
                            >
                              Open
                            </Link>
                            {canDeleteRequests ? (
                              <button
                                type="button"
                                className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60 disabled:opacity-60"
                                disabled={deletingRequestId === item.id}
                                onClick={() => handleDeleteRequest(item)}
                              >
                                {deletingRequestId === item.id ? 'Deleting...' : 'Delete'}
                              </button>
                            ) : null}
                            {isGlobalAdmin && isUnassigned ? (
                              <button
                                type="button"
                                className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60"
                                onClick={() => handleStartAssignment(item)}
                              >
                                Assign
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!state.loading && !state.error && pagination.count > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Showing <strong>{(pagination.page - 1) * pagination.pageSize + 1}</strong>
              - <strong>{Math.min(pagination.page * pagination.pageSize, pagination.count)}</strong>
              of <strong>{pagination.count}</strong>
            </div>

            <div className="flex items-center gap-1">
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60 disabled:opacity-50"
                disabled={!pagination.previous || state.loading}
                onClick={() => setPagination(curr => ({ ...curr, page: curr.page - 1 }))}
              >
                Previous
              </button>

              <span className="px-2 text-xs text-muted-foreground">
                Page {pagination.page} / {Math.max(1, Math.ceil(pagination.count / pagination.pageSize))}
              </span>

              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60 disabled:opacity-50"
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
