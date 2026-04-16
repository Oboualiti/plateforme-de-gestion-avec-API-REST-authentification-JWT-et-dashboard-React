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

const requestTypeOptions = ['INFO', 'SCRIPT', 'TOOL', 'APP_PROJECT']

function RequestsPage() {
  const { user, refreshUser } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', requests: [] })
  const [filters, setFilters] = useState({
    search: '',
    company: '',
    source_entity: '',
    target_entity: '',
    type: '',
    status: '',
    stuck: false,
  })

  const roleKeys = useMemo(() => user?.role_keys || [], [user?.role_keys])
  const isGlobalAdmin = roleKeys.includes('super_admin')
  const isSenior = roleKeys.includes('senior')
  const isManagerView = isGlobalAdmin || isSenior
  const title = isGlobalAdmin
    ? 'All requests'
    : isSenior
      ? `Company requests (${user?.company_name || 'No company'})`
      : user?.entity_type === 'PROD'
        ? 'Your requests'
        : 'Incoming Requests'

  useEffect(() => {
    let active = true
    async function loadRequests() {
      try {
        await refreshUser()
        const params = {
          search: filters.search || undefined,
          company: filters.company || undefined,
          source_entity: filters.source_entity || undefined,
          target_entity: filters.target_entity || undefined,
          type: filters.type || undefined,
          status: filters.status || undefined,
          stuck: filters.stuck ? 'true' : undefined,
        }
        const response = await api.get('/requests/', { params })
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
    setState((current) => ({ ...current, loading: true, error: '' }))
    loadRequests()
    return () => {
      active = false
    }
  }, [filters, refreshUser])

  function resetFilters() {
    setFilters({
      search: '',
      company: '',
      source_entity: '',
      target_entity: '',
      type: '',
      status: '',
      stuck: false,
    })
  }

  return (
    <main className="page-content">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Requests Management</p>
            <h1>{title}</h1>
          </div>
          {user?.request_creation_allowed ? (
            <Link className="pill-link" to="/requests/create">
              Send Request
            </Link>
          ) : (
            <span className="muted-text">Request sending is not enabled for your user.</span>
          )}
        </div>

        <div className="filter-bar">
          <input
            placeholder="Search by ref, title, description, creator"
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
          />
          <input
            placeholder="Company"
            value={filters.company}
            onChange={(event) =>
              setFilters((current) => ({ ...current, company: event.target.value }))
            }
            disabled={!isManagerView}
          />
          <input
            placeholder="Source entity"
            value={filters.source_entity}
            onChange={(event) =>
              setFilters((current) => ({ ...current, source_entity: event.target.value }))
            }
          />
          <input
            placeholder="Target team"
            value={filters.target_entity}
            onChange={(event) =>
              setFilters((current) => ({ ...current, target_entity: event.target.value }))
            }
          />
          <select
            className="app-select"
            value={filters.type}
            onChange={(event) =>
              setFilters((current) => ({ ...current, type: event.target.value }))
            }
          >
            <option value="">All types</option>
            {requestTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            className="app-select"
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="">All statuses</option>
            {Object.keys(statusLabelMap).map((statusCode) => (
              <option key={statusCode} value={statusCode}>
                {statusLabelMap[statusCode]}
              </option>
            ))}
          </select>
          <label className="checkbox-row" htmlFor="stuck-only">
            <input
              id="stuck-only"
              type="checkbox"
              checked={filters.stuck}
              onChange={(event) =>
                setFilters((current) => ({ ...current, stuck: event.target.checked }))
              }
            />
            Stuck only
          </label>
          <button className="ghost-button" type="button" onClick={resetFilters}>
            Clear filters
          </button>
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
                  <th>Stuck</th>
                  <th>Company</th>
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
                    <td colSpan="12">No requests found for the selected filters.</td>
                  </tr>
                )}
                {state.requests.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.reference_code || item.request_number}</strong>
                    </td>
                    <td>{item.title}</td>
                    <td>{item.type}</td>
                    <td>
                      <span className={statusClassMap[item.status] || 'status-tag'}>
                        {statusLabelMap[item.status] || item.status}
                      </span>
                    </td>
                    <td>
                      {item.is_stuck ? (
                        <span className="status-tag danger">Yes</span>
                      ) : (
                        <span className="status-tag active">No</span>
                      )}
                    </td>
                    <td>{item.company_name || '-'}</td>
                    <td>{item.source_entity_name || '-'}</td>
                    <td>{item.target_team_name || '-'}</td>
                    <td>{item.creator_name || '-'}</td>
                    <td>{item.current_assignee_name || 'Unassigned'}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                    <td>
                      <Link className="table-action" to={`/requests/${item.id}`}>
                        Open
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
