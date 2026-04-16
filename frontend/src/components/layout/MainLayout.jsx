import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'

import SidebarAccordion from '../navigation/SidebarAccordion'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { getSidebarSections, getSidebarVariant } from '../../lib/sidebarNavigation'

function getInitials(user) {
  const source = user?.first_name || user?.username || 'U'
  return source.slice(0, 2).toUpperCase()
}

function MainLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [topbarSearch, setTopbarSearch] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationPreview, setNotificationPreview] = useState([])
  const userMenuRef = useRef(null)
  const notificationMenuRef = useRef(null)
  const sidebarSections = getSidebarSections(user)
  const sidebarVariant = getSidebarVariant(user)
  const userName = user?.first_name || user?.username
  const userRole = user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'

  function submitTopbarSearch(event) {
    event.preventDefault()
    const search = topbarSearch.trim()
    if (!search) {
      navigate('/requests')
      return
    }
    navigate(`/requests?search=${encodeURIComponent(search)}`)
  }

  useEffect(() => {
    function handleDocumentClick(event) {
      if (!userMenuRef.current?.contains(event.target)) {
        setUserMenuOpen(false)
      }
      if (!notificationMenuRef.current?.contains(event.target)) {
        setNotificationMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDocumentClick)
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
    }
  }, [])

  useEffect(() => {
    setNotificationMenuOpen(false)
    let active = true
    async function loadNotificationState() {
      try {
        const [countResponse, previewResponse] = await Promise.all([
          api.get('/notifications/unread-count/'),
          api.get('/notifications/', {
            params: { unread_only: 'true' },
          }),
        ])
        if (active) {
          setUnreadCount(countResponse.data?.unread_count || 0)
          setNotificationPreview((previewResponse.data || []).slice(0, 5))
        }
      } catch {
      }
    }
    function handleNotificationChanged() {
      loadNotificationState()
    }
    loadNotificationState()
    window.addEventListener('notifications:changed', handleNotificationChanged)
    const intervalId = setInterval(loadNotificationState, 10000)
    return () => {
      active = false
      window.removeEventListener('notifications:changed', handleNotificationChanged)
      clearInterval(intervalId)
    }
  }, [location.pathname])

  async function openNotificationFromPreview(event, item) {
    event.preventDefault()
    const targetLink = item.link || '/notifications'
    setNotificationMenuOpen(false)
    try {
      if (!item.is_read) {
        await api.post(`/notifications/${item.id}/read/`)
        setUnreadCount((current) => Math.max(0, current - 1))
        setNotificationPreview((current) => current.filter((entry) => entry.id !== item.id))
        window.dispatchEvent(new Event('notifications:changed'))
      }
    } catch {
    } finally {
      navigate(targetLink)
    }
  }

  return (
    <div className="layout-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-mark">
            <svg fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="22">
              <path d="M4 20h16" />
              <path d="M6 20V9" />
              <path d="M12 20V9" />
              <path d="M18 20V9" />
              <path d="M3 9h18L12 4 3 9Z" />
            </svg>
          </div>
          <h2>Request Platform</h2>
          <p className="muted-text">Operations workspace</p>
          <p className="sidebar-variant-label">{sidebarVariant.replaceAll('_', ' ')}</p>
        </div>

        <nav className="sidebar-nav">
          <SidebarAccordion sections={sidebarSections} />
        </nav>

        <div className="sidebar-footer">
          {user?.request_creation_allowed && (
            <Link className="pill-link sidebar-primary-action" to="/requests/create">
              New request
            </Link>
          )}

          <div className="brand-card">
            <p className="eyebrow">Workspace</p>
            <h3>{user?.company_name || 'Global operations'}</h3>
            <p className="muted-text">{user?.entity_name || 'No entity assigned'}</p>
            <div className="sidebar-footer-meta">
              <Link to="/requests">Requests</Link>
              <Link to="/dashboard">Dashboard</Link>
            </div>
          </div>

          <button type="button" className="ghost-button sidebar-logout" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>

      <section className="layout-content">
        <header className="app-topbar">
          <div className="app-topbar-title">
            <h2>Workspace</h2>
            <span className="app-topbar-divider" />
            <form className="app-topbar-search" onSubmit={submitTopbarSearch}>
              <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                placeholder="Search requests, users, entities"
                value={topbarSearch}
                onChange={(event) => setTopbarSearch(event.target.value)}
              />
            </form>
          </div>

          <div className="app-topbar-actions">
            <div
              className={`app-notification-menu ${notificationMenuOpen ? 'app-notification-menu-open' : ''}`}
              ref={notificationMenuRef}
            >
              <button
                type="button"
                className="app-notification-button"
                aria-label="Notifications"
                aria-expanded={notificationMenuOpen}
                onClick={() => {
                  setNotificationMenuOpen((current) => !current)
                  setUserMenuOpen(false)
                }}
              >
                <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="20">
                  <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                  <path d="M9 17a3 3 0 0 0 6 0" />
                </svg>
                {unreadCount > 0 ? (
                  <span className="app-notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                ) : null}
              </button>
              <div className="app-notification-panel">
                <div className="app-notification-panel-head">
                  <strong>Notifications</strong>
                  <span>{unreadCount} unread</span>
                </div>
                {notificationPreview.length === 0 ? (
                  <p className="muted-text">No new notifications.</p>
                ) : (
                  <div className="app-notification-preview-list">
                    {notificationPreview.map((item) => (
                      <Link
                        key={item.id}
                        className="app-notification-preview-item"
                        to={item.link || '/notifications'}
                        onClick={(event) => openNotificationFromPreview(event, item)}
                      >
                        <strong>{item.title}</strong>
                        <p>{item.message}</p>
                      </Link>
                    ))}
                  </div>
                )}
                <Link className="app-user-menu-link" to="/notifications" onClick={() => setNotificationMenuOpen(false)}>
                  Open notifications
                </Link>
              </div>
            </div>
            <div className={`app-user-menu ${userMenuOpen ? 'app-user-menu-open' : ''}`} ref={userMenuRef}>
              <button
                type="button"
                className="app-user-chip app-user-chip-button"
                onClick={() => setUserMenuOpen((current) => !current)}
              >
                <div>
                  <strong>{userName}</strong>
                  <p className="muted-text">{userRole}</p>
                </div>
                <div className="app-avatar">{getInitials(user)}</div>
              </button>
              <div className="app-user-menu-panel">
                <div className="app-user-menu-profile">
                  <strong>{userName}</strong>
                  <p className="muted-text">{user?.email || 'No email set'}</p>
                  <p className="muted-text">
                    {user?.company_name || 'Global'} / {user?.entity_name || 'No entity'}
                  </p>
                </div>
                <Link className="app-user-menu-link" to="/profile">
                  Profile
                </Link>
                <button type="button" className="app-user-menu-link" onClick={() => { setUserMenuOpen(false); logout() }}>
                  Log out
                </button>
              </div>
            </div>
          </div>
        </header>

        <Outlet />
      </section>
    </div>
  )
}

export default MainLayout
