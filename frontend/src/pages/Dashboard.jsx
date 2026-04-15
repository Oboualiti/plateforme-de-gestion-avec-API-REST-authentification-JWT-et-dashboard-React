import { useMemo } from 'react'

import { useAuth } from '../context/AuthContext'

function Dashboard() {
  const { user } = useAuth()
  const now = useMemo(() => new Date().toLocaleString(), [])

  return (
    <main className="page-content">
      <section className="panel">
        <p className="eyebrow">Dashboard</p>
        <h1>Welcome back, {user?.first_name || user?.username}</h1>
        <div className="summary-grid">
          <div className="summary-card">
            <span>Name</span>
            <strong>
              {user?.first_name} {user?.last_name}
            </strong>
          </div>
          <div className="summary-card">
            <span>Email</span>
            <strong>{user?.email || '-'}</strong>
          </div>
          <div className="summary-card">
            <span>Role</span>
            <strong>{user?.role_keys?.join(', ') || '-'}</strong>
          </div>
          <div className="summary-card">
            <span>Company</span>
            <strong>{user?.company_name || '-'}</strong>
          </div>
          <div className="summary-card">
            <span>Entity</span>
            <strong>{user?.entity_name || '-'}</strong>
          </div>
          <div className="summary-card">
            <span>Current time</span>
            <strong>{now}</strong>
          </div>
        </div>
      </section>

      <section className="detail-grid">
        <section className="panel">
          <p className="eyebrow">Upcoming</p>
          <h2>Requests workspace</h2>
          <p className="muted-text">Recent activity, team queues, and SLA widgets will appear here.</p>
        </section>
        <section className="panel">
          <p className="eyebrow">Upcoming</p>
          <h2>Reports and alerts</h2>
          <p className="muted-text">Reporting summaries and notifications are reserved for the next iteration.</p>
        </section>
      </section>
    </main>
  )
}

export default Dashboard
