import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api } from './api'

const STATUS_ORDER = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CLOSED']
const RESOLVED_SET = new Set(['COMPLETED', 'CLOSED'])
const ACTIVE_SET = new Set(['NEW', 'ACCEPTED', 'IN_PROGRESS'])

function toDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getRequestDeadline(item) {
  return item?.deadline_date || item?.deadlineDate || item?.deadline || item?.approximate_deadline || item?.due_date || item?.dueDate || null
}

function buildScopedRequestsParams(scope) {
  return {
    page: 1,
    page_size: 200,
    scope,
    skip_count: 1,
  }
}

function buildSummary(items) {
  const statusCounts = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = items.filter((item) => item.status === status).length
    return acc
  }, {})
  const totalRequests = items.length
  const resolved = items.filter((item) => RESOLVED_SET.has(item.status)).length
  const openRequests = items.filter((item) => ACTIVE_SET.has(item.status)).length
  const unassigned = items.filter((item) => !item.assignee_name && !item.current_assignee__username).length
  const overdue = items.filter((item) => {
    const due = toDate(getRequestDeadline(item))
    return due && due.getTime() < Date.now() && !RESOLVED_SET.has(item.status)
  }).length

  const sortedRecent = [...items].sort((a, b) => {
    const aDate = +(toDate(a.updated_at || a.updatedAt || a.created_at || a.createdAt) || 0)
    const bDate = +(toDate(b.updated_at || b.updatedAt || b.created_at || b.createdAt) || 0)
    return bDate - aDate
  })

  const byEntity = new Map()
  items.forEach((item) => {
    const code = item.target_entity_code || item.target_entity?.code || item.target_entity_name || 'Unknown'
    const name = item.target_entity_name || item.target_entity?.name || code
    const current = byEntity.get(code) || { code, name, count: 0 }
    current.count += 1
    byEntity.set(code, current)
  })

  const byOwner = new Map()
  items
    .filter((item) => !RESOLVED_SET.has(item.status) && item.status !== 'REJECTED')
    .forEach((item) => {
      const name = item.assignee_name || item.current_assignee__username
      if (!name) return
      const current = byOwner.get(name) || { name, role: 'User', count: 0 }
      current.count += 1
      byOwner.set(name, current)
    })

  const memberSet = new Set()
  items.forEach((item) => {
    ;[item.created_by_name, item.creator_name, item.requester_name, item.assignee_name, item.current_assignee__username].forEach((name) => {
      const cleaned = String(name || '').trim()
      if (cleaned) memberSet.add(cleaned.toLowerCase())
    })
  })

  const resolutionRate = totalRequests ? Math.round((resolved / totalRequests) * 100) : 0

  return {
    total_requests: totalRequests,
    open_requests: openRequests,
    resolved,
    unassigned,
    overdue,
    submitted_by_me: 0,
    created_by_team: totalRequests,
    attention_count: overdue + unassigned,
    resolution_rate: resolutionRate,
    avg_resolution_days: 0,
    status_counts: statusCounts,
    active_entities: byEntity.size,
    company_members: memberSet.size,
    priority_watch: sortedRecent.find((item) => getRequestDeadline(item)) || sortedRecent[0] || null,
    concentration: [...byEntity.values()].sort((a, b) => b.count - a.count).slice(0, 6),
    ownership: [...byOwner.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    recent: sortedRecent.slice(0, 5),
    recent_compact: sortedRecent.slice(0, 2),
    recent_movement: sortedRecent.slice(0, 5),
    trend: [],
    request_type_mix: [],
    request_volume_rows: [...byEntity.values()].map((item) => ({ name: item.name, total: item.count })).slice(0, 6),
    summary_rows: [
      { metric: 'Total requests', value: totalRequests },
      { metric: 'Open queue', value: openRequests },
      { metric: 'Resolved', value: resolved },
      { metric: 'Average turnaround (days)', value: '0.00' },
      { metric: 'Overdue', value: overdue },
      { metric: 'Resolution rate (%)', value: resolutionRate },
      { metric: 'Unassigned', value: unassigned },
    ],
  }
}

export function useScopedRequests(scope, options = {}) {
  return useQuery({
    queryKey: ['requests', 'scoped-list', scope],
    queryFn: async () => {
      const { data } = await api.get('/requests/', {
        params: buildScopedRequestsParams(scope),
      })
      const items = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : []
      return {
        items,
        summary: buildSummary(items),
      }
    },
    enabled: Boolean(scope) && (options.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  })
}
