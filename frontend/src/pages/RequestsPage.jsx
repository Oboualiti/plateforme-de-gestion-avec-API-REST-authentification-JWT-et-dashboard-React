import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, PlusCircle, Search } from 'lucide-react'

import { Avatar } from '../components/Avatar'
import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const PAGE_SIZE = 8

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

function formatUpdated(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function RequestsPage() {
  const { user, refreshUser } = useAuth()
  const [searchParams] = useSearchParams()
  const scope = searchParams.get('scope') || 'all'
  const initialSearch = searchParams.get('search') || ''

  const [state, setState] = useState({ loading: true, error: '', requests: [] })
  const [filters, setFilters] = useState({
    search: initialSearch,
    company_id: '',
    source_entity_id: '',
    target_entity_id: '',
    status: '',
  })
  const [options, setOptions] = useState({
    companies: [],
    sourceEntities: [],
    targetEntities: [],
  })
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    count: 0,
    next: null,
    previous: null,
  })

  const roleKeys = useMemo(() => user?.role_keys || [], [user?.role_keys])
  const isGlobalAdmin = roleKeys.includes('super_admin')
  const scopeTitle = {
    all: 'All requests',
    mine: 'My requests',
    team: 'Incoming queue',
    'team-all': 'Team requests',
    entity: 'Entity requests',
    company: 'Company requests',
  }

  useEffect(() => {
    if (!isGlobalAdmin) return
    let active = true
    async function fetchCompanies() {
      try {
        const response = await api.get('/admin/companies/')
        if (!active) return
        const payload = response.data
        const companies = Array.isArray(payload) ? payload : payload?.results || payload?.companies || []
        setOptions((current) => ({ ...current, companies }))
      } catch (_err) {
        if (!active) return
        setOptions((current) => ({ ...current, companies: [] }))
      }
    }
    fetchCompanies()
    return () => {
      active = false
    }
  }, [isGlobalAdmin])

  useEffect(() => {
    const companyId = isGlobalAdmin ? filters.company_id : user?.company_id
    if (!companyId) {
      setOptions((current) => ({ ...current, sourceEntities: [], targetEntities: [] }))
      return
    }

    let active = true
    async function fetchEntities() {
      try {
        const response = await api.get('/admin/entities/', { params: { company_id: companyId } })
        if (!active) return
        const payload = response.data
        const entities = Array.isArray(payload) ? payload : payload?.results || payload?.entities || []
        setOptions((current) => ({
          ...current,
          sourceEntities: entities,
          targetEntities: entities.filter((item) => item.entity_type !== 'PROD'),
        }))
      } catch (_err) {
        if (!active) return
        setOptions((current) => ({ ...current, sourceEntities: [], targetEntities: [] }))
      }
    }
    fetchEntities()
    return () => {
      active = false
    }
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
        status: filters.status || undefined,
      }
      const response = await api.get('/requests/', { params })
      const payload = response.data || {}
      const results = Array.isArray(payload.results) ? payload.results : []
      setState({ loading: false, error: '', requests: results })
      setPagination((current) => ({
        ...current,
        count: Number(payload.count || 0),
        next: payload.next || null,
        previous: payload.previous || null,
      }))
    } catch (error) {
      setState({
        loading: false,
        error: error.response?.data?.detail || 'Could not load requests.',
        requests: [],
      })
      setPagination((current) => ({ ...current, count: 0, next: null, previous: null }))
    }
  }

  useEffect(() => {
    setState((current) => ({ ...current, loading: true, error: '' }))
    loadRequests()
  }, [filters, pagination.page, refreshUser])

  function handleFilterChange(key, value) {
    setFilters((current) => {
      const next = { ...current, [key]: value }
      if (key === 'company_id') {
        next.source_entity_id = ''
        next.target_entity_id = ''
      }
      return next
    })
    setPagination((current) => ({ ...current, page: 1 }))
  }

  function resetFilters() {
    setFilters({
      search: '',
      company_id: '',
      source_entity_id: '',
      target_entity_id: '',
      status: '',
    })
    setPagination((current) => ({ ...current, page: 1 }))
  }

  const canShowCompanyFilter = isGlobalAdmin
  const totalPages = Math.max(1, Math.ceil((pagination.count || 0) / pagination.pageSize))
  const fromIndex = pagination.count ? (pagination.page - 1) * pagination.pageSize + 1 : 0
  const toIndex = Math.min(pagination.page * pagination.pageSize, pagination.count || 0)

  return (
    <main className="space-y-6">
      <PageHeader
        title={scopeTitle[scope] || 'Requests'}
        description="Browse, filter, and manage requests across your scope."
        actions={
          user?.request_creation_allowed ? (
            <Button asChild>
              <Link to="/requests/create">
                <PlusCircle className="mr-1 h-4 w-4" /> New request
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="surface-card mb-4 p-4">
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(event) => handleFilterChange('search', event.target.value)}
              placeholder="Search title, reference, description..."
              className="pl-9"
            />
          </div>

          {canShowCompanyFilter && (
            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm lg:col-span-2"
              value={filters.company_id}
              onChange={(event) => handleFilterChange('company_id', event.target.value)}
            >
              <option value="">All companies</option>
              {options.companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code ? `${item.code} - ${item.name}` : item.name}
                </option>
              ))}
            </select>
          )}

          <select
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm lg:col-span-2"
            value={filters.source_entity_id}
            onChange={(event) => handleFilterChange('source_entity_id', event.target.value)}
            disabled={canShowCompanyFilter ? !filters.company_id : !options.sourceEntities.length}
          >
            <option value="">All sources</option>
            {options.sourceEntities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code || item.name}
              </option>
            ))}
          </select>

          <select
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm lg:col-span-2"
            value={filters.target_entity_id}
            onChange={(event) => handleFilterChange('target_entity_id', event.target.value)}
            disabled={canShowCompanyFilter ? !filters.company_id : !options.targetEntities.length}
          >
            <option value="">All targets</option>
            {options.targetEntities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code || item.name}
              </option>
            ))}
          </select>

          <select
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm lg:col-span-2"
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
          <Button variant="outline" size="sm" onClick={resetFilters}>
            Clear filters
          </Button>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {state.loading && state.requests.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading requests...</div>
        ) : state.error ? (
          <div className="py-16 text-center text-sm font-medium text-destructive">{state.error}</div>
        ) : state.requests.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium">No requests match your filters</p>
            <p className="mt-1 text-xs text-muted-foreground">Try clearing filters or creating a new request.</p>
            {user?.request_creation_allowed ? (
              <div className="mt-4">
                <Button asChild>
                  <Link to="/requests/create">
                    <PlusCircle className="mr-1 h-4 w-4" /> New request
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Reference</th>
                  <th className="px-4 py-3 text-left font-medium">Title</th>
                  <th className="px-4 py-3 text-left font-medium">Source - Target</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Assignee</th>
                  <th className="px-4 py-3 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {state.requests.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <Link to={`/requests/${item.id}`} className="hover:text-primary hover:underline">
                        {item.reference_code || item.request_number || '-'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/requests/${item.id}`} className="font-medium text-foreground hover:text-primary">
                        {item.title || '-'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="font-medium text-foreground">{item.source_entity_name || '-'}</span>
                      <span className="mx-1.5 text-muted-foreground">-</span>
                      <span className="font-medium text-foreground">{item.target_entity_name || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${typePillClass(item.type)}`}>
                        {item.type || 'INFO'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusPillClass(item.status)}>
                        {statusLabelMap[item.status] || item.status || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.assignee_name ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={item.assignee_name} size={24} />
                          <span className="text-xs">{item.assignee_name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatUpdated(item.updated_at || item.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!state.loading && !state.error && pagination.count > pagination.pageSize && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <div className="text-xs text-muted-foreground">
              Showing {fromIndex}-{toIndex} of {pagination.count}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.previous}
                onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs text-muted-foreground">
                Page {pagination.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.next}
                onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

export default RequestsPage
