import { useCallback, useRef, useState } from 'react'

import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

function dispatchNotificationsChanged() {
  window.dispatchEvent(new Event('notifications:changed'))
}

export function useNotifications({ limit } = {}) {
  const { user } = useAuth()
  const unreadOnlyRef = useRef(false)
  const [state, setState] = useState({
    loading: true,
    error: '',
    notifications: [],
    totalCount: 0,
    unreadCount: 0,
    unreadOnly: false,
  })
  const [busy, setBusy] = useState(false)
  const canViewRequestDiscussion = Boolean(
    user?.effective_permission_keys?.includes('view_request_discussion'),
  )

  const filterVisibleNotifications = useCallback(
    (list) => {
      if (canViewRequestDiscussion) return list
      return (list || []).filter((item) => {
        const eventType = String(item?.event_type || '').toUpperCase()
        const hasMessageId = Boolean(item?.metadata?.message_id)
        return eventType !== 'REQUEST_MESSAGE' && !hasMessageId
      })
    },
    [canViewRequestDiscussion],
  )

  const loadNotifications = useCallback(
    async (nextUnreadOnly = unreadOnlyRef.current) => {
      unreadOnlyRef.current = nextUnreadOnly
      setState((current) => ({ ...current, loading: true, error: '', unreadOnly: nextUnreadOnly }))
      try {
        const response = await api.get('/notifications/', {
          params: { unread_only: nextUnreadOnly ? 'true' : undefined },
        })
        const visibleNotifications = filterVisibleNotifications(response.data || [])
        const unreadCount = nextUnreadOnly
          ? visibleNotifications.length
          : visibleNotifications.filter((item) => !item.is_read).length
        setState((current) => ({
          ...current,
          loading: false,
          notifications: limit ? visibleNotifications.slice(0, limit) : visibleNotifications,
          totalCount: visibleNotifications.length,
          unreadCount,
          unreadOnly: nextUnreadOnly,
        }))
      } catch (error) {
        setState((current) => ({
          ...current,
          loading: false,
          error: error.response?.data?.detail || 'Could not load notifications.',
          notifications: [],
          totalCount: 0,
          unreadCount: 0,
        }))
      }
    },
    [filterVisibleNotifications, limit],
  )

  const markAsRead = useCallback(async (notificationId) => {
    setBusy(true)
    try {
      await api.post(`/notifications/${notificationId}/read/`)
      await loadNotifications(unreadOnlyRef.current)
      dispatchNotificationsChanged()
    } catch {
    } finally {
      setBusy(false)
    }
  }, [loadNotifications])

  const markAllRead = useCallback(async () => {
    setBusy(true)
    try {
      await api.post('/notifications/read-all/')
      await loadNotifications(unreadOnlyRef.current)
      dispatchNotificationsChanged()
    } catch {
    } finally {
      setBusy(false)
    }
  }, [loadNotifications])

  return {
    ...state,
    busy,
    canViewRequestDiscussion,
    loadNotifications,
    markAsRead,
    markAllRead,
  }
}
