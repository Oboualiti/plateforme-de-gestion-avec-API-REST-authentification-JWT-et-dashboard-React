import { Link, Outlet } from 'react-router-dom'

import SidebarAccordion from '../navigation/SidebarAccordion'
import { useAuth } from '../../context/AuthContext'
import { getSidebarSections, getSidebarVariant } from '../../lib/sidebarNavigation'

function getInitials(user) {
  const source = user?.first_name || user?.username || 'U'
  return source.slice(0, 2).toUpperCase()
}

function MainLayout() {
  const { user, logout } = useAuth()
  const sidebarSections = getSidebarSections(user)
  const sidebarVariant = getSidebarVariant(user)
  const userName = user?.first_name || user?.username
  const userRole = user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'

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
            Sign out
          </button>
        </div>
      </aside>

      <section className="layout-content">
        <header className="app-topbar">
          <div className="app-topbar-title">
            <h2>Workspace</h2>
            <span className="app-topbar-divider" />
            <div className="app-topbar-search">
              <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input placeholder="Search requests, users, entities" readOnly value="" />
            </div>
          </div>

          <div className="app-topbar-actions">
            <div className="app-topbar-links">
              <Link to="/requests">Requests</Link>
              <Link to="/admin/dashboard">Admin</Link>
            </div>

            <div className="app-user-chip">
              <div>
                <strong>{userName}</strong>
                <p className="muted-text">{userRole}</p>
              </div>
              <div className="app-avatar">{getInitials(user)}</div>
            </div>
          </div>
        </header>

        <Outlet />
      </section>
    </div>
  )
}

export default MainLayout
