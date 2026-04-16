import { useMemo } from 'react'

import { useAuth } from '../context/AuthContext'

function ProfilePage() {
  const { user } = useAuth()
  const primaryRole = useMemo(
    () => user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user',
    [user?.role_keys],
  )

  return (
    <main className="page-content">
      <section className="workspace-header">
        <div className="panel-header">
          <div className="page-intro">
            <p className="eyebrow">Profile</p>
            <h1>{user?.first_name || user?.username || 'User profile'}</h1>
            <p className="subtitle">Your account and workspace identity details.</p>
          </div>
        </div>
      </section>

      <section className="kpi-grid">
        <article className="summary-card summary-card-emphasis">
          <span>Username</span>
          <strong className="stat-value-small">{user?.username || '-'}</strong>
          <p className="muted-text">login identity</p>
        </article>
        <article className="summary-card">
          <span>Primary role</span>
          <strong className="stat-value-small">{primaryRole}</strong>
          <p className="muted-text">current permission lane</p>
        </article>
        <article className="summary-card">
          <span>Company</span>
          <strong className="stat-value-small">{user?.company_name || '-'}</strong>
          <p className="muted-text">business scope</p>
        </article>
        <article className="summary-card">
          <span>Entity</span>
          <strong className="stat-value-small">{user?.entity_name || '-'}</strong>
          <p className="muted-text">operational unit</p>
        </article>
      </section>

      <section className="editorial-grid">
        <article className="panel">
          <p className="eyebrow">Account details</p>
          <div className="workspace-list">
            <div className="workspace-list-item">
              <div>
                <strong>Full name</strong>
                <p className="muted-text">
                  {`${user?.first_name || ''} ${user?.last_name || ''}`.trim() || '-'}
                </p>
              </div>
            </div>
            <div className="workspace-list-item">
              <div>
                <strong>Email</strong>
                <p className="muted-text">{user?.email || 'No email set'}</p>
              </div>
            </div>
            <div className="workspace-list-item">
              <div>
                <strong>Entity type</strong>
                <p className="muted-text">{user?.entity_type || '-'}</p>
              </div>
            </div>
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">Permissions</p>
          <div className="workspace-list">
            <div className="workspace-list-item">
              <div>
                <strong>Roles</strong>
                <p className="muted-text">
                  {(user?.role_keys || []).join(', ').replaceAll('_', ' ') || '-'}
                </p>
              </div>
            </div>
            <div className="workspace-list-item">
              <div>
                <strong>Request creation</strong>
                <p className="muted-text">
                  {user?.request_creation_allowed ? 'Allowed' : 'Not allowed'}
                </p>
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  )
}

export default ProfilePage
