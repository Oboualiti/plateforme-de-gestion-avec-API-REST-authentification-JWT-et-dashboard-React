import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

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

const statusOptions = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED', 'COMPLETED', 'CLOSED']
const terminalStatuses = new Set(['REJECTED', 'COMPLETED', 'CLOSED'])

function formatRole(roleKeys) {
  if (!roleKeys?.length) return 'User'
  return roleKeys[0]
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatTimelineTitle(item) {
  return item.title || item.kind
}

function RequestDetailsPage() {
  const { requestId } = useParams()
  const [state, setState] = useState({ loading: true, error: '', request: null })
  const [comment, setComment] = useState('')
  const [statusValue, setStatusValue] = useState('IN_PROGRESS')
  const [note, setNote] = useState('')
  const [actionState, setActionState] = useState({
    busy: false,
    error: '',
  })

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

  async function refreshFromResponse(requestPromise) {
    setActionState({ busy: true, error: '' })
    try {
      const response = await requestPromise
      setState((current) => ({ ...current, request: response.data }))
      setStatusValue(response.data.status)
      setComment('')
      setNote('')
      setActionState({ busy: false, error: '' })
    } catch (error) {
      setActionState({
        busy: false,
        error: error.response?.data?.detail || error.response?.data?.note?.[0] || 'Action failed.',
      })
    }
  }

  async function submitComment(event) {
    event.preventDefault()
    if (!comment.trim()) return
    await refreshFromResponse(api.post(`/requests/${requestId}/comments/`, { message: comment }))
  }

  async function submitStatus(event) {
    event.preventDefault()
    await refreshFromResponse(
      api.post(`/requests/${requestId}/status/`, {
        status: statusValue,
        note,
      }),
    )
  }

  async function assignToMe() {
    await refreshFromResponse(api.post(`/requests/${requestId}/assign/`))
  }

  if (state.loading) {
    return (
      <main className="page-content">
        <section className="panel state-card">
          <p className="muted-text">Loading request...</p>
        </section>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="page-content">
        <section className="panel state-card">
          <p className="error-text">{state.error}</p>
        </section>
      </main>
    )
  }

  const request = state.request
  const needsResolutionNote = terminalStatuses.has(statusValue)
  const lifecycleSteps = [
    { label: 'New', value: 'NEW', helper: 'Awaiting review' },
    { label: 'Accepted', value: 'ACCEPTED', helper: 'Ownership confirmed' },
    { label: 'In progress', value: 'IN_PROGRESS', helper: 'Work underway' },
    { label: 'Completed', value: 'COMPLETED', helper: 'Work delivered' },
    { label: 'Closed', value: 'CLOSED', helper: 'Request finalized' },
  ]

  return (
    <main className="page-content">
      <section className="workspace-header">
        <div className="panel-header">
          <div className="page-intro">
            <p className="eyebrow">Request details</p>
            <h1>{request.title}</h1>
            <p>{request.description}</p>
          </div>
          <div className="page-actions">
            <span className={statusClassMap[request.status] || 'status-tag'}>
              {statusLabelMap[request.status] || request.status}
            </span>
            <Link className="ghost-button pill-link" to="/requests">
              Back to list
            </Link>
          </div>
        </div>
        <div className="workspace-meta">
          <span className="muted-text">{request.reference_code || request.request_number}</span>
          <span className="muted-text">{request.company_name || '-'}</span>
          <span className="muted-text">{request.target_team_name || '-'}</span>
        </div>
      </section>

      <section className="detail-grid">
        <div className="editorial-stack">
          <section className="panel">
            <div className="workspace-section-title">
              <div>
                <p className="eyebrow">Status</p>
                <h2>Lifecycle</h2>
              </div>
              <div className="page-actions">
                {request.can_assign_to_me && (
                  <button className="ghost-button" disabled={actionState.busy} onClick={assignToMe} type="button">
                    Assign to me
                  </button>
                )}
              </div>
            </div>
            <div className="request-lifecycle">
              {lifecycleSteps.map((step) => (
                <div
                  key={step.value}
                  className={`request-lifecycle-step ${request.status === step.value ? 'request-lifecycle-step-active' : ''}`}
                >
                  {step.label}
                  <span>{step.helper}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="workspace-section-title">
              <div>
                <p className="eyebrow">Discussion</p>
                <h2>Comments</h2>
              </div>
              <span className="muted-text">{request.comments.length} item(s)</span>
            </div>

            <div className="thread-list">
              {request.comments.length === 0 && <p className="muted-text">No comments yet.</p>}
              {request.comments.map((item, index) => (
                <article key={item.id} className={`thread-card ${index % 2 === 1 ? 'thread-bubble-dark' : ''}`}>
                  <div className="thread-head">
                    <div>
                      <strong>{item.sender_name}</strong>
                      <div className="subline">
                        {formatRole(item.sender_role_keys)} | {item.sender_entity_name || 'Unknown entity'}
                      </div>
                    </div>
                    <small>{new Date(item.created_at).toLocaleString()}</small>
                  </div>
                  <p>{item.message}</p>
                </article>
              ))}
            </div>

            <form className="stack-form" onSubmit={submitComment}>
              <label htmlFor="comment">Add comment</label>
              <div className="request-comment-composer">
                <textarea
                  id="comment"
                  className="app-textarea"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Add a comment"
                />
                <button disabled={actionState.busy || !comment.trim()} type="submit">
                  Send
                </button>
              </div>
            </form>
          </section>
        </div>

        <aside className="editorial-stack">
          <section className="panel">
            <p className="eyebrow">Summary</p>
            <h3>Request metadata</h3>
            <div className="workspace-list">
              <div className="workspace-list-item">
                <div>
                  <strong>Source</strong>
                  <p className="muted-text">{request.source_entity_name || '-'}</p>
                </div>
              </div>
              <div className="workspace-list-item">
                <div>
                  <strong>Target</strong>
                  <p className="muted-text">{request.target_team_name || '-'}</p>
                </div>
              </div>
              <div className="workspace-list-item">
                <div>
                  <strong>Requester</strong>
                  <p className="muted-text">{request.requester_name || '-'}</p>
                </div>
              </div>
              <div className="workspace-list-item">
                <div>
                  <strong>Assignee</strong>
                  <p className="muted-text">{request.current_assignee_name || 'Unassigned'}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <p className="eyebrow">Activity</p>
            <h3>Timeline</h3>
            <div className="timeline-list">
              {request.activity_timeline.slice(0, 5).map((item, index) => (
                <article key={`${item.kind}-${item.timestamp}-${index}`} className="timeline-card">
                  <div className="thread-head">
                    <strong>{formatTimelineTitle(item)}</strong>
                    <small>{new Date(item.timestamp).toLocaleString()}</small>
                  </div>
                  <p>{item.description}</p>
                  {item.note ? <p className="muted-text">{item.note}</p> : null}
                </article>
              ))}
            </div>
          </section>

          {request.can_update_status && (
            <section className="panel">
              <p className="eyebrow">Actions</p>
              <h3>Update status</h3>
              <form className="status-form" onSubmit={submitStatus}>
                <div>
                  <label htmlFor="status">Status</label>
                  <select
                    id="status"
                    className="app-select"
                    value={statusValue}
                    onChange={(event) => setStatusValue(event.target.value)}
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {statusLabelMap[option] || option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="note">Resolution note</label>
                  <textarea
                    id="note"
                    className="app-textarea"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={needsResolutionNote ? 'Resolution note is required' : 'Optional note'}
                  />
                </div>
                <button disabled={actionState.busy || (needsResolutionNote && !note.trim())} type="submit">
                  Save status
                </button>
                {actionState.error && <p className="error-text">{actionState.error}</p>}
              </form>
            </section>
          )}
        </aside>
      </section>
    </main>
  )
}

export default RequestDetailsPage
