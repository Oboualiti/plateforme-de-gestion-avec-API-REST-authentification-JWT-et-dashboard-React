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
import { Download } from 'lucide-react'

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

function getScopeForRole(role) {
  if (role === 'super_admin') return 'all'
  if (role === 'senior') return 'company'
  if (role === 'manager') return 'entity'
  if (role === 'team_leader') return 'team-all'
  return 'mine'
}

function getScopeLabel(role, user) {
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

function ReportsPage() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', reports: null, dashboard: null, requests: [] })

  const role = getPrimaryRole(user)
  const scope = getScopeForRole(role)
  const scopeLabel = getScopeLabel(role, user)
  const isSuperAdmin = role === 'super_admin'

  useEffect(() => {
    let active = true

    async function load() {
      setState({ loading: true, error: '', reports: null, dashboard: null, requests: [] })

      const [reportsRes, dashboardRes, requestsRes] = await Promise.allSettled([
        isSuperAdmin ? api.get('/admin/reports/') : Promise.resolve({ data: null }),
        isSuperAdmin ? api.get('/admin/dashboard/') : Promise.resolve({ data: null }),
        api.get('/requests/', { params: { page: 1, page_size: 400, scope } }),
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
  }, [isSuperAdmin, scope, user])

  const parsed = useMemo(() => {
    const reports = state.reports || {}
    const dashboard = state.dashboard || {}
    const items = state.requests || []

    const totalRequests = isSuperAdmin ? dashboard.totals?.requests || items.length : items.length
    const openQueue = isSuperAdmin
      ? (dashboard.queue?.open ?? items.filter((item) => ACTIVE_SET.has(item.status)).length)
      : items.filter((item) => ACTIVE_SET.has(item.status)).length
    const resolved = isSuperAdmin
      ? (dashboard.open_vs_resolved?.resolved ?? items.filter((item) => RESOLVED_SET.has(item.status)).length)
      : items.filter((item) => RESOLVED_SET.has(item.status)).length
    const unassigned = isSuperAdmin
      ? (dashboard.queue?.unassigned ?? items.filter((item) => !item.assignee_name && !item.current_assignee__username).length)
      : items.filter((item) => !item.assignee_name && !item.current_assignee__username).length

    const avgDays = avgResolutionDays(items)
    const avgTurnaround = avgDays ? `${avgDays.toFixed(1)}d` : '0.0d'

    const overdue = items.filter((item) => {
      const due = toDate(item.due_date || item.dueDate)
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

    const companyRows = (reports.request_volume_by_company || [])
      .map((entry) => ({
        name: cleanLabel(entry.company_name || entry['company__name'], 'Unspecified company'),
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
      companyRows: isSuperAdmin ? companyRows : unitRows,
      summaryRows,
    }
  }, [isSuperAdmin, state.dashboard, state.reports, state.requests])

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

  return (
    <main className="space-y-6">
      <PageHeader
        title="Reports"
        description="Unified analytics for request intake, delivery speed, workload balance, and operational pressure."
        actions={
          <Button variant="outline" onClick={() => exportCsv('reports-summary.csv', parsed.summaryRows)}>
            <Download className="mr-2 h-4 w-4" /> Export summary
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-6 p-5 lg:grid-cols-[1fr_410px]">
          <div>
            <p className="eyebrow">Performance Center</p>
            <h2 className="mt-2 text-4xl font-extrabold uppercase leading-tight">Make Platform Activity Easy To Read At A Glance</h2>
            <p className="mt-4 text-sm text-muted-foreground">
              These reports highlight demand, delivery speed, ownership gaps, and workload concentration so the next action is obvious.
            </p>
          </div>
          <div className="space-y-3">
            <div className="rounded-sm border-2 border-ink bg-secondary p-4 text-secondary-foreground shadow-elev-sm">
              <p className="text-xs font-extrabold uppercase tracking-wider text-secondary-foreground/80">Current Scope</p>
              <p className="mt-1 text-4xl font-bold leading-tight">{scopeLabel}</p>
              <p className="text-sm text-secondary-foreground/85">Role-scoped reporting</p>
            </div>
            <div className="rounded-sm border-2 border-dashed border-ink p-4">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Primary Issue</p>
              <p className="mt-1 text-4xl font-bold text-foreground">{parsed.unassigned} requests need an owner</p>
              <p className="text-sm text-muted-foreground">Use this page to spot what needs follow-up first.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="p-5">
            <p className="eyebrow">Total requests</p>
            <p className="mt-2 text-5xl font-bold tabular-nums">{parsed.totalRequests}</p>
            <p className="mt-2 text-sm text-muted-foreground">All recorded demand</p>
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-primary-foreground/80">Open queue</p>
            <p className="mt-2 text-5xl font-bold tabular-nums">{parsed.openQueue}</p>
            <p className="mt-2 text-sm text-primary-foreground/80">{parsed.unassigned} still unassigned</p>
          </CardContent>
        </Card>

        <Card className="bg-success text-success-foreground">
          <CardContent className="p-5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-success-foreground/80">Resolved</p>
            <p className="mt-2 text-5xl font-bold tabular-nums">{parsed.resolved}</p>
            <p className="mt-2 text-sm text-success-foreground/85">Completed or closed work items</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="eyebrow">Avg turnaround</p>
            <p className="mt-2 text-5xl font-bold tabular-nums">{parsed.avgTurnaround}</p>
            <p className="mt-2 text-sm text-muted-foreground">Average time from creation to resolution</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="eyebrow">Overdue</p>
            <p className="mt-2 text-5xl font-bold tabular-nums">{parsed.overdue}</p>
            <p className="mt-2 text-sm text-muted-foreground">Open items beyond due date</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <p className="eyebrow">Analytics</p>
              <h3 className="text-4xl font-extrabold uppercase">Request Flow Over The Last 7 Days</h3>
              <p className="mt-1 text-sm text-muted-foreground">Created vs resolved volume to quickly see if backlog is growing or shrinking.</p>
            </div>
            <Button variant="outline" onClick={() => exportCsv('request-flow-7-days.csv', parsed.trend)}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent className="p-5 pt-4">
            <div className="h-[330px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={parsed.trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="5 5" stroke="hsl(var(--ink) / 0.28)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      border: '2px solid hsl(var(--ink))',
                      borderRadius: 4,
                      background: 'hsl(var(--card))',
                      fontWeight: 700,
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="created" name="Created" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="resolved" name="Resolved" stroke="hsl(var(--success))" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="eyebrow">Analytics</p>
            <h3 className="text-4xl font-extrabold uppercase">Control Metrics</h3>
            <p className="mt-1 text-sm text-muted-foreground">Quick health signals for leadership review.</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 p-5 pt-4">
            <div className="rounded-sm border border-ink/40 p-3">
              <p className="eyebrow">Resolution rate</p>
              <p className="mt-1 text-5xl font-bold">{parsed.resolutionRate}%</p>
              <p className="mt-2 text-sm text-muted-foreground">Share of total requests already delivered.</p>
            </div>
            <div className="rounded-sm border border-ink/40 p-3">
              <p className="eyebrow">Unassigned work</p>
              <p className="mt-1 text-5xl font-bold">{parsed.unassigned}</p>
              <p className="mt-2 text-sm text-muted-foreground">Open items that still need ownership.</p>
            </div>
            <div className="rounded-sm border border-ink/40 p-3">
              <p className="eyebrow">Workload pressure</p>
              <p className="mt-1 text-5xl font-bold">{parsed.workloadPressure}</p>
              <p className="mt-2 text-sm text-muted-foreground">Positive means incoming demand is ahead of completions.</p>
            </div>
            <div className="rounded-sm border border-ink/40 p-3">
              <p className="eyebrow">Tracked units</p>
              <p className="mt-1 text-5xl font-bold">{parsed.companyRows.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">Active companies/units with measurable request volume.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <p className="eyebrow">Analytics</p>
              <h3 className="text-4xl font-extrabold uppercase">Status Distribution</h3>
            </div>
            <Button variant="outline" onClick={() => exportCsv('status-distribution.csv', parsed.statusDistribution)}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-4">
            {parsed.statusDistribution.length ? (
              parsed.statusDistribution.map((row) => {
                const pct = parsed.totalRequests ? Math.round((row.total / parsed.totalRequests) * 100) : 0
                return (
                  <div key={row.status} className="rounded-sm border border-ink/30 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-bold uppercase text-foreground">{row.status.replaceAll('_', ' ')}</p>
                      <p className="text-sm font-bold tabular-nums text-muted-foreground">{row.total}</p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full border border-ink/35 bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-muted-foreground">No status distribution data.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <p className="eyebrow">Analytics</p>
              <h3 className="text-4xl font-extrabold uppercase">{isSuperAdmin ? 'Activity By Company' : 'Activity By Unit'}</h3>
            </div>
            <Button variant="outline" onClick={() => exportCsv('activity-distribution.csv', parsed.companyRows)}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-4">
            {parsed.companyRows.length ? (
              parsed.companyRows.map((row) => (
                <div key={row.name} className="flex items-center justify-between rounded-sm border border-ink/40 p-3">
                  <div>
                    <p className="text-xl font-bold text-foreground">{row.name}</p>
                    <p className="text-sm text-muted-foreground">request volume</p>
                  </div>
                  <p className="text-4xl font-bold tabular-nums text-foreground">{row.total}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No activity data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">Scope: {scopeLabel}</p>
    </main>
  )
}

export default ReportsPage




