import { Link } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'

function Dashboard() {
  const { user } = useAuth()
  const quickActions = [
    user?.request_creation_allowed ? { label: 'Create request', to: '/requests/create' } : null,
    { label: 'Open requests', to: '/requests' },
    { label: 'Admin workspace', to: '/admin/dashboard' },
  ].filter(Boolean)

  return (
    <main className="page-content">
      <section className="workspace-header">
        <div className="panel-header">
          <div className="page-intro">
            <p className="eyebrow">Dashboard</p>
            <h1>Operations overview</h1>
            <p className="subtitle">
              Monitor workload, ownership, and request flow from a single operational workspace.
            </p>
          </div>
          <div className="page-actions">
            {quickActions.map((action, index) => (
              <Link
                key={action.to}
                className={index === 0 ? 'pill-link-primary pill-link' : 'ghost-button pill-link'}
                to={action.to}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="workspace-meta">
          <span className="status-tag info">{user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'}</span>
          <span className="muted-text">{user?.company_name || 'Global'}</span>
          <span className="muted-text">{user?.entity_name || 'No entity assigned'}</span>
        </div>
      </section>

      <section className="kpi-grid">
        <article className="summary-card summary-card-emphasis">
          <span>Access scope</span>
          <strong>{user?.role_keys?.length || 0}</strong>
          <p className="muted-text">active role lane(s)</p>
        </article>
        <article className="summary-card">
          <span>Company</span>
          <strong className="stat-value-small">{user?.company_name || 'Global'}</strong>
          <p className="muted-text">current business scope</p>
        </article>
        <article className="summary-card">
          <span>Entity</span>
          <strong className="stat-value-small">{user?.entity_name || 'Pending'}</strong>
          <p className="muted-text">assigned operating unit</p>
        </article>
        <article className="summary-card">
          <span>Request actions</span>
          <strong>{user?.request_creation_allowed ? 'Enabled' : 'View only'}</strong>
          <p className="muted-text">workspace permissions</p>
        </article>
      </section>

      <section className="editorial-grid">
        <div className="editorial-stack">
          <section className="panel">
            <div className="workspace-section-title">
              <div>
                <p className="eyebrow">Queue health</p>
                <h2>Request lifecycle</h2>
              </div>
              <Link className="inline-link" to="/requests">
                View requests
              </Link>
            </div>
            <div className="request-lifecycle">
              <div className="request-lifecycle-step request-lifecycle-step-active">
                Draft
                <span>Created and waiting for review</span>
              </div>
              <div className="request-lifecycle-step">
                Accepted
                <span>Picked up by the target team</span>
              </div>
              <div className="request-lifecycle-step">
                In progress
                <span>Work is underway</span>
              </div>
              <div className="request-lifecycle-step">
                Completed
                <span>Work finished</span>
              </div>
              <div className="request-lifecycle-step">
                Closed
                <span>Lifecycle finalized</span>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="workspace-section-title">
              <div>
                <p className="eyebrow">Activity</p>
                <h2>Operational focus areas</h2>
              </div>
            </div>
            <div className="workspace-list">
              <div className="workspace-list-item">
                <div>
                  <strong>Requests</strong>
                  <p className="muted-text">Use list views as the main workspace for triage and tracking.</p>
                </div>
                <Link className="table-action" to="/requests">
                  Open
                </Link>
              </div>
              <div className="workspace-list-item">
                <div>
                  <strong>Administration</strong>
                  <p className="muted-text">Manage users, entities, hierarchy, and permissions from structured tables.</p>
                </div>
                <Link className="ghost-button pill-link" to="/admin/dashboard">
                  Review
                </Link>
              </div>
              <div className="workspace-list-item">
                <div>
                  <strong>Monitoring</strong>
                  <p className="muted-text">Track logs, notifications, and operational reporting.</p>
                </div>
                <Link className="ghost-button pill-link" to="/admin/reports">
                  Explore
                </Link>
              </div>
            </div>
          </section>
        </div>

        <div className="editorial-stack">
          <article className="panel">
            <p className="eyebrow">User profile</p>
            <h3>{user?.first_name || user?.username}</h3>
            <p className="muted-text">
              {user?.company_name || 'Global'} · {user?.entity_name || 'No entity assigned'}
            </p>
            <div className="workspace-list">
              <div className="workspace-list-item">
                <div>
                  <strong>Primary role</strong>
                  <p className="muted-text">{user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'}</p>
                </div>
              </div>
              <div className="workspace-list-item">
                <div>
                  <strong>Access</strong>
                  <p className="muted-text">
                    {user?.request_creation_allowed
                      ? 'Can create and manage requests.'
                      : 'Limited to review and operational tracking.'}
                  </p>
                </div>
              </div>
            </div>
          </article>

          <article className="panel">
            <p className="eyebrow">Quick guidance</p>
            <h3>How to use this workspace</h3>
            <p className="muted-text">
              Use the sidebar for role-specific modules, tables for operational work, and detail pages for actions, comments, and history.
            </p>
          </article>
        </div>
      </section>
    </main>
  )
}

export default Dashboard
