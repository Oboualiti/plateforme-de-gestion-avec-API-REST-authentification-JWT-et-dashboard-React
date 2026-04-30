import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCheck,
  ClipboardList,
  UserPlus,
  AlertCircle,
  MessageSquare,
  RefreshCw,
  CheckCircle2,
  Settings,
  Filter,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

import PageHeader from '../components/layout/PageHeader'
import { useNotifications } from '../hooks/useNotifications'
import { api } from '../lib/api'

const PAGE_SIZE = 5

function getRequestIdFromNotificationLink(link) {
  if (!link || !link.startsWith('/requests/')) return null
  const match = link.match(/^\/requests\/(\d+)/)
  return match ? Number(match[1]) : null
}

function isRequestMessageNotification(item) {
  const eventType = String(item?.event_type || '').toUpperCase()
  return eventType.includes('MESSAGE') || Boolean(item?.metadata?.message_id)
}

function formatEventType(value) {
  return (value || 'notification')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getMetaForType(eventType) {
  const key = String(eventType || '').toUpperCase()
  if (key.includes('ASSIGN')) return { icon: UserPlus, dot: 'bg-success', tag: 'bg-success/15 text-success' }
  if (key.includes('DEADLINE')) return { icon: AlertCircle, dot: 'bg-warning', tag: 'bg-warning/15 text-warning' }
  if (key.includes('COMMENT') || key.includes('DISCUSSION')) return { icon: MessageSquare, dot: 'bg-primary', tag: 'bg-primary/15 text-primary' }
  if (key.includes('STATUS')) return { icon: RefreshCw, dot: 'bg-primary', tag: 'bg-primary/15 text-primary' }
  if (key.includes('COMPLETE') || key.includes('CLOSE') || key.includes('RESOLVE')) return { icon: CheckCircle2, dot: 'bg-success', tag: 'bg-success/15 text-success' }
  if (key.includes('SYSTEM')) return { icon: Settings, dot: 'bg-muted-foreground', tag: 'bg-muted text-muted-foreground' }
  return { icon: ClipboardList, dot: 'bg-primary', tag: 'bg-primary/15 text-primary' }
}

function NotificationsPage() {
  const navigate = useNavigate()
  const notifications = useNotifications()
  const [activeTab, setActiveTab] = useState('all')
  const [selectedTypes, setSelectedTypes] = useState([])
  const [dateRange, setDateRange] = useState('last_7_days')
  const [page, setPage] = useState(1)

  useEffect(() => {
    notifications.loadNotifications(false)
  }, [notifications.canViewRequestDiscussion, notifications.loadNotifications])

  const allItems = notifications.notifications || []
  const unreadCount = allItems.filter((item) => !item.is_read).length
  const systemCount = allItems.filter((item) => String(item.event_type || '').toUpperCase().includes('SYSTEM')).length
  const mentionCount = allItems.filter((item) => String(item.message || '').includes('@')).length

  const filtered = useMemo(() => {
    let list = allItems
    if (activeTab === 'unread') list = list.filter((item) => !item.is_read)
    if (activeTab === 'mentions') list = list.filter((item) => String(item.message || '').includes('@'))
    if (activeTab === 'system') list = list.filter((item) => String(item.event_type || '').toUpperCase().includes('SYSTEM'))
    if (selectedTypes.length) {
      const set = new Set(selectedTypes)
      list = list.filter((item) => set.has(String(item.event_type || 'notification').toUpperCase()))
    }
    const now = new Date()
    if (dateRange === 'today') {
      list = list.filter((item) => {
        const d = new Date(item.created_at)
        return (
          d.getFullYear() === now.getFullYear()
          && d.getMonth() === now.getMonth()
          && d.getDate() === now.getDate()
        )
      })
    } else if (dateRange === 'last_7_days') {
      const threshold = new Date(now)
      threshold.setDate(now.getDate() - 7)
      list = list.filter((item) => new Date(item.created_at) >= threshold)
    } else if (dateRange === 'last_month') {
      const threshold = new Date(now)
      threshold.setMonth(now.getMonth() - 1)
      list = list.filter((item) => new Date(item.created_at) >= threshold)
    }
    return list
  }, [activeTab, allItems, selectedTypes, dateRange])

  const typeOptions = useMemo(() => {
    const unique = Array.from(new Set(allItems.map((item) => String(item.event_type || 'notification').toUpperCase())))
    return unique.map((key) => ({ key, label: formatEventType(key) }))
  }, [allItems])

  useEffect(() => {
    setPage(1)
  }, [activeTab, selectedTypes, notifications.unreadOnly, dateRange])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const endIndex = startIndex + PAGE_SIZE
  const pagedItems = filtered.slice(startIndex, endIndex)

  function toggleType(typeKey) {
    setSelectedTypes((current) => (
      current.includes(typeKey)
        ? current.filter((value) => value !== typeKey)
        : [...current, typeKey]
    ))
  }

  async function openNotification(item) {
    const fallbackLink = item?.link || '/notifications'
    const requestId = getRequestIdFromNotificationLink(fallbackLink)
    try {
      if (!item.is_read) {
        await notifications.markAsRead(item.id)
      }
      if (!requestId) {
        navigate(fallbackLink)
        return
      }

      const response = await api.get(`/requests/${requestId}/`)
      const requestData = response.data || {}
      const requestNumber = requestData.request_number || item?.metadata?.request_number || ''

      const requestStatus = String(requestData.status || '').toUpperCase()

      if (isRequestMessageNotification(item)) {
        navigate(`/requests/${requestId}?tab=comments`)
        return
      }

      if (requestStatus === 'REJECTED') {
        const query = requestNumber ? `?search=${encodeURIComponent(requestNumber)}&status=REJECTED` : '?status=REJECTED'
        navigate(`/pending-requests${query}`, {
          state: {
            rejectedFromNotification: true,
            requestId: requestData.id,
            requestNumber,
            title: requestData.title || '-',
            priority: requestData.priority || 'MEDIUM',
            sourceEntityName: requestData.source_entity_name || '-',
            targetEntityName: requestData.target_entity_name || '-',
            reason: requestData.rejection_reason || requestData.resolution_note || 'No rejection reason provided.',
          },
        })
        return
      }
      if (requestData.is_pending_approval) {
        navigate(`/pending-requests${requestNumber ? `?search=${encodeURIComponent(requestNumber)}` : ''}`)
        return
      }

      navigate(`/requests/${requestId}`)
    } catch {
      navigate(fallbackLink)
    } finally {
      await notifications.loadNotifications(false)
    }
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Notifications"
        description="Track request updates, mentions, and system activity in one place."
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div />
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={notifications.markAllRead}
          disabled={notifications.busy}
        >
          <CheckCheck className="h-4 w-4" />
          Mark all as read
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'all', label: 'All', count: allItems.length },
              { key: 'unread', label: 'Unread only', count: unreadCount },
              { key: 'mentions', label: 'Mentions', count: mentionCount },
              { key: 'system', label: 'System', count: systemCount },
            ].map((tab) => {
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-none border-b-2 px-3 py-1.5 text-xs font-extrabold uppercase tracking-widest transition-all ${
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/30'
                  }`}
                >
                  {tab.label}
                  <span className={`inline-flex min-w-5 items-center justify-center rounded-none px-1.5 text-[10px] font-bold ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="surface-card border-ink/10 shadow-none overflow-hidden p-0">
            {notifications.loading ? (
              <p className="px-4 py-10 text-sm text-muted-foreground">Loading notifications...</p>
            ) : notifications.error ? (
              <p className="px-4 py-10 text-sm font-medium text-destructive">{notifications.error}</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications.</p>
            ) : (
              <div className="divide-y divide-ink/10">
                {pagedItems.map((item, index) => {
                  const meta = getMetaForType(item.event_type)
                  const Icon = meta.icon
                  const highlighted = !item.is_read && index === 0
                  return (
                    <article key={item.id} className={`relative flex gap-3 px-4 py-4 ${highlighted ? 'bg-primary/10' : ''}`}>
                      {highlighted ? <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-primary" /> : null}
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60">
                        <Icon className="h-5 w-5 text-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="truncate text-sm font-semibold text-foreground">{item.title}</h3>
                          <small className="shrink-0 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.tag}`}>
                            {formatEventType(item.event_type)}
                          </span>
                          <div className="flex items-center gap-2">
                            {item.link ? (
                              <button
                                type="button"
                                className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60"
                                onClick={() => { void openNotification(item) }}
                              >
                                Open
                              </button>
                            ) : null}
                            {!item.is_read ? (
                              <button
                                type="button"
                                className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => notifications.markAsRead(item.id)}
                                disabled={notifications.busy}
                              >
                                Mark read
                              </button>
                            ) : (
                              <CheckCheck className="h-4 w-4 text-muted-foreground" />
                            )}
                            {!item.is_read ? <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} /> : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          {!notifications.loading && !notifications.error && filtered.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-xs">Page {safePage} of {totalPages}</span>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <span className="text-xs">
                Showing {filtered.length ? startIndex + 1 : 0} to {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} notifications
              </span>
            </div>
          ) : null}
        </section>

        <aside className="surface-card border-ink/10 shadow-none h-fit p-4 xl:mt-[42px]">
          <div className="mb-4 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Filter className="h-4 w-4" />
              Filters
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline"
              onClick={() => {
                setSelectedTypes([])
                setDateRange('all')
              }}
            >
              Clear all
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Type</p>
              <div className="space-y-2">
                {typeOptions.map((option) => {
                  const checked = selectedTypes.includes(option.key)
                  return (
                    <label key={option.key} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={checked}
                        onChange={() => toggleType(option.key)}
                      />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Date range</p>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={dateRange}
                  onChange={(event) => setDateRange(event.target.value)}
                  className="h-10 w-full appearance-none rounded-md border border-border bg-background pl-9 pr-9 text-sm text-foreground"
                >
                  <option value="today">Today</option>
                  <option value="last_7_days">Last 7 days</option>
                  <option value="last_month">Last month</option>
                  <option value="all">All notifications</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>


          </div>
        </aside>
      </div>
    </main>
  )
}

export default NotificationsPage
