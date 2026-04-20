import { useEffect, useState } from 'react'

import PageHeader from '../components/layout/PageHeader'
import { api } from '../lib/api'

function NotificationsPage() {
  const [state, setState] = useState({
    loading: true,
    error: '',
    notifications: [],
    unreadOnly: false,
  })
  const [busy, setBusy] = useState(false)

  async function loadNotifications(unreadOnly = state.unreadOnly) {
    setState((current) => ({ ...current, loading: true, error: '', unreadOnly }))
    try {
      const response = await api.get('/notifications/', {
        params: { unread_only: unreadOnly ? 'true' : undefined },
      })
      setState((current) => ({
        ...current,
        loading: false,
        notifications: response.data || [],
        unreadOnly,
      }))
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error.response?.data?.detail || 'Could not load notifications.',
        notifications: [],
      }))
    }
  }

  useEffect(() => {
    let active = true
    async function bootstrap() {
      try {
        await api.post('/notifications/read-all/')
        window.dispatchEvent(new Event('notifications:changed'))
      } catch {
      } finally {
        if (active) {
          loadNotifications(false)
        }
      }
    }
    bootstrap()
    return () => {
      active = false
    }
  }, [])

  async function markAsRead(notificationId) {
    setBusy(true)
    try {
      const response = await api.post(`/notifications/${notificationId}/read/`)
      setState((current) => ({
        ...current,
        notifications: current.notifications.map((item) =>
          item.id === notificationId ? response.data : item,
        ),
      }))
      window.dispatchEvent(new Event('notifications:changed'))
    } catch {
    } finally {
      setBusy(false)
    }
  }

  async function markAllRead() {
    setBusy(true)
    try {
      await api.post('/notifications/read-all/')
      await loadNotifications(state.unreadOnly)
      window.dispatchEvent(new Event('notifications:changed'))
    } catch {
    } finally {
      setBusy(false)
    }
  }

  function formatEventType(value) {
    return (value || 'notification')
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow={null}
        title="Your notifications"
        description="All updates related to requests, messages, and account actions."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                state.unreadOnly
                  ? 'border-border bg-background text-foreground hover:bg-muted/60'
                  : 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
              onClick={() => loadNotifications(false)}
              disabled={busy}
            >
              All
            </button>
            <button
              type="button"
              className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                state.unreadOnly
                  ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border-border bg-background text-foreground hover:bg-muted/60'
              }`}
              onClick={() => loadNotifications(true)}
              disabled={busy}
            >
              Unread only
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={markAllRead}
              disabled={busy}
            >
              Mark all read
            </button>
          </div>
        )}
      />

      <section className="surface-card overflow-hidden">
        {state.loading && <p className="px-4 py-6 text-sm text-muted-foreground">Loading notifications...</p>}
        {state.error && <p className="px-4 py-6 text-sm font-medium text-destructive">{state.error}</p>}
        {!state.loading && !state.error && state.notifications.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications.</p>
        )}
        {!state.loading && !state.error && state.notifications.length > 0 && (
          <div className="divide-y divide-border">
            {state.notifications.map((item) => (
              <article
                key={item.id}
                className={`px-4 py-4 transition-colors ${item.is_read ? 'bg-card' : 'bg-primary-soft/50'}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {formatEventType(item.event_type)}
                    </span>
                  </div>
                  <small className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</small>
                </div>

                <p className="mt-3 text-sm text-foreground/90">{item.message}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {item.link ? (
                    <a
                      className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60"
                      href={item.link}
                    >
                      Open
                    </a>
                  ) : null}
                  {!item.is_read ? (
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => markAsRead(item.id)}
                      disabled={busy}
                    >
                      Mark read
                    </button>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      Read
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default NotificationsPage
