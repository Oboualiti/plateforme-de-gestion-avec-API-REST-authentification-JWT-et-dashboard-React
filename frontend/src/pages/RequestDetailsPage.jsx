import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { Select } from '../components/ui/select'

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
  const [commentAttachment, setCommentAttachment] = useState(null)
  const [assignmentForm, setAssignmentForm] = useState({ userId: '', note: '' })
  const [actionState, setActionState] = useState({ busy: false, error: '' })
  const [aiSummary, setAiSummary] = useState({ loading: false, error: '', data: null })
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
      setCommentAttachment(null)
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
    if (!comment.trim() && !commentAttachment) return
    const payload = new FormData()
    payload.append('message', comment)
    if (commentAttachment) {
      payload.append('attachment', commentAttachment)
    }
    await refreshFromResponse(api.post(`/requests/${requestId}/comments/`, payload))
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

  async function handleSummarizeDiscussion() {
    if (aiSummary.loading) return
    setAiSummary({ loading: true, error: '', data: null })
    try {
      const response = await api.post(`/requests/${requestId}/ai-summary/`, {})
      setAiSummary({
        loading: false,
        error: '',
        data: response.data || null,
      })
    } catch (nextError) {
      setAiSummary({
        loading: false,
        error: nextError.response?.data?.detail || 'Could not summarize discussion with AI.',
        data: null,
      })
    }
  }

  if (state.loading) {
    return (
      <main className="space-y-6">
        <section className="surface-card p-6">
          <p className="text-sm text-muted-foreground">Loading request...</p>
        </section>
      </main>
    )
  }

  if (state.error || !request) {
    return (
      <main className="space-y-6">
        <section className="surface-card p-6">
          <p className="text-sm font-medium text-destructive">{state.error || 'Could not load request.'}</p>
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
    <main className="space-y-6">
      <section className="surface-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 font-mono text-xs text-muted-foreground">
                {request.reference_code || request.request_number}
              </span>
              <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                {statusLabelMap[request.status] || request.status}
              </span>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Request Details</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                {request.title || 'Untitled request'}
              </h1>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {request.description || 'No description provided for this request.'}
            </p>
            {request.attachment_url ? (
              <a
                href={request.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md border border-border bg-muted/20 px-2.5 py-1 text-xs font-semibold text-foreground transition hover:bg-muted/40"
              >
                Open request attachment
              </a>
            ) : null}
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Company</p>
                <p className="font-medium text-foreground">{request.company_name || 'No company'}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Source Entity</p>
                <p className="font-medium text-foreground">{request.source_entity_name || 'Unknown source'}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="font-medium text-foreground">{formatDateTime(request.created_at)}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted/60"
              to="/requests"
            >
              Back To List
            </Link>
          </div>
        </div>
      </section>

      {actionState.error ? (
        <section className="surface-card p-4">
          <p className="text-sm font-medium text-destructive">{actionState.error}</p>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryItems.map((item) => (
          <article className="surface-card p-4" key={item.label}>
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="surface-card p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Executive Summary</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Report Narrative</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {request.description || 'No detailed description was provided for this request.'}
          </p>
          <div className="mt-4 rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Resolution Note</p>
            <p className="mt-1 text-sm font-medium text-foreground">{request.resolution_note || 'No resolution note yet.'}</p>
          </div>
        </article>

        <article className="surface-card p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Assignment</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Ownership Control</h2>
          <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Current Assignee</p>
            <p className="mt-1 text-sm font-medium text-foreground">{request.assignee_name || 'Unassigned'}</p>
          </div>

          {isTeamLeader && (
            <div className="mt-3">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted/60 disabled:opacity-60"
                disabled={!canAssignToMe || actionState.busy}
                onClick={handleAssignToMe}
              >
                {request.current_assignee ? 'Already Assigned' : actionState.busy ? 'Saving...' : 'Take For Myself'}
              </button>
            </div>
          )}

          {canManagerAssignTl && (
            <div className="mt-4 space-y-2">
              <label htmlFor="assign-team-leader" className="text-sm font-medium text-foreground">Assign To Team Leader</label>
              <Select
                id="assign-team-leader"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              </Select>

              <label htmlFor="assign-note" className="text-sm font-medium text-foreground">Assignment Note (Optional)</label>
              <textarea
                id="assign-note"
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={assignmentForm.note}
                onChange={(event) =>
                  setAssignmentForm((current) => ({ ...current, note: event.target.value }))
                }
                placeholder="Context for the assigned team leader..."
              />

              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                disabled={!assignmentForm.userId || actionState.busy}
                onClick={handleAssignToUser}
              >
                {actionState.busy ? 'Saving...' : 'Assign To Team Leader'}
              </button>
            </div>
          )}
        </article>
      </section>

      <section className="surface-card p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Process Tracking</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">Journey Map</h2>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {lifecycleSteps.map((step, index) => {
            const isActive = activeLifecycleIndex === index
            const isComplete = activeLifecycleIndex > index
            const isDecisionStep = step.key === 'decision'
            const stepClass = isActive
              ? 'border-primary bg-primary-soft'
              : isComplete
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-border bg-muted/20'

            return (
              <article key={step.key} className={`rounded-md border p-3 ${stepClass}`}>
                <p className="text-xs text-muted-foreground">{step.helper}</p>
                {!isDecisionStep ? (
                  <button
                    type="button"
                    className="mt-1 text-sm font-semibold text-foreground hover:text-primary disabled:opacity-60"
                    disabled={!canChangeStatus || actionState.busy}
                    onClick={() => handleLifecycleStatusChange(step.value)}
                  >
                    {step.label}
                  </button>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`inline-flex h-8 items-center justify-center rounded-md border px-2.5 text-xs font-medium transition ${decisionSelection === 'ACCEPTED' ? 'border-blue-300 bg-blue-100 text-blue-800' : 'border-border bg-background text-foreground hover:bg-muted/60'}`}
                      disabled={!canChangeStatus || actionState.busy}
                      onClick={() => handleLifecycleStatusChange('ACCEPTED')}
                    >
                      Accepted
                    </button>
                    <button
                      type="button"
                      className={`inline-flex h-8 items-center justify-center rounded-md border px-2.5 text-xs font-medium transition ${decisionSelection === 'REJECTED' ? 'border-red-300 bg-red-100 text-red-800' : 'border-border bg-background text-foreground hover:bg-muted/60'}`}
                      disabled={!canChangeStatus || actionState.busy}
                      onClick={() => handleLifecycleStatusChange('REJECTED')}
                    >
                      Rejected
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">AI Summary</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Summarize discussion</h2>
          </div>
          <button
            type="button"
            onClick={handleSummarizeDiscussion}
            disabled={aiSummary.loading}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {aiSummary.loading ? 'Summarizing...' : 'Summarize discussion'}
          </button>
        </div>

        {aiSummary.error ? (
          <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {aiSummary.error}
          </p>
        ) : null}

        {aiSummary.data ? (
          <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <div>
              <p className="text-xs text-muted-foreground">Short summary</p>
              <p className="text-sm text-foreground">{aiSummary.data.short_summary || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current progress</p>
              <p className="text-sm text-foreground">{aiSummary.data.current_progress || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Latest blocker</p>
              <p className="text-sm text-foreground">{aiSummary.data.latest_blocker || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending from</p>
              <p className="text-sm font-medium text-foreground">{aiSummary.data.pending_from || 'unknown'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Next action needed</p>
              <p className="text-sm text-foreground">{aiSummary.data.next_action || '-'}</p>
            </div>
            {Array.isArray(aiSummary.data.already_done) && aiSummary.data.already_done.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">Already done</p>
                <ul className="list-disc pl-5 text-sm text-foreground">
                  {aiSummary.data.already_done.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {Array.isArray(aiSummary.data.still_needed) && aiSummary.data.still_needed.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">Still needed</p>
                <ul className="list-disc pl-5 text-sm text-foreground">
                  {aiSummary.data.still_needed.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="surface-card p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Discussion</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">Conversation</h2>

        <div
          className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-md border border-border bg-muted/20 p-3"
          ref={discussionScrollRef}
        >
          {comments.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : null}
          {comments.map((item) => (
            <article key={item.id} className="rounded-md border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                    {getInitials(item.sender_name)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.sender_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRole(item.sender_role_keys)} | {item.sender_entity_name || 'Unknown entity'}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</p>
              </div>
              <p className="mt-2 text-sm text-foreground">{item.message}</p>
              {item.attachment_url ? (
                <a
                  href={item.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center rounded-md border border-border bg-muted/20 px-2.5 py-1 text-xs font-semibold text-foreground transition hover:bg-muted/40"
                >
                  Open attachment
                </a>
              ) : null}
            </article>
          ))}
        </div>

        <form className="mt-3 space-y-2" onSubmit={submitComment}>
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add a comment"
          />
          <input
            type="file"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold"
            onChange={(event) => setCommentAttachment(event.target.files?.[0] || null)}
          />
          {commentAttachment ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="truncate pr-2">{commentAttachment.name}</span>
              <button
                type="button"
                className="font-semibold text-foreground hover:underline"
                onClick={() => setCommentAttachment(null)}
              >
                Remove
              </button>
            </div>
          ) : null}
          <button
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            disabled={actionState.busy || (!comment.trim() && !commentAttachment)}
            type="submit"
          >
            Send Comment
          </button>
        </form>
      </section>
    </main>
  )
}

export default RequestDetailsPage
