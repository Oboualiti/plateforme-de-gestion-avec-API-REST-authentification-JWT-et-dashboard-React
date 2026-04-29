import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  MoreHorizontal,
  Paperclip,
  Send,
  Sparkles,
  UserPlus,
  Users,
  Building2,
  MessageSquarePlus,
  ExternalLink,
  Clock,
  Loader2,
} from 'lucide-react'

import { Avatar } from '../components/Avatar'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
import { DeadlinePlanner } from '../components/ui/deadline-planner'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

const statusLabelMap = {
  NEW: 'New',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
}

const terminalStatuses = new Set(['REJECTED', 'COMPLETED', 'CLOSED'])
const stepperStatuses = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED']
const priorityLabelMap = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
}

const priorityBadgeClassMap = {
  HIGH: 'bg-rose-100 text-rose-700',
  MEDIUM: 'bg-amber-100 text-amber-800',
  LOW: 'bg-emerald-100 text-emerald-700',
}

function badgeClass(baseClass) {
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${baseClass}`
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDateOnly(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

function formatRelative(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function getInitials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function StatusStepper({ currentStatus }) {
  const currentIndex = stepperStatuses.indexOf(currentStatus)
  const isTerminal = terminalStatuses.has(currentStatus) && currentStatus !== 'COMPLETED'

  return (
    <div className="flex w-full items-center gap-0 overflow-hidden rounded-lg border border-border bg-card">
      {stepperStatuses.map((status, i) => {
        const isPast = i < currentIndex
        const isCurrent = i === currentIndex
        const isFuture = i > currentIndex && !isTerminal

        return (
          <div
            key={status}
            className={cn(
              "flex flex-1 items-center justify-center py-3 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors relative",
              isCurrent && "bg-primary text-primary-foreground shadow-brutal border-x-2 border-ink z-10",
              isPast && "bg-primary/5 text-primary",
              isFuture && "text-muted-foreground bg-card",
              isTerminal && i >= currentIndex && "opacity-40 grayscale"
            )}
          >
            {statusLabelMap[status]}
            {isPast && <CheckCircle2 className="ml-1.5 h-3 w-3" />}
          </div>
        )
      })}
    </div>
  )
}

function StatusNoteModal({
  open,
  targetStatus,
  note,
  deadlineDate,
  requireDeadline,
  required,
  error,
  loading,
  onChangeNote,
  onChangeDeadlineDate,
  onCancel,
  onConfirm,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <section className="w-full max-w-lg rounded-xl border-2 border-ink bg-card shadow-elev-xl animate-in fade-in zoom-in duration-200">
        <div className="border-b border-border px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Status update</p>
          <h3 className="mt-1 text-lg font-extrabold text-foreground">Move request to {statusLabelMap[targetStatus]}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {required ? 'Resolution note is required for this terminal status.' : 'Add an optional note for this transition.'}
          </p>
        </div>
        <div className="space-y-3 px-6 py-5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {required ? 'Resolution note *' : 'Note'}
          </label>
          <textarea
            value={note}
            onChange={(event) => onChangeNote(event.target.value)}
            className="w-full min-h-[110px] rounded-lg border-2 border-ink bg-card p-3 text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none placeholder:text-muted-foreground"
            placeholder={required ? 'Write the resolution note...' : 'Optional note...'}
          />
          {requireDeadline ? (
            <>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Approximate deadline *
              </label>
              <div className="flex justify-center">
                <DeadlinePlanner
                  selectedDate={deadlineDate ? new Date(deadlineDate) : undefined}
                  numberOfMonths={1}
                  onDateSelect={(date) => {
                    if (date) {
                      const formattedDate = date.toISOString().split('T')[0]
                      onChangeDeadlineDate(formattedDate)
                    }
                  }}
                />
              </div>
            </>
          ) : null}
          {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={loading}>
            {loading ? 'Saving...' : 'Confirm'}
          </Button>
        </div>
      </section>
    </div>
  )
}

function PendingDecisionModal({
  open,
  busy,
  error,
  note,
  requestData,
  canDecide,
  onChangeNote,
  onApprove,
  onReject,
  onClose,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/85 backdrop-blur-sm p-4">
      <section className="w-full max-w-lg rounded-xl border-2 border-ink bg-card shadow-elev-xl">
        <div className="border-b border-border px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Pending approval</p>
          <h3 className="mt-1 text-lg font-extrabold text-foreground">Request decision required</h3>
          <p className="mt-1 text-sm text-muted-foreground">This request was opened from notifications and is waiting for approval.</p>
        </div>
        <div className="border-b border-border px-6 py-4">
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold text-foreground">{requestData?.title || '-'}</p>
            <p className="text-xs text-muted-foreground">
              Ref: {requestData?.request_number || '-'}
            </p>
            <p className="text-xs text-muted-foreground">
              {requestData?.source_entity_name || '-'} - {requestData?.target_entity_name || '-'}
            </p>
            <p className="text-xs text-muted-foreground">
              Priority: {(requestData?.priority || 'MEDIUM').toUpperCase()} • Created: {formatDateOnly(requestData?.created_at)}
            </p>
          </div>
        </div>
        <div className="space-y-3 px-6 py-5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Rejection reason (required for reject)
          </label>
          <textarea
            value={note}
            onChange={(event) => onChangeNote(event.target.value)}
            className="w-full min-h-[110px] rounded-lg border-2 border-ink bg-card p-3 text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none placeholder:text-muted-foreground"
            placeholder="Write reason if you reject..."
          />
          {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button type="button" onClick={onApprove} disabled={busy || !canDecide}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
          </Button>
          <Button type="button" variant="destructive" onClick={onReject} disabled={busy || !canDecide}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
          </Button>
        </div>
      </section>
    </div>
  )
}

function RequestDetailsPage() {
  const { requestId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', request: null })
  const [activeTab, setActiveTab] = useState('comments')
  const [comment, setComment] = useState('')
  const [commentAttachment, setCommentAttachment] = useState(null)
  const [mentionState, setMentionState] = useState({
    open: false,
    query: '',
    start: -1,
    end: -1,
    activeIndex: 0,
  })
  const [assignmentForm, setAssignmentForm] = useState({ userId: '', note: '' })
  const [actionState, setActionState] = useState({ busy: false, error: '' })
  const [aiSummary, setAiSummary] = useState({ loading: false, error: '', data: null })
  const [historyPage, setHistoryPage] = useState(1)
  const [statusDialog, setStatusDialog] = useState({
    open: false,
    targetStatus: '',
    note: '',
    deadlineDate: '',
    requireDeadline: false,
    required: false,
    error: '',
  })
  const [deadlineForm, setDeadlineForm] = useState({ value: '', saving: false, error: '' })
  const [pendingDecisionModal, setPendingDecisionModal] = useState({
    open: false,
    busy: false,
    note: '',
    error: '',
  })
  const discussionRef = useRef(null)
  const commentInputRef = useRef(null)

  const request = state.request
  const roleKeys = user?.role_keys || []
  const effectivePermissionKeys = new Set(user?.effective_permission_keys || [])
  const isSuperAdmin = roleKeys.includes('super_admin')
  const isManager = roleKeys.includes('manager')
  const isSenior = roleKeys.includes('senior')
  const isTeamLeader = roleKeys.includes('team_leader')
  const isUser = roleKeys.includes('user')
  const canViewRequestDiscussion = Boolean(
    request?.can_view_request_discussion ?? effectivePermissionKeys.has('view_request_discussion'),
  )
  const canCommentRequest = canViewRequestDiscussion && effectivePermissionKeys.has('comment_request')
  const canChangeStatus = Boolean(request?.can_update_status)
  const allowedStatusTransitions = request?.allowed_status_transitions || []
  const statusOptions = useMemo(() => {
    const options = [request?.status, ...allowedStatusTransitions].filter(Boolean)
    return [...new Set(options)]
  }, [allowedStatusTransitions, request?.status])
  const canEditDeadline = Boolean(request?.can_edit_deadline)
  const hasDeadlineEditAccess = canEditDeadline && effectivePermissionKeys.has('edit_request_deadline')
  const canAssignToMe = Boolean(request?.can_assign_to_me) && (isTeamLeader || isUser)
  const openedFromNotification = new URLSearchParams(location.search).get('from') === 'notification'
  const isPendingApproval = Boolean(request?.is_pending_approval)
  const isPendingLikeRequest = isPendingApproval || request?.status === 'NEW'
  const canDecidePendingFromNotification = isPendingLikeRequest
    && allowedStatusTransitions.includes('ACCEPTED')
    && allowedStatusTransitions.includes('REJECTED')
  const potentialAssignees = request?.potential_assignees || []
  const assignableUsers = useMemo(() => {
    if (!isSuperAdmin) return potentialAssignees
    return potentialAssignees.filter((candidate) => {
      const keys = candidate?.role_keys || candidate?.roles?.map((role) => role?.key).filter(Boolean) || []
      return keys.includes('team_leader') || candidate?.role === 'team_leader'
    })
  }, [isSuperAdmin, potentialAssignees])
  const canManagerAssignTl = (isSuperAdmin || isManager || isSenior)
    && !request?.current_assignee
    && assignableUsers.length > 0

  const comments = request?.comments || []
  const lastCommentId = comments.length ? comments[comments.length - 1].id : null
  const mentionCandidates = useMemo(() => {
    const map = new Map()
    const add = (username, label = '') => {
      const clean = String(username || '').trim()
      if (!clean) return
      if (!map.has(clean.toLowerCase())) {
        map.set(clean.toLowerCase(), { username: clean, label })
      }
    }
    add(user?.username, user?.fullName)
    add(request?.requester_user__username || request?.requester_name, request?.requester_name)
    add(request?.assignee_name, request?.assignee_name)
    potentialAssignees.forEach((candidate) => {
      add(candidate?.username, candidate?.full_name || candidate?.name || '')
    })
    comments.forEach((c) => add(c?.sender_username || c?.sender_name, c?.sender_name))
    return Array.from(map.values())
  }, [comments, potentialAssignees, request?.assignee_name, request?.requester_name, request?.requester_user__username, user?.fullName, user?.username])
  const filteredMentions = useMemo(() => {
    if (!mentionState.open) return []
    const q = mentionState.query.toLowerCase()
    const list = mentionCandidates.filter((candidate) => candidate.username.toLowerCase().includes(q))
    return list.slice(0, 8)
  }, [mentionCandidates, mentionState.open, mentionState.query])

  const historyItems = request?.activity_timeline || []
  const ITEMS_PER_PAGE = 8
  const totalHistoryPages = Math.ceil(historyItems.length / ITEMS_PER_PAGE)
  const paginatedHistory = historyItems.slice((historyPage - 1) * ITEMS_PER_PAGE, historyPage * ITEMS_PER_PAGE)

  useEffect(() => {
    async function load() {
      try {
        const response = await api.get(`/requests/${requestId}/`)
        setState({ loading: false, error: '', request: response.data })
      } catch (error) {
        setState({ loading: false, error: error.response?.data?.detail || 'Could not load request.', request: null })
      }
    }
    load()
  }, [requestId])

  // Real-time polling
  useEffect(() => {
    if (!requestId) return undefined
    const intervalId = setInterval(async () => {
       try {
         const response = await api.get(`/requests/${requestId}/`)
         setState(curr => {
           if (!curr.request) return curr
           const hasChange = curr.request.status !== response.data.status || 
                            (curr.request.comments || []).length !== (response.data.comments || []).length ||
                            curr.request.current_assignee !== response.data.current_assignee
           return hasChange ? { ...curr, request: response.data } : curr
         })
       } catch (err) {
         // Silently ignore polling failures
       }
    }, 2500)
    return () => clearInterval(intervalId)
  }, [requestId])

  // Auto-scroll logic
  useEffect(() => {
    if (activeTab !== 'comments') return
    if (discussionRef.current) {
        discussionRef.current.scrollTop = discussionRef.current.scrollHeight
    }
  }, [lastCommentId, activeTab])

  useEffect(() => {
    if (!canViewRequestDiscussion && activeTab === 'comments') {
      setActiveTab('history')
    }
  }, [canViewRequestDiscussion, activeTab])

  useEffect(() => {
    setDeadlineForm((current) => ({
      ...current,
      value: request?.deadline_date || '',
      error: '',
    }))
  }, [request?.deadline_date])

  useEffect(() => {
    if (!openedFromNotification || !isPendingLikeRequest) return
    setPendingDecisionModal((current) => ({ ...current, open: true }))
  }, [openedFromNotification, isPendingLikeRequest, request?.id])

  async function handleAction(promise) {
    setActionState({ busy: true, error: '' })
    try {
      const response = await promise
      setState(curr => ({ ...curr, request: response.data }))
      setComment('')
      setCommentAttachment(null)
      setActionState({ busy: false, error: '' })
    } catch (error) {
      setActionState({ 
        busy: false, 
        error: error.response?.data?.detail || error.response?.data?.note?.[0] || 'Action failed.' 
      })
    }
  }

  async function submitPendingDecisionFromModal(status) {
    setPendingDecisionModal((current) => ({ ...current, busy: true, error: '' }))
    try {
      const note = pendingDecisionModal.note.trim()
      if (status === 'REJECTED' && !note) {
        setPendingDecisionModal((current) => ({
          ...current,
          busy: false,
          error: 'Rejection reason is required.',
        }))
        return
      }

      const response = await api.post(`/requests/${requestId}/status/`, { status, note })
      setState((current) => ({ ...current, request: response.data }))
      setPendingDecisionModal({ open: false, busy: false, note: '', error: '' })
      navigate('/pending-requests', { replace: true })
    } catch (error) {
      setPendingDecisionModal((current) => ({
        ...current,
        busy: false,
        error: error.response?.data?.detail || 'Could not submit decision.',
      }))
    }
  }

  async function submitComment(e) {
    e.preventDefault()
    if (!canCommentRequest) return
    if (!comment.trim() && !commentAttachment) return
    const formData = new FormData()
    formData.append('message', comment)
    if (commentAttachment) formData.append('attachment', commentAttachment)
    await handleAction(api.post(`/requests/${requestId}/comments/`, formData))
  }

  function closeMentionMenu() {
    setMentionState((current) => ({
      ...current,
      open: false,
      query: '',
      start: -1,
      end: -1,
      activeIndex: 0,
    }))
  }

  function insertMention(username) {
    const start = mentionState.start
    const end = mentionState.end >= 0 ? mentionState.end : start
    if (start < 0) return
    const before = comment.slice(0, start)
    const after = comment.slice(end)
    const mentionToken = `@${username} `
    const nextValue = `${before}${mentionToken}${after}`
    setComment(nextValue)
    closeMentionMenu()
    requestAnimationFrame(() => {
      if (!commentInputRef.current) return
      const caretPos = before.length + mentionToken.length
      commentInputRef.current.focus()
      commentInputRef.current.setSelectionRange(caretPos, caretPos)
    })
  }

  function handleCommentInputChange(value) {
    setComment(value)
    const caret = commentInputRef.current?.selectionStart ?? value.length
    const before = value.slice(0, caret)
    const atIndex = before.lastIndexOf('@')
    if (atIndex < 0) {
      closeMentionMenu()
      return
    }
    const prefix = before.slice(atIndex + 1)
    const hasSpace = /\s/.test(prefix)
    if (hasSpace) {
      closeMentionMenu()
      return
    }
    setMentionState({
      open: true,
      query: prefix,
      start: atIndex,
      end: caret,
      activeIndex: 0,
    })
  }

  function handleCommentInputKeyDown(event) {
    if (!mentionState.open || !filteredMentions.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setMentionState((current) => ({
        ...current,
        activeIndex: (current.activeIndex + 1) % filteredMentions.length,
      }))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setMentionState((current) => ({
        ...current,
        activeIndex: (current.activeIndex - 1 + filteredMentions.length) % filteredMentions.length,
      }))
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const active = filteredMentions[mentionState.activeIndex]
      if (active) insertMention(active.username)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMentionMenu()
    }
  }

  function requestStatusChange(status) {
    if (!status || status === request?.status) return
    const required = terminalStatuses.has(status)
    const requireDeadline = status === 'ACCEPTED' && hasDeadlineEditAccess
    setStatusDialog({
      open: true,
      targetStatus: status,
      note: '',
      deadlineDate: request?.deadline_date || '',
      requireDeadline,
      required,
      error: '',
    })
  }

  function closeStatusDialog() {
    if (actionState.busy) return
    setStatusDialog({
      open: false,
      targetStatus: '',
      note: '',
      deadlineDate: '',
      requireDeadline: false,
      required: false,
      error: '',
    })
  }

  async function confirmStatusChange() {
    const note = statusDialog.note.trim()
    if (statusDialog.required && !note) {
      setStatusDialog((current) => ({
        ...current,
        error: 'Resolution note is required for terminal statuses.',
      }))
      return
    }
    if (statusDialog.requireDeadline && !statusDialog.deadlineDate) {
      setStatusDialog((current) => ({
        ...current,
        error: 'Approximate deadline is required when accepting this request.',
      }))
      return
    }
    const payload = { status: statusDialog.targetStatus, note }
    if (statusDialog.deadlineDate) {
      payload.deadline_date = statusDialog.deadlineDate
    }
    await handleAction(
      api.post(`/requests/${requestId}/status/`, payload),
    )
    setStatusDialog({
      open: false,
      targetStatus: '',
      note: '',
      deadlineDate: '',
      requireDeadline: false,
      required: false,
      error: '',
    })
  }

  async function handleAssignToMe() {
    await handleAction(api.post(`/requests/${requestId}/assign/`, {}))
  }

  async function handleAssignToUser() {
    if (!assignmentForm.userId) return
    await handleAction(api.post(`/requests/${requestId}/assign_user/`, {
      user_id: Number(assignmentForm.userId),
      note: assignmentForm.note || 'Assigned via delegation'
    }))
    setAssignmentForm({ userId: '', note: '' })
  }

  async function loadAiSummary() {
    setAiSummary({ loading: true, error: '', data: null })
    try {
      const response = await api.post(`/requests/${requestId}/ai-summary/`)
      setAiSummary({ loading: false, error: '', data: response.data })
    } catch (err) {
      setAiSummary({ loading: false, error: 'AI summarization failed.', data: null })
    }
  }

  async function saveDeadline() {
    if (!hasDeadlineEditAccess || !deadlineForm.value) return
    setDeadlineForm((current) => ({ ...current, saving: true, error: '' }))
    try {
      const response = await api.post(`/requests/${requestId}/deadline/`, {
        deadline_date: deadlineForm.value,
      })
      setState((current) => ({ ...current, request: response.data }))
      setDeadlineForm((current) => ({ ...current, saving: false, error: '' }))
    } catch (error) {
      setDeadlineForm((current) => ({
        ...current,
        saving: false,
        error: error.response?.data?.detail || 'Could not save deadline.',
      }))
    }
  }

  if (state.loading) return (
    <main className="page-content space-y-6">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
        <Skeleton className="h-[500px] w-full rounded-xl" />
      </div>
    </main>
  )

  if (state.error || !request) return (
    <main className="page-content py-12 text-center">
      <div className="rounded-xl border-2 border-destructive bg-destructive/5 p-8 max-w-md mx-auto">
        <p className="text-destructive font-bold uppercase tracking-wider">{state.error || 'Request Not Found'}</p>
        <Button variant="outline" className="mt-6" asChild>
          <Link to="/requests"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Workspace</Link>
        </Button>
      </div>
    </main>
  )

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Top bar: back link */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Requests
      </button>

      {/* Header row */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Request</span>
            <span className="text-muted-foreground/60">•</span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] tracking-tight text-foreground border-2 border-ink shadow-sm">
              {request.reference_code || `#${request.request_number}`}
            </span>
            <button className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Copy reference" onClick={() => navigator.clipboard.writeText(request.reference_code || request.request_number)}>
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">{request.title || 'Untitled Request'}</h1>
          <div className="flex flex-wrap items-center gap-2 pt-1 mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-card px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-foreground shadow-sm">
              <FileText className="h-3 w-3 text-muted-foreground" />
              Type: {request.type || 'Standard'}
            </span>
            {request.priority && (
               <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-card px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-foreground shadow-sm">
                 <span className={cn("h-1.5 w-1.5 rounded-full", request.priority === 'High' ? "bg-destructive" : request.priority === 'Medium' ? "bg-warning" : "bg-info")} />
                 Priority: {request.priority}
               </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-card px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground shadow-sm">
              <Calendar className="h-3 w-3" />
              Opened {formatRelative(request.created_at)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary border-2 border-ink shadow-brutal px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-primary-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/80" />
            {statusLabelMap[request.status]}
          </span>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1.5 text-xs mt-3">
            <dt className="flex items-center gap-1.5 text-muted-foreground font-semibold">
              <Calendar className="h-3 w-3" /> Created
            </dt>
            <dd className="text-right font-bold tabular-nums">{formatDateOnly(request.created_at)}</dd>
            <dt className="flex items-center gap-1.5 text-muted-foreground font-semibold">
              <Calendar className="h-3 w-3" /> Last interaction
            </dt>
            <dd className="text-right font-bold tabular-nums">{formatDateOnly(request.updated_at || request.created_at)}</dd>
            <dt className="flex items-center gap-1.5 text-muted-foreground font-semibold">
              <CalendarDays className="h-3 w-3" /> Approx. deadline
            </dt>
            <dd className="text-right font-extrabold tabular-nums text-primary">{request.deadline_date ? formatDateOnly(request.deadline_date) : '-'}</dd>
          </dl>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-8">
          {/* AI Summary */}
          <article className="surface-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary border border-ink">
                <Bot className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-extrabold uppercase text-foreground tracking-widest">AI Synopsis</h2>
              <span className="rounded-md bg-primary/15 border border-primary/30 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-primary">Beta</span>
              <Button variant="ghost" size="sm" onClick={loadAiSummary} disabled={aiSummary.loading} className="ml-auto h-7 px-2 border-2 border-ink shadow-sm bg-surface-2 text-[10px] uppercase font-extrabold">
                {aiSummary.loading ? 'Parsing...' : <><Sparkles className="h-3 w-3 mr-1" /> Re-trigger</>}
              </Button>
            </div>
            {aiSummary.data ? (
              <div className="grid gap-5 sm:grid-cols-4">
                <div className="sm:col-span-1">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Briefing</p>
                  <p className="text-xs leading-relaxed text-foreground font-medium">{aiSummary.data.short_summary}</p>
                </div>
                <div className="sm:col-span-1">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current progress</p>
                  <p className="mb-1.5 text-xs text-foreground font-bold">{aiSummary.data.current_progress || '-'}</p>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const progressMap = {
                        NEW: 25,
                        ACCEPTED: 50,
                        IN_PROGRESS: 75,
                        COMPLETED: 100,
                        REJECTED: 100,
                        CLOSED: 100,
                      };
                      const percent = progressMap[request.status] || 0;
                      return (
                        <>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted border border-ink/20">
                            <div className={cn("h-full rounded-full", request.status === 'REJECTED' ? "bg-destructive" : "bg-primary")} style={{ width: `${percent}%` }} />
                          </div>
                          <span className="text-[11px] font-extrabold tabular-nums text-foreground">{percent}%</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="sm:col-span-1">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pending from</p>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const pf = aiSummary.data.pending_from || 'unknown';
                      
                      let name = '';
                      if (pf === 'requester') name = request.requester_name || 'Requester';
                      else if (pf === 'handler') name = request.assignee_name || 'Handler';
                      else if (pf === 'both') {
                        const rName = request.requester_name || 'Requester';
                        const hName = request.assignee_name || 'Handler';
                        name = `${rName} & ${hName}`;
                      }
                      else {
                        // Fallback instead of TBD
                        name = request.assignee_name || request.requester_name || 'System';
                      }

                      return (
                        <>
                          <Avatar name={name} size={24} />
                          <span className="text-xs font-semibold truncate">{name}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="sm:col-span-1">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Next Expected Step</p>
                  <p className="text-xs leading-relaxed font-bold text-primary">{aiSummary.data.next_action || 'Continuous monitoring'}</p>
                </div>
              </div>
            ) : (
               <div className="rounded-md border-2 border-dashed border-ink/30 bg-muted/10 py-6 text-center">
                 <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">No intelligence data generated yet.</p>
                 <Button size="sm" onClick={loadAiSummary} disabled={aiSummary.loading} className="text-[10px] font-extrabold uppercase tracking-wider shadow-brutal border-2 border-ink bg-primary text-primary-foreground">
                   {aiSummary.loading ? 'Initializing...' : 'Initialize Synthesis'}
                 </Button>
               </div>
            )}
          </article>

          {/* Lifecycle */}
          <article className="surface-card p-5">
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground pl-1">Request Lifecycle</p>
            <StatusStepper currentStatus={request.status} />
          </article>

          {/* Request Context */}
          <article className="surface-card p-5">
            <div className="mb-3 flex items-center gap-2 text-muted-foreground pl-1">
              <FileText className="h-4 w-4" />
              <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-foreground">Request Context</h3>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90 font-medium pl-1">{request.description}</p>
            {request.attachment_url && (
              <a href={request.attachment_url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-md border-2 border-ink bg-muted/30 px-4 py-2 text-[11px] uppercase tracking-wider font-extrabold hover:bg-muted shadow-brutal transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ml-1">
                <Paperclip className="h-3.5 w-3.5" /> View original attachment
              </a>
            )}
          </article>

          {/* Discussion / History Tab Box */}
          <article className="surface-card overflow-hidden flex flex-col">
            <div className="flex border-b-2 border-ink bg-surface-2 font-extrabold text-xs">
              <button
                onClick={() => canViewRequestDiscussion && setActiveTab('comments')}
                disabled={!canViewRequestDiscussion}
                className={cn(
                  "relative flex-1 px-4 py-4 text-[10px] font-extrabold uppercase tracking-widest transition-colors border-r-2 border-ink z-10",
                  activeTab === 'comments' ? "text-foreground bg-card border-b-0" : "text-muted-foreground hover:text-foreground",
                  !canViewRequestDiscussion && "cursor-not-allowed opacity-50"
                )}
              >
                Discussion ({comments.length})
                {activeTab === 'comments' && <span className="absolute inset-x-0 -bottom-[3px] h-[6px] bg-card z-20" />}
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={cn(
                   "relative flex-1 px-4 py-4 text-[10px] font-extrabold uppercase tracking-widest transition-colors z-10",
                   activeTab === 'history' ? "text-foreground bg-card" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Activity Log ({historyItems.length})
                {activeTab === 'history' && <span className="absolute inset-x-0 -bottom-[3px] h-[6px] bg-card z-20" />}
              </button>
            </div>

            <div className="p-6">
               {activeTab === 'comments' ? (
                <div className="space-y-6">
                  {!canViewRequestDiscussion ? (
                    <div className="py-8 text-center text-xs font-medium text-muted-foreground">
                      You do not have permission to view this discussion.
                    </div>
                  ) : (
                    <>
                      <div ref={discussionRef} className="max-h-[420px] overflow-y-auto space-y-5 pr-2 custom-scrollbar">
                        {comments.length === 0 ? (
                           <div className="py-12 text-center text-muted-foreground">
                             <MessageSquarePlus className="mx-auto h-8 w-8 mb-3 opacity-20" />
                             <p className="text-[10px] font-bold uppercase tracking-widest">No messages yet</p>
                           </div>
                        ) : (
                          comments.map(c => (
                            <div key={c.id} className="flex gap-4">
                              <Avatar name={c.sender_name} size={32} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-4 mb-1">
                                   <div className="flex items-baseline gap-2 min-w-0">
                                      <span className="text-sm font-extrabold text-foreground truncate">{c.sender_name}</span>
                                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                        {c.sender_entity_name ? `${c.sender_entity_name} • ` : ''}{c.sender_role_keys?.join(', ')}
                                      </span>
                                   </div>
                                   <span className="text-[10px] font-bold text-muted-foreground shrink-0 uppercase tracking-widest">{formatRelative(c.created_at)}</span>
                                </div>
                                <div className="rounded-lg rounded-tl-none border-2 border-ink bg-surface-2 p-4 text-sm font-medium text-foreground/95 whitespace-pre-line shadow-sm">
                                  {c.message}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {canCommentRequest ? (
                        <form onSubmit={submitComment} className="mt-4 rounded-xl border-2 border-ink shadow-brutal bg-background overflow-visible relative z-20">
                          <div className="relative flex items-start gap-2 p-1">
                             <textarea
                              ref={commentInputRef}
                              value={comment}
                              onChange={e => handleCommentInputChange(e.target.value)}
                              onKeyDown={handleCommentInputKeyDown}
                              placeholder="Type your message..."
                              className="flex-1 bg-transparent p-3 text-sm font-medium outline-none placeholder:text-muted-foreground resize-none min-h-[60px]"
                             />
                             {mentionState.open && filteredMentions.length > 0 ? (
                               <div className="absolute bottom-[calc(100%+6px)] left-3 z-40 max-h-56 w-96 max-w-[calc(100%-7.5rem)] overflow-y-auto rounded-md border-2 border-ink bg-card p-1 shadow-elev-lg">
                                 {filteredMentions.map((candidate, index) => {
                                    const active = index === mentionState.activeIndex
                                    return (
                                      <button
                                        key={candidate.username}
                                        type="button"
                                       className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs font-semibold ${
                                         active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/60'
                                       }`}
                                       onMouseDown={(event) => {
                                         event.preventDefault()
                                         insertMention(candidate.username)
                                       }}
                                     >
                                       <span>@{candidate.username}</span>
                                       {candidate.label ? (
                                         <span className={`truncate pl-2 ${active ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>
                                           {candidate.label}
                                         </span>
                                       ) : null}
                                     </button>
                                   )
                                 })}
                               </div>
                             ) : null}
                             <div className="flex flex-col gap-2 p-2 pt-3 pr-3">
                               <Button
                                 size="sm"
                                 type="submit"
                                 disabled={actionState.busy || (!comment.trim() && !commentAttachment)}
                                 className="h-8 px-4 text-[10px] font-extrabold uppercase tracking-wider border-2 border-ink shadow-sm"
                               >
                                 <Send className="h-3 w-3 mr-1.5" /> Send
                               </Button>
                             </div>
                          </div>
                          <div className="border-t-2 border-ink bg-surface-2 px-4 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                               <input
                                type="file"
                                id="file-upload"
                                className="hidden"
                                onChange={e => setCommentAttachment(e.target.files?.[0])}
                               />
                               <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                                 <Paperclip className="h-3.5 w-3.5" />
                                 {commentAttachment ? commentAttachment.name : 'Attach file (max 10MB)'}
                               </label>
                            </div>
                          </div>
                        </form>
                      ) : (
                         <div className="mt-8 border-t-2 border-ink pt-6 text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest text-center">
                           You do not have permission to comment in this discussion.
                         </div>
                      )}
                    </>
                  )}
                </div>
               ) : (
                <>
                  <ol className="relative space-y-6 border-l-2 border-ink pl-6 ml-2">
                    {paginatedHistory.map((item, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[33px] mt-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary border-2 border-ink" />
                        <div className="flex flex-col">
                          <span className="text-sm font-extrabold text-foreground leading-none">{item.title}</span>
                          <span className="text-[12px] font-medium text-foreground/80 mt-1.5 leading-relaxed">
                            {item.description}
                          </span>
                          <span className="mt-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                             {formatDateTime(item.timestamp)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>

                  {totalHistoryPages > 1 && (
                    <div className="mt-8 flex items-center justify-between border-t-2 border-ink pt-6">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Page {historyPage} of {totalHistoryPages}
                      </span>
                      <div className="flex gap-2">
                         <Button
                          variant="outline"
                          size="sm"
                          disabled={historyPage === 1}
                          onClick={() => setHistoryPage(p => p - 1)}
                          className="h-8 px-3 text-[10px] uppercase border-2 border-ink shadow-brutal active:translate-y-0.5 active:translate-x-0.5"
                         >
                           Previous
                         </Button>
                         <Button
                          variant="outline"
                          size="sm"
                          disabled={historyPage === totalHistoryPages}
                          onClick={() => setHistoryPage(p => p + 1)}
                          className="h-8 px-3 text-[10px] uppercase border-2 border-ink shadow-brutal active:translate-y-0.5 active:translate-x-0.5"
                         >
                           Next
                         </Button>
                      </div>
                    </div>
                  )}
                </>
               )}
            </div>
          </article>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:col-span-4">
          <div className="lg:sticky lg:top-6 space-y-6">
            {/* Deadline planner */}
            <article className="surface-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-[11px] font-extrabold uppercase tracking-widest">Deadline Planner</h3>
              </div>
              <p className="mb-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Approximate completion date</p>
              <div className="rounded-xl border-2 border-ink bg-card p-2 shadow-sm mb-4">
                <DeadlinePlanner
                  selectedDate={deadlineForm.value ? new Date(deadlineForm.value) : undefined}
                  numberOfMonths={1}
                  disabled={!hasDeadlineEditAccess}
                  onDateSelect={(date) => {
                    if (!date) return
                    const formattedDate = date.toISOString().split('T')[0]
                    setDeadlineForm((current) => ({ ...current, value: formattedDate, error: '' }))
                  }}
                />
              </div>
              <Button
                size="sm"
                className="w-full text-[11px] uppercase tracking-wider font-extrabold border-2 border-ink shadow-brutal active:translate-y-[2px] active:translate-x-[2px] active:shadow-none"
                onClick={saveDeadline}
                disabled={!hasDeadlineEditAccess || deadlineForm.saving || !deadlineForm.value}
              >
                {deadlineForm.saving ? 'Saving...' : 'Save Deadline'}
              </Button>
              {!hasDeadlineEditAccess ? (
                <p className="mt-3 text-[10px] font-bold text-muted-foreground text-center">
                  Requires "Edit Request Deadline" permission.
                </p>
              ) : null}
              {deadlineForm.error ? (
                <p className="mt-3 text-[10px] font-bold text-destructive text-center uppercase">{deadlineForm.error}</p>
              ) : null}
            </article>

            {/* Operations */}
            <article className="surface-card p-5">
              <h3 className="mb-4 text-[11px] font-extrabold uppercase tracking-widest pl-1">Operations</h3>
              <div className="space-y-4">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground pl-1">Transition Status</label>
                    <div className="relative">
                      <Select
                         value={request.status}
                         onChange={e => requestStatusChange(e.target.value)}
                         disabled={!canChangeStatus || actionState.busy || statusOptions.length <= 1}
                         className="w-full font-bold border-2 border-ink shadow-sm bg-surface-2"
                      >
                         {statusOptions.map(s => (
                           <option key={s} value={s}>{statusLabelMap[s]}</option>
                         ))}
                      </Select>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium mt-1 pl-1">Update the status to reflect current progress.</p>
                 </div>

                 <div className="grid grid-cols-2 gap-3 pt-2">
                   <Button
                      variant="outline"
                      className="w-full text-[10px] uppercase tracking-wider px-2 font-extrabold border-2 border-ink shadow-brutal active:translate-y-[2px] active:translate-x-[2px] active:shadow-none bg-surface-2"
                      onClick={handleAssignToMe}
                      disabled={!canAssignToMe || actionState.busy}
                   >
                     <UserPlus className="h-3 w-3 mr-1.5" /> Assign to me
                   </Button>
                   <Button
                      variant="outline"
                      className="w-full text-[10px] uppercase tracking-wider px-2 font-extrabold border-2 border-ink shadow-brutal active:translate-y-[2px] active:translate-x-[2px] active:shadow-none bg-surface-2"
                      onClick={() => document.getElementById('assign-tl-select')?.focus()}
                      disabled={!canManagerAssignTl}
                   >
                     <Users className="h-3 w-3 mr-1.5" /> Assign TL
                   </Button>
                 </div>

                 {canManagerAssignTl && (
                   <div className="space-y-3 pt-4 border-t-2 border-ink">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground pl-1">Team Leader Delegation</label>
                        <Select
                           id="assign-tl-select"
                           value={assignmentForm.userId}
                           onChange={e => setAssignmentForm(curr => ({ ...curr, userId: e.target.value }))}
                           className="w-full font-bold border-2 border-ink shadow-sm bg-surface-2"
                        >
                           <option value="">Select individual...</option>
                           {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                        </Select>
                     </div>
                     <textarea
                        placeholder="Assignment note..."
                        className="w-full h-16 rounded-md border-2 border-ink bg-card p-3 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                        value={assignmentForm.note}
                        onChange={e => setAssignmentForm(curr => ({ ...curr, note: e.target.value }))}
                     />
                     <Button size="sm" className="w-full text-[10px] uppercase tracking-wider font-extrabold border-2 border-ink shadow-brutal active:translate-y-0.5 active:translate-x-0.5 active:shadow-none" onClick={handleAssignToUser} disabled={!assignmentForm.userId || actionState.busy}>
                        Confirm Assignment
                     </Button>
                   </div>
                 )}
              </div>
              {actionState.error && <p className="mt-4 text-[10px] font-bold text-destructive uppercase tracking-widest text-center">{actionState.error}</p>}
            </article>

            {/* Routing */}
            <article className="surface-card p-5">
              <h3 className="mb-4 text-[11px] font-extrabold uppercase tracking-widest pl-1">Routing Info</h3>
              <div className="space-y-4">
                <div className="px-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Company / Entity</p>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <p className="text-sm font-extrabold truncate text-foreground">{request.company_name || 'N/A'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border-2 border-ink bg-surface-2 p-4 shadow-sm">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Source</p>
                    <p className="truncate text-xs font-extrabold text-foreground">{request.source_entity_name || 'N/A'}</p>
                    <p className="truncate text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-wide">
                      {request.requester_name || '-'} • Requester
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-50" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Target</p>
                    <p className="truncate text-xs font-extrabold text-foreground">{request.target_entity_name || 'N/A'}</p>
                    <p className="truncate text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-wide">
                      {request.assignee_name || 'Not assigned'} • Owner
                    </p>
                  </div>
                </div>
              </div>
            </article>

            {/* Quick AI Synopsis card if initialized */}
            {aiSummary.data && (
               <article className="surface-card p-5 shadow-sm">
                 <div className="mb-3 flex items-center gap-2">
                   <Bot className="h-4 w-4 text-primary" />
                   <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-foreground">Active Step Info</h3>
                 </div>
                 <p className="text-xs font-bold leading-relaxed text-muted-foreground">{aiSummary.data.next_action}</p>
               </article>
            )}

          </div>
        </aside>
      </div>

      <StatusNoteModal
        open={statusDialog.open}
        targetStatus={statusDialog.targetStatus}
        note={statusDialog.note}
        deadlineDate={statusDialog.deadlineDate}
        requireDeadline={statusDialog.requireDeadline}
        required={statusDialog.required}
        error={statusDialog.error}
        loading={actionState.busy}
        onChangeNote={(value) =>
          setStatusDialog((current) => ({ ...current, note: value, error: '' }))
        }
        onChangeDeadlineDate={(value) =>
          setStatusDialog((current) => ({ ...current, deadlineDate: value, error: '' }))
        }
        onCancel={closeStatusDialog}
        onConfirm={confirmStatusChange}
      />
      <PendingDecisionModal
        open={pendingDecisionModal.open}
        busy={pendingDecisionModal.busy}
        error={pendingDecisionModal.error}
        note={pendingDecisionModal.note}
        requestData={request}
        canDecide={canDecidePendingFromNotification}
        onChangeNote={(value) =>
          setPendingDecisionModal((current) => ({ ...current, note: value, error: '' }))
        }
        onApprove={() => submitPendingDecisionFromModal('ACCEPTED')}
        onReject={() => submitPendingDecisionFromModal('REJECTED')}
        onClose={() => navigate('/pending-requests')}
      />
    </main>
  )
}

export default RequestDetailsPage
