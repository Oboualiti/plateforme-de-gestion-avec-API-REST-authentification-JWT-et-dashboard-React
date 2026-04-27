import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  ArrowRight, 
  ArrowUpRight, 
  Building2, 
  CheckCheck, 
  ClipboardList, 
  PlusCircle, 
  UserRound, 
  Users,
  Inbox, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Activity, 
  Target, 
  FileText, 
  BarChart3,
  Briefcase,
  CircleHelp
} from 'lucide-react'

import { Avatar } from '../components/Avatar'
import PageHeader from '../components/layout/PageHeader'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../lib/constants'
import { api } from '../lib/api'

const STATUS_ORDER = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CLOSED']
const RESOLVED_SET = new Set(['COMPLETED', 'CLOSED'])
const ADMIN_REPORT_ROLES = new Set(['super_admin', 'senior', 'manager', 'team_leader'])

const STATUS_META = {
  NEW: { label: 'New', tone: 'bg-slate-100 text-slate-800 border-slate-500', bar: 'bg-warning' },
  ACCEPTED: { label: 'Accepted', tone: 'bg-blue-100 text-blue-800 border-blue-500', bar: 'bg-info' },
  IN_PROGRESS: { label: 'In progress', tone: 'bg-primary text-primary-foreground border-ink', bar: 'bg-primary' },
  COMPLETED: { label: 'Completed', tone: 'bg-emerald-100 text-emerald-800 border-emerald-500', bar: 'bg-success' },
  REJECTED: { label: 'Rejected', tone: 'bg-red-100 text-red-800 border-red-500', bar: 'bg-destructive' },
  CLOSED: { label: 'Closed', tone: 'bg-slate-200 text-slate-800 border-slate-600', bar: 'bg-foreground' },
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
  return user?.company_name || 'Personal scope'
}

function statusPillClass(status) {
  const tone = STATUS_META[status]?.tone || 'bg-slate-100 text-slate-800 border-slate-500'
  return `inline-flex items-center rounded-sm border-2 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${tone}`
}

function typePillClass(type) {
  let tone = 'bg-slate-100 text-slate-700 border-slate-500'
  if (type === 'SCRIPT') tone = 'bg-indigo-100 text-indigo-700 border-indigo-500'
  if (type === 'TOOL') tone = 'bg-cyan-100 text-cyan-700 border-cyan-500'
  if (type === 'APP_PROJECT') tone = 'bg-purple-100 text-purple-700 border-purple-500'
  return `inline-flex items-center rounded-sm border-2 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${tone}`
}

function toDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getRequestDeadline(item) {
  return item?.deadline_date || item?.deadlineDate || item?.deadline || item?.approximate_deadline || item?.due_date || item?.dueDate || null
}

function formatRelative(value) {
  const date = toDate(value)
  if (!date) return '-'
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} d ago`
}

function formatDue(value) {
  const date = toDate(value)
  if (!date) return 'No due date set'

  const diffMs = date.getTime() - Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  if (Math.abs(diffMs) < dayMs) {
    return diffMs >= 0 ? 'Due today' : 'Overdue today'
  }

  const diffDays = Math.round(Math.abs(diffMs) / dayMs)
  if (diffMs > 0) return 'Due in ' + diffDays + ' day' + (diffDays === 1 ? '' : 's')
  return 'Overdue by ' + diffDays + ' day' + (diffDays === 1 ? '' : 's')
}

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
function Dashboard() {
  const { user, loading: authLoading, refreshUser } = useAuth()
  const [dashboardState, setDashboardState] = useState({ loading: true, error: '', data: null })
  const [requestState, setRequestState] = useState({ loading: true, error: '', items: [] })

  const primaryRole = getPrimaryRole(user)
  const roleLabel = ROLE_LABELS[primaryRole] || 'User'
  const scope = getScopeForRole(primaryRole)
  const scopeLabel = getScopeLabel(primaryRole, user)
  const canAccessReports = ADMIN_REPORT_ROLES.has(primaryRole)
  const canReadGlobalDashboard = primaryRole === 'super_admin'
  const effectivePermissionKeys = useMemo(
    () => new Set(user?.effective_permission_keys || []),
    [user?.effective_permission_keys],
  )
  const canCreateRequest = Boolean(user?.request_creation_allowed) && effectivePermissionKeys.has('create_request')

  useEffect(() => {
    refreshUser().catch(() => {})
  }, [refreshUser])

  useEffect(() => {
    let active = true

    async function load() {
      setDashboardState({ loading: true, error: '', data: null })
      setRequestState({ loading: true, error: '', items: [] })

      const [dashboardResult, requestsResult] = await Promise.allSettled([
        canReadGlobalDashboard ? api.get('/admin/dashboard/') : Promise.resolve({ data: null }),
        api.get('/requests/', { params: { page: 1, page_size: 200, scope, skip_count: 1 } }),
      ])

      if (!active) return

      if (dashboardResult.status === 'fulfilled') {
        setDashboardState({ loading: false, error: '', data: dashboardResult.value.data || null })
      } else {
        setDashboardState({ loading: false, error: 'Could not load dashboard metrics.', data: null })
      }

      if (requestsResult.status === 'fulfilled') {
        const payload = requestsResult.value.data || {}
        const items = Array.isArray(payload.results) ? payload.results : Array.isArray(payload) ? payload : []
        setRequestState({ loading: false, error: '', items })
      } else {
        setRequestState({ loading: false, error: 'Could not load requests.', items: [] })
      }
    }

    if (user) load()
    return () => {
      active = false
    }
  }, [canReadGlobalDashboard, scope, user])

  const metrics = useMemo(() => {
    const items = requestState.items
    const statusCount = STATUS_ORDER.reduce((acc, key) => {
      acc[key] = items.filter((item) => item.status === key).length
      return acc
    }, {})

    const totalRequests = items.length
    const openRequests = items.filter((item) => !RESOLVED_SET.has(item.status) && item.status !== 'REJECTED').length
    const resolved = items.filter((item) => RESOLVED_SET.has(item.status)).length
    const unassigned = items.filter((item) => !item.assignee_name && !item.current_assignee__username).length
    const overdue = items.filter((item) => {
      const due = toDate(getRequestDeadline(item))
      return due && due.getTime() < Date.now() && !RESOLVED_SET.has(item.status)
    }).length

    const resolutionRate = totalRequests ? Math.round((resolved / totalRequests) * 100) : 0

    const identityNames = [
      user?.full_name,
      [user?.first_name, user?.last_name].filter(Boolean).join(' '),
      user?.username,
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)

    const submittedByMe = items.filter((item) => {
      const creatorId = item.created_by_id ?? item.creator_id ?? item.requester_id ?? item.created_by?.id
      if (creatorId && user?.id && Number(creatorId) === Number(user.id)) return true
      const creatorName = String(item.created_by_name || item.creator_name || item.requester_name || '').trim().toLowerCase()
      return creatorName && identityNames.includes(creatorName)
    }).length

    const attentionCount = overdue + unassigned
    const createdByTeam = Math.max(0, totalRequests - submittedByMe)

    const sortedRecent = [...items].sort((a, b) => {
      const aDate = +(toDate(a.updated_at || a.updatedAt || a.created_at || a.createdAt) || 0)
      const bDate = +(toDate(b.updated_at || b.updatedAt || b.created_at || b.createdAt) || 0)
      return bDate - aDate
    })

    const itemsWithDueDate = sortedRecent
      .filter((item) => toDate(getRequestDeadline(item)))
      .sort((a, b) => +(toDate(getRequestDeadline(a)) || 0) - +(toDate(getRequestDeadline(b)) || 0))

    const priorityWatch =
      itemsWithDueDate.find((item) => item.status === 'IN_PROGRESS') ||
      itemsWithDueDate[0] ||
      sortedRecent.find((item) => item.status === 'IN_PROGRESS') ||
      sortedRecent.find((item) => item.status === 'NEW') ||
      sortedRecent[0] ||
      null

    const byEntity = new Map()
    items.forEach((item) => {
      const code = item.target_entity_code || item.target_entity?.code || item.target_entity_name || 'Unknown'
      const name = item.target_entity_name || item.target_entity?.name || code
      const current = byEntity.get(code) || { code, name, count: 0 }
      current.count += 1
      byEntity.set(code, current)
    })

    const concentration = [...byEntity.values()].sort((a, b) => b.count - a.count).slice(0, 4)

    const byOwner = new Map()
    items
      .filter((item) => !RESOLVED_SET.has(item.status) && item.status !== 'REJECTED')
      .forEach((item) => {
        const name = item.assignee_name || item.current_assignee__username
        if (!name) return
        const current = byOwner.get(name) || {
          name,
          role: ROLE_LABELS[item.assignee_role] || 'User',
          count: 0,
        }
        current.count += 1
        byOwner.set(name, current)
      })

    const ownership = [...byOwner.values()].sort((a, b) => b.count - a.count).slice(0, 3)

    const memberSet = new Set()
    items.forEach((item) => {
      ;[item.created_by_name, item.creator_name, item.requester_name, item.assignee_name, item.current_assignee__username].forEach((name) => {
        const cleaned = String(name || '').trim()
        if (cleaned) memberSet.add(cleaned.toLowerCase())
      })
    })

    return {
      statusCount,
      totalRequests,
      openRequests,
      resolved,
      unassigned,
      overdue,
      submittedByMe,
      attentionCount,
      createdByTeam,
      resolutionRate,
      priorityWatch,
      concentration,
      ownership,
      activeEntities: byEntity.size,
      companyMembers: memberSet.size,
      recent: sortedRecent.slice(0, 5),
      recentCompact: sortedRecent.slice(0, 2),
    }
  }, [requestState.items, user])

  if (authLoading || dashboardState.loading || requestState.loading) {
    return (
      <main className="space-y-6">
        <Skeleton className="h-28 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-36 rounded-md" />
          ))}
        </div>
      </main>
    )
  }

  if (!user) return null

  if (primaryRole === 'user') {
    return (
      <main className="space-y-8">
        <PageHeader
          title={`Dashboard`}
          description={`${roleLabel} · ${scopeLabel} — personal operational overview.`}
          actions={canCreateRequest ? (
            <Button asChild>
              <Link to="/requests/create">
                <PlusCircle className="mr-1 h-4 w-4" /> New request
              </Link>
            </Button>
          ) : null}
        />

        {/* Compact Operational Summary */}
        <div className="flex flex-wrap items-center gap-8 rounded-sm border border-ink/10 bg-surface-2 p-6">
          <div>
            <div className="flex items-center gap-1">
              <p className="eyebrow">Active Scope</p>
              <HelpTip text="Shows which organization scope this dashboard currently summarizes." />
            </div>
            <p className="mt-1 text-xl font-bold">{scopeLabel}</p>
          </div>
          <div className="h-10 w-px bg-ink/10" />
          <div>
            <div className="flex items-center gap-1">
              <p className="eyebrow">Open Queue</p>
              <HelpTip text="Total active requests that are not yet resolved in this scope." />
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums">{metrics.openRequests}</p>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <p className="eyebrow">Unassigned</p>
              <HelpTip text="Open requests that still have no current assignee." />
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums text-warning">{metrics.unassigned}</p>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <p className="eyebrow">Overdue</p>
              <HelpTip text="Open requests with due dates that already passed." />
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums text-destructive">{metrics.overdue}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-sm border border-success/30 bg-success/5 px-3 py-2 text-success">
            <CheckCheck className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Stable Workflow</span>
          </div>
        </div>

        {/* Standardized KPI System */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="surface-card border-border/70 bg-card">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Requests</p>
                <div className="p-1 rounded bg-muted text-muted-foreground">
                  <Inbox className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.totalRequests}</p>
              <p className="mt-1 text-xs text-muted-foreground">Recorded demand in scope</p>
            </CardContent>
          </Card>

          <Card className="surface-card border-warning/40 bg-warning/12">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-bold uppercase tracking-wider text-warning">Status Overview</p>
                <div className="p-1 rounded bg-warning/20 text-warning">
                  <AlertCircle className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.attentionCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Items needing attention</p>
            </CardContent>
          </Card>

          <Card className="surface-card border-warning/40 bg-warning/12">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-bold uppercase tracking-wider text-warning">Open Requests</p>
                <div className="p-1 rounded bg-warning/20 text-warning">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.openRequests}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metrics.unassigned} pending assignment</p>
            </CardContent>
          </Card>

          <Card className="surface-card border-success/40 bg-success/12">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-bold uppercase tracking-wider text-success">Resolution Rate</p>
                <div className="p-1 rounded bg-success/20 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.resolutionRate}%</p>
              <p className="mt-1 text-xs text-muted-foreground">{metrics.resolved} closed items</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Analytical Drilldown: Lifecycle */}
          <Card className="border-ink/5 shadow-none">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <div>
                <p className="eyebrow">Flow Analysis</p>
                <h3 className="text-lg font-bold">Request Life Cycle</h3>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/requests">Full queue</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="space-y-1">
                {STATUS_ORDER.map((status) => {
                  const count = metrics.statusCount[status] || 0
                  const pct = metrics.totalRequests ? Math.round((count / metrics.totalRequests) * 100) : 0
                  return (
                    <div key={status} className="group relative flex items-center gap-4 py-2">
                      <div className="flex w-24 flex-shrink-0 items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${STATUS_META[status].bar}`} />
                        <span className="text-xs font-bold uppercase tracking-tight text-muted-foreground">{STATUS_META[status].label}</span>
                      </div>
                      <div className="relative h-2 flex-grow overflow-hidden rounded-full bg-muted/30">
                        <div
                          className={`h-full opacity-70 ${STATUS_META[status].bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex w-20 flex-shrink-0 items-center justify-end gap-3 text-right">
                        <span className="text-sm font-bold tabular-nums">{count}</span>
                        <span className="w-8 text-[10px] font-medium text-muted-foreground">{pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-ink/5 shadow-none">
            <CardHeader className="pb-2">
              <p className="eyebrow">Operational Feed</p>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Recent Activity</h3>
                <HelpTip text="Latest requests updated in this scope, including requester, status, and last activity time." />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-ink/5">
                {metrics.recentCompact.length ? (
                  metrics.recentCompact.map((item) => (
                    <Link
                      key={item.id}
                      to={`/requests/${item.id}`}
                      className="group flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-grow">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-foreground group-hover:text-primary">
                            {item.title || 'Untitled request'}
                          </span>
                          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                            {item.reference_code || item.request_number || '-'}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.created_by_name || item.creator_name || 'System'} · {item.target_entity_code || 'N/A'}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-4 text-right">
                        <div className="hidden sm:block">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {formatRelative(item.updated_at || item.created_at)}
                          </p>
                          <span className={`text-[10px] font-bold ${(item.status === 'CLOSED' || item.status === 'REJECTED') ? 'text-muted-foreground' : 'text-primary'}`}>
                            {STATUS_META[item.status]?.label || item.status}
                          </span>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 transition-colors group-hover:text-primary" />
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="px-5 py-8 text-center text-xs text-muted-foreground">No recent activity detected.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {(dashboardState.error || requestState.error) && (
          <p className="text-xs font-medium text-destructive">{dashboardState.error || requestState.error}</p>
        )}
      </main>
    )
  }




  if (primaryRole === 'manager' || primaryRole === 'team_leader') {
    return (
      <main className="space-y-8">
        <PageHeader
          title={`Dashboard`}
          description={`${roleLabel} · ${scopeLabel} — team operational workspace.`}
          actions={canCreateRequest ? (
            <Button asChild>
              <Link to="/requests/create">
                <PlusCircle className="mr-1 h-4 w-4" /> New request
              </Link>
            </Button>
          ) : null}
        />

        {/* Compact Operational Summary */}
        <div className="flex flex-wrap items-center gap-8 rounded-sm border border-ink/10 bg-surface-2 p-6">
          <div>
            <div className="flex items-center gap-1">
              <p className="eyebrow">Active Scope</p>
              <HelpTip text="Shows which organization scope this dashboard currently summarizes." />
            </div>
            <p className="mt-1 text-xl font-bold">{scopeLabel}</p>
          </div>
          <div className="h-10 w-px bg-ink/10" />
          <div>
            <div className="flex items-center gap-1">
              <p className="eyebrow">Open Queue</p>
              <HelpTip text="Total active requests that are not yet resolved in this scope." />
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums">{metrics.openRequests}</p>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <p className="eyebrow">Unassigned</p>
              <HelpTip text="Open requests that still have no current assignee." />
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums text-warning">{metrics.unassigned}</p>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <p className="eyebrow">Overdue</p>
              <HelpTip text="Open requests with due dates that already passed." />
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums text-destructive">{metrics.overdue}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-sm border border-success/30 bg-success/5 px-3 py-2 text-success">
            <CheckCheck className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Stable Workflow</span>
          </div>
        </div>

        {/* Standardized KPI System */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="surface-card border-border/70 bg-card">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Team Queue</p>
                  <HelpTip text="All open requests currently under your team scope." />
                </div>
                <div className="p-1 rounded bg-muted text-muted-foreground">
                  <ClipboardList className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.openRequests}</p>
              <p className="mt-1 text-xs text-muted-foreground">Requests needing coordination</p>
            </CardContent>
          </Card>

          <Card className="surface-card border-border/70 bg-card">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Units in Focus</p>
                  <HelpTip text="Number of entities currently generating workload in your scope." />
                </div>
                <div className="p-1 rounded bg-muted text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.concentration.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Active platform entities</p>
            </CardContent>
          </Card>

          <Card className="surface-card border-warning/40 bg-warning/12">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-warning">Need Attention</p>
                  <HelpTip text="Combined count of unassigned and overdue requests." />
                </div>
                <div className="p-1 rounded bg-warning/20 text-warning">
                  <AlertCircle className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.attentionCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metrics.overdue} overdue items</p>
            </CardContent>
          </Card>

          <Card className="surface-card border-success/40 bg-success/12">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-success">Resolved in Scope</p>
                  <HelpTip text="Requests completed or closed in the current scope." />
                </div>
                <div className="p-1 rounded bg-success/20 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.resolved}</p>
              <p className="mt-1 text-xs text-muted-foreground">Closed or completed work</p>
            </CardContent>
          </Card>
        </div>

        {/* Analytical Drilldowns */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Life Cycle */}
          <Card className="border-ink/5 shadow-none">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <div>
                <p className="eyebrow">Flow Analysis</p>
                <h3 className="text-lg font-bold">Request Life Cycle</h3>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/requests">Full queue</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="space-y-1">
                {STATUS_ORDER.map((status) => {
                  const count = metrics.statusCount[status] || 0
                  const pct = metrics.totalRequests ? Math.round((count / metrics.totalRequests) * 100) : 0
                  return (
                    <div key={status} className="group relative flex items-center gap-4 py-2">
                      <div className="flex w-24 flex-shrink-0 items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${STATUS_META[status].bar}`} />
                        <span className="text-xs font-bold uppercase tracking-tight text-muted-foreground">{STATUS_META[status].label}</span>
                      </div>
                      <div className="relative h-2 flex-grow overflow-hidden rounded-full bg-muted/30">
                        <div
                          className={`h-full opacity-70 ${STATUS_META[status].bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex w-20 flex-shrink-0 items-center justify-end gap-3 text-right">
                        <span className="text-sm font-bold tabular-nums">{count}</span>
                        <span className="w-8 text-[10px] font-medium text-muted-foreground">{pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Workload Concentration */}
          <Card className="border-ink/5 shadow-none">
            <CardHeader className="pb-2">
              <p className="eyebrow">Operational Pressure</p>
              <h3 className="text-lg font-bold">Workload Concentration</h3>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="divide-y divide-ink/5">
                {metrics.concentration.length ? (
                  metrics.concentration.map((entity) => (
                    <div key={entity.code} className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold uppercase tracking-tight text-foreground">{entity.code}</p>
                        <p className="truncate text-xs text-muted-foreground">{entity.name}</p>
                      </div>
                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-lg font-bold tabular-nums">{entity.count}</p>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Volume</p>
                        </div>
                        <div className="h-8 w-1 rounded-full bg-ink/10">
                          <div
                            className="w-full rounded-full bg-warning"
                            style={{ height: `${Math.min(100, (entity.count / (metrics.totalRequests || 1)) * 300)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-xs text-muted-foreground">No distribution data recorded.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-ink/5 shadow-none">
            <CardHeader className="pb-2">
              <p className="eyebrow">Operational Feed</p>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Recent Activity</h3>
                <HelpTip text="Latest requests updated in this scope, including requester, status, and last activity time." />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-ink/5">
                {metrics.recent.length ? (
                  metrics.recent.slice(0, 6).map((item) => (
                    <Link
                      key={item.id}
                      to={`/requests/${item.id}`}
                      className="group flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-grow">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-foreground group-hover:text-primary">
                            {item.title || 'Untitled request'}
                          </span>
                          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                            {item.reference_code || item.request_number || '-'}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.created_by_name || item.creator_name || 'System'} · {item.target_entity_code || 'N/A'}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-4 text-right">
                        <div className="hidden sm:block">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {formatRelative(item.updated_at || item.created_at)}
                          </p>
                          <span className={`text-[10px] font-bold ${(item.status === 'CLOSED' || item.status === 'REJECTED') ? 'text-muted-foreground' : 'text-primary'}`}>
                            {STATUS_META[item.status]?.label || item.status}
                          </span>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 transition-colors group-hover:text-primary" />
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="px-5 py-8 text-center text-xs text-muted-foreground">No recent activity detected.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Ownership Distribution */}
          <Card className="border-ink/10 shadow-none">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-semibold text-foreground">Ownership Distribution</CardTitle>
                <HelpTip text="Shows how open requests are distributed across assignees to highlight workload balance." />
              </div>
              <CardDescription className="text-sm text-muted-foreground">Request load by team member.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {metrics.ownership.length ? (
                metrics.ownership.slice(0, 5).map((owner) => (
                  <div key={owner.name} className="flex items-center justify-between rounded-lg border bg-card p-3 shadow-elev-sm">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-primary-foreground bg-primary`}>
                        {owner.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{owner.name}</p>
                        <p className="text-xs text-muted-foreground">{owner.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold tabular-nums text-foreground">{owner.count}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Users className="mb-2 h-8 w-8 opacity-20" />
                  <p className="text-sm">No ownership data available.</p>
                </div>
              )}
              {metrics.unassigned > 0 && (
                <div className="mt-6 flex items-center justify-between border-t border-ink/5 pt-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                    <p className="text-xs font-bold uppercase tracking-tight text-warning">Coverage Risk</p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-warning">{metrics.unassigned} items unassigned</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {(dashboardState.error || requestState.error) && (
          <p className="text-xs font-medium text-destructive">{dashboardState.error || requestState.error}</p>
        )}
      </main>
    )
  }
  if (primaryRole === 'senior' || primaryRole === 'super_admin') {
    return (
      <main className="space-y-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold tracking-tight">Platform Overview</h1>
          <p className="text-sm text-muted-foreground">{roleLabel} · {scopeLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-8 rounded-sm border border-ink/10 bg-surface-2 p-6">
          <div>
            <p className="eyebrow">Active Scope</p>
            <p className="mt-1 text-xl font-bold">{scopeLabel}</p>
          </div>
          <div className="h-10 w-px bg-ink/10" />
          <div>
            <p className="eyebrow">Open Queue</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{metrics.openRequests}</p>
          </div>
          <div>
            <p className="eyebrow">Unassigned</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-warning">{metrics.unassigned}</p>
          </div>
          <div>
            <p className="eyebrow">Overdue</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-destructive">{metrics.overdue}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-sm border border-success/30 bg-success/5 px-3 py-2 text-success">
            <CheckCheck className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Stable Workflow</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-ink/10 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow">Active entities</p>
                    <HelpTip text="Number of target entities currently receiving requests in this scope." />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums">{metrics.activeEntities}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Online scope footprint</p>
                </div>
                <Building2 className="h-5 w-5 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-ink/10 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow">Company members</p>
                    <HelpTip text="Count of distinct active users appearing across requests in this scope." />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{metrics.companyMembers}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Active platform accounts</p>
                </div>
                <Users className="h-5 w-5 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-warning/30 bg-warning/5 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow text-warning">Open requests</p>
                    <HelpTip text="All unresolved requests currently in progress or waiting action." />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{metrics.openRequests}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{metrics.unassigned} pending assignment</p>
                </div>
                <div className="rounded-sm bg-warning/10 p-2">
                  <ClipboardList className="h-5 w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-success/30 bg-success/5 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow text-success">Resolution rate</p>
                    <HelpTip text="Percentage of requests resolved (completed or closed) out of total requests." />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{metrics.resolutionRate}%</p>
                  <p className="mt-1 text-sm text-muted-foreground">{metrics.resolved} closed in scope</p>
                </div>
                <div className="rounded-sm bg-success/10 p-2">
                  <CheckCheck className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>


        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-ink/5 shadow-none">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <div>
                <p className="eyebrow">Flow Analysis</p>
                <div className="flex items-center gap-1">
                  <h3 className="text-lg font-bold">Request Lifecycle</h3>
                  <HelpTip text="Status distribution of requests to show where work is currently concentrated." />
                </div>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/requests">Full queue</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="space-y-1">
                {STATUS_ORDER.map((status) => {
                  const count = metrics.statusCount[status] || 0
                  const pct = metrics.totalRequests ? Math.round((count / metrics.totalRequests) * 100) : 0
                  return (
                    <div key={status} className="group relative flex items-center gap-4 py-2">
                      <div className="flex w-24 flex-shrink-0 items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${STATUS_META[status].bar}`} />
                        <span className="text-xs font-bold uppercase tracking-tight text-muted-foreground">{STATUS_META[status].label}</span>
                      </div>
                      <div className="relative h-2 flex-grow overflow-hidden rounded-full bg-muted/30">
                        <div className={`h-full opacity-70 ${STATUS_META[status].bar}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex w-20 flex-shrink-0 items-center justify-end gap-3 text-right">
                        <span className="text-sm font-bold tabular-nums">{count}</span>
                        <span className="w-8 text-[10px] font-medium text-muted-foreground">{pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-ink/5 shadow-none">
            <CardHeader className="pb-2">
              <p className="eyebrow">Operational Pressure</p>
              <div className="flex items-center gap-1">
                <h3 className="text-lg font-bold">Workload Concentration</h3>
                <HelpTip text="Shows which entities carry the highest request volume right now." />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="divide-y divide-ink/5">
                {metrics.concentration.length ? (
                  metrics.concentration.map((entity) => (
                    <div key={entity.code} className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold uppercase tracking-tight text-foreground">{entity.code}</p>
                        <p className="truncate text-xs text-muted-foreground">{entity.name}</p>
                      </div>
                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-lg font-bold tabular-nums">{entity.count}</p>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Volume</p>
                        </div>
                        <div className="h-8 w-1 rounded-full bg-ink/10">
                          <div
                            className="w-full rounded-full bg-warning"
                            style={{ height: `${Math.min(100, (entity.count / (metrics.totalRequests || 1)) * 300)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-xs text-muted-foreground">No distribution data recorded.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>


        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-ink/5 shadow-none">
            <CardHeader className="pb-2">
              <p className="eyebrow">Operational Feed</p>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Recent Activity</h3>
                <HelpTip text="Latest requests updated in this scope, including requester, status, and last activity time." />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-ink/5">
                {metrics.recent.length ? (
                  metrics.recent.slice(0, 6).map((item) => (
                    <Link
                      key={item.id}
                      to={`/requests/${item.id}`}
                      className="group flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-grow">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-foreground group-hover:text-primary">
                            {item.title || 'Untitled request'}
                          </span>
                          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                            {item.reference_code || item.request_number || '-'}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.created_by_name || item.creator_name || 'System'} · {item.target_entity_code || 'N/A'}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-4 text-right">
                        <div className="hidden sm:block">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {formatRelative(item.updated_at || item.created_at)}
                          </p>
                          <span className={`text-[10px] font-bold ${(item.status === 'CLOSED' || item.status === 'REJECTED') ? 'text-muted-foreground' : 'text-primary'}`}>
                            {STATUS_META[item.status]?.label || item.status}
                          </span>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 transition-colors group-hover:text-primary" />
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="px-5 py-8 text-center text-xs text-muted-foreground">No recent activity detected.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-ink/5 shadow-none">
            <CardHeader className="pb-2">
              <p className="eyebrow">Workforce Coverage</p>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Ownership Distribution</h3>
                <HelpTip text="Shows how open requests are distributed across assignees to highlight workload balance." />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="space-y-4">
                {metrics.ownership.length ? (
                  metrics.ownership.slice(0, 3).map((owner) => (
                    <div key={owner.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-ink/10 bg-surface-2 text-[10px] font-bold uppercase">
                          {owner.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">{owner.name}</p>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{owner.role}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold tabular-nums">{owner.count}</p>
                        <p className="text-[10px] font-medium text-muted-foreground">Assigned items</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-xs text-muted-foreground">No active assignments in this scope.</p>
                )}
                {metrics.unassigned > 0 && (
                  <div className="mt-6 flex items-center justify-between border-t border-ink/5 pt-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                      <p className="text-xs font-bold uppercase tracking-tight text-warning">Coverage Risk</p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-warning">{metrics.unassigned} items unassigned</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {(dashboardState.error || requestState.error) && (
          <p className="text-xs font-medium text-destructive">{dashboardState.error || requestState.error}</p>
        )}
      </main>
    )
  }
  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Platform Overview</h1>
        <p className="text-sm text-muted-foreground">{roleLabel} · {scopeLabel}</p>
      </div>

      <div className="flex flex-wrap items-center gap-8 rounded-sm border border-ink/10 bg-surface-2 p-6">
        <div>
          <div className="flex items-center gap-1">
            <p className="eyebrow">Active Scope</p>
            <HelpTip text="Shows which organization scope this dashboard currently summarizes." />
          </div>
          <p className="mt-1 text-xl font-bold">{scopeLabel}</p>
        </div>
        <div className="h-10 w-px bg-ink/10" />
        <div>
          <div className="flex items-center gap-1">
            <p className="eyebrow">Open Queue</p>
            <HelpTip text="Total active requests that are not yet resolved in this scope." />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums">{metrics.openRequests}</p>
        </div>
        <div>
          <div className="flex items-center gap-1">
            <p className="eyebrow">Unassigned</p>
            <HelpTip text="Open requests that still have no current assignee." />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-warning">{metrics.unassigned}</p>
        </div>
        <div>
          <div className="flex items-center gap-1">
            <p className="eyebrow">Overdue</p>
            <HelpTip text="Open requests with due dates that already passed." />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-destructive">{metrics.overdue}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-sm border border-success/30 bg-success/5 px-3 py-2 text-success">
          <CheckCheck className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Operational Health Stable</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-ink/10 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <p className="eyebrow">Total requests</p>
                  <HelpTip text="Total number of requests recorded in the current scope." />
                </div>
                <p className="mt-2 text-4xl font-bold tabular-nums">{metrics.totalRequests}</p>
                <p className="mt-1 text-sm text-muted-foreground">Recorded demand in scope</p>
              </div>
              <Building2 className="h-5 w-5 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-ink/10 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">{canReadGlobalDashboard ? 'Global users' : 'Units in scope'}</p>
                <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{canReadGlobalDashboard ? dashboardState.data?.totals?.users || 0 : metrics.concentration.length}</p>
                <p className="mt-1 text-sm text-muted-foreground">Active platform entities</p>
              </div>
              <Users className="h-5 w-5 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-warning/30 bg-warning/5 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <p className="eyebrow text-warning">Open requests</p>
                  <HelpTip text="All unresolved requests currently in progress or waiting action." />
                </div>
                <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{metrics.openRequests}</p>
                <p className="mt-1 text-sm text-muted-foreground">{metrics.unassigned} pending assignment</p>
              </div>
              <div className="rounded-sm bg-warning/10 p-2">
                <ClipboardList className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-success/30 bg-success/5 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <p className="eyebrow text-success">Resolution rate</p>
                  <HelpTip text="Percentage of requests resolved (completed or closed) out of total requests." />
                </div>
                <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{metrics.resolutionRate}%</p>
                <p className="mt-1 text-sm text-muted-foreground">{metrics.resolved} closed items</p>
              </div>
              <div className="rounded-sm bg-success/10 p-2">
                <CheckCheck className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {(dashboardState.error || requestState.error) && (
        <p className="text-xs font-medium text-destructive">{dashboardState.error || requestState.error}</p>
      )}
    </main>
  )
}

export default Dashboard






