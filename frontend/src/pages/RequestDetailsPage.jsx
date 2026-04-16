import { useEffect, useState } from 'react'
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

function formatTimelineTitle(item) {
  return item.title || item.kind
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function RequestDetailsPage() {
  const { requestId } = useParams()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', request: null })
  const [comment, setComment] = useState('')
  const [actionState, setActionState] = useState({
    busy: false,
    error: '',
  })
  const [reassignTarget, setReassignTarget] = useState('')
  const [reassignNote, setReassignNote] = useState('')
  const [delegateTarget, setDelegateTarget] = useState('')
  const [delegateNote, setDelegateNote] = useState('')

  useEffect(() => {
    let active = true
    async function loadRequest() {
      try {
        const response = await api.get(`/requests/${requestId}/`)
        if (active) {
          setState({ loading: false, error: '', request: response.data })
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

  async function refreshFromResponse(requestPromise) {
    setActionState({ busy: true, error: '' })
    try {
      const response = await requestPromise
      setState((current) => ({ ...current, request: response.data }))
      setReassignTarget(String(response.data.target_entity || ''))
      setComment('')
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

  async function updateStatus(nextStatus, nextNote = '') {
    await refreshFromResponse(
      api.post(`/requests/${requestId}/status/`, {
        status: nextStatus,
        note: nextNote,
      }),
    )
  }

  async function handleLifecycleStatusChange(nextStatus) {
    if (!request.can_update_status || actionState.busy || request.status === nextStatus) return

    const nextNote = terminalStatuses.has(nextStatus)
      ? window.prompt('Resolution note is required for this status.')?.trim()
      : window.prompt('Optional note for this status change:')?.trim() || ''

    if (terminalStatuses.has(nextStatus) && !nextNote) {
      setActionState({ busy: false, error: 'Resolution note is required.' })
      return
    }

    await updateStatus(nextStatus, nextNote || '')
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
  const isSuperAdmin = user?.role_keys?.includes('super_admin')
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

      <section className="panel request-summary-panel">
        <div className="workspace-section-title">
          <div>
            <p className="eyebrow">Overview</p>
            <h2>Request summary</h2>
          </div>
        </div>

        <div className="request-summary-grid">
          <article className="request-summary-item request-summary-item-wide">
            <span>Reference</span>
            <strong>{request.reference_code || request.request_number}</strong>
          </article>
          <article className="request-summary-item">
            <span>Status</span>
            <strong>{statusLabelMap[request.status] || request.status}</strong>
          </article>
          <article className="request-summary-item">
            <span>Type</span>
            <strong>{request.type || '-'}</strong>
          </article>
          <article className="request-summary-item">
            <span>Company</span>
            <strong>{request.company_name || '-'}</strong>
          </article>
          <article className="request-summary-item">
            <span>Source entity</span>
            <strong>{request.source_entity_name || '-'}</strong>
          </article>
          <article className="request-summary-item">
            <span>Target entity</span>
            <strong>{request.target_entity_name || '-'}</strong>
          </article>
          <article className="request-summary-item">
            <span>Creator</span>
            <strong>{request.requester_name || '-'}</strong>
          </article>
          <article className="request-summary-item">
            <span>Assignee</span>
            <strong>{request.assignee_name || 'Unassigned'}</strong>
          </article>
          <article className="request-summary-item">
            <span>Created at</span>
            <strong>{formatDateTime(request.created_at)}</strong>
          </article>
          <article className="request-summary-item request-summary-item-wide">
            <span>Resolution note</span>
            <strong>{request.resolution_note || 'Not resolved yet'}</strong>
          </article>
        </div>
      </section>

      <div className="request-primary-column">
        <section className="panel">
          <div className="workspace-section-title">
            <div>
              <p className="eyebrow">Status</p>
              <h2>Lifecycle</h2>
            </div>
          </div>
          <div className="request-lifecycle">
            {lifecycleSteps.map((step) => (
              <button
                type="button"
                key={step.value}
                disabled={!request.can_update_status || actionState.busy}
                onClick={() => handleLifecycleStatusChange(step.value)}
                className={`request-lifecycle-step ${request.status === step.value ? 'request-lifecycle-step-active' : ''} ${request.can_update_status ? 'request-lifecycle-step-clickable' : ''}`}
              >
                {step.label}
                <span>{step.helper}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Comments</p>
          <h2>Discussion</h2>
          <div className="thread-list">
            {request.comments.length === 0 && <p className="muted-text">No comments yet.</p>}
            {request.comments.map((item) => (
              <article
                key={item.id}
                className={`thread-card ${item.sender === user?.id ? 'outgoing' : 'incoming'}`}
              >
                <div className="thread-head">
                  <div>
                    <strong>{item.sender_name}</strong>
                    <div className="subline request-thread-meta">
                      {formatRole(item.sender_role_keys)} | {item.sender_entity_name || 'Unknown entity'}
                    </div>
                  </div>
                  <small>{formatDateTime(item.created_at)}</small>
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
              Send comment
            </button>
          </form>
        </section>
      </div>

      {request.can_reassign_target_team && isSuperAdmin && (
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
