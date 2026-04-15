import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../lib/api'

const statusClassMap = {
  NEW: 'status-tag info',
  ACCEPTED: 'status-tag active',
  IN_PROGRESS: 'status-tag warning',
  REJECTED: 'status-tag danger',
  COMPLETED: 'status-tag active',
  CLOSED: 'status-tag muted',
}

function RequestsPage() {
  const [state, setState] = useState({ loading: true, error: '', requests: [] })

  useEffect(() => {
    let active = true
    async function loadRequests() {
      try {
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
  }, [])

  return (
    <main className="page-content">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Requests</p>
            <h1>Your requests</h1>
          </div>
          <Link className="pill-link" to="/requests/create">
            Create Request
          </Link>
        </div>

        {state.loading && <p className="muted-text">Loading requests...</p>}
        {state.error && <p className="error-text">{state.error}</p>}

        {!state.loading && !state.error && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {state.requests.length === 0 && (
                  <tr>
                    <td colSpan="5">No requests yet.</td>
                  </tr>
                )}
                {state.requests.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link className="inline-link" to={`/requests/${item.id}`}>
                        {item.title}
                      </Link>
                    </td>
                    <td>{item.type}</td>
                    <td>
                      <span className={statusClassMap[item.status] || 'status-tag'}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.priority}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
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
