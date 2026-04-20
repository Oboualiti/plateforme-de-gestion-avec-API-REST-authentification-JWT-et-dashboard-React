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
  const [assignmentForm, setAssignmentForm] = useState({ userId: '', note: '' })
  const [actionState, setActionState] = useState({ busy: false, error: '' })
  const discussionScrollRef = useRef(null)

  const request = state.request
  const roleKeys = user?.role_keys || []
  const isManager = roleKeys.includes('manager')
  const isTeamLeader = roleKeys.includes('team_leader')
  const canChangeStatus = Boolean(request?.can_update_status)
  const canAssignToMe = Boolean(request?.can_assign_to_me)
  const potentialAssignees = request?.potential_assignees || []
  const canManagerAssignTl =
    isManager && Boolean(request?.can_update_status) && !request?.current_assignee && potentialAssignees.length > 0

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
          const hasCommentChange =
            currentComments.length !== nextComments.length ||
            currentComments[currentComments.length - 1]?.id !== nextComments[nextComments.length - 1]?.id
          const hasStatusChange = currentRequest.status !== response.data.status
          const hasAssigneeChange = currentRequest.current_assignee !== response.data.current_assignee

          if (!hasCommentChange && !hasStatusChange && !hasAssigneeChange) {
            return current
          }

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
      setComment('')
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

  async function handleAssignToMe() {
    if (!canAssignToMe || actionState.busy) return
    await refreshFromResponse(api.post(`/requests/${requestId}/assign/`, {}))
  }

  async function handleAssignToUser() {
    if (!canManagerAssignTl || actionState.busy || !assignmentForm.userId) return
    await refreshFromResponse(
      api.post(`/requests/${requestId}/assign_user/`, {
        user_id: Number(assignmentForm.userId),
        note: assignmentForm.note || 'Assigned by manager',
      }),
    )
    setAssignmentForm({ userId: '', note: '' })
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
    { key: 'new', label: 'New', value: 'NEW', helper: 'Awaiting review' },
    { key: 'decision', label: 'Ownership confirmed', helper: 'Accepted or rejected' },
    { key: 'in_progress', label: 'In progress', value: 'IN_PROGRESS', helper: 'Work underway' },
    { key: 'completed', label: 'Completed', value: 'COMPLETED', helper: 'Work delivered' },
    { key: 'closed', label: 'Closed', value: 'CLOSED', helper: 'Finalized' },
  ]

  const lifecycleStageMap = {
    NEW: 0,
    ACCEPTED: 1,
    REJECTED: 1,
    IN_PROGRESS: 2,
    COMPLETED: 3,
    CLOSED: 4,
  }
  const activeLifecycleIndex = lifecycleStageMap[request.status] ?? 0
  const decisionSelection =
    request.status === 'REJECTED'
      ? 'REJECTED'
      : ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'].includes(request.status)
      ? 'ACCEPTED'
      : ''
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

          <section className="panel request-detail-summary-card">
            <div className="workspace-section-title">
              <div>
                <p className="eyebrow">Assignment</p>
                <h2>Ownership control</h2>
              </div>
            </div>
            <div className="request-summary-copy">
              <div className="request-summary-highlight">
                <span>Current assignee</span>
                <strong>{request.assignee_name || 'Unassigned'}</strong>
              </div>

              {isTeamLeader && (
                <div className="table-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!canAssignToMe || actionState.busy}
                    onClick={handleAssignToMe}
                  >
                    {request.current_assignee ? 'Already assigned' : actionState.busy ? 'Saving...' : 'Take for myself'}
                  </button>
                </div>
              )}

              {canManagerAssignTl && (
                <div className="status-form">
                  <label htmlFor="assign-team-leader">Assign to team leader</label>
                  <select
                    id="assign-team-leader"
                    className="app-select"
                    value={assignmentForm.userId}
                    onChange={(event) =>
                      setAssignmentForm((current) => ({ ...current, userId: event.target.value }))
                    }
                  >
                    <option value="">Select team leader</option>
                    {potentialAssignees.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.username}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="assign-note">Assignment note (optional)</label>
                  <textarea
                    id="assign-note"
                    className="app-textarea"
                    value={assignmentForm.note}
                    onChange={(event) =>
                      setAssignmentForm((current) => ({ ...current, note: event.target.value }))
                    }
                    placeholder="Context for the assigned team leader..."
                  />
                  <div className="table-actions">
                    <button
                      type="button"
                      disabled={!assignmentForm.userId || actionState.busy}
                      onClick={handleAssignToUser}
                    >
                      {actionState.busy ? 'Saving...' : 'Assign to team leader'}
                    </button>
                  </div>
                </div>
              )}
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
                  const isActive = activeLifecycleIndex === index
                  const isComplete = activeLifecycleIndex > index
                  const isDecisionStep = step.key === 'decision'
                  return (
                    <article
                      key={step.key}
                      className={[
                        'request-lifecycle-step',
                        isDecisionStep ? 'request-lifecycle-step-decision' : '',
                        isActive ? 'request-lifecycle-step-active' : '',
                        isComplete ? 'request-lifecycle-step-complete' : '',
                        step.key === 'decision' && decisionSelection === 'REJECTED'
                          ? 'request-lifecycle-step-branch-rejected'
                          : '',
                      ].join(' ').trim()}
                    >
                      <span>{step.helper}</span>
                      {!isDecisionStep && (
                        <button
                          type="button"
                          disabled={!canChangeStatus || actionState.busy}
                          onClick={() => handleLifecycleStatusChange(step.value)}
                          className={[
                            'request-lifecycle-step-action',
                            canChangeStatus ? 'request-lifecycle-step-clickable' : '',
                          ].join(' ').trim()}
                        >
                          <strong>{step.label}</strong>
                        </button>
                      )}
                      {isDecisionStep && (
                        <div className="request-lifecycle-decision-row">
                          <button
                            type="button"
                            disabled={!canChangeStatus || actionState.busy}
                            onClick={() => handleLifecycleStatusChange('ACCEPTED')}
                            className={[
                              'request-lifecycle-choice',
                              decisionSelection === 'ACCEPTED' ? 'request-lifecycle-choice-active' : '',
                            ].join(' ').trim()}
                          >
                            Accepted
                          </button>
                          <button
                            type="button"
                            disabled={!canChangeStatus || actionState.busy}
                            onClick={() => handleLifecycleStatusChange('REJECTED')}
                            className={[
                              'request-lifecycle-choice',
                              decisionSelection === 'REJECTED' ? 'request-lifecycle-choice-danger' : '',
                            ].join(' ').trim()}
                          >
                            Rejected
                          </button>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="panel request-discussion-card">
            <div className="workspace-section-title">
              <div>
                <p className="eyebrow">Discussion</p>
                <h2>Conversation</h2>
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
        </div>
      </div>
    </main>
  )
}

export default RequestDetailsPage
