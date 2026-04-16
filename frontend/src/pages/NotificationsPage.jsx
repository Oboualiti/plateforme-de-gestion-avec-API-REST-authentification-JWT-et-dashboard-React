import { useEffect, useState } from 'react'

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
      setBusy(false)
    }
  }

  return (
    <main className="page-content">
      <section className="workspace-header">
        <div className="panel-header">
          <div className="page-intro">
            <p className="eyebrow">Notifications</p>
            <h1>Your notifications</h1>
            <p className="subtitle">All updates related to requests, messages, and account actions.</p>
          </div>
          <div className="page-actions">
            <button
              type="button"
              className={state.unreadOnly ? 'ghost-button pill-link' : 'pill-link-primary pill-link'}
              onClick={() => loadNotifications(false)}
              disabled={busy}
            >
              All
            </button>
            <button
              type="button"
              className={state.unreadOnly ? 'pill-link-primary pill-link' : 'ghost-button pill-link'}
              onClick={() => loadNotifications(true)}
              disabled={busy}
            >
              Unread only
            </button>
            <button type="button" className="ghost-button pill-link" onClick={markAllRead} disabled={busy}>
              Mark all read
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        {state.loading && <p className="muted-text">Loading notifications...</p>}
        {state.error && <p className="error-text">{state.error}</p>}
        {!state.loading && !state.error && state.notifications.length === 0 && (
          <p className="muted-text">No notifications.</p>
        )}
        {!state.loading && !state.error && state.notifications.length > 0 && (
          <div className="thread-list">
            {state.notifications.map((item) => (
              <article
                key={item.id}
                className={`thread-card ${item.is_read ? 'notification-read' : 'notification-unread'}`}
              >
                <div className="thread-head">
                  <div>
                    <strong>{item.title}</strong>
                    <div className="subline">{item.event_type.replaceAll('_', ' ')}</div>
                  </div>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </div>
                <p>{item.message}</p>
                <div className="button-row">
                  {item.link ? (
                    <a className="ghost-button pill-link" href={item.link}>
                      Open
                    </a>
                  ) : null}
                  {!item.is_read ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => markAsRead(item.id)}
                      disabled={busy}
                    >
                      Mark read
                    </button>
                  ) : (
                    <span className="status-tag active">Read</span>
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
