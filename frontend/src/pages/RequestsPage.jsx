import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, PlusCircle, Search } from 'lucide-react'

import { Avatar } from '../components/Avatar'
import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
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
  NEW: 'bg-slate-100 text-slate-700 border-slate-400',
  ACCEPTED: 'bg-blue-100 text-blue-700 border-blue-400',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 border-amber-400',
  REJECTED: 'bg-red-100 text-red-700 border-red-400',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-400',
  CLOSED: 'bg-slate-200 text-slate-700 border-slate-500',
}

function statusPillClass(status) {
  return `inline-flex items-center rounded-md border-2 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${statusToneMap[status] || 'bg-slate-100 text-slate-700 border-slate-400'}`
}

function typePillClass(type) {
  let baseClass = 'bg-slate-100 text-slate-700 border-slate-400'
  if (type === 'SCRIPT') baseClass = 'bg-indigo-100 text-indigo-700 border-indigo-400'
  if (type === 'TOOL') baseClass = 'bg-cyan-100 text-cyan-700 border-cyan-400'
  if (type === 'APP_PROJECT') baseClass = 'bg-purple-100 text-purple-700 border-purple-400'
  return `inline-flex items-center rounded-md border-2 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${baseClass}`
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
  const resolvedScope = scope === 'mine' ? 'all' : scope
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
  const effectivePermissionKeys = useMemo(
    () => new Set(user?.effective_permission_keys || []),
    [user?.effective_permission_keys],
  )
  const hasPermission = (permissionKey) => effectivePermissionKeys.has(permissionKey)
  const isGlobalAdmin = roleKeys.includes('super_admin')
  const isSenior = roleKeys.includes('senior')
  const isManager = roleKeys.includes('manager')
  const isTeamLeader = roleKeys.includes('team_leader')
  const isBasicUser = roleKeys.includes('user')
  const isIncomingQueueTeamLeader = isTeamLeader && resolvedScope === 'team'
  const isPendingScope = resolvedScope === 'pending'
  const canDecidePending = isPendingScope
    && hasPermission('approve_request')
    && (
      isGlobalAdmin
      || isSenior
      || ((isManager || isTeamLeader) && user?.entity_type === 'PROD')
    )
  const actorCompanyId = useMemo(
    () => user?.company_id || user?.company || '',
    [user?.company_id, user?.company],
  )
  const isSingleEntityRole = !isGlobalAdmin && !isSenior && (isManager || isTeamLeader || isBasicUser)
  const scopeTitle = {
    all: 'All requests',
    mine: 'My requests',
    pending: 'Pending requests',
    team: 'Incoming queue',
    'team-all': 'Team requests',
    entity: 'Entity requests',
    company: 'Company requests',
  }

  const applyScopeFilter = (items) => {
    if (!Array.isArray(items)) return []
    if (resolvedScope !== 'team' || !user?.entity_id) return items

    const currentEntityId = Number(user.entity_id)
    const currentEntityName = (user.entity_name || '').trim().toLowerCase()
    const currentEntityCode = (user.entity_code || user.entity?.code || '').trim().toLowerCase()

    return items.filter((item) => {
      const targetId = Number(item.target_entity_id || item.target_entity?.id || 0)
      if (targetId && currentEntityId && targetId === currentEntityId) return true

      const targetName = (item.target_entity_name || item.target_entity?.name || '').trim().toLowerCase()
      const targetCode = (item.target_entity_code || item.target_entity?.code || item.target_unit?.code || '').trim().toLowerCase()

      if (currentEntityName && targetName && targetName === currentEntityName) return true
      if (currentEntityCode && targetCode && targetCode === currentEntityCode) return true
      return false
    })
  }

  useEffect(() => {
    const nextSearch = searchParams.get('search') || ''
    setFilters((current) => (
      current.search === nextSearch ? current : { ...current, search: nextSearch }
    ))
    setPagination((current) => (current.page === 1 ? current : { ...current, page: 1 }))
  }, [searchParams])

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
    if (isSingleEntityRole) {
      const sourceEntity = user?.source_entity?.id
        ? user.source_entity
        : (user?.entity_id
          ? {
              id: user.entity_id,
              code: user.entity_code || '',
              name: user.entity_name || '',
              entity_type: user.entity_type || 'PROD',
            }
          : null)
      const targetEntities = Array.isArray(user?.available_target_teams) ? user.available_target_teams : []
      setOptions((current) => ({
        ...current,
        sourceEntities: sourceEntity ? [sourceEntity] : [],
        targetEntities,
      }))
      return
    }

    const companyId = isGlobalAdmin ? filters.company_id : actorCompanyId
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
          sourceEntities: entities.filter((item) => item.entity_type === 'PROD'),
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
  }, [actorCompanyId, filters.company_id, isGlobalAdmin, isSingleEntityRole, user?.available_target_teams, user?.entity_code, user?.entity_id, user?.entity_name, user?.entity_type, user?.source_entity])

  async function loadRequests() {
    try {
      await refreshUser()
      const isTeamScope = resolvedScope === 'team'
      const params = {
        page: isTeamScope ? 1 : pagination.page,
        page_size: isTeamScope ? 200 : pagination.pageSize,
        scope: resolvedScope !== 'all' ? resolvedScope : undefined,
        search: filters.search || undefined,
        company_id: isGlobalAdmin ? filters.company_id || undefined : actorCompanyId || undefined,
        source_entity_id: filters.source_entity_id || undefined,
        target_entity_id: filters.target_entity_id || undefined,
        status: filters.status || undefined,
      }
      const response = await api.get('/requests/', { params })
      const payload = response.data || {}
      const rawResults = Array.isArray(payload.results) ? payload.results : []
      const results = applyScopeFilter(rawResults)

      if (isTeamScope) {
        const totalCount = results.length
        const totalPages = Math.max(1, Math.ceil(totalCount / pagination.pageSize))
        const safePage = Math.min(Math.max(1, pagination.page), totalPages)
        const startIndex = (safePage - 1) * pagination.pageSize
        const endIndex = startIndex + pagination.pageSize
        const pagedResults = results.slice(startIndex, endIndex)

        setState({ loading: false, error: '', requests: pagedResults })
        setPagination((current) => ({
          ...current,
          page: safePage,
          count: totalCount,
          next: safePage < totalPages ? `local-page-${safePage + 1}` : null,
          previous: safePage > 1 ? `local-page-${safePage - 1}` : null,
        }))
        return
      }

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

  async function handlePendingDecision(requestId, nextStatus) {
    let note = ''
    if (nextStatus === 'REJECTED') {
      note = window.prompt('Rejection reason (required):')?.trim() || ''
      if (!note) return
    }
    try {
      await api.post(`/requests/${requestId}/status/`, { status: nextStatus, note })
      await loadRequests()
    } catch (error) {
      window.alert(error.response?.data?.detail || 'Could not update pending request.')
    }
  }

  useEffect(() => {
    setState((current) => ({ ...current, loading: true, error: '' }))
    loadRequests()
  }, [filters, pagination.page, resolvedScope, refreshUser])

  useEffect(() => {
    if (resolvedScope !== 'pending') return undefined

    const refreshPending = () => {
      loadRequests()
    }

    const timer = window.setInterval(refreshPending, 8000)
    window.addEventListener('focus', refreshPending)
    document.addEventListener('visibilitychange', refreshPending)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshPending)
      document.removeEventListener('visibilitychange', refreshPending)
    }
  }, [resolvedScope, filters, pagination.page, refreshUser])

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

  const canShowCompanyFilter = hasPermission('view_all_requests') || isIncomingQueueTeamLeader
  const totalPages = Math.max(1, Math.ceil((pagination.count || 0) / pagination.pageSize))
  const fromIndex = pagination.count ? (pagination.page - 1) * pagination.pageSize + 1 : 0
  const toIndex = Math.min(pagination.page * pagination.pageSize, pagination.count || 0)

  return (
    <main className="space-y-6">
      <PageHeader
        title={scopeTitle[resolvedScope] || 'Requests'}
        description="Browse, filter, and manage requests across your scope."
        actions={
          user?.request_creation_allowed && hasPermission('create_request') ? (
            <Button asChild>
              <Link to="/requests/create">
                <PlusCircle className="mr-1 h-4 w-4" /> New request
              </Link>
            </Button>
          ) : null
        }
      />

      {isIncomingQueueTeamLeader ? <div className="h-0.5 w-full bg-border" /> : null}

      <div className={`${isIncomingQueueTeamLeader ? 'rounded-md border-2 border-ink bg-card p-4 shadow-elev-sm' : 'surface-card mb-4 p-4'}`}>
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
            <Select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm lg:col-span-2"
              value={isGlobalAdmin ? filters.company_id : (actorCompanyId ? String(actorCompanyId) : '')}
              onChange={(event) => handleFilterChange('company_id', event.target.value)}
              disabled={!isGlobalAdmin}
            >
              {isGlobalAdmin ? (
                [
                  <option key="company-default" value="">Company</option>,
                  ...options.companies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code ? `${item.code} - ${item.name}` : item.name}
                    </option>
                  )),
                ]
              ) : (
                <option value={actorCompanyId ? String(actorCompanyId) : ''}>{(user?.company_name || 'My company').toUpperCase()}</option>
              )}
            </Select>
          )}

          <Select
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm lg:col-span-2"
            value={filters.source_entity_id}
            onChange={(event) => handleFilterChange('source_entity_id', event.target.value)}
            disabled={canShowCompanyFilter ? !filters.company_id : !options.sourceEntities.length}
          >
            <option value="">All sources</option>
            {options.sourceEntities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || item.code}
              </option>
            ))}
          </Select>

          <Select
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm lg:col-span-2"
            value={filters.target_entity_id}
            onChange={(event) => handleFilterChange('target_entity_id', event.target.value)}
            disabled={canShowCompanyFilter ? !filters.company_id : !options.targetEntities.length}
          >
            <option value="">All targets</option>
            {options.targetEntities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || item.code}
              </option>
            ))}
          </Select>

          <Select
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
          </Select>
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

      <div className={`${isIncomingQueueTeamLeader ? 'overflow-hidden rounded-md border-2 border-ink bg-card shadow-elev-sm' : 'surface-card overflow-hidden'}`}>
        {state.loading && state.requests.length === 0 ? (
          <div className="overflow-x-auto p-4">
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
                {Array.from({ length: 8 }).map((_, index) => (
                  <tr key={`request-row-skeleton-${index}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-44" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : state.error ? (
          <div className="py-16 text-center text-sm font-medium text-destructive">{state.error}</div>
        ) : state.requests.length === 0 ? (
          <div className={`${isIncomingQueueTeamLeader ? 'm-3 rounded-md border-2 border-dashed border-ink p-16 text-center' : 'py-16 text-center'}`}>
            <p className="text-sm font-medium">No requests match your filters</p>
            <p className="mt-1 text-xs text-muted-foreground">Try clearing filters or creating a new request.</p>
            {user?.request_creation_allowed && hasPermission('create_request') ? (
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
                  {(!isPendingScope || !canDecidePending) && <th className="px-4 py-3 text-left font-medium">Assignee</th>}
                  <th className="px-4 py-3 text-left font-medium">Updated</th>
                  {canDecidePending && <th className="px-4 py-3 text-right font-medium">Decision</th>}
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
                      <span className={typePillClass(item.type)}>
                        {item.type || 'INFO'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusPillClass(item.status)}>
                        {statusLabelMap[item.status] || item.status || '-'}
                      </span>
                    </td>
                    {(!isPendingScope || !canDecidePending) && (
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
                    )}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatUpdated(item.updated_at || item.created_at)}
                    </td>
                    {canDecidePending && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => handlePendingDecision(item.id, 'ACCEPTED')}
                            disabled={item.status !== 'NEW'}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handlePendingDecision(item.id, 'REJECTED')}
                            disabled={item.status !== 'NEW'}
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    )}
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
