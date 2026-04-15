import { useEffect, useState } from 'react'
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

  return (
    <main className="page-content">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Requests</p>
            <h1>{isProdSide ? 'Your requests' : 'Incoming Requests'}</h1>
          </div>
          {user?.request_creation_allowed ? (
            <Link className="pill-link" to="/requests/create">
              Create Request
            </Link>
          ) : (
            <span className="muted-text">
              Only users from production entities can create requests.
            </span>
          )}
        </div>

        {state.loading && <p className="muted-text">Loading requests...</p>}
        {state.error && (
          <div className="state-card">
            <p className="error-text">{state.error}</p>
          </div>
        )}

        {!state.loading && !state.error && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Target</th>
                  <th>Creator</th>
                  <th>Assignee</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.requests.length === 0 && (
                  <tr>
                    <td colSpan="10">
                      {isProdSide ? 'No requests yet.' : 'No incoming requests for your team.'}
                    </td>
                  </tr>
                )}
                {state.requests.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.reference_code || item.request_number}</strong>
                    </td>
                    <td>
                      {item.title}
                    </td>
                    <td>{item.type}</td>
                    <td>
                      <span className={statusClassMap[item.status] || 'status-tag'}>
                        {statusLabelMap[item.status] || item.status}
                      </span>
                    </td>
                    <td>{item.source_entity_name || '-'}</td>
                    <td>{item.target_team_name || '-'}</td>
                    <td>{item.creator_name || '-'}</td>
                    <td>{item.current_assignee_name || 'Unassigned'}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                    <td>
                      <Link className="table-action" to={`/requests/${item.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

export default RequestsPage
