import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
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

const statusOptions = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED', 'COMPLETED', 'CLOSED']
const terminalStatuses = new Set(['REJECTED', 'COMPLETED', 'CLOSED'])

function formatRole(roleKeys) {
  if (!roleKeys?.length) return 'User'
  return roleKeys[0]
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function RequestDetailsPage() {
  const { requestId } = useParams()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', request: null })
  const [comment, setComment] = useState('')
  const [statusValue, setStatusValue] = useState('IN_PROGRESS')
  const [note, setNote] = useState('')
  const [actionState, setActionState] = useState({
    busy: false,
    error: '',
  })
  const [reassignTarget, setReassignTarget] = useState('')
  const [reassignNote, setReassignNote] = useState('')
  const discussionScrollRef = useRef(null)

  const lastCommentId = useMemo(() => {
    const comments = state.request?.comments || []
    return comments.length ? comments[comments.length - 1].id : null
  }, [state.request?.comments])

  useEffect(() => {
    let active = true
    async function loadRequest() {
      try {
        const response = await api.get(`/requests/${requestId}/`)
        if (active) {
          setState({ loading: false, error: '', request: response.data })
          setStatusValue(response.data.status)
          setReassignTarget(String(response.data.target_entity || ''))
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

  useEffect(() => {
    if (!state.request) return undefined
    let active = true
    const intervalId = setInterval(async () => {
      try {
        const response = await api.get(`/requests/${requestId}/`)
        if (!active) return
        setState((current) => {
          const currentRequest = current.request
          if (!currentRequest) return current

          const currentComments = currentRequest.comments || []
          const nextComments = response.data.comments || []
          const currentLast = currentComments[currentComments.length - 1]
          const nextLast = nextComments[nextComments.length - 1]
          const hasCommentChange =
            nextComments.length !== currentComments.length ||
            (currentLast?.id || null) !== (nextLast?.id || null)
          const hasStatusChange = currentRequest.status !== response.data.status
          const hasAssignmentChange =
            currentRequest.current_assignee_name !== response.data.current_assignee_name ||
            currentRequest.target_entity !== response.data.target_entity

          if (!hasCommentChange && !hasStatusChange && !hasAssignmentChange) {
            return current
          }

          setStatusValue(response.data.status)
          setReassignTarget(String(response.data.target_entity || ''))
          return { ...current, request: response.data }
        })
      } catch {
      }
    }, 2500)

    return () => {
      active = false
      clearInterval(intervalId)
    }
  }, [requestId, Boolean(state.request)])

  useEffect(() => {
    const container = discussionScrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [requestId, lastCommentId])

  async function refreshFromResponse(requestPromise) {
    setActionState({ busy: true, error: '' })
    try {
      const response = await requestPromise
      setState((current) => ({ ...current, request: response.data }))
      setStatusValue(response.data.status)
      setReassignTarget(String(response.data.target_entity || ''))
      setComment('')
      setNote('')
      setReassignNote('')
      setDelegateNote('')
      setDelegateTarget('')
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

  async function submitReassign(event) {
    event.preventDefault()
    if (!reassignTarget) return
    await refreshFromResponse(
      api.post(`/requests/${requestId}/reassign/`, {
        target_team: Number(reassignTarget),
        note: reassignNote,
      }),
    )
  }

  async function submitDelegate(event) {
    event.preventDefault()
    if (!delegateTarget) return
    await refreshFromResponse(
      api.post(`/requests/${requestId}/assign_user/`, {
        user_id: Number(delegateTarget),
        note: delegateNote,
      }),
    )
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
      <PageHeader
        eyebrow="Request details"
        title={request.title}
        description={request.description}
        actions={
          <>
            {request.can_assign_to_me && (
              <button className="ghost-button" disabled={actionState.busy} onClick={assignToMe} type="button">
                Assign to me
              </button>
            )}
            <Link className="ghost-button pill-link" to="/requests">
              Back to list
            </Link>
          </>
        }
        meta={
          <>
            <span className={statusClassMap[request.status] || 'status-tag'}>
              {statusLabelMap[request.status] || request.status}
            </span>
            <span className="muted-text">{request.reference_code || request.request_number}</span>
            <span className="muted-text">{request.type}</span>
          </>
        }
      />

      {actionState.error && <p className="error-text">{actionState.error}</p>}

      <section className="summary-grid request-meta-grid">
          <div className="summary-card">
            <span>Reference</span>
            <strong className="stat-value-small">{request.reference_code || request.request_number}</strong>
          </div>
          <div className="summary-card">
            <span>Type</span>
            <strong className="stat-value-small">{request.type}</strong>
          </div>
          <div className="summary-card">
            <span>Company</span>
            <strong className="stat-value-small">{request.company_name || '-'}</strong>
          </div>
          <div className="summary-card">
            <span>Source</span>
            <strong className="stat-value-small">{request.source_entity_name || '-'}</strong>
          </div>
          <div className="summary-card">
            <span>Target</span>
            <strong className="stat-value-small">{request.target_team_name || '-'}</strong>
          </div>
          <div className="summary-card">
            <span>Creator</span>
            <strong className="stat-value-small">{request.requester_name || '-'}</strong>
          </div>
          <div className="summary-card">
            <span>Created at</span>
            <strong className="stat-value-small">{new Date(request.created_at).toLocaleString()}</strong>
          </div>
          <div className="summary-card">
            <span>Assignee</span>
            <strong className="stat-value-small">{request.current_assignee_name || 'Unassigned'}</strong>
          </div>
          <div className="summary-card">
            <span>Resolution note</span>
            <strong className="stat-value-small">{request.resolution_note || 'Not resolved yet'}</strong>
          </div>
      </section>

      <section className="panel discussion-panel">
        <p className="eyebrow">Comments</p>
        <h2>Discussion</h2>
        <div className="thread-list discussion-scroll" ref={discussionScrollRef}>
          {request.comments.length === 0 && <p className="muted-text">No comments yet.</p>}
          {request.comments.map((item) => (
            <article
              key={item.id}
              className={`thread-card ${item.sender === user?.id ? 'outgoing' : 'incoming'}`}
            >
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
          <textarea
            className="app-textarea"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add a comment"
          />
          <button disabled={actionState.busy || !comment.trim()} type="submit">
            Add comment
          </button>
        </form>
      </section>

      {request.can_update_status && (
        <section className="panel">
          <p className="eyebrow">Support actions</p>
          <h2>Update status</h2>
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
              <label htmlFor="status-note">Note</label>
              <textarea
                id="status-note"
                className="app-textarea"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={needsResolutionNote ? 'Resolution note is required' : 'Optional note'}
              />
            </div>
            <button disabled={actionState.busy || (needsResolutionNote && !note.trim())} type="submit">
              Update status
            </button>
          </form>
        </section>
      )}

      {request.can_reassign_target_team && (
        <section className="panel">
          <p className="eyebrow">Admin actions</p>
          <h2>Reassign target team</h2>
          <form className="status-form" onSubmit={submitReassign}>
            <div>
              <label htmlFor="reassign-target">Target team</label>
              <select
                id="reassign-target"
                className="app-select"
                value={reassignTarget}
                onChange={(event) => setReassignTarget(event.target.value)}
              >
                <option value="">Select target team</option>
                {(request.available_reassignment_targets || []).map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="reassign-note">Note</label>
              <textarea
                id="reassign-note"
                className="app-textarea"
                value={reassignNote}
                onChange={(event) => setReassignNote(event.target.value)}
                placeholder="Optional note for reassignment"
              />
            </div>
            <button disabled={actionState.busy || !reassignTarget} type="submit">
              Reassign team
            </button>
          </form>
        </section>
      )}

      {request.potential_assignees?.length > 0 && (user?.role_keys?.includes('super_admin') || user?.role_keys?.includes('senior')) && (
        <section className="panel">
          <p className="eyebrow">Admin actions</p>
          <h2>Delegate assignment</h2>
          <form className="status-form" onSubmit={submitDelegate}>
            <div>
              <label htmlFor="delegate-target">Assign to member</label>
              <select
                id="delegate-target"
                className="app-select"
                value={delegateTarget}
                onChange={(event) => setDelegateTarget(event.target.value)}
              >
                <option value="">Select team member</option>
                {request.potential_assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.username}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="delegate-note">Note</label>
              <textarea
                id="delegate-note"
                className="app-textarea"
                value={delegateNote}
                onChange={(event) => setDelegateNote(event.target.value)}
                placeholder="Optional note for assignment"
              />
            </div>
            <button disabled={actionState.busy || !delegateTarget} type="submit">
              Assign to member
            </button>
          </form>
        </section>
      )}
    </main>
  )
}

export default RequestDetailsPage
