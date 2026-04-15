import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const supportRoles = ['handler', 'senior', 'manager', 'team_leader', 'super_admin']
const statusOptions = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED', 'COMPLETED', 'CLOSED']

function RequestDetailsPage() {
  const { requestId } = useParams()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', request: null })
  const [comment, setComment] = useState('')
  const [statusValue, setStatusValue] = useState('IN_PROGRESS')
  const [note, setNote] = useState('')

  const canUpdateStatus = supportRoles.some((role) => user?.role_keys?.includes(role))

  useEffect(() => {
    let active = true
    async function loadRequest() {
      try {
        const response = await api.get(`/requests/${requestId}/`)
        if (active) {
          setState({ loading: false, error: '', request: response.data })
          setStatusValue(response.data.status)
        }
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error.response?.data?.detail || 'Could not load request.',
            request: null,
          })
        }
      }
    }
    loadRequest()
    return () => {
      active = false
    }
  }, [requestId])

  async function submitComment(event) {
    event.preventDefault()
    const response = await api.post(`/requests/${requestId}/comments/`, { message: comment })
    setState((current) => ({ ...current, request: response.data }))
    setComment('')
  }

  async function submitStatus(event) {
    event.preventDefault()
    const response = await api.post(`/requests/${requestId}/status/`, {
      status: statusValue,
      note,
    })
    setState((current) => ({ ...current, request: response.data }))
    setNote('')
  }

  if (state.loading) {
    return (
      <main className="page-content">
        <section className="panel">
          <p className="muted-text">Loading request...</p>
        </section>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="page-content">
        <section className="panel">
          <p className="error-text">{state.error}</p>
        </section>
      </main>
    )
  }

  const request = state.request

  return (
    <main className="page-content">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Request details</p>
            <h1>{request.title}</h1>
          </div>
          <Link className="pill-link" to="/requests">
            Back
          </Link>
        </div>

        <div className="summary-grid">
          <div className="summary-card">
            <span>Status</span>
            <strong>{request.status}</strong>
          </div>
          <div className="summary-card">
            <span>Priority</span>
            <strong>{request.priority}</strong>
          </div>
          <div className="summary-card">
            <span>Target team</span>
            <strong>{request.target_team_name || '-'}</strong>
          </div>
        </div>

        <p>{request.description}</p>
      </section>

      <section className="detail-grid">
        <section className="panel">
          <p className="eyebrow">History</p>
          <h2>Status history</h2>
          <div className="permission-list">
            {request.status_history.map((item) => (
              <article key={item.id} className="permission-card">
                <div>
                  <strong>
                    {item.old_status} → {item.new_status}
                  </strong>
                  <div className="subline">
                    {item.changed_by_name} · {new Date(item.changed_at).toLocaleString()}
                  </div>
                </div>
                <p className="muted-text">{item.note || 'No note'}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Comments</p>
          <h2>Discussion</h2>
          <div className="permission-list">
            {request.comments.map((item) => (
              <article key={item.id} className="permission-card">
                <div>
                  <strong>{item.sender_name}</strong>
                  <div className="subline">{new Date(item.created_at).toLocaleString()}</div>
                </div>
                <p>{item.message}</p>
              </article>
            ))}
          </div>
          <form className="stack-form" onSubmit={submitComment}>
            <textarea
              className="app-textarea"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add a comment"
            />
            <button type="submit">Add comment</button>
          </form>
        </section>
      </section>

      {canUpdateStatus && (
        <section className="panel">
          <p className="eyebrow">Support actions</p>
          <h2>Update status</h2>
          <form className="status-form" onSubmit={submitStatus}>
            <select
              className="app-select"
              value={statusValue}
              onChange={(event) => setStatusValue(event.target.value)}
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional note"
            />
            <button type="submit">Update status</button>
          </form>
        </section>
      )}
    </main>
  )
}

export default RequestDetailsPage
