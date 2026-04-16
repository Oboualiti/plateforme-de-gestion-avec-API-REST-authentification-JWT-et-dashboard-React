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

  const metrics = useMemo(() => {
    const requests = state.requests || []
    return {
      total: requests.length,
      pending: requests.filter((item) => item.status === 'NEW').length,
      inProgress: requests.filter((item) => item.status === 'IN_PROGRESS').length,
      stuck: requests.filter((item) => item.is_stuck).length,
    }
  }, [state.requests])

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
      <section className="workspace-header">
        <div className="panel-header">
          <div className="page-intro">
            <p className="eyebrow">Requests</p>
            <h1>{title}</h1>
            <p>Use filters to narrow operational work and open requests for status updates, discussion, and routing.</p>
          </div>
          {user?.request_creation_allowed ? (
            <Link className="pill-link-primary pill-link" to="/requests/create">
              New request
            </Link>
          ) : (
            <span className="muted-text">Request creation is not enabled for your user.</span>
          )}
        </div>
      </section>

      <section className="kpi-grid">
        <article className="summary-card summary-card-emphasis">
          <span>Total requests</span>
          <strong>{metrics.total}</strong>
        </article>
        <article className="summary-card">
          <span>Pending</span>
          <strong>{metrics.pending}</strong>
        </article>
        <article className="summary-card">
          <span>In progress</span>
          <strong>{metrics.inProgress}</strong>
        </article>
        <article className="summary-card">
          <span>Stuck</span>
          <strong>{metrics.stuck}</strong>
        </article>
      </section>

      <section className="table-wrap">
        <div className="card-toolbar">
          <div>
            <p className="eyebrow">Filters</p>
            <h2>Request workspace</h2>
          </div>
          <span className="muted-text">{state.loading ? 'Loading...' : `${metrics.total} result(s)`}</span>
        </div>

        <div className="filter-bar table-caption">
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
          <table className="data-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Status</th>
                <th>Scope</th>
                <th>Ownership</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.requests.length === 0 && (
                <tr>
                  <td colSpan="6">No requests found for the selected filters.</td>
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
                  <td>
                    <div className="caption-grid">
                      <span className={statusClassMap[item.status] || 'status-tag'}>
                        {statusLabelMap[item.status] || item.status}
                      </span>
                      {item.is_stuck ? <span className="status-tag danger">Stuck</span> : null}
                    </div>
                  </td>
                  <td>
                    <div className="caption-grid">
                      <span>{item.company_name || '-'}</span>
                      <span className="muted-text">
                        {item.source_entity_name || '-'} {'->'} {item.target_team_name || '-'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="caption-grid">
                      <span>{item.creator_name || '-'}</span>
                      <span className="muted-text">{item.current_assignee_name || 'Unassigned'}</span>
                    </div>
                  </td>
                  <td>{new Date(item.created_at).toLocaleString()}</td>
                  <td>
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
