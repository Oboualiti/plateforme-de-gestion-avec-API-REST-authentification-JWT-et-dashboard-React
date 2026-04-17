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

const timelineKindMap = {
  created: 'Origin',
  sent: 'Routing',
  assignment: 'Assignment',
  reassignment: 'Redirect',
  status: 'Status',
  comment: 'Comment',
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
  const [delegateTarget, setDelegateTarget] = useState('')
  const [delegateNote, setDelegateNote] = useState('')
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

  const request = state.request
  const comments = request.comments || []
  const needsResolutionNote = terminalStatuses.has(statusValue)
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
  const timelineItems = request.activity_timeline || []
  const summaryItems = [
    { label: 'Created', value: formatDateTime(request.created_at) },
    { label: 'Company', value: request.company_name || '-' },
    { label: 'Source entity', value: request.source_entity_name || '-' },
    { label: 'Target entity', value: request.target_entity_name || '-' },
    { label: 'Creator', value: request.requester_name || '-' },
    { label: 'Type', value: request.type || '-' },
    { label: 'Assignee', value: request.assignee_name || 'Unassigned' },
    { label: 'Current status', value: statusLabelMap[request.status] || request.status },
  ]

  return (
    <main className="page-content">
      <div className="request-detail-shell">
        <section className="panel request-detail-hero">
          <div className="request-detail-hero-copy">
            <div className="request-hero-status">
              <span className="request-reference-chip">{request.reference_code || request.request_number}</span>
              <span className={statusClassMap[request.status] || 'status-tag'}>
                {statusLabelMap[request.status] || request.status}
              </span>
            </div>
            <div className="request-hero-heading">
              <p className="eyebrow">Architectural review</p>
              <h1>{request.title}</h1>
              <p className="subtitle">
                {request.description || 'This request is ready for review, routing, status oversight, and discussion.'}
              </p>
            </div>
            <div className="request-hero-meta">
              <span>{request.company_name || 'No company'}</span>
              <span>{request.source_entity_name || 'Unknown source'}</span>
              <span>{formatDateTime(request.created_at)}</span>
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

        {actionState.error && <p className="error-text">{actionState.error}</p>}

        <section className="request-detail-meta-grid">
          {summaryItems.map((item) => (
            <article className="panel request-detail-meta-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </section>

        <section className="request-detail-layout">
          <div className="request-detail-main">
            <section className="panel request-detail-summary-card">
              <div className="workspace-section-title">
                <div>
                  <p className="eyebrow">Executive summary</p>
                  <h2>Report narrative</h2>
                </div>
              </div>
              <div className="request-summary-copy">
                <p>{request.description || 'No detailed description was provided for this request.'}</p>
                <div className="request-summary-highlight">
                  <span>Resolution note</span>
                  <strong>{request.resolution_note || 'No resolution note yet.'}</strong>
                </div>
              </div>
            </section>

            <section className="panel request-process-card">
              <div className="workspace-section-title">
                <div>
                  <p className="eyebrow">Process tracking</p>
                  <h2>Journey map</h2>
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
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

      <section className="panel discussion-panel">
        <p className="eyebrow">Comments</p>
        <h2>Discussion</h2>
        <div className="thread-list discussion-scroll" ref={discussionScrollRef}>
          {comments.length === 0 && <p className="muted-text">No comments yet.</p>}
          {comments.map((item) => (
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

            <section className="panel request-rail-card">
              <div className="workspace-section-title">
                <div>
                  <p className="eyebrow">Timeline</p>
                  <h2>Recorded activity</h2>
                </div>
              </div>
              <div className="request-timeline-list">
                {timelineItems.length === 0 ? <p className="muted-text">No recorded activity yet.</p> : null}
                {timelineItems.slice(0, 8).map((item, index) => (
                  <article className="request-timeline-item" key={`${item.timestamp}-${item.title}-${index}`}>
                    <div className="request-timeline-kicker">
                      <span>{timelineKindMap[item.kind] || 'Event'}</span>
                      <small>{formatDateTime(item.timestamp)}</small>
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                    {item.note ? <p className="muted-text">{item.note}</p> : null}
                  </article>
                ))}
              </div>
            </section>

            {request.can_reassign_target_team && isSuperAdmin ? (
              <section className="panel request-rail-card">
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
          </aside>
        </section>
      </div>
    </main>
  )
}

export default RequestDetailsPage
