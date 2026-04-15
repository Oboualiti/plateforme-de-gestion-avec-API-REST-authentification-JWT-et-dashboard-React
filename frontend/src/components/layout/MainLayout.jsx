import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'

function MainLayout() {
  const { user, logout } = useAuth()
  const menuItems = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/requests', label: 'Requests' },
    { to: '/admin/permissions', label: 'Permission Management' },
  ]

  return (
    <div className="layout-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <p className="eyebrow">Request Hub</p>
          <h2>Operations Portal</h2>
          <p className="muted-text">
            {user?.first_name || user?.username} · {user?.role_keys?.join(', ') || 'user'}
          </p>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? 'nav-item nav-item-active' : 'nav-item'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button type="button" className="ghost-button sidebar-logout" onClick={logout}>
          Logout
        </button>
      </aside>

      <section className="layout-content">
        <Outlet />
      </section>
    </div>
  )
}

export default MainLayout
