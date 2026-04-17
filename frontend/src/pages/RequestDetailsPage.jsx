import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

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

const terminalStatuses = new Set(['REJECTED', 'COMPLETED', 'CLOSED'])

function formatRole(roleKeys) {
  if (!roleKeys?.length) return 'User'
  return roleKeys[0]
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function getInitials(name) {
  if (!name) return 'NA'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function RequestDetailsPage() {
  const { requestId } = useParams()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', request: null })
  const [comment, setComment] = useState('')
  const [actionState, setActionState] = useState({ busy: false, error: '' })
  const [reassignTarget, setReassignTarget] = useState('')
  const [reassignNote, setReassignNote] = useState('')
  const discussionScrollRef = useRef(null)

  const request = state.request
  const roleKeys = user?.role_keys || []
  const isSuperAdmin = roleKeys.includes('super_admin')
  const isAdminReviewRole = roleKeys.some((role) => ['super_admin', 'senior', 'manager'].includes(role))
  const canChangeStatus = request?.can_update_status && !isAdminReviewRole

  const lastCommentId = useMemo(() => {
    const comments = request?.comments || []
    return comments.length ? comments[comments.length - 1].id : null
  }, [request?.comments])

  useEffect(() => {
    let active = true

    async function loadRequest() {
      try {
        const response = await api.get(`/requests/${requestId}/`)
        if (!active) return
        setState({ loading: false, error: '', request: response.data })
        setReassignTarget(String(response.data.target_entity || ''))
      } catch (error) {
        if (!active) return
        setState({
          loading: false,
          error: error.response?.data?.detail || 'Could not load request.',
          request: null,
        })
      }
    }

    loadRequest()
    return () => {
      active = false
    }
  }, [requestId])

  useEffect(() => {
    if (!request) return undefined

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
          const currentTimeline = currentRequest.activity_timeline || []
          const nextTimeline = response.data.activity_timeline || []
          const hasCommentChange =
            currentComments.length !== nextComments.length ||
            currentComments[currentComments.length - 1]?.id !== nextComments[nextComments.length - 1]?.id
          const hasStatusChange = currentRequest.status !== response.data.status
          const hasAssignmentChange =
            currentRequest.current_assignee_name !== response.data.current_assignee_name ||
            currentRequest.target_entity !== response.data.target_entity
          const hasTimelineChange =
            currentTimeline.length !== nextTimeline.length ||
            currentTimeline[0]?.timestamp !== nextTimeline[0]?.timestamp

          if (!hasCommentChange && !hasStatusChange && !hasAssignmentChange && !hasTimelineChange) {
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
  }, [requestId, request])

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
      setReassignTarget(String(response.data.target_entity || ''))
      setComment('')
      setReassignNote('')
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
    if (!canChangeStatus || actionState.busy || request.status === nextStatus) return

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

  if (state.loading) {
    return (
      <main className="page-content">
        <section className="panel state-card">
          <p className="muted-text">Loading request...</p>
        </section>
      </main>
    )
  }

  if (state.error || !request) {
    return (
      <main className="page-content">
        <section className="panel state-card">
          <p className="error-text">{state.error || 'Could not load request.'}</p>
        </section>
      </main>
    )
  }

  const lifecycleSteps = [
    { label: 'New', value: 'NEW', helper: 'Awaiting review' },
    { label: 'Accepted', value: 'ACCEPTED', helper: 'Ownership confirmed' },
    { label: 'In progress', value: 'IN_PROGRESS', helper: 'Work underway' },
    { label: 'Rejected', value: 'REJECTED', helper: 'Stopped or declined' },
    { label: 'Completed', value: 'COMPLETED', helper: 'Work delivered' },
    { label: 'Closed', value: 'CLOSED', helper: 'Finalized' },
  ]

  const activeLifecycleIndex = lifecycleSteps.findIndex((step) => step.value === request.status)
  const comments = request.comments || []
  const summaryItems = [
    { label: 'Created', value: formatDateTime(request.created_at) },
    { label: 'Company', value: request.company_name || '-' },
    { label: 'Source Entity', value: request.source_entity_name || '-' },
    { label: 'Target Entity', value: request.target_entity_name || '-' },
    { label: 'Creator', value: request.requester_name || '-' },
    { label: 'Type', value: request.type || '-' },
    { label: 'Assignee', value: request.assignee_name || 'Unassigned' },
    { label: 'Current Status', value: statusLabelMap[request.status] || request.status },
  ]

  return (
    <main className="page-content">
      <div className="request-detail-shell">
        <section className="panel request-detail-hero request-detail-hero-refined">
          <div className="request-detail-hero-copy">
            <div className="request-hero-status">
              <span className="request-reference-chip">{request.reference_code || request.request_number}</span>
              <span className={statusClassMap[request.status] || 'status-tag'}>
                {statusLabelMap[request.status] || request.status}
              </span>
              {request.is_stuck ? <span className="status-tag danger">Stuck</span> : null}
            </div>
            <div className="request-hero-heading">
              <p className="eyebrow">Request details</p>
              <h1>{request.title || 'Untitled request'}</h1>
              <div className="request-hero-description">
                <span>Description</span>
                <p>
                  {request.description || 'No description provided for this request.'}
                </p>
              </div>
            </div>
            <div className="request-hero-meta">
              <span>
                <small>Company</small>
                <strong>{request.company_name || 'No company'}</strong>
              </span>
              <span>
                <small>Source entity</small>
                <strong>{request.source_entity_name || 'Unknown source'}</strong>
              </span>
              <span>
                <small>Created</small>
                <strong>{formatDateTime(request.created_at)}</strong>
              </span>
            </div>
          </div>

          <div className="request-detail-hero-actions">
            {!isAdminReviewRole && request.can_assign_to_me ? (
              <button className="ghost-button" disabled={actionState.busy} onClick={assignToMe} type="button">
                Assign to me
              </button>
            ) : null}
            <Link className="ghost-button pill-link" to="/requests">
              Back to list
            </Link>
          </div>
        </section>

        {actionState.error ? <p className="error-text">{actionState.error}</p> : null}

        <section className="request-detail-meta-grid">
          {summaryItems.map((item) => (
            <article className="panel request-detail-meta-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </section>

        <section className="panel request-process-card">
          <div className="workspace-section-title">
            <div>
              <p className="eyebrow">Lifecycle</p>
              <h2>Request journey</h2>
            </div>
          </div>

          <div className="request-lifecycle-shell">
            <div className="request-lifecycle request-lifecycle-expanded">
              {lifecycleSteps.map((step, index) => {
                const isActive = request.status === step.value
                const isComplete = activeLifecycleIndex > index
                return (
                  <button
                    type="button"
                    key={step.value}
                    disabled={!canChangeStatus || actionState.busy}
                    onClick={() => handleLifecycleStatusChange(step.value)}
                    className={[
                      'request-lifecycle-step',
                      canChangeStatus ? 'request-lifecycle-step-clickable' : '',
                      isActive ? 'request-lifecycle-step-active' : '',
                      isComplete ? 'request-lifecycle-step-complete' : '',
                    ].join(' ').trim()}
                  >
                    <span>{step.helper}</span>
                    <strong>{step.label}</strong>
                    {isActive ? <em className="request-lifecycle-current">Current</em> : null}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <div className="request-detail-main request-detail-main-refined">
          <section className="panel request-discussion-card">
            <div className="workspace-section-title">
              <div>
                <p className="eyebrow">Discussion</p>
                <h2>Comments</h2>
              </div>
            </div>

            <div className="request-discussion-stack">
              <div className="thread-list request-thread-list" ref={discussionScrollRef}>
                {comments.length === 0 ? <p className="muted-text">No comments yet.</p> : null}
                {comments.map((item) => (
                  <article
                    key={item.id}
                    className={`thread-card ${item.sender === user?.id ? 'outgoing' : 'incoming'}`}
                  >
                    <div className="request-comment-card">
                      <div className="request-comment-avatar">{getInitials(item.sender_name)}</div>
                      <div className="request-comment-body">
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
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <form className="stack-form request-comment-composer" onSubmit={submitComment}>
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
            </div>
          </section>

          {request.can_reassign_target_team && isSuperAdmin ? (
            <section className="panel request-detail-summary-card">
              <div className="workspace-section-title">
                <div>
                  <p className="eyebrow">Admin action</p>
                  <h2>Route request</h2>
                </div>
              </div>
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
                  <label htmlFor="reassign-note">Routing note</label>
                  <textarea
                    id="reassign-note"
                    className="app-textarea"
                    value={reassignNote}
                    onChange={(event) => setReassignNote(event.target.value)}
                    placeholder="Optional note for routing"
                  />
                </div>
                <button disabled={actionState.busy || !reassignTarget} type="submit">
                  Update target team
                </button>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  )
}

export default RequestDetailsPage
