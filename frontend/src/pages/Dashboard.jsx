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
import { useScopedRequests } from '../lib/requestsQueries'

const STATUS_ORDER = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CLOSED']
const RESOLVED_SET = new Set(['COMPLETED', 'CLOSED'])
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

function getScopeForRole(role, analyticsScope) {
  if (analyticsScope === 'global') return 'all'
  if (analyticsScope === 'company') return 'company'
  if (analyticsScope === 'entity') return 'entity'
  if (analyticsScope === 'team') return 'team-all'
  if (analyticsScope === 'own') return 'mine'
  if (role === 'super_admin') return 'all'
  if (role === 'senior') return 'company'
  if (role === 'manager') return 'entity'
  if (role === 'team_leader') return 'team-all'
  return 'mine'
}

function getScopeLabel(role, user) {
  if (user?.analytics_scope === 'global') return 'Global platform'
  if (user?.analytics_scope === 'company') return user?.company_name || 'Company scope'
  if (user?.analytics_scope === 'entity') return user?.entity_name || 'Entity scope'
  if (user?.analytics_scope === 'team') return user?.entity_name || 'Team scope'
  if (user?.analytics_scope === 'own') return user?.company_name || 'Personal scope'
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

  const primaryRole = getPrimaryRole(user)
  const roleLabel = ROLE_LABELS[primaryRole] || 'User'
  const dashboardProfile = user?.dashboard_profile || 'requester'
  const isResolverProfile = dashboardProfile === 'resolver'
  const isScopedResolverProfile = dashboardProfile === 'team_resolver' || dashboardProfile === 'entity_resolver'
  const scope = getScopeForRole(primaryRole, user?.analytics_scope)
  const scopeLabel = getScopeLabel(primaryRole, user)
  const canShowGlobalDashboardTotals = user?.analytics_scope === 'global'
  const effectivePermissionKeys = useMemo(
    () => new Set(user?.effective_permission_keys || []),
    [user?.effective_permission_keys],
  )
  const canCreateRequest = Boolean(user?.request_creation_allowed) && effectivePermissionKeys.has('create_request')
  const requestsQuery = useScopedRequests(scope, { enabled: Boolean(user) })
  const ownRequestsQuery = useScopedRequests('mine', { enabled: Boolean(user && primaryRole === 'user') })
  const resolverRequestsQuery = useScopedRequests('all', { enabled: Boolean(user && primaryRole === 'user' && isResolverProfile) })
  const requestState = {
    loading: requestsQuery.isLoading
      || (primaryRole === 'user' && ownRequestsQuery.isLoading)
      || (primaryRole === 'user' && isResolverProfile && resolverRequestsQuery.isLoading),
    error: requestsQuery.error?.response?.data?.detail
      || ownRequestsQuery.error?.response?.data?.detail
      || resolverRequestsQuery.error?.response?.data?.detail
      || (requestsQuery.error || ownRequestsQuery.error || resolverRequestsQuery.error ? 'Could not load requests.' : ''),
    items: requestsQuery.data?.items || [],
  }

  useEffect(() => {
    refreshUser().catch(() => {})
  }, [refreshUser])

  useEffect(() => {
    let active = true

    async function load() {
      setDashboardState({ loading: true, error: '', data: null })

      try {
        const dashboardResult = await api.get('/admin/dashboard/')
        if (active) {
          setDashboardState({ loading: false, error: '', data: dashboardResult.data || null })
        }
      } catch {
        if (active) {
          setDashboardState({ loading: false, error: 'Could not load dashboard metrics.', data: null })
        }
      }
    }

    if (user) load()
    return () => {
      active = false
    }
  }, [user])

  const metrics = useMemo(() => {
    const summary = requestsQuery.data?.summary || {}
    const dashboard = dashboardState.data || {}
    const dashboardStatusRows = Array.isArray(dashboard.requests_by_status) ? dashboard.requests_by_status : []
    const dashboardStatusCounts = dashboardStatusRows.reduce((acc, item) => {
      acc[item.status] = Number(item.total || 0)
      return acc
    }, {})
    const dashboardOwnership = Array.isArray(dashboard.team_workload)
      ? dashboard.team_workload
        .filter((item) => item.current_assignee__username)
        .map((item) => ({
          name: item.current_assignee__username,
          role: 'User',
          count: Number(item.total || 0),
        }))
      : []
    const dashboardConcentration = Array.isArray(dashboard.requests_by_entity)
      ? dashboard.requests_by_entity
        .map((item) => ({
          name: item.target_entity__name
            || item.current_assignee__entity__name
            || item.requester_user__entity__name
            || item.company__name,
          total: item.total,
        }))
        .filter((item) => item.name)
        .map((item) => ({
          code: item.name,
          name: item.name,
          count: Number(item.total || 0),
        }))
      : []
    const statusCount = STATUS_ORDER.reduce((acc, key) => {
      acc[key] = Number(dashboardStatusCounts[key] ?? summary.status_counts?.[key] ?? 0)
      return acc
    }, {})

    const totalRequests = Number(dashboard.totals?.requests ?? summary.total_requests ?? 0)
    const openRequests = Number(dashboard.queue?.open ?? summary.open_requests ?? 0)
    const resolved = Number((statusCount.COMPLETED || 0) + (statusCount.CLOSED || 0) || summary.resolved || 0)
    const unassigned = Number(dashboard.queue?.unassigned ?? summary.unassigned ?? 0)
    const overdue = Number(summary.overdue || 0)
    const submittedByMe = Number(summary.submitted_by_me || 0)
    const attentionCount = Number(summary.attention_count || 0)
    const createdByTeam = Number(summary.created_by_team || 0)
    const resolutionRate = Number(summary.resolution_rate || 0)

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
      priorityWatch: summary.priority_watch || null,
      concentration: dashboardConcentration.length ? dashboardConcentration : (Array.isArray(summary.concentration) ? summary.concentration : []),
      ownership: dashboardOwnership.length ? dashboardOwnership : (Array.isArray(summary.ownership) ? summary.ownership : []),
      activeEntities: Number(summary.active_entities || 0),
      companyMembers: Number(summary.company_members || 0),
      recent: Array.isArray(summary.recent) ? summary.recent : [],
      recentCompact: Array.isArray(summary.recent_compact) ? summary.recent_compact : [],
    }
  }, [dashboardState.data, requestsQuery.data?.summary])

  const userCardMetrics = useMemo(() => {
    const ownItems = ownRequestsQuery.data?.items || []
    const resolverItems = resolverRequestsQuery.data?.items || []
    const workflowItems = isResolverProfile ? resolverItems : ownItems
    const assignedItems = resolverItems.filter((item) => (
      item.current_assignee === user?.id || item.assignee_name === user?.username
    ))
    const openItems = workflowItems.filter((item) => !RESOLVED_SET.has(item.status) && item.status !== 'REJECTED')
    const activeAssignedItems = assignedItems.filter((item) => !RESOLVED_SET.has(item.status) && item.status !== 'REJECTED')
    const overdueItems = openItems.filter((item) => {
      const due = toDate(getRequestDeadline(item))
      return due && due.getTime() < Date.now()
    })
    const resolvedItems = workflowItems.filter((item) => RESOLVED_SET.has(item.status))

    return {
      myRequests: isResolverProfile ? activeAssignedItems.length : openItems.length,
      escalationRisk: overdueItems.length,
      submittedByMe: isResolverProfile ? workflowItems.filter((item) => item.status === 'IN_PROGRESS').length : ownItems.length,
      resolvedForMe: resolvedItems.length,
    }
  }, [isResolverProfile, ownRequestsQuery.data?.items, resolverRequestsQuery.data?.items, user?.id, user?.username])

  const userFlowMetrics = useMemo(() => {
    const ownItems = ownRequestsQuery.data?.items || []
    const resolverItems = resolverRequestsQuery.data?.items || []
    const workflowItems = isResolverProfile ? resolverItems : ownItems
    const statusCount = STATUS_ORDER.reduce((acc, key) => {
      acc[key] = workflowItems.filter((item) => item.status === key).length
      return acc
    }, {})

    return {
      statusCount,
      totalRequests: workflowItems.length,
    }
  }, [isResolverProfile, ownRequestsQuery.data?.items, resolverRequestsQuery.data?.items])

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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-warning/30 bg-warning/5 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow">{isResolverProfile ? 'Assigned To Me' : 'My Requests'}</p>
                    <HelpTip text={isResolverProfile ? 'Open requests currently assigned to you.' : 'Open requests submitted by you.'} />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{userCardMetrics.myRequests}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isResolverProfile ? 'Open assigned work' : 'Open items submitted by you'}</p>
                </div>
                <ClipboardList className="h-5 w-5 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-ink/10 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow">Escalation Risk</p>
                    <HelpTip text={isResolverProfile ? 'Assigned open requests with due dates that already passed.' : 'Your open requests with due dates that already passed.'} />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{userCardMetrics.escalationRisk}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {userCardMetrics.escalationRisk ? 'Overdue items need follow-up' : 'No overdue items right now'}
                  </p>
                </div>
                <AlertCircle className="h-5 w-5 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-ink/10 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow">{isResolverProfile ? 'In Progress' : 'Submitted By Me'}</p>
                    <HelpTip text={isResolverProfile ? 'Assigned requests currently in progress.' : 'All requests submitted by you.'} />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{userCardMetrics.submittedByMe}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isResolverProfile ? 'Work actively being handled' : 'Useful for follow-up and context'}</p>
                </div>
                <ClipboardList className="h-5 w-5 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-success/30 bg-success/5 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow text-success">{isResolverProfile ? 'Resolved Work' : 'Resolved For Me'}</p>
                    <HelpTip text={isResolverProfile ? 'Visible assigned work that was completed or closed.' : 'Your requests that were completed or closed.'} />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{userCardMetrics.resolvedForMe}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isResolverProfile ? 'Completed or closed work' : 'Requests already delivered'}</p>
                </div>
                <div className="rounded-sm bg-success/10 p-2">
                  <CheckCheck className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Analytical Drilldown: Lifecycle */}
          <Card className="border-ink/5 shadow-none lg:col-span-2">
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
                  const count = userFlowMetrics.statusCount[status] || 0
                  const pct = userFlowMetrics.totalRequests ? Math.round((count / userFlowMetrics.totalRequests) * 100) : 0
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

          {/* Ownership Distribution (Added for User Dashboard) */}
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
                  metrics.ownership.slice(0, 5).map((owner) => (
                    <Link key={owner.name} to={`/requests?assignee=${encodeURIComponent(owner.name)}`} className="flex items-center justify-between transition-colors hover:bg-muted/30">
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
                    </Link>
                  ))
                ) : (
                  <p className="py-4 text-center text-xs text-muted-foreground">No active assignments in this scope.</p>
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
          <Card className="border-ink/10 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow">{isScopedResolverProfile ? 'Resolver Queue' : 'Team Queue'}</p>
                    <HelpTip text={isScopedResolverProfile ? 'Open requests currently under your resolver scope.' : 'All open requests currently under your team scope.'} />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{metrics.openRequests}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{isScopedResolverProfile ? 'Requests needing delivery' : 'Requests needing coordination'}</p>
                </div>
                <ClipboardList className="h-5 w-5 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-ink/10 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow">{isScopedResolverProfile ? 'Work Units' : 'Units in Focus'}</p>
                    <HelpTip text="Number of entities currently generating workload in your scope." />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{metrics.concentration.length}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Active platform entities</p>
                </div>
                <Building2 className="h-5 w-5 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-warning/30 bg-warning/5 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow text-warning">Need Attention</p>
                    <HelpTip text="Combined count of unassigned and overdue requests." />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{metrics.attentionCount}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{metrics.overdue} overdue items</p>
                </div>
                <div className="rounded-sm bg-warning/10 p-2">
                  <AlertCircle className="h-5 w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-success/30 bg-success/5 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="eyebrow text-success">{isScopedResolverProfile ? 'Resolved By Scope' : 'Resolved in Scope'}</p>
                    <HelpTip text="Requests completed or closed in the current scope." />
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{metrics.resolved}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Closed or completed work</p>
                </div>
                <div className="rounded-sm bg-success/10 p-2">
                  <CheckCheck className="h-5 w-5 text-success" />
                </div>
              </div>
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
                  metrics.ownership.slice(0, 5).map((owner) => (
                    <Link key={owner.name} to={`/requests?assignee=${encodeURIComponent(owner.name)}`} className="flex items-center justify-between transition-colors hover:bg-muted/30">
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
                    </Link>
                  ))
                ) : (
                  <p className="py-4 text-center text-xs text-muted-foreground">No active assignments in this scope.</p>
                )}
                {metrics.unassigned > 0 && (
                  <Link to="/requests?assignee=unassigned" className="mt-6 flex items-center justify-between border-t border-ink/5 pt-4 transition-colors hover:bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                      <p className="text-xs font-bold uppercase tracking-tight text-warning">Coverage Risk</p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-warning">{metrics.unassigned} items unassigned</p>
                  </Link>
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
                  metrics.ownership.slice(0, 5).map((owner) => (
                    <Link key={owner.name} to={`/requests?assignee=${encodeURIComponent(owner.name)}`} className="flex items-center justify-between transition-colors hover:bg-muted/30">
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
                    </Link>
                  ))
                ) : (
                  <p className="py-4 text-center text-xs text-muted-foreground">No active assignments in this scope.</p>
                )}
                {metrics.unassigned > 0 && (
                  <Link to="/requests?assignee=unassigned" className="mt-6 flex items-center justify-between border-t border-ink/5 pt-4 transition-colors hover:bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                      <p className="text-xs font-bold uppercase tracking-tight text-warning">Coverage Risk</p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-warning">{metrics.unassigned} items unassigned</p>
                  </Link>
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
                <p className="eyebrow">{canShowGlobalDashboardTotals ? 'Global users' : 'Units in scope'}</p>
                <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{canShowGlobalDashboardTotals ? dashboardState.data?.totals?.users || 0 : metrics.concentration.length}</p>
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
