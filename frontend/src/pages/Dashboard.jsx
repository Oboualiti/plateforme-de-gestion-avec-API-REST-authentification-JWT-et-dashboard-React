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
} from 'lucide-react'

import { Avatar } from '../components/Avatar'
import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
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
function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const [dashboardState, setDashboardState] = useState({ loading: true, error: '', data: null })
  const [requestState, setRequestState] = useState({ loading: true, error: '', items: [] })

  const primaryRole = getPrimaryRole(user)
  const roleLabel = ROLE_LABELS[primaryRole] || 'User'
  const scope = getScopeForRole(primaryRole)
  const scopeLabel = getScopeLabel(primaryRole, user)
  const canAccessReports = ADMIN_REPORT_ROLES.has(primaryRole)
  const canReadGlobalDashboard = primaryRole === 'super_admin'

  useEffect(() => {
    let active = true

    async function load() {
      setDashboardState({ loading: true, error: '', data: null })
      setRequestState({ loading: true, error: '', items: [] })

      const [dashboardResult, requestsResult] = await Promise.allSettled([
        canReadGlobalDashboard ? api.get('/admin/dashboard/') : Promise.resolve({ data: null }),
        api.get('/requests/', { params: { page: 1, page_size: 400, scope } }),
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
      const due = toDate(item.due_date || item.dueDate)
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
      .filter((item) => toDate(item.due_date || item.dueDate))
      .sort((a, b) => +(toDate(a.due_date || a.dueDate) || 0) - +(toDate(b.due_date || b.dueDate) || 0))

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
        const owner = item.assignee_name || item.current_assignee__username
        if (!owner) return
        const current = byOwner.get(owner) || { name: owner, role: 'User', count: 0 }
        current.count += 1
        byOwner.set(owner, current)
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
      <main className="space-y-6">
        <div className="grid gap-4">
          <Card className="lg:col-span-2">
            <CardContent className="grid gap-6 p-5 lg:grid-cols-[1fr_240px]">
              <div>
                <p className="eyebrow">Workspace Overview</p>
                <h2 className="mt-2 text-4xl font-extrabold uppercase leading-tight text-foreground">Stay On Top Of Requests Without The Clutter</h2>
                <p className="mt-4 text-sm text-muted-foreground">
                  Track your active work, spot blockers early, and move from queue review to action faster.
                </p>
              </div>
              <div className="space-y-3">
                <div className="rounded-sm border-2 border-ink bg-secondary p-4 text-secondary-foreground shadow-elev-sm">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-secondary-foreground/80">Scope</p>
                  <p className="mt-1 text-4xl font-bold leading-tight">{scopeLabel}</p>
                  <p className="text-sm text-secondary-foreground/85">{roleLabel}</p>
                </div>
                <div className="rounded-sm border-2 border-dashed border-ink bg-card p-4">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Active workload</p>
                  <p className="mt-1 text-4xl font-bold text-foreground">{metrics.openRequests} items</p>
                  <p className="text-sm text-muted-foreground">{metrics.unassigned} upcoming deadlines need monitoring</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-primary-foreground/80">My requests</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums">{metrics.openRequests}</p>
                  <p className="mt-2 text-sm text-primary-foreground/80">Open items still in motion</p>
                </div>
                <ClipboardList className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Need attention</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums text-foreground">{metrics.attentionCount}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{metrics.overdue} overdue · {metrics.unassigned} unassigned</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Submitted by me</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums text-foreground">{metrics.submittedByMe}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Useful for follow-up and prioritization</p>
                </div>
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-success text-success-foreground">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-success-foreground/80">Resolved for me</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums">{metrics.resolved}</p>
                  <p className="mt-2 text-sm text-success-foreground/85">Finished requests already delivered</p>
                </div>
                <CheckCheck className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <p className="eyebrow">Progress Snapshot</p>
                <h3 className="text-4xl font-extrabold uppercase">Work Status Breakdown</h3>
              </div>
              <Button variant="ghost" asChild>
                <Link to="/requests">View requests</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {STATUS_ORDER.map((status) => {
                const count = metrics.statusCount[status] || 0
                const pct = metrics.totalRequests ? Math.round((count / metrics.totalRequests) * 100) : 0
                return (
                  <div key={status} className="rounded-sm border border-ink/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={statusPillClass(status)}>{STATUS_META[status].label}</span>
                        <span className="text-sm text-muted-foreground">{STATUS_META[status].label}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold tabular-nums text-foreground">{count}</div>
                        <div className="text-xs text-muted-foreground">{pct}% of scope</div>
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full border border-ink/40 bg-muted">
                      <div className={`h-full ${STATUS_META[status].bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="eyebrow">Manage your profile</p>
              <h3 className="text-4xl font-extrabold uppercase">Profile details</h3>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              <div className="rounded-sm border border-ink/40 p-4">
                <p className="eyebrow">Assigned workspace</p>
                <p className="mt-1 text-4xl font-bold text-foreground">{user?.entity_code || user?.entity_name || user?.company_code || 'N/A'}</p>
                <p className="text-lg text-muted-foreground">{user?.entity_name || user?.company_name || 'No workspace assigned'}</p>
              </div>
              <div className="rounded-sm border border-ink/40 p-4">
                <p className="eyebrow">Primary role</p>
                <p className="mt-1 text-4xl font-bold text-foreground">{roleLabel}</p>
                <p className="text-lg text-muted-foreground">Submit, follow, and close requests with clear visibility.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <p className="eyebrow">Activity</p>
              <h3 className="text-4xl font-extrabold uppercase">Recent Activity</h3>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {metrics.recentCompact.length ? (
                metrics.recentCompact.map((item) => (
                  <Link key={item.id} to={`/requests/${item.id}`} className="group block rounded-sm border border-ink/40 p-3 hover:bg-muted/20">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={item.created_by_name || item.creator_name || user?.username || 'U'} size={36} />
                        <span className="font-mono text-xs text-muted-foreground">{item.reference_code || item.request_number || '-'}</span>
                        <span className={statusPillClass(item.status)}>{STATUS_META[item.status]?.label || item.status}</span>
                        <span className={typePillClass(item.type)}>{(item.type || 'INFO').replace('_', ' / ')}</span>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </div>
                    <p className="text-xl font-bold text-foreground">{item.title || 'Untitled request'}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(item.created_by_name || item.creator_name || 'Unknown user')}{' -> '}{(item.target_entity_code || item.target_entity_name || 'N/A')} · {formatRelative(item.updated_at || item.created_at)}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="eyebrow">Support</p>
              <h3 className="text-4xl font-extrabold uppercase">Helpful Shortcuts</h3>
            </CardHeader>
            <CardContent className="space-y-2 p-5">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/requests/create">
                  <PlusCircle className="mr-2 h-4 w-4" /> Create a new request
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/requests">
                  <ClipboardList className="mr-2 h-4 w-4" /> Browse the queue
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/profile">
                  <UserRound className="mr-2 h-4 w-4" /> Manage your profile
                </Link>
              </Button>
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
    const showTeamLeaderHeader = primaryRole === 'team_leader'
    const greetingName = String(user?.first_name || user?.full_name?.split(' ')?.[0] || user?.username || 'User').toUpperCase()
    const teamLeaderScope = user?.entity_name || scopeLabel

    return (
      <main className="space-y-6">
        {showTeamLeaderHeader && (
          <PageHeader
            title={`Welcome, ${greetingName}`}
            description={`${roleLabel} · ${teamLeaderScope} — a focused workspace for today's priorities.`}
            actions={
              <>
                <Button asChild>
                  <Link to="/requests/create">
                    <PlusCircle className="mr-1 h-4 w-4" /> Create request
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/requests">
                    Open requests <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </>
            }
          />
        )}

        <div className="grid gap-4">
          <Card className="lg:col-span-2">
            <CardContent className="grid gap-6 p-5 lg:grid-cols-[1fr_240px]">
              <div>
                <p className="eyebrow">Workspace Overview</p>
                <h2 className="mt-2 text-4xl font-extrabold uppercase leading-tight text-foreground">Stay On Top Of Requests Without The Clutter</h2>
                <p className="mt-4 text-sm text-muted-foreground">
                  Track your active work, spot blockers early, and move from queue review to action faster.
                </p>
              </div>
              <div className="space-y-3">
                <div className="rounded-sm border-2 border-ink bg-secondary p-4 text-secondary-foreground shadow-elev-sm">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-secondary-foreground/80">Scope</p>
                  <p className="mt-1 text-4xl font-bold leading-tight">{scopeLabel}</p>
                  <p className="text-sm text-secondary-foreground/85">{roleLabel}</p>
                </div>
                <div className="rounded-sm border-2 border-dashed border-ink bg-card p-4">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Active workload</p>
                  <p className="mt-1 text-4xl font-bold text-foreground">{metrics.openRequests} items</p>
                  <p className="text-sm text-muted-foreground">{metrics.unassigned} upcoming deadlines need monitoring</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-primary-foreground/80">Team queue</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums">{metrics.openRequests}</p>
                  <p className="mt-2 text-sm text-primary-foreground/80">Requests currently needing team coordination</p>
                </div>
                <ClipboardList className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Need attention</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums text-foreground">{metrics.attentionCount}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{metrics.overdue} overdue · {metrics.unassigned} unassigned</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Created by team</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums text-foreground">{metrics.createdByTeam}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Useful for follow-up and prioritization</p>
                </div>
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-success text-success-foreground">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-success-foreground/80">Resolved in scope</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums">{metrics.resolved}</p>
                  <p className="mt-2 text-sm text-success-foreground/85">Closed or completed work</p>
                </div>
                <CheckCheck className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <p className="eyebrow">Progress Snapshot</p>
                <h3 className="text-4xl font-extrabold uppercase">Work Status Breakdown</h3>
              </div>
              <Button variant="ghost" asChild>
                <Link to="/requests">View requests</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {STATUS_ORDER.map((status) => {
                const count = metrics.statusCount[status] || 0
                const pct = metrics.totalRequests ? Math.round((count / metrics.totalRequests) * 100) : 0
                return (
                  <div key={status} className="rounded-sm border border-ink/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={statusPillClass(status)}>{STATUS_META[status].label}</span>
                        <span className="text-sm text-muted-foreground">{STATUS_META[status].label}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold tabular-nums text-foreground">{count}</div>
                        <div className="text-xs text-muted-foreground">{pct}% of scope</div>
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full border border-ink/40 bg-muted">
                      <div className={`h-full ${STATUS_META[status].bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="eyebrow">Your Profile</p>
              <h3 className="text-4xl font-extrabold uppercase">Account Context</h3>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              <div className="rounded-sm border border-ink/40 p-4">
                <p className="eyebrow">Assigned workspace</p>
                <p className="mt-1 text-4xl font-bold text-foreground">{user?.entity_code || user?.entity_name || user?.company_code || 'N/A'}</p>
                <p className="text-lg text-muted-foreground">{user?.entity_name || user?.company_name || 'No workspace assigned'}</p>
              </div>
              <div className="rounded-sm border border-ink/40 p-4">
                <p className="eyebrow">Primary role</p>
                <p className="mt-1 text-4xl font-bold text-foreground">{roleLabel}</p>
                <p className="text-lg text-muted-foreground">Coordinate execution, remove blockers, and keep delivery moving.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <p className="eyebrow">Activity</p>
              <h3 className="text-4xl font-extrabold uppercase">Recent Activity</h3>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {metrics.recent.length ? (
                metrics.recent.slice(0, 3).map((item) => (
                  <Link key={item.id} to={`/requests/${item.id}`} className="group block rounded-sm border border-ink/40 p-3 hover:bg-muted/20">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={item.created_by_name || item.creator_name || user?.username || 'U'} size={36} />
                        <span className="font-mono text-xs text-muted-foreground">{item.reference_code || item.request_number || '-'}</span>
                        <span className={statusPillClass(item.status)}>{STATUS_META[item.status]?.label || item.status}</span>
                        <span className={typePillClass(item.type)}>{(item.type || 'INFO').replace('_', ' / ')}</span>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </div>
                    <p className="text-xl font-bold text-foreground">{item.title || 'Untitled request'}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(item.created_by_name || item.creator_name || 'Unknown user')}{' -> '}{(item.target_entity_code || item.target_entity_name || 'N/A')} · {formatRelative(item.updated_at || item.created_at)}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="eyebrow">Support</p>
              <h3 className="text-4xl font-extrabold uppercase">Helpful Shortcuts</h3>
            </CardHeader>
            <CardContent className="space-y-2 p-5">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/requests/create">
                  <PlusCircle className="mr-2 h-4 w-4" /> Create a new request
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/requests">
                  <ClipboardList className="mr-2 h-4 w-4" /> Browse the queue
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/profile">
                  <UserRound className="mr-2 h-4 w-4" /> Manage your profile
                </Link>
              </Button>
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
      <main className="space-y-6">
        <PageHeader
          title="Platform Administration"
          description={`${roleLabel} · ${scopeLabel} — operational health, workload clarity, and flow performance in one place.`}
          actions={
            <>
              <Button variant="outline" asChild>
                <Link to="/requests">
                  Open requests <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild>
                <Link to="/admin/reports">Platform reports</Link>
              </Button>
            </>
          }
        />

        <div className="grid gap-4">
          <Card className="lg:col-span-2">
            <CardContent className="grid gap-6 p-5 lg:grid-cols-[1fr_240px]">
              <div>
                <p className="eyebrow">Control Room</p>
                <h2 className="mt-2 text-4xl font-extrabold uppercase leading-tight text-foreground">Keep Operations Visible And Decisive</h2>
                <p className="mt-4 text-sm text-muted-foreground">
                  See where demand is building, which teams need support, and how quickly work is getting closed.
                </p>
              </div>
              <div className="space-y-3">
                <div className="rounded-sm border-2 border-ink bg-secondary p-4 text-secondary-foreground shadow-elev-sm">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-secondary-foreground/80">Scope</p>
                  <p className="mt-1 text-4xl font-bold leading-tight">{scopeLabel}</p>
                  <p className="text-sm text-secondary-foreground/85">{roleLabel}</p>
                </div>
                <div className="rounded-sm border-2 border-dashed border-ink bg-card p-4">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Active workload</p>
                  <p className="mt-1 text-4xl font-bold text-foreground">{metrics.openRequests} items</p>
                  <p className="text-sm text-muted-foreground">{metrics.unassigned} upcoming deadlines need monitoring</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="bg-warning text-warning-foreground">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-warning-foreground/80">Active entities</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums">{metrics.activeEntities}</p>
                  <p className="mt-2 text-sm text-warning-foreground/85">{scopeLabel} footprint currently online</p>
                </div>
                <Building2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Company members</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums text-foreground">{metrics.companyMembers}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Currently active accounts in scope</p>
                </div>
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary text-primary-foreground">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-primary-foreground/80">Open requests</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums">{metrics.openRequests}</p>
                  <p className="mt-2 text-sm text-primary-foreground/80">{metrics.unassigned} waiting for an owner</p>
                </div>
                <ClipboardList className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-success text-success-foreground">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-success-foreground/80">Resolution rate</p>
                  <p className="mt-2 text-5xl font-bold tabular-nums">{metrics.resolutionRate}%</p>
                  <p className="mt-2 text-sm text-success-foreground/85">{metrics.resolved} resolved across current scope</p>
                </div>
                <CheckCheck className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <p className="eyebrow">Flow Summary</p>
                <h3 className="text-4xl font-extrabold uppercase">Request Lifecycle</h3>
              </div>
              <Button variant="ghost" asChild>
                <Link to="/requests">View requests</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {STATUS_ORDER.map((status) => {
                const count = metrics.statusCount[status] || 0
                const pct = metrics.totalRequests ? Math.round((count / metrics.totalRequests) * 100) : 0
                return (
                  <div key={status} className="rounded-sm border border-ink/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={statusPillClass(status)}>{STATUS_META[status].label}</span>
                        <span className="text-sm text-muted-foreground">{STATUS_META[status].label}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold tabular-nums text-foreground">{count}</div>
                        <div className="text-xs text-muted-foreground">{pct}% of scope</div>
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full border border-ink/40 bg-muted">
                      <div className={`h-full ${STATUS_META[status].bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="eyebrow">Coverage</p>
              <h3 className="text-4xl font-extrabold uppercase">Where Workload Is Concentrating</h3>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {metrics.concentration.length ? (
                metrics.concentration.map((entity) => (
                  <div key={entity.code} className="flex items-center justify-between rounded-sm border border-ink/40 p-3">
                    <div>
                      <p className="text-sm font-extrabold uppercase text-foreground">{entity.code}</p>
                      <p className="text-lg text-muted-foreground">{entity.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold tabular-nums text-foreground">{entity.count}</p>
                      <p className="text-sm text-muted-foreground">incoming requests</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No concentration data yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <p className="eyebrow">Activity</p>
              <h3 className="text-4xl font-extrabold uppercase">Operational Focus Areas</h3>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {metrics.recent.length ? (
                metrics.recent.slice(0, 4).map((item) => (
                  <Link key={item.id} to={`/requests/${item.id}`} className="group block rounded-sm border border-ink/40 p-3 hover:bg-muted/20">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={item.created_by_name || item.creator_name || 'U'} size={36} />
                        <span className="font-mono text-xs text-muted-foreground">{item.reference_code || item.request_number || '-'}</span>
                        <span className={statusPillClass(item.status)}>{STATUS_META[item.status]?.label || item.status}</span>
                        <span className={typePillClass(item.type)}>{(item.type || 'INFO').replace('_', ' / ')}</span>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </div>
                    <p className="text-xl font-bold text-foreground">{item.title || 'Untitled request'}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(item.created_by_name || item.creator_name || 'Unknown user')}{' -> '}{(item.target_entity_code || item.target_entity_name || 'N/A')} · {formatRelative(item.updated_at || item.created_at)}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No operational highlights yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="eyebrow">Support</p>
              <h3 className="text-4xl font-extrabold uppercase">Ownership And Coverage</h3>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {metrics.ownership.length ? (
                metrics.ownership.slice(0, 2).map((owner) => (
                  <div key={owner.name} className="flex items-center justify-between rounded-sm border border-ink/40 p-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={owner.name} size={34} />
                      <div>
                        <p className="text-xl font-bold text-foreground">{owner.name}</p>
                        <p className="text-sm text-muted-foreground">{owner.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold tabular-nums text-foreground">{owner.count}</p>
                      <p className="text-sm text-muted-foreground">open items</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No ownership data yet.</p>
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
  return (
    <main className="space-y-6">
      <PageHeader
        title="Platform Administration"
        description={`${roleLabel} - operational health, workload clarity, and flow performance in your scope.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/requests">
                Open requests <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            {canAccessReports && (
              <Button asChild>
                <Link to="/admin/reports">Platform reports</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-6 p-5 lg:grid-cols-[1fr_240px]">
            <div>
              <p className="eyebrow">Control Room</p>
              <h2 className="mt-2 text-4xl font-extrabold uppercase leading-tight text-foreground">Keep Operations Visible And Decisive</h2>
              <p className="mt-4 text-sm text-muted-foreground">
                See where demand is building, which teams need support, and how quickly work is getting closed.
              </p>
            </div>
            <div className="space-y-3">
              <div className="rounded-sm border-2 border-ink bg-secondary p-4 text-secondary-foreground shadow-elev-sm">
                <p className="text-xs font-extrabold uppercase tracking-wider text-secondary-foreground/80">Scope</p>
                <p className="mt-1 text-4xl font-bold leading-tight">{scopeLabel}</p>
                <p className="text-sm text-secondary-foreground/85">{roleLabel}</p>
              </div>
              <div className="rounded-sm border-2 border-dashed border-ink bg-card p-4">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Active workload</p>
                <p className="mt-1 text-4xl font-bold text-foreground">{metrics.openRequests} items</p>
                <p className="text-sm text-muted-foreground">{metrics.unassigned} upcoming deadlines need monitoring</p>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-warning text-warning-foreground">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-warning-foreground/80">Total requests</p>
                <p className="mt-2 text-5xl font-bold tabular-nums">{metrics.totalRequests}</p>
                <p className="mt-2 text-sm text-warning-foreground/85">All recorded demand in scope</p>
              </div>
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{canReadGlobalDashboard ? 'Global users' : 'Teams in scope'}</p>
                <p className="mt-2 text-5xl font-bold tabular-nums text-foreground">{canReadGlobalDashboard ? dashboardState.data?.totals?.users || 0 : metrics.concentration.length}</p>
                <p className="mt-2 text-sm text-muted-foreground">{canReadGlobalDashboard ? 'Active accounts on platform' : 'Active destination units'}</p>
              </div>
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-primary-foreground/80">Open requests</p>
                <p className="mt-2 text-5xl font-bold tabular-nums">{metrics.openRequests}</p>
                <p className="mt-2 text-sm text-primary-foreground/80">{metrics.unassigned} waiting for an owner</p>
              </div>
              <ClipboardList className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-success text-success-foreground">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-success-foreground/80">Resolution rate</p>
                <p className="mt-2 text-5xl font-bold tabular-nums">{metrics.resolutionRate}%</p>
                <p className="mt-2 text-sm text-success-foreground/85">{metrics.resolved} resolved across current scope</p>
              </div>
              <CheckCheck className="h-5 w-5" />
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













