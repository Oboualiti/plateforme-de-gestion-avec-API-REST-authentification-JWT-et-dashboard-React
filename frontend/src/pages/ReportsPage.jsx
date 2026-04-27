import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { 
  ArrowUpRight, 
  Download, 
  Inbox, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Activity, 
  Target, 
  FileText, 
  BarChart3,
  Users,
  Briefcase,
  CircleHelp
} from 'lucide-react'

import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const RESOLVED_SET = new Set(['COMPLETED', 'CLOSED'])
const ACTIVE_SET = new Set(['NEW', 'ACCEPTED', 'IN_PROGRESS'])

function cleanLabel(value, fallback) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return fallback
  if (normalized.toLowerCase() === 'null') return fallback
  return normalized
}

function getPrimaryRole(user) {
  return user?.role_keys?.[0] || user?.role || 'user'
}

function getScopeForRole(role, permissions) {
  if (permissions.has('view_global_reports')) return 'all'
  if (permissions.has('view_company_reports')) return 'company'
  if (permissions.has('view_entity_reports')) return 'entity'
  if (role === 'super_admin') return 'all'
  if (role === 'senior') return 'company'
  if (role === 'manager') return 'entity'
  if (role === 'team_leader') return 'team-all'
  return 'mine'
}

function getScopeLabel(role, user, permissions) {
  if (permissions.has('view_global_reports')) return 'Global platform'
  if (permissions.has('view_company_reports')) return user?.company_name || 'Company scope'
  if (permissions.has('view_entity_reports')) return user?.entity_name || 'Entity scope'
  if (role === 'super_admin') return 'Global platform'
  if (role === 'senior') return user?.company_name || 'Company scope'
  if (role === 'manager') return user?.entity_name || 'Entity scope'
  if (role === 'team_leader') return user?.entity_name || 'Team scope'
  return 'Personal scope'
}

function toDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getRequestDeadline(item) {
  return item?.deadline_date || item?.deadlineDate || item?.deadline || item?.approximate_deadline || item?.due_date || item?.dueDate || null
}

function formatDay(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function exportCsv(filename, rows) {
  if (!rows?.length) return
  const headers = Object.keys(rows[0])
  const content = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replaceAll('"', '""')}"`).join(',')),
  ].join('\n')

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function avgResolutionDays(items) {
  const durations = items
    .filter((item) => RESOLVED_SET.has(item.status))
    .map((item) => {
      const start = toDate(item.created_at || item.createdAt)
      const end = toDate(item.completed_at || item.closed_at || item.updated_at || item.updatedAt || item.created_at || item.createdAt)
      if (!start || !end) return null
      return (end.getTime() - start.getTime()) / 86400000
    })
    .filter((value) => value !== null && value >= 0)

  if (!durations.length) return 0
  return durations.reduce((sum, value) => sum + value, 0) / durations.length
}


function formatRelative(value) {
  const date = toDate(value)
  if (!date) return 'just now'
  const diff = Math.max(0, Date.now() - date.getTime())
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `about ${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function toTagLabel(value) {
  return cleanLabel(value, 'other').replaceAll('_', ' ').toUpperCase()
}

const STATUS_BAR_CLASS = {
  NEW: 'bg-[#d97706]',
  ACCEPTED: 'bg-[#f2c200]',
  IN_PROGRESS: 'bg-[#eab308]',
  COMPLETED: 'bg-[#f2c200]',
  REJECTED: 'bg-[#dc2626]',
  CLOSED: 'bg-[#475569]',
}

const AVATAR_TONE = ['bg-[#f2c200]', 'bg-[#f2c200]', 'bg-[#f2c200]', 'bg-[#f2c200]', 'bg-[#f2c200]']

function HelpTip({ text }) {
  return (
    <span className="group relative inline-flex items-center">
      <CircleHelp className="h-3.5 w-3.5 text-muted-foreground/70 transition-colors group-hover:text-primary" />
      <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-medium text-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}

function ReportsPage() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', reports: null, dashboard: null, requests: [] })

  const role = getPrimaryRole(user)
  const effectivePermissionKeys = useMemo(
    () => new Set(user?.effective_permission_keys || []),
    [user?.effective_permission_keys],
  )
  const hasPermission = (permissionKey) => effectivePermissionKeys.has(permissionKey)
  const scope = getScopeForRole(role, effectivePermissionKeys)
  const scopeLabel = getScopeLabel(role, user, effectivePermissionKeys)
  const canViewGlobalReports = hasPermission('view_global_reports')
  const canViewCompanyReports = hasPermission('view_company_reports')
  const canViewEntityReports = hasPermission('view_entity_reports')
  const canExportData = hasPermission('export_data')
  const isSuperAdmin = role === 'super_admin' && canViewGlobalReports
  const canViewReports = canViewGlobalReports || canViewCompanyReports || canViewEntityReports
  const canSeeCompanyVolume = canViewGlobalReports || canViewCompanyReports
  const canSeeExecutiveCards = (role === 'super_admin' && canViewGlobalReports) || (role === 'senior' && canViewCompanyReports)

  useEffect(() => {
    if (!canViewReports) {
      setState({ loading: false, error: 'You do not have permission to view reports.', reports: null, dashboard: null, requests: [] })
      return undefined
    }
    let active = true

    async function load() {
      setState({ loading: true, error: '', reports: null, dashboard: null, requests: [] })

      const [reportsRes, dashboardRes, requestsRes] = await Promise.allSettled([
        api.get('/admin/reports/'),
        isSuperAdmin ? api.get('/admin/dashboard/') : Promise.resolve({ data: null }),
        api.get('/requests/', { params: { page: 1, page_size: 200, scope, skip_count: 1 } }),
      ])

      if (!active) return

      const next = {
        loading: false,
        error: '',
        reports: reportsRes.status === 'fulfilled' ? reportsRes.value.data || {} : null,
        dashboard: dashboardRes.status === 'fulfilled' ? dashboardRes.value.data || {} : null,
        requests:
          requestsRes.status === 'fulfilled'
            ? (Array.isArray(requestsRes.value.data?.results)
                ? requestsRes.value.data.results
                : Array.isArray(requestsRes.value.data)
                  ? requestsRes.value.data
                  : [])
            : [],
      }

      if (next.requests.length === 0 && !next.reports && !next.dashboard) {
        next.error = 'Could not load reports.'
      }

      setState(next)
    }

    if (user) load()
    return () => {
      active = false
    }
  }, [canViewReports, isSuperAdmin, scope, user])

  const parsed = useMemo(() => {
    const reports = state.reports || {}
    const dashboard = state.dashboard || {}
    const items = state.requests || []
    const reportStatusRows = Array.isArray(reports.requests_by_status) ? reports.requests_by_status : []
    const reportTotal = reportStatusRows.reduce((sum, item) => sum + Number(item.total || 0), 0)
    const reportOpen = Number(reports.open_vs_resolved?.open || 0)
    const reportResolved = Number(reports.open_vs_resolved?.resolved || 0)
    const hasReportTotals = reportTotal > 0 || (reportOpen + reportResolved > 0)

    const totalFromReports = (reports.requests_by_status || []).reduce((sum, row) => sum + Number(row.total || 0), 0)
    const totalRequests = isSuperAdmin
      ? dashboard.totals?.requests || totalFromReports || items.length
      : totalFromReports || items.length
    const openQueue = isSuperAdmin
      ? (dashboard.queue?.open ?? items.filter((item) => ACTIVE_SET.has(item.status)).length)
      : (hasReportTotals ? reportOpen : items.filter((item) => ACTIVE_SET.has(item.status)).length)
    const resolved = isSuperAdmin
      ? (dashboard.open_vs_resolved?.resolved ?? items.filter((item) => RESOLVED_SET.has(item.status)).length)
      : (hasReportTotals ? reportResolved : items.filter((item) => RESOLVED_SET.has(item.status)).length)
    const unassigned = isSuperAdmin
      ? (dashboard.queue?.unassigned ?? items.filter((item) => !item.assignee_name && !item.current_assignee__username).length)
      : items.filter((item) => !item.assignee_name && !item.current_assignee__username).length

    const avgDays = avgResolutionDays(items)
    const avgTurnaround = avgDays ? `${avgDays.toFixed(1)}d` : '0.0d'

    const overdue = items.filter((item) => {
      const due = toDate(getRequestDeadline(item))
      return due && due.getTime() < Date.now() && !RESOLVED_SET.has(item.status)
    }).length

    const resolutionRate = totalRequests ? Math.round((resolved / totalRequests) * 100) : 0
    const workloadPressure = openQueue - resolved

    const timelineBase = []
    for (let index = 6; index >= 0; index -= 1) {
      const date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - index)
      timelineBase.push({ key: date.toISOString().slice(0, 10), label: formatDay(date), created: 0, resolved: 0 })
    }

    const timelineMap = new Map(timelineBase.map((entry) => [entry.key, { ...entry }]))

    items.forEach((item) => {
      const createdAt = toDate(item.created_at || item.createdAt)
      if (createdAt) {
        const key = createdAt.toISOString().slice(0, 10)
        const row = timelineMap.get(key)
        if (row) row.created += 1
      }

      if (RESOLVED_SET.has(item.status)) {
        const resolvedAt = toDate(item.completed_at || item.closed_at || item.updated_at || item.updatedAt || item.created_at || item.createdAt)
        if (resolvedAt) {
          const key = resolvedAt.toISOString().slice(0, 10)
          const row = timelineMap.get(key)
          if (row) row.resolved += 1
        }
      }
    })

    const trend = [...timelineMap.values()]

    const statusRows = (reports.requests_by_status || [])
      .map((entry) => ({
        status: cleanLabel(entry.status, 'UNKNOWN'),
        total: Number(entry.total || 0),
      }))
      .filter((entry) => entry.total > 0)

    const fallbackStatusMap = new Map()
    items.forEach((item) => {
      fallbackStatusMap.set(item.status, (fallbackStatusMap.get(item.status) || 0) + 1)
    })

    const statusDistribution = statusRows.length
      ? statusRows
      : [...fallbackStatusMap.entries()].map(([status, total]) => ({ status, total }))

    const typeRows = (reports.requests_by_type || [])
      .map((entry) => ({
        type: cleanLabel(entry.category || entry.type, 'Other'),
        total: Number(entry.total || 0),
      }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total)

    const companyRows = (reports.request_volume_by_company || [])
      .map((entry) => ({
        name: cleanLabel(entry.company_name || entry['company__name'], 'Unspecified company'),
        total: Number(entry.total || 0),
      }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)

    const entityRows = (reports.request_volume_by_entity || [])
      .map((entry) => ({
        name: cleanLabel(entry.target_entity__name, 'Unspecified unit'),
        total: Number(entry.total || 0),
      }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)

    const fallbackByUnit = new Map()
    items.forEach((item) => {
      const key = cleanLabel(item.target_entity_name || item.target_entity_code || item.source_entity_name, 'Unspecified unit')
      fallbackByUnit.set(key, (fallbackByUnit.get(key) || 0) + 1)
    })
    const unitRows = [...fallbackByUnit.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)

    const fallbackTypeMap = new Map()
    items.forEach((item) => {
      const key = cleanLabel(item.category, 'Other')
      fallbackTypeMap.set(key, (fallbackTypeMap.get(key) || 0) + 1)
    })
    const fallbackTypeRows = [...fallbackTypeMap.entries()]
      .map(([type, total]) => ({ type, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 4)

    const requestTypeMix = (typeRows.length ? typeRows : fallbackTypeRows).slice(0, 4)
    const mixTotal = requestTypeMix.reduce((sum, row) => sum + row.total, 0)
    const requestVolumeRows = canSeeCompanyVolume
      ? (companyRows.length ? companyRows : unitRows)
      : (entityRows.length ? entityRows : unitRows)

    const recentMovement = [...items]
      .sort((a, b) => {
        const aTime = toDate(a.updated_at || a.updatedAt || a.created_at || a.createdAt)?.getTime() || 0
        const bTime = toDate(b.updated_at || b.updatedAt || b.created_at || b.createdAt)?.getTime() || 0
        return bTime - aTime
      })
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        reference: cleanLabel(item.reference_code || item.request_number, '-'),
        status: cleanLabel(item.status, 'NEW'),
        category: cleanLabel(item.category, 'OTHER'),
        title: cleanLabel(item.title, 'Untitled request'),
        actor: cleanLabel(item.created_by_name || item.creator_name || item.requester_name, 'Unknown user'),
        target: cleanLabel(item.target_entity_code || item.target_entity_name || item.source_entity_name, 'Unspecified unit'),
        when: formatRelative(item.updated_at || item.updatedAt || item.created_at || item.createdAt),
      }))

    const ownershipMap = new Map()
    items.forEach((item) => {
      const key = cleanLabel(item.assignee_name || item.current_assignee__username, 'Unassigned')
      ownershipMap.set(key, (ownershipMap.get(key) || 0) + 1)
    })
    const ownershipRows = [...ownershipMap.entries()]
      .map(([name, total], idx) => ({
        name,
        total,
        role: cleanLabel(items.find((item) => cleanLabel(item.assignee_name || item.current_assignee__username, 'Unassigned') === name)?.assignee_role_name, 'User'),
        tone: AVATAR_TONE[idx % AVATAR_TONE.length],
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    const summaryRows = [
      { metric: 'Total requests', value: totalRequests },
      { metric: 'Open queue', value: openQueue },
      { metric: 'Resolved', value: resolved },
      { metric: 'Average turnaround (days)', value: avgDays.toFixed(2) },
      { metric: 'Overdue', value: overdue },
      { metric: 'Resolution rate (%)', value: resolutionRate },
      { metric: 'Unassigned', value: unassigned },
    ]

    return {
      totalRequests,
      openQueue,
      resolved,
      avgTurnaround,
      overdue,
      resolutionRate,
      unassigned,
      workloadPressure,
      trend,
      statusDistribution,
      requestTypeMix,
      mixTotal,
      requestVolumeRows,
      recentMovement,
      ownershipRows,
      showExecutiveCards: canSeeExecutiveCards,
      summaryRows,
    }
  }, [canSeeCompanyVolume, canSeeExecutiveCards, isSuperAdmin, state.dashboard, state.reports, state.requests])

  if (state.loading) {
    return (
      <main className="space-y-6">
        <Skeleton className="h-28 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-96 w-full rounded-md" />
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="space-y-4">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm font-bold text-destructive">{state.error}</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (parsed.parseError) {
    return (
      <main className="space-y-4">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm font-bold text-destructive">{parsed.parseError}</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="space-y-5">
      <PageHeader
        title="Reports"
        description="Unified analytics for request intake, delivery speed, workload balance, and operational pressure."
        actions={
          <Button variant="outline" onClick={() => exportCsv('reports-summary.csv', parsed.summaryRows)} disabled={!canExportData}>
            <Download className="mr-2 h-4 w-4" /> Export summary
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="surface-card border-border/70 bg-card">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Requests</p>
                <HelpTip text="Total number of requests recorded in the selected scope." />
              </div>
              <div className="p-1 rounded bg-muted text-muted-foreground">
                <Inbox className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{parsed.totalRequests}</p>
            <p className="mt-1 text-xs text-muted-foreground">All time volume</p>
          </CardContent>
        </Card>

        <Card className="surface-card border-warning/40 bg-warning/12">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-warning">Open Queue</p>
                <HelpTip text="Requests currently in active workflow and not yet resolved." />
              </div>
              <div className="p-1 rounded bg-warning/20 text-warning">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{parsed.openQueue}</p>
            <p className="mt-1 text-xs text-muted-foreground">In active workflow</p>
          </CardContent>
        </Card>

        <Card className="surface-card border-success/40 bg-success/12">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-success">Resolved</p>
                <HelpTip text="Requests that reached completed or closed status." />
              </div>
              <div className="p-1 rounded bg-success/20 text-success">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{parsed.resolved}</p>
            <p className="mt-1 text-xs text-muted-foreground">Completed requests</p>
          </CardContent>
        </Card>

        <Card className="surface-card border-border/70 bg-card">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Avg Turnaround</p>
                <HelpTip text="Average time taken to resolve requests from creation to completion." />
              </div>
              <div className="p-1 rounded bg-muted text-muted-foreground">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{parsed.avgTurnaround}</p>
            <p className="mt-1 text-xs text-muted-foreground">Average delivery time</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="surface-card border-warning/40 bg-warning/12">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-warning">Unassigned</p>
                <HelpTip text="Open requests that still have no owner assigned." />
              </div>
              <div className="p-1 rounded bg-warning/20 text-warning">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{parsed.unassigned}</p>
            <p className="mt-1 text-xs text-muted-foreground">Needs ownership</p>
          </CardContent>
        </Card>

        <Card className="surface-card border-destructive/40 bg-destructive/12">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-destructive">Overdue</p>
                <HelpTip text="Open requests with a deadline date that has already passed." />
              </div>
              <div className="p-1 rounded bg-destructive/20 text-destructive">
                <AlertCircle className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{parsed.overdue}</p>
            <p className="mt-1 text-xs text-muted-foreground">Past due date</p>
          </CardContent>
        </Card>

        <Card className="surface-card border-success/40 bg-success/12">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-success">Resolution Rate</p>
                <HelpTip text="Percentage of resolved requests out of total requests in scope." />
              </div>
              <div className="p-1 rounded bg-success/20 text-success">
                <Target className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{parsed.resolutionRate}%</p>
            <p className="mt-1 text-xs text-muted-foreground">{parsed.resolved} closed in scope</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-elev-sm">
          <CardHeader className="flex-row items-center justify-between border-b bg-muted/20 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">Request Flow (Last 7 Days)</h3>
                <HelpTip text="Daily trend comparing newly created requests versus resolved requests." />
              </div>
              <p className="text-sm text-muted-foreground">Created vs resolved volume to monitor backlog trends.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportCsv('request-flow-7-days.csv', parsed.trend)} disabled={!canExportData}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </CardHeader>
          <CardContent className="p-5 pt-6">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={parsed.trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} dy={10} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip
                    contentStyle={{
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 6,
                      background: 'hsl(var(--card))',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      fontSize: '13px'
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Line type="monotone" dataKey="created" name="Created" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="resolved" name="Resolved" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-elev-sm flex flex-col">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">Control Metrics</h3>
              <HelpTip text="Key operational health indicators for fast decision support." />
            </div>
            <p className="text-sm text-muted-foreground">Quick health signals for review.</p>
          </CardHeader>
          <CardContent className="flex-1 p-5 grid grid-cols-1 gap-4">
            <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-elev-sm">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-muted-foreground">Resolution rate</p>
                  <HelpTip text="Share of requests successfully resolved in scope." />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Already delivered</p>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{parsed.resolutionRate}%</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-elev-sm">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-muted-foreground">Unassigned work</p>
                  <HelpTip text="Current requests waiting for someone to take ownership." />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Needs ownership</p>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{parsed.unassigned}</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-elev-sm">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-muted-foreground">Workload pressure</p>
                  <HelpTip text="Gap between demand (open queue) and resolved output." />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Demand vs completions</p>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{parsed.workloadPressure}</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-elev-sm">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-muted-foreground">Tracked units</p>
                  <HelpTip text="Number of teams/entities currently represented in volume analytics." />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Active sources</p>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{parsed.requestVolumeRows.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-elev-sm">
          <CardHeader className="flex-row items-center justify-between border-b bg-muted/20 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">Request Type Mix</h3>
                <HelpTip text="Distribution of requests by category/type to understand work composition." />
              </div>
              <p className="text-sm text-muted-foreground">Distribution of work categories.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportCsv('request-type-mix.csv', parsed.requestTypeMix)} disabled={!canExportData}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-6">
            {parsed.requestTypeMix.length ? (
              parsed.requestTypeMix.map((row) => {
                const pct = parsed.mixTotal ? Math.round((row.total / parsed.mixTotal) * 100) : 0
                return (
                  <div key={row.type} className="group">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{row.type}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-foreground">{row.total}</span>
                        <span className="ml-2 text-sm text-muted-foreground">({pct}%)</span>
                      </div>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <BarChart3 className="mb-2 h-8 w-8 opacity-20" />
                <p className="text-sm">No request type data available.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-elev-sm">
          <CardHeader className="flex-row items-center justify-between border-b bg-muted/20 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">Demand Concentration</h3>
                <HelpTip text="Shows which teams or units are carrying the highest request volume." />
              </div>
              <p className="text-sm text-muted-foreground">Where workload is accumulating.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportCsv('request-volume-distribution.csv', parsed.requestVolumeRows)} disabled={!canExportData}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-6">
            {parsed.requestVolumeRows.length ? (
              parsed.requestVolumeRows.map((row) => {
                const pct = parsed.totalRequests ? Math.round((row.total / parsed.totalRequests) * 100) : 0
                return (
                  <div key={row.name} className="group">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{row.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-foreground">{row.total}</span>
                        <span className="ml-2 text-sm text-muted-foreground">({pct}%)</span>
                      </div>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <BarChart3 className="mb-2 h-8 w-8 opacity-20" />
                <p className="text-sm">No activity data available.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {parsed.showExecutiveCards ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="shadow-elev-sm">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">Recent Movement</h3>
                <HelpTip text="Most recent request updates with actor, target, and current status." />
              </div>
              <p className="text-sm text-muted-foreground">Latest activity across your scope.</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {parsed.recentMovement.length ? (
                  parsed.recentMovement.map((item) => {
                    const statusClass = STATUS_BAR_CLASS[item.status] || 'bg-slate-500'
                    return (
                      <a key={item.id} href={`/requests/${item.id}`} className="group block p-4 transition-colors hover:bg-muted/30">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">{item.reference}</span>
                              <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                <div className={`h-1.5 w-1.5 rounded-full ${statusClass}`} />
                                {toTagLabel(item.status)}
                              </div>
                            </div>
                            <p className="font-medium text-foreground group-hover:text-primary transition-colors">{item.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.actor} &rarr; {item.target} • {item.when}
                            </p>
                          </div>
                          <ArrowUpRight className="mt-1 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </a>
                    )
                  })
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">No recent movement.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-elev-sm">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">Ownership Distribution</h3>
                <HelpTip text="How open requests are split across assignees to reveal balance or overload." />
              </div>
              <p className="text-sm text-muted-foreground">Active workload by assignee.</p>
            </CardHeader>
            <CardContent className="p-5 pt-6 space-y-4">
              {parsed.ownershipRows.length ? (
                parsed.ownershipRows.map((owner) => {
                  const initials = owner.name
                    .split(' ')
                    .filter(Boolean)
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                  return (
                    <div key={owner.name} className="flex items-center justify-between rounded-lg border bg-card p-3 shadow-elev-sm">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-primary-foreground bg-primary`}>
                          {initials || 'NA'}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{owner.name}</p>
                          <p className="text-xs text-muted-foreground">{owner.role}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold tabular-nums text-foreground">{owner.total}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open</p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Users className="mb-2 h-8 w-8 opacity-20" />
                  <p className="text-sm">No ownership data available.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="flex items-center justify-end">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Target className="h-3 w-3" /> Scope: {scopeLabel}
        </p>
      </div>
    </main>
  )
}

export default ReportsPage









