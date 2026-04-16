import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const statusClassMap = {
  NEW: 'status-tag info',
  ACCEPTED: 'status-tag active',
  IN_PROGRESS: 'status-tag warning',
  REJECTED: 'status-tag danger',
  COMPLETED: 'status-tag active',
  CLOSED: 'status-tag muted',
}

const statusLabelMap = {
  NEW: 'New',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
}

function RequestsPage() {
  const { user, refreshUser } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', requests: [] })
  const isProdSide = user?.entity_type === 'PROD'

  useEffect(() => {
    let active = true
    async function loadRequests() {
      try {
        await refreshUser()
        const response = await api.get('/requests/')
        if (active) {
          setState({ loading: false, error: '', requests: response.data })
        }
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error.response?.data?.detail || 'Could not load requests.',
            requests: [],
          })
        }
      }
    }
    loadRequests()
    return () => {
      active = false
    }
  }, [refreshUser])

  const metrics = useMemo(() => {
    const requests = state.requests || []
    return {
      total: requests.length,
      pending: requests.filter((item) => item.status === 'NEW').length,
      inProgress: requests.filter((item) => item.status === 'IN_PROGRESS').length,
      resolved: requests.filter((item) => ['COMPLETED', 'CLOSED'].includes(item.status)).length,
    }
  }, [state.requests])

  return (
    <main className="page-content">
      <section className="workspace-header">
        <div className="panel-header">
          <div className="page-intro">
            <p className="eyebrow">{isProdSide ? 'Requests' : 'Team queue'}</p>
            <h1>{isProdSide ? 'My requests' : 'Incoming requests'}</h1>
            <p>
              {isProdSide
                ? 'Track requests you created and follow their progress.'
                : 'Review incoming work, ownership, and current execution status.'}
            </p>
          </div>
          {user?.request_creation_allowed ? (
            <Link className="pill-link-primary pill-link" to="/requests/create">
              New request
            </Link>
          ) : null}
        </div>
      </section>

      <section className="kpi-grid">
        <article className="summary-card summary-card-emphasis">
          <span>Pending review</span>
          <strong>{metrics.pending}</strong>
        </article>
        <article className="summary-card">
          <span>In progress</span>
          <strong>{metrics.inProgress}</strong>
        </article>
        <article className="summary-card">
          <span>Resolved</span>
          <strong>{metrics.resolved}</strong>
        </article>
        <article className="summary-card">
          <span>Total requests</span>
          <strong className="metric-highlight">{metrics.total}</strong>
        </article>
      </section>

      <section className="table-wrap">
        <div className="card-toolbar">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>Request list</h2>
          </div>
          <div className="toolbar-group">
            <span className="status-tag info">{isProdSide ? 'Personal view' : 'Team view'}</span>
            <span className="muted-text">{metrics.total} records</span>
          </div>
        </div>

        {state.loading && <p className="table-caption">Loading requests...</p>}
        {state.error && (
          <div className="table-caption">
            <p className="error-text">{state.error}</p>
          </div>
        )}

        {!state.loading && !state.error && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Target</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.requests.length === 0 && (
                <tr>
                  <td colSpan="5">
                    {isProdSide ? 'No requests yet.' : 'No incoming requests for your team.'}
                  </td>
                </tr>
              )}
              {state.requests.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="caption-grid">
                      <strong>{item.title}</strong>
                      <span className="muted-text">
                        {item.reference_code || item.request_number} · {item.type}
                      </span>
                    </div>
                  </td>
                  <td>{item.target_team_name || '-'}</td>
                  <td>
                    <span className={statusClassMap[item.status] || 'status-tag'}>
                      {statusLabelMap[item.status] || item.status}
                    </span>
                  </td>
                  <td>{new Date(item.created_at).toLocaleString()}</td>
                  <td className="table-actions">
                    <Link className="ghost-button pill-link" to={`/requests/${item.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

export default RequestsPage
