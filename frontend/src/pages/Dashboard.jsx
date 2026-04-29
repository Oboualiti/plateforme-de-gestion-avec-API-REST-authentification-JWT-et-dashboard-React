import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { 
  ArrowRight, 
  ArrowUpRight, 
  Building2, 
  CheckCheck, 
  CheckCircle2, 
  ClipboardList, 
  Clock,
  PlusCircle, 
  UserRound, 
  Users,
  Inbox, 
  AlertCircle, 
  Activity, 
  Target, 
  FileText, 
  BarChart3,
  Briefcase,
  CircleHelp
} from 'lucide-react'

import { Avatar } from '../components/Avatar'
import ChartRangeSelect from '../components/charts/ChartRangeSelect'
import PageHeader from '../components/layout/PageHeader'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { useAuth } from '../context/AuthContext'
import { buildRangeBuckets } from '../lib/chartRanges'
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

function formatShortDate(value) {
  const date = toDate(value)
  if (!date) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTrendYAxis(value) {
  const num = Number(value || 0)
  if (num >= 1000) return `${Math.round(num / 1000)}K`
  return `${num}`
}

function formatCompactVolume(value) {
  const num = Number(value || 0)
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return String(num)
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
  const [trendRange, setTrendRange] = useState('7d')

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

  const isSupportOrDevEntity = ['SUPPORT', 'TDEV'].includes(String(user?.entity_type || '').toUpperCase())
  const showScopedSingleConcentration = (primaryRole === 'manager' || primaryRole === 'team_leader') && isSupportOrDevEntity && metrics.concentration.length === 1
  const hideLifeCycleCard = (primaryRole === 'manager' || primaryRole === 'team_leader') && isSupportOrDevEntity
  const isProdManagerOrTl = (primaryRole === 'manager' || primaryRole === 'team_leader') && String(user?.entity_type || '').toUpperCase() === 'PROD'
  const isProdNormalUser = primaryRole === 'user' && String(user?.entity_type || '').toUpperCase() === 'PROD'
  const isSupportDevNormalUser = primaryRole === 'user' && ['SUPPORT', 'TDEV'].includes(String(user?.entity_type || '').toUpperCase())
  const isExecutiveUnifiedRole = primaryRole === 'super_admin' || primaryRole === 'senior'
  const singleEntity = metrics.concentration[0] || null
  const singleEntityTrend = useMemo(() => {
    if (!showScopedSingleConcentration) return []
    const map = new Map(
      buildRangeBuckets(trendRange).map((row) => [
        row.key,
        { ...row, label: formatShortDate(new Date(row.key)) || row.label },
      ]),
    )
    requestState.items.forEach((item) => {
      const created = toDate(item.created_at || item.createdAt)
      if (created) {
        const createdKey = created.toISOString().slice(0, 10)
        if (map.has(createdKey)) map.get(createdKey).created += 1
      }
      const updated = toDate(item.updated_at || item.updatedAt || item.created_at || item.createdAt)
      if (!updated) return
      const key = updated.toISOString().slice(0, 10)
      if (!map.has(key)) return
      const bucket = map.get(key)
      bucket.count += 1
      if (RESOLVED_SET.has(item.status)) bucket.resolved += 1
    })
    return [...map.values()]
  }, [requestState.items, showScopedSingleConcentration, trendRange])
  const singleEntityStatusRows = useMemo(() => {
    const rows = [
      { key: 'NEW', label: 'New', tone: 'bg-info text-info' },
      { key: 'IN_PROGRESS', label: 'In Progress', tone: 'bg-warning text-warning' },
      { key: 'COMPLETED', label: 'Completed', tone: 'bg-success text-success' },
      { key: 'CLOSED', label: 'Closed', tone: 'bg-primary text-primary' },
    ]
    const total = rows.reduce((sum, row) => sum + Number(metrics.statusCount[row.key] || 0), 0) || 1
    return rows.map((row) => {
      const value = Number(metrics.statusCount[row.key] || 0)
      return {
        ...row,
        value,
        pct: (value / total) * 100,
      }
    })
  }, [metrics.statusCount])
  const superAdminTrendRows = useMemo(() => {
    if (!isExecutiveUnifiedRole) return []
    const map = new Map(
      buildRangeBuckets(trendRange).map((row) => [
        row.key,
        { ...row, label: formatShortDate(new Date(row.key)) || row.label },
      ]),
    )
    requestState.items.forEach((item) => {
      const updated = toDate(item.updated_at || item.updatedAt || item.created_at || item.createdAt)
      if (!updated) return
      const key = updated.toISOString().slice(0, 10)
      if (!map.has(key)) return
      map.get(key).count += 1
    })
    return [...map.values()]
  }, [isExecutiveUnifiedRole, requestState.items, trendRange])
  const superAdminLifecycleRows = useMemo(() => {
    if (!isExecutiveUnifiedRole) return []
    return STATUS_ORDER.map((status) => {
      const value = Number(metrics.statusCount[status] || 0)
      const pct = metrics.totalRequests ? (value / metrics.totalRequests) * 100 : 0
      return {
        key: status,
        label: STATUS_META[status]?.label || status,
        value,
        pct,
        barTone: STATUS_META[status]?.bar || 'bg-muted',
      }
    })
  }, [isExecutiveUnifiedRole, metrics.statusCount, metrics.totalRequests])
  const superAdminTopConcentrationRows = useMemo(() => {
    if (!isExecutiveUnifiedRole) return []
    const rows = [...(metrics.concentration || [])].sort((a, b) => Number(b.count || 0) - Number(a.count || 0)).slice(0, 3)
    const topTotal = rows.reduce((sum, row) => sum + Number(row.count || 0), 0) || 1
    return rows.map((row, index) => ({
      ...row,
      rank: index + 1,
      pct: (Number(row.count || 0) / topTotal) * 100,
    }))
  }, [isExecutiveUnifiedRole, metrics.concentration])
  const concentrationSpread = useMemo(() => {
    if (!superAdminTopConcentrationRows.length) return 0
    const values = superAdminTopConcentrationRows.map((row) => row.pct)
    return Math.max(...values) - Math.min(...values)
  }, [superAdminTopConcentrationRows])
  const prodLifecycleRows = useMemo(() => {
    if (!isProdManagerOrTl) return []
    return STATUS_ORDER.map((status) => {
      const value = Number(metrics.statusCount[status] || 0)
      const pct = metrics.totalRequests ? (value / metrics.totalRequests) * 100 : 0
      return {
        key: status,
        label: STATUS_META[status]?.label || status,
        value,
        pct,
        barTone: STATUS_META[status]?.bar || 'bg-muted',
      }
    })
  }, [isProdManagerOrTl, metrics.statusCount, metrics.totalRequests])
  const prodTopEntities = useMemo(() => {
    if (!isProdManagerOrTl) return []
    const rows = [...(metrics.concentration || [])].sort((a, b) => Number(b.count || 0) - Number(a.count || 0)).slice(0, 4)
    const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0) || 1
    return rows.map((row, index) => ({
      ...row,
      rank: index + 1,
      pct: (Number(row.count || 0) / total) * 100,
    }))
  }, [isProdManagerOrTl, metrics.concentration])
  const prodTrendRows = useMemo(() => {
    if (!isProdManagerOrTl) return []
    const map = new Map(
      buildRangeBuckets(trendRange).map((row) => [
        row.key,
        { ...row, label: formatShortDate(new Date(row.key)) || row.label },
      ]),
    )
    requestState.items.forEach((item) => {
      const updated = toDate(item.updated_at || item.updatedAt || item.created_at || item.createdAt)
      if (!updated) return
      const key = updated.toISOString().slice(0, 10)
      if (!map.has(key)) return
      map.get(key).count += 1
    })
    return [...map.values()]
  }, [isProdManagerOrTl, requestState.items, trendRange])
  const userJourneyTrendRows = useMemo(() => {
    if (!isProdNormalUser) return []
    const map = new Map(
      buildRangeBuckets(trendRange).map((row) => [
        row.key,
        { ...row, label: formatShortDate(new Date(row.key)) || row.label },
      ]),
    )
    const ownItems = ownRequestsQuery.data?.items || []
    ownItems.forEach((item) => {
      const created = toDate(item.created_at || item.createdAt)
      if (created) {
        const key = created.toISOString().slice(0, 10)
        if (map.has(key)) map.get(key).created += 1
      }
      if (RESOLVED_SET.has(item.status)) {
        const resolved = toDate(item.completed_at || item.closed_at || item.updated_at || item.updatedAt || item.created_at || item.createdAt)
        if (resolved) {
          const key = resolved.toISOString().slice(0, 10)
          if (map.has(key)) map.get(key).resolved += 1
        }
      }
    })
    return [...map.values()]
  }, [isProdNormalUser, ownRequestsQuery.data?.items, trendRange])
  const safeUserJourneyTrendRows = useMemo(() => {
    if (!Array.isArray(userJourneyTrendRows)) return []
    return userJourneyTrendRows.map((row) => ({
      ...row,
      created: Number(row?.created || 0),
      resolved: Number(row?.resolved || 0),
      label: row?.label || '',
    }))
  }, [userJourneyTrendRows])
  const userNeedAction = useMemo(() => {
    if (!isProdNormalUser) return { waitingReply: 0, recentlyUpdated: 0, dueSoon: 0, overdue: 0 }
    const ownItems = ownRequestsQuery.data?.items || []
    const now = Date.now()
    const in3Days = now + (3 * 24 * 60 * 60 * 1000)
    const waitingReply = ownItems.filter((item) => item.status === 'NEW' || item.status === 'ACCEPTED').length
    const recentlyUpdated = ownItems.filter((item) => {
      const updated = toDate(item.updated_at || item.updatedAt || item.created_at || item.createdAt)
      return updated && (now - updated.getTime()) <= (48 * 60 * 60 * 1000)
    }).length
    const dueSoon = ownItems.filter((item) => {
      const due = toDate(getRequestDeadline(item))
      return due && due.getTime() >= now && due.getTime() <= in3Days && !RESOLVED_SET.has(item.status)
    }).length
    const overdue = ownItems.filter((item) => {
      const due = toDate(getRequestDeadline(item))
      return due && due.getTime() < now && !RESOLVED_SET.has(item.status)
    }).length
    return { waitingReply, recentlyUpdated, dueSoon, overdue }
  }, [isProdNormalUser, ownRequestsQuery.data?.items])
  const userResponseMetrics = useMemo(() => {
    if (!isProdNormalUser) return { averageResponse: '0h', totalRequests: 0 }
    const ownItems = ownRequestsQuery.data?.items || []
    const durationsHours = ownItems
      .filter((item) => RESOLVED_SET.has(item.status))
      .map((item) => {
        const created = toDate(item.created_at || item.createdAt)
        const resolved = toDate(item.completed_at || item.closed_at || item.updated_at || item.updatedAt)
        if (!created || !resolved) return null
        return Math.max(0, (resolved.getTime() - created.getTime()) / 3600000)
      })
      .filter((value) => value !== null)
    const avgHours = durationsHours.length
      ? durationsHours.reduce((sum, value) => sum + value, 0) / durationsHours.length
      : 0
    const wholeHours = Math.floor(avgHours)
    const minutes = Math.round((avgHours - wholeHours) * 60)
    const averageResponse = avgHours < 1 ? `${Math.max(1, minutes)}m` : `${wholeHours}h ${minutes}m`
    return { averageResponse, totalRequests: ownItems.length }
  }, [isProdNormalUser, ownRequestsQuery.data?.items])
  const supportAssignedItems = useMemo(() => {
    if (!isSupportDevNormalUser) return []
    const resolverItems = resolverRequestsQuery.data?.items || []
    return resolverItems.filter((item) => (
      item.current_assignee === user?.id || item.assignee_name === user?.username
    ))
  }, [isSupportDevNormalUser, resolverRequestsQuery.data?.items, user?.id, user?.username])
  const supportDeliveryMetrics = useMemo(() => {
    if (!isSupportDevNormalUser) {
      return { assignedActive: 0, overdue: 0, inProgress: 0, resolved: 0, totalAssigned: 0, avgDays: '0d' }
    }
    const active = supportAssignedItems.filter((item) => !RESOLVED_SET.has(item.status) && item.status !== 'REJECTED')
    const overdue = active.filter((item) => {
      const due = toDate(getRequestDeadline(item))
      return due && due.getTime() < Date.now()
    }).length
    const inProgress = supportAssignedItems.filter((item) => item.status === 'IN_PROGRESS').length
    const resolved = supportAssignedItems.filter((item) => RESOLVED_SET.has(item.status)).length
    const durations = supportAssignedItems
      .filter((item) => RESOLVED_SET.has(item.status))
      .map((item) => {
        const start = toDate(item.created_at || item.createdAt)
        const end = toDate(item.completed_at || item.closed_at || item.updated_at || item.updatedAt || item.created_at || item.createdAt)
        if (!start || !end) return null
        return Math.max(0, (end.getTime() - start.getTime()) / 86400000)
      })
      .filter((v) => v !== null)
    const avgDays = durations.length ? `${Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)}d` : '0d'
    return {
      assignedActive: active.length,
      overdue,
      inProgress,
      resolved,
      totalAssigned: supportAssignedItems.length,
      avgDays,
    }
  }, [isSupportDevNormalUser, supportAssignedItems])
  const supportTrendRows = useMemo(() => {
    if (!isSupportDevNormalUser) return []
    const map = new Map(
      buildRangeBuckets(trendRange).map((row) => [
        row.key,
        { ...row, label: formatShortDate(new Date(row.key)) || row.label },
      ]),
    )
    supportAssignedItems.forEach((item) => {
      const created = toDate(item.created_at || item.createdAt)
      if (created) {
        const key = created.toISOString().slice(0, 10)
        if (map.has(key)) map.get(key).created += 1
      }
      if (RESOLVED_SET.has(item.status)) {
        const resolved = toDate(item.completed_at || item.closed_at || item.updated_at || item.updatedAt || item.created_at || item.createdAt)
        if (resolved) {
          const key = resolved.toISOString().slice(0, 10)
          if (map.has(key)) map.get(key).resolved += 1
        }
      }
    })
    return [...map.values()]
  }, [isSupportDevNormalUser, supportAssignedItems, trendRange])
  const supportLifecycleRows = useMemo(() => {
    if (!isSupportDevNormalUser) return []
    const total = supportAssignedItems.length || 1
    return STATUS_ORDER.map((status) => {
      const value = supportAssignedItems.filter((item) => item.status === status).length
      return {
        key: status,
        label: STATUS_META[status]?.label || status,
        value,
        pct: (value / total) * 100,
        barTone: STATUS_META[status]?.bar || 'bg-muted',
      }
    })
  }, [isSupportDevNormalUser, supportAssignedItems])
  const supportTopEntities = useMemo(() => {
    if (!isSupportDevNormalUser) return []
    const map = new Map()
    supportAssignedItems.forEach((item) => {
      const code = item.target_entity_code || item.target_entity?.code || item.target_entity_name || 'N/A'
      const name = item.target_entity_name || item.target_entity?.name || code
      const curr = map.get(code) || { code, name, count: 0 }
      curr.count += 1
      map.set(code, curr)
    })
    const rows = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 4)
    const total = rows.reduce((sum, row) => sum + row.count, 0) || 1
    return rows.map((row, index) => ({ ...row, rank: index + 1, pct: (row.count / total) * 100 }))
  }, [isSupportDevNormalUser, supportAssignedItems])
  const isMonthlyTrendRange = trendRange === 'this_month'
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
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCompactVolume(metrics.openRequests)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <p className="eyebrow">Unassigned</p>
              <HelpTip text="Open requests that still have no current assignee." />
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums text-warning">{formatCompactVolume(metrics.unassigned)}</p>
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

        {!isProdNormalUser && !isSupportDevNormalUser && (
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
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {isProdNormalUser ? (
            <Card className="border-ink/10 bg-surface-2 lg:col-span-2 rounded-sm shadow-none">
              <CardHeader className="pb-3">
                <p className="eyebrow text-info">Personal Overview</p>
                <h3 className="text-3xl font-extrabold tracking-tight">My Request Journey</h3>
                <p className="text-sm text-muted-foreground">Track your submitted requests, progress, and items needing attention.</p>
              </CardHeader>
              <CardContent className="p-5 pt-3">
                <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-sm border border-warning/30 bg-warning/5 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow">Open Requests</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(userCardMetrics.myRequests)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Open items submitted by you</p>
                      </div>
                      <ClipboardList className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  </div>
                  <div className="rounded-sm border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow">Waiting On Support</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(userNeedAction.waitingReply)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Overdue items need follow-up</p>
                      </div>
                      <AlertCircle className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  </div>
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow">Submitted By Me</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(userCardMetrics.submittedByMe)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Useful for follow-up and context</p>
                      </div>
                      <ClipboardList className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  </div>
                  <div className="rounded-sm border border-success/30 bg-success/5 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow text-success">Resolved For Me</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(userCardMetrics.resolvedForMe)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Requests already delivered</p>
                      </div>
                      <div className="rounded-sm bg-success/10 p-2">
                        <CheckCheck className="h-5 w-5 text-success" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-4 grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">My request summary</p>
                    <p className="mt-2 text-xs text-muted-foreground">Total requests</p>
                    <p className="text-4xl font-bold tabular-nums">{formatCompactVolume(userResponseMetrics.totalRequests)}</p>
                    <p className="text-xs text-muted-foreground">All time</p>
                    <div className="my-4 h-px w-full bg-ink/10" />
                    <p className="text-xs text-muted-foreground">Average response</p>
                    <p className="text-3xl font-bold tabular-nums">{userResponseMetrics.averageResponse}</p>
                    <p className="text-xs text-muted-foreground">Last 30 days</p>
                    <div className="mt-4 rounded-lg border border-success/25 bg-success/10 p-2">
                      <p className="text-sm font-semibold text-success">Healthy response flow</p>
                      <p className="text-xs text-muted-foreground">You're getting timely support.</p>
                    </div>
                  </div>
                  <div className="journey-chart-panel">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">7-day submitted vs resolved</p>
                      <ChartRangeSelect value={trendRange} onChange={setTrendRange} className="w-auto" />
                    </div>
                    <div className="journey-chart-legend mb-2">
                      <span><i className="legend-dot submitted" />Submitted</span>
                      <span><i className="legend-dot resolved" />Resolved</span>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={safeUserJourneyTrendRows} margin={{ top: 22, right: 12, left: 0, bottom: 6 }}>
                          <defs>
                            <linearGradient id="userSubmittedFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.04} />
                            </linearGradient>
                            <linearGradient id="userResolvedFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.14} />
                              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground) / 0.18)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} interval={isMonthlyTrendRange ? 2 : 0} />
                          <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} width={34} />
                          <Tooltip
                            cursor={{ stroke: '#64748b', strokeDasharray: '4 4' }}
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null
                              const submitted = payload.find((p) => p.dataKey === 'created')?.value ?? 0
                              const resolved = payload.find((p) => p.dataKey === 'resolved')?.value ?? 0
                              return (
                                <div className="journey-chart-tooltip">
                                  <strong>{label}</strong>
                                  <p className="tooltip-submitted">Submitted: {formatCompactVolume(submitted)}</p>
                                  <p className="tooltip-resolved">Resolved: {formatCompactVolume(resolved)}</p>
                                </div>
                              )
                            }}
                          />
                          <Area type="monotone" dataKey="resolved" name="Resolved" stroke="none" fill="url(#userResolvedFill)" />
                          <Area type="monotone" dataKey="created" name="Submitted" stroke="none" fill="url(#userSubmittedFill)" />
                          <Line type="monotone" dataKey="created" name="Submitted" stroke="#f59e0b" strokeWidth={2.6} dot={{ r: 5, fill: '#f59e0b', stroke: '#fef3c7', strokeWidth: 1.2 }} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#22c55e" strokeWidth={2.3} dot={{ r: 4, fill: '#22c55e', stroke: '#dcfce7', strokeWidth: 1 }} activeDot={{ r: 5 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">My request lifecycle</p>
                    <div className="space-y-2">
                      {STATUS_ORDER.map((status) => {
                        const count = userFlowMetrics.statusCount[status] || 0
                        const pct = userFlowMetrics.totalRequests ? Math.round((count / userFlowMetrics.totalRequests) * 100) : 0
                        return (
                          <div key={`journey-${status}`}>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span className="font-semibold text-foreground">{STATUS_META[status].label}</span>
                              <span className="font-bold tabular-nums text-foreground">{formatCompactVolume(count)} ({pct}%)</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted/30">
                              <div className={`h-full rounded-full ${STATUS_META[status].bar}`} style={{ width: `${Math.max(1, pct)}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Requests needing action</p>
                    <div className="space-y-1 text-sm">
                      {[
                        { key: 'waiting', label: 'Waiting for your reply', desc: 'Requests awaiting your response', count: userNeedAction.waitingReply, icon: AlertCircle, tone: 'text-warning' },
                        { key: 'updated', label: 'Recently updated', desc: 'Requests with recent activity', count: userNeedAction.recentlyUpdated, icon: Clock, tone: 'text-primary' },
                        { key: 'due', label: 'Due soon', desc: 'Due within the next 3 days', count: userNeedAction.dueSoon, icon: Clock, tone: 'text-info' },
                        { key: 'overdue', label: 'Overdue', desc: 'Past due and require attention', count: userNeedAction.overdue, icon: AlertCircle, tone: 'text-destructive' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between rounded-md px-1.5 py-2 hover:bg-muted/20">
                          <div className="flex items-center gap-3">
                            <item.icon className={`h-4 w-4 ${item.tone}`} />
                            <div>
                              <p className="font-semibold text-foreground">{item.label}</p>
                              <p className="text-xs text-muted-foreground">{item.desc}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold tabular-nums">{formatCompactVolume(item.count)}</span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground/70" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : isSupportDevNormalUser ? (
            <Card className="border-ink/10 bg-surface-2 rounded-sm shadow-none lg:col-span-2">
              <CardHeader className="pb-3">
                <p className="eyebrow text-info">Personal Operations</p>
                <h3 className="text-3xl font-extrabold tracking-tight">My Delivery Queue</h3>
                <p className="text-sm text-muted-foreground">Track work assigned to you, progress, and target entities generating your workload.</p>
              </CardHeader>
              <CardContent className="p-5 pt-3">
                <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-sm border border-warning/30 bg-warning/5 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow">Assigned To Me</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(supportDeliveryMetrics.assignedActive)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Active assigned work</p>
                      </div>
                      <ClipboardList className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  </div>
                  <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow">Overdue</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(supportDeliveryMetrics.overdue)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Need attention</p>
                      </div>
                      <AlertCircle className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  </div>
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow">In Progress</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(supportDeliveryMetrics.inProgress)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Being handled</p>
                      </div>
                      <ClipboardList className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  </div>
                  <div className="rounded-sm border border-success/30 bg-success/5 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow text-success">Resolved Work</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(supportDeliveryMetrics.resolved)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Completed / closed</p>
                      </div>
                      <div className="rounded-sm bg-success/10 p-2">
                        <CheckCheck className="h-5 w-5 text-success" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-4 grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">My work summary</p>
                    <p className="mt-2 text-xs text-muted-foreground">Total assigned</p>
                    <p className="text-3xl font-bold tabular-nums">{formatCompactVolume(supportDeliveryMetrics.totalAssigned)}</p>
                    <div className="my-3 h-px w-full bg-ink/10" />
                    <p className="text-xs text-muted-foreground">Average completion</p>
                    <p className="text-2xl font-bold tabular-nums">{supportDeliveryMetrics.avgDays}</p>
                  </div>
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assigned vs completed</p>
                      <ChartRangeSelect value={trendRange} onChange={setTrendRange} className="w-auto" />
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={supportTrendRows} margin={{ top: 16, right: 12, left: 0, bottom: 6 }}>
                          <defs>
                            <linearGradient id="supportAssignedFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.26} />
                              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.03} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground) / 0.2)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} interval={isMonthlyTrendRange ? 2 : 0} />
                          <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} width={34} />
                          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', color: 'hsl(var(--foreground))' }} />
                          <Area type="monotone" dataKey="created" name="Assigned" stroke="none" fill="url(#supportAssignedFill)" />
                          <Line type="monotone" dataKey="created" name="Assigned" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} />
                          <Line type="monotone" dataKey="resolved" name="Completed" stroke="#22c55e" strokeWidth={2.2} dot={{ r: 3, fill: '#22c55e' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Assigned request lifecycle</p>
                    <div className="space-y-2">
                      {supportLifecycleRows.map((row) => (
                        <div key={`support-${row.key}`}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-semibold text-foreground">{row.label}</span>
                            <span className="font-bold tabular-nums text-foreground">{formatCompactVolume(row.value)} ({row.pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted/30">
                            <div className={`h-full rounded-full ${row.barTone}`} style={{ width: `${Math.max(1, Math.min(100, row.pct))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Top target entities</p>
                    <div className="space-y-3">
                      {supportTopEntities.map((row) => (
                        <div key={`support-entity-${row.code}`}>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-primary text-[10px] font-bold text-primary">{row.rank}</span>
                              <span className="text-sm font-bold text-foreground">{row.code}</span>
                            </div>
                            <div className="flex items-center gap-3 text-right">
                              <span className="text-sm font-bold tabular-nums">{formatCompactVolume(row.count)}</span>
                              <span className="w-10 text-xs text-muted-foreground">{row.pct.toFixed(0)}%</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full bg-muted/30">
                            <div className="h-full rounded-full bg-warning" style={{ width: `${Math.max(1, Math.min(100, row.pct))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
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
          )}

          {/* Recent Activity */}
          <Card className={`border-ink/5 shadow-none ${(showScopedSingleConcentration || hideLifeCycleCard) ? 'lg:col-span-2' : ''}`}>
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
          <Card className={`border-ink/5 shadow-none ${showScopedSingleConcentration ? 'lg:col-start-1' : ''}`}>
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
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCompactVolume(metrics.openRequests)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <p className="eyebrow">Unassigned</p>
              <HelpTip text="Open requests that still have no current assignee." />
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums text-warning">{formatCompactVolume(metrics.unassigned)}</p>
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
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(metrics.openRequests)}</p>
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
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(metrics.attentionCount)}</p>
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
                  <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(metrics.resolved)}</p>
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
          {isProdManagerOrTl ? (
            <Card className="border-ink/5 shadow-none lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="eyebrow">Operational Overview</p>
                    <h3 className="text-3xl font-extrabold tracking-tight">Entity Flow & Workload</h3>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/requests">Full queue</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-3">
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow">Target entities</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums">{formatCompactVolume(metrics.concentration.length)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Active delivery scope</p>
                      </div>
                      <Users className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  </div>
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow">Total volume</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums">{formatCompactVolume(metrics.totalRequests)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Requests in scope</p>
                      </div>
                      <BarChart3 className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  </div>
                  <div className="rounded-sm border border-info/30 bg-info/5 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow">In progress</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums">{formatCompactVolume(metrics.statusCount.IN_PROGRESS || 0)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Currently being handled</p>
                      </div>
                      <Activity className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  </div>
                  <div className="rounded-sm border border-success/30 bg-success/5 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="eyebrow text-success">Completed</p>
                        <p className="mt-2 text-4xl font-bold tabular-nums">{formatCompactVolume(metrics.statusCount.COMPLETED || 0)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Closed successfully</p>
                      </div>
                      <CheckCheck className="h-5 w-5 text-success" />
                    </div>
                  </div>
                </div>

                <div className="mb-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Request Lifecycle</p>
                    <div className="space-y-2">
                      {prodLifecycleRows.map((row) => (
                        <div key={row.key}>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-foreground">{row.label}</span>
                            <div className="flex items-center gap-3 text-right">
                              <span className="text-sm font-bold tabular-nums">{formatCompactVolume(row.value)}</span>
                              <span className="w-10 text-xs text-muted-foreground">{row.pct.toFixed(0)}%</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full bg-muted/30">
                            <div className={`h-full rounded-full ${row.barTone}`} style={{ width: `${Math.max(1, Math.min(100, row.pct))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Top Target Entities</p>
                    <div className="space-y-3">
                      {prodTopEntities.map((row) => (
                        <div key={row.code}>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-warning text-[10px] font-bold text-warning">{row.rank}</span>
                              <span className="text-sm font-bold text-foreground">{row.code}</span>
                            </div>
                            <div className="flex items-center gap-3 text-right">
                              <span className="text-sm font-bold tabular-nums">{formatCompactVolume(row.count)}</span>
                              <span className="w-10 text-xs text-muted-foreground">{row.pct.toFixed(0)}%</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full bg-muted/30">
                            <div className="h-full rounded-full bg-warning" style={{ width: `${Math.max(1, Math.min(100, row.pct))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">7-Day Request Activity</p>
                      <p className="text-[11px] text-muted-foreground">Daily requests updated in this scope.</p>
                    </div>
                    <ChartRangeSelect value={trendRange} onChange={setTrendRange} className="w-auto" />
                  </div>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={prodTrendRows} margin={{ top: 16, right: 12, left: 0, bottom: 6 }}>
                        <defs>
                          <linearGradient id="prodTrendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground) / 0.2)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} interval={isMonthlyTrendRange ? 2 : 0} />
                        <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={formatTrendYAxis} axisLine={false} tickLine={false} width={34} />
                        <Tooltip
                          formatter={(value, _name, item) => {
                            if (item?.dataKey !== 'count' || item?.name === 'Trend fill') return null
                            return [Number(value || 0), 'Requests updated']
                          }}
                          labelFormatter={(label) => `Date: ${label}`}
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', color: 'hsl(var(--foreground))' }}
                        />
                        <Area type="monotone" dataKey="count" name="Trend fill" stroke="none" fill="url(#prodTrendFill)" />
                        <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} activeDot={{ r: 6, fill: '#f59e0b' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
          {/* Life Cycle */}
          {!hideLifeCycleCard ? (
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
          ) : null}

          {/* Workload Concentration */}
          <Card className={`border-ink/5 shadow-none ${(showScopedSingleConcentration || hideLifeCycleCard) ? 'lg:col-span-2' : ''}`}>
            <CardHeader className="pb-4">
              <p className="eyebrow">Operational Pressure</p>
              <h3 className="text-lg font-bold">Workload Concentration</h3>
            </CardHeader>
            <CardContent className="p-6 pt-4">
              {showScopedSingleConcentration ? (
                <div className="space-y-5">
                  <div className="grid items-stretch gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
                    <div className="rounded-sm border border-ink/10 bg-surface-2 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Single-Entity Scope</p>
                    <p className="mt-3 truncate text-4xl font-extrabold uppercase tracking-tight text-foreground">
                      {singleEntity?.code}
                    </p>
                    <p className="mt-1 truncate text-base text-muted-foreground">{singleEntity?.name}</p>
                    <div className="my-5 h-px w-full bg-ink/10" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Volume in your scope</p>
                    <p className="mt-3 text-5xl font-extrabold tabular-nums text-foreground">{singleEntity?.count || 0}</p>
                    <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs font-bold">Stable concentration</span>
                    </div>
                    <div className="my-5 h-px w-full bg-ink/10" />
                    <p className="text-sm leading-relaxed text-muted-foreground">No cross-entity split for this role scope.</p>
                  </div>

                    <div className="rounded-sm border border-ink/10 bg-surface-2 p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Request Activity Trend</p>
                          <p className="text-[11px] text-muted-foreground">Daily requests updated in this single-entity scope.</p>
                        </div>
                        <ChartRangeSelect value={trendRange} onChange={setTrendRange} className="w-auto" />
                      </div>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={singleEntityTrend} margin={{ top: 22, right: 16, left: 0, bottom: 8 }}>
                            <defs>
                              <linearGradient id="workloadTrendFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.32} />
                                <stop offset="55%" stopColor="#f59e0b" stopOpacity={0.14} />
                                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground) / 0.2)" vertical={false} />
                            <XAxis
                              dataKey="label"
                              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                              dy={8}
                              interval={isMonthlyTrendRange ? 2 : 0}
                              minTickGap={isMonthlyTrendRange ? 18 : 8}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                              tickFormatter={formatTrendYAxis}
                              axisLine={false}
                              tickLine={false}
                              width={34}
                            />
                            <Tooltip
                              formatter={(value, _name, item) => {
                                if (item?.dataKey !== 'count' || item?.name === 'Trend fill') return null
                                return [Number(value || 0), 'Requests updated']
                              }}
                              labelFormatter={(label) => `Date: ${label}`}
                              contentStyle={{
                                background: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '6px',
                                color: 'hsl(var(--foreground))',
                              }}
                            />
                            <Area type="monotone" dataKey="count" name="Trend fill" stroke="none" fill="url(#workloadTrendFill)" />
                            <Line
                              type="monotone"
                              dataKey="count"
                              stroke="#f59e0b"
                              strokeWidth={3}
                              dot={(props) => {
                                const { cx, cy, index } = props
                                const isLast = index === singleEntityTrend.length - 1
                                return (
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={isLast ? 6.5 : 5}
                                    fill="#f59e0b"
                                    stroke={isLast ? '#fbbf24' : '#f59e0b'}
                                    strokeWidth={isLast ? 2 : 1}
                                  />
                                )
                              }}
                              activeDot={{ r: 7, fill: '#f59e0b' }}
                            >
                              <LabelList
                                dataKey="count"
                                position="top"
                                offset={10}
                                formatter={(value) => {
                                  const num = Number(value || 0)
                                  return num > 0 ? num.toLocaleString() : ''
                                }}
                                style={{ fill: 'hsl(var(--foreground))', fontSize: 11, fontWeight: 700 }}
                              />
                            </Line>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Volume by Status</p>
                      <Link to="/requests" className="text-sm font-semibold text-primary hover:underline">View details</Link>
                    </div>
                    <div className="grid gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                      {singleEntityStatusRows.map((row, index) => {
                        const barTone = row.tone.split(' ')[0]
                        const textTone = row.tone.split(' ')[1] || 'text-muted-foreground'
                        return (
                          <div key={row.key} className={`px-3 ${index > 0 ? 'xl:border-l xl:border-ink/10' : ''}`}>
                            <div className="mb-2 flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${barTone}`} />
                                <span className="font-semibold text-foreground">{row.label}</span>
                              </div>
                              <span className="font-bold tabular-nums text-foreground">{formatCompactVolume(row.value)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted/30">
                              <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }} />
                            </div>
                            <p className={`mt-2 text-xs font-semibold ${textTone}`}>{row.pct.toFixed(1)}%</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
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
              )}
            </CardContent>
          </Card>
            </>
          )}

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
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCompactVolume(metrics.openRequests)}</p>
          </div>
          <div>
            <p className="eyebrow">Unassigned</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-warning">{formatCompactVolume(metrics.unassigned)}</p>
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
                <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{formatCompactVolume(metrics.openRequests)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{formatCompactVolume(metrics.unassigned)} pending assignment</p>
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
                  <p className="mt-1 text-sm text-muted-foreground">{formatCompactVolume(metrics.resolved)} closed in scope</p>
                </div>
                <div className="rounded-sm bg-success/10 p-2">
                  <CheckCheck className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>


        {isExecutiveUnifiedRole ? (
          <Card className="border-ink/5 shadow-none">
            <CardHeader className="pb-4">
              <p className="eyebrow text-warning">Operational Pressure</p>
              <div className="flex items-center gap-2">
                <h3 className="text-3xl font-extrabold tracking-tight">{primaryRole === 'senior' ? 'Company Volume Overview' : 'Queue & Workload Overview'}</h3>
                <HelpTip text="Unified view of request lifecycle and workload concentration." />
              </div>
              <p className="text-sm text-muted-foreground">
                {primaryRole === 'senior'
                  ? 'Company-wide queue visibility and entity workload distribution'
                  : 'Unified view of request lifecycle and workload concentration'}
              </p>
            </CardHeader>
            <CardContent className="p-5 pt-3">
              <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
                <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                  <div className="flex h-full min-h-[640px] flex-col justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{primaryRole === 'senior' ? 'Company Overview' : 'Platform Scope'}</p>
                      <p className="mt-3 text-4xl font-extrabold tracking-tight text-foreground">{primaryRole === 'senior' ? 'Company Queue' : 'Global Queue'}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{primaryRole === 'senior' ? 'Company-wide operational overview' : 'Cross-entity operational overview'}</p>
                    </div>
                    <div className="h-px w-full bg-ink/10" />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{primaryRole === 'senior' ? 'Total company volume' : 'Total Requests'}</p>
                      <p className="mt-3 text-5xl font-extrabold tabular-nums text-foreground">{formatCompactVolume(metrics.totalRequests)}</p>
                      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-success">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-xs font-bold">{primaryRole === 'senior' ? 'Balanced operations' : 'Balanced workload'}</span>
                      </div>
                    </div>
                    <div className="h-px w-full bg-ink/10" />
                    <div>
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Request Lifecycle</p>
                      <div className="space-y-2">
                        {superAdminLifecycleRows.map((row) => (
                          <div key={`left-${row.key}`}>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span className="font-semibold text-foreground">{row.label}</span>
                              <span className="font-bold tabular-nums text-foreground">{formatCompactVolume(row.value)}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted/30">
                              <div className={`h-full rounded-full ${row.barTone}`} style={{ width: `${Math.max(1, Math.min(100, row.pct))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="h-px w-full bg-ink/10" />
                    <p className="text-sm leading-relaxed text-muted-foreground">Top workload is distributed across main entities.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-xl font-bold tracking-tight text-foreground">{primaryRole === 'senior' ? '7-Day Request Activity' : '7-Day Queue Activity'}</p>
                        <p className="text-[11px] text-muted-foreground">Daily requests updated in the selected scope.</p>
                      </div>
                      <ChartRangeSelect value={trendRange} onChange={setTrendRange} className="w-auto" />
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={superAdminTrendRows} margin={{ top: 22, right: 16, left: 0, bottom: 8 }}>
                          <defs>
                            <linearGradient id="superAdminTrendFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.32} />
                              <stop offset="55%" stopColor="#f59e0b" stopOpacity={0.14} />
                              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground) / 0.2)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} dy={8} interval={isMonthlyTrendRange ? 2 : 0} />
                          <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={formatTrendYAxis} axisLine={false} tickLine={false} width={34} />
                          <Tooltip
                            formatter={(value, _name, item) => {
                              if (item?.dataKey !== 'count' || item?.name === 'Trend fill') return null
                              return [Number(value || 0), 'Requests updated']
                            }}
                            labelFormatter={(label) => `Date: ${label}`}
                            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', color: 'hsl(var(--foreground))' }}
                          />
                          <Area type="monotone" dataKey="count" name="Trend fill" stroke="none" fill="url(#superAdminTrendFill)" />
                          <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5, fill: '#f59e0b' }} activeDot={{ r: 7, fill: '#f59e0b' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-sm border border-ink/10 bg-surface-2 p-4">
                    <p className="mb-4 text-xl font-bold tracking-tight text-foreground">{primaryRole === 'senior' ? 'Top Entities by Volume' : 'Workload Concentration'}</p>
                    <div className="space-y-3">
                      {superAdminTopConcentrationRows.map((row) => (
                        <div key={row.code} className="rounded-sm border border-ink/10 p-3">
                          <div className="mb-1 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-warning text-xs font-bold text-warning">{row.rank}</span>
                              <div>
                                <p className="text-base font-bold text-foreground">{row.code}</p>
                                <p className="text-xs text-muted-foreground">{row.name}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-3xl font-bold tabular-nums text-foreground">{formatCompactVolume(row.count)}</p>
                              <p className="text-sm font-semibold text-muted-foreground">{row.pct.toFixed(1)}%</p>
                            </div>
                          </div>
                          <div className="h-2 rounded-full bg-muted/30">
                            <div className="h-full rounded-full bg-warning" style={{ width: `${Math.max(1, Math.min(100, row.pct))}%` }} />
                          </div>
                        </div>
                      ))}
                      <div className="mt-2 flex items-center justify-between rounded-sm border border-success/30 bg-success/10 px-3 py-2 text-success">
                        <span className="text-sm font-bold">Balanced concentration</span>
                        <span className="text-xs font-semibold text-muted-foreground">Spread is within {concentrationSpread.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
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
        )}


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
          <p className="mt-1 text-xl font-bold tabular-nums">{formatCompactVolume(metrics.openRequests)}</p>
        </div>
        <div>
          <div className="flex items-center gap-1">
            <p className="eyebrow">Unassigned</p>
            <HelpTip text="Open requests that still have no current assignee." />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-warning">{formatCompactVolume(metrics.unassigned)}</p>
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
