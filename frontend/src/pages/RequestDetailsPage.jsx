import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  MessageSquarePlus,
  ArrowRight,
  User2,
  Clock,
  ExternalLink,
  Bot,
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

function RequestDetailsPage() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', request: null })
  const [activeTab, setActiveTab] = useState('comments')
  const [comment, setComment] = useState('')
  const [commentAttachment, setCommentAttachment] = useState(null)
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
  const discussionRef = useRef(null)

  const request = state.request
  const roleKeys = user?.role_keys || []
  const effectivePermissionKeys = new Set(user?.effective_permission_keys || [])
  const isSuperAdmin = roleKeys.includes('super_admin')
  const isManager = roleKeys.includes('manager')
  const isSenior = roleKeys.includes('senior')
  const isTeamLeader = roleKeys.includes('team_leader')
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
  const canAssignToMe = Boolean(request?.can_assign_to_me) && isTeamLeader
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

  async function submitComment(e) {
    e.preventDefault()
    if (!canCommentRequest) return
    if (!comment.trim() && !commentAttachment) return
    const formData = new FormData()
    formData.append('message', comment)
    if (commentAttachment) formData.append('attachment', commentAttachment)
    await handleAction(api.post(`/requests/${requestId}/comments/`, formData))
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
    <main className="page-content pb-12 space-y-6">
      <section className="surface-card min-h-[210px] bg-surface-1 dark:bg-gradient-to-r dark:from-surface-1 dark:via-surface-1 dark:to-surface-2 p-8">
        <div className="flex min-h-[170px] flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="-ml-3 w-fit px-2 text-[12px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Button>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">
              {request.reference_code || `#${request.request_number}`}
            </p>
            <h1 className="text-5xl font-black uppercase tracking-[-0.02em] leading-none text-foreground">
              {request.title || 'Untitled Request'}
            </h1>


          </div>
          <div className="flex flex-col items-start gap-3 pb-1 lg:items-end">
            <span className="inline-flex items-center rounded-md border-2 border-ink bg-primary px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-primary-foreground">
              {statusLabelMap[request.status]}
            </span>
            <span className="flex items-center text-xs font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
              <Calendar className="mr-1.5 h-3.5 w-3.5" /> {formatDateTime(request.created_at)}
            </span>
          </div>
        </div>
      </section>

      {/* Process Stepper */}
      <section className="animate-fade-in">
        <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          <span>Operational Lifecycle</span>
          <span className="text-primary">{statusLabelMap[request.status]}</span>
        </div>
        <StatusStepper currentStatus={request.status} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Workspace (Left) */}
        <div className="space-y-6 lg:col-span-2">
          {/* High-Level Context */}
          <article className="surface-card p-8">
             <div className="mb-6 flex flex-wrap gap-3">
               <span className={badgeClass("bg-slate-100 text-slate-700")}>{request.type || 'Standard'}</span>
               <span className="flex items-center text-[10px] font-bold text-muted-foreground uppercase ml-auto">
                 <Calendar className="mr-1.5 h-3 w-3" /> Opened {formatDateTime(request.created_at)}
               </span>
             </div>
             <div>
               <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Request Context</h2>
               <div className="prose prose-sm max-w-none text-foreground/90 whitespace-pre-line leading-relaxed">
                 {request.description || "No detailed description provided."}
               </div>
             </div>
             {request.attachment_url && (
               <div className="mt-8 pt-6 border-t border-border">
                  <a href={request.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2 text-xs font-semibold hover:bg-muted/50 transition">
                    <ExternalLink className="h-3.5 w-3.5" /> View Original Attachment
                  </a>
               </div>
             )}
          </article>

          {/* Discussion & Interaction Hub */}
          <article className="surface-card overflow-hidden">
            <div className="flex border-b border-border bg-muted/5">
              <button 
                onClick={() => canViewRequestDiscussion && setActiveTab('comments')}
                disabled={!canViewRequestDiscussion}
                className={cn("flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2", 
                  activeTab === 'comments' ? "border-primary text-foreground bg-card" : "border-transparent text-muted-foreground hover:text-foreground",
                  !canViewRequestDiscussion && "cursor-not-allowed opacity-50 hover:text-muted-foreground")}
              >
                Discussion ({comments.length})
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={cn("flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2", 
                  activeTab === 'history' ? "border-primary text-foreground bg-card" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                Activity Log ({historyItems.length})
              </button>
            </div>

            <div className="p-8">
              {activeTab === 'comments' ? (
                <div className="space-y-8">
                  {!canViewRequestDiscussion ? (
                    <div className="py-8 text-center text-xs font-medium text-muted-foreground">
                      You do not have permission to view this discussion.
                    </div>
                  ) : (
                    <>
                  <div ref={discussionRef} className="max-h-[500px] overflow-y-auto space-y-6 pr-4 custom-scrollbar">
                    {comments.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">
                         <MessageSquarePlus className="mx-auto h-8 w-8 mb-3 opacity-20" />
                         <p className="text-xs font-bold uppercase tracking-widest">No messages yet</p>
                      </div>
                    ) : (
                      comments.map(item => (
                        <div key={item.id} className="flex gap-4">
                          <Avatar name={item.sender_name} size={32} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-4 mb-1">
                               <span className="text-sm font-bold text-foreground truncate">{item.sender_name}</span>
                               <span className="text-[10px] font-medium text-muted-foreground">{formatRelative(item.created_at)}</span>
                            </div>
                            <div className="bg-muted/30 rounded-lg rounded-tl-none p-4 text-sm text-foreground/90 whitespace-pre-line border border-border/40">
                              {item.message}
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground">
                               {item.sender_entity_name ? `${item.sender_entity_name} â€¢ ` : ''}{item.sender_role_keys?.join(', ')}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {canCommentRequest ? (
                    <form onSubmit={submitComment} className="mt-8 border-t border-border pt-8">
                      <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Type your message..."
                        className="w-full min-h-[100px] rounded-lg border-2 border-ink bg-card p-4 text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder:text-muted-foreground"
                      />
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                           <input 
                            type="file" 
                            id="file-upload" 
                            className="hidden" 
                            onChange={e => setCommentAttachment(e.target.files?.[0])}
                           />
                           <label htmlFor="file-upload" className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                             {commentAttachment ? `📎 ${commentAttachment.name}` : 'Attach File'}
                           </label>
                        </div>
                        <Button size="sm" type="submit" disabled={actionState.busy || (!comment.trim() && !commentAttachment)}>
                          Post Response
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="mt-8 border-t border-border pt-6 text-xs font-medium text-muted-foreground">
                      You do not have permission to comment in this discussion.
                    </div>
                  )}
                    </>
                  )}
                </div>
              ) : (
                <>
                  <ol className="relative space-y-6 border-l border-border pl-6">
                    {paginatedHistory.map((item, i) => (
                      <li key={i}>
                        <span className="absolute -left-[27px] mt-1 flex h-3 w-3 items-center justify-center rounded-full bg-background ring-2 ring-primary" />
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-foreground leading-none">{item.title}</span>
                          <span className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            {item.description}
                          </span>
                          <span className="mt-2 text-[10px] font-medium text-muted-foreground/40 uppercase tracking-tight">
                             {formatDateTime(item.timestamp)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>

                  {totalHistoryPages > 1 && (
                    <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Page {historyPage} of {totalHistoryPages}
                      </span>
                      <div className="flex gap-2">
                         <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={historyPage === 1}
                          onClick={() => setHistoryPage(p => p - 1)}
                          className="h-8 px-3 text-[10px] uppercase"
                         >
                           Previous
                         </Button>
                         <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={historyPage === totalHistoryPages}
                          onClick={() => setHistoryPage(p => p + 1)}
                          className="h-8 px-3 text-[10px] uppercase"
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

          {/* AI Intelligence */}
          <article className="surface-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">AI Synopsis</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={loadAiSummary} disabled={aiSummary.loading} className="h-7 px-2">
                {aiSummary.loading ? '...' : <Clock className="h-3 w-3" />}
              </Button>
            </div>
            {aiSummary.data ? (
              <div className="space-y-4">
                <div className="rounded border border-primary/10 bg-primary/5 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase text-primary">Briefing</p>
                  <p className="text-[11px] font-medium leading-relaxed">{aiSummary.data.short_summary}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Status</p>
                    <p className="text-xs font-bold">{aiSummary.data.current_progress || '-'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Owner</p>
                    <p className="truncate text-xs font-bold">{aiSummary.data.pending_from || 'System'}</p>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Next Expected Step</p>
                  <p className="text-xs font-medium text-primary">{aiSummary.data.next_action || 'Continuous monitoring'}</p>
                </div>
              </div>
            ) : (
              <div className="rounded border border-dashed border-border bg-muted/10 py-6 text-center">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">No intelligence data</p>
                <Button variant="link" size="sm" onClick={loadAiSummary} className="mt-1 h-auto p-0 text-[10px] uppercase">Initialize</Button>
              </div>
            )}
          </article>
        </div>

        {/* Operational Sidebar (Right) */}
        <aside className="space-y-6">
          <article className="surface-card p-6 space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Deadline Planner</h3>
            <div className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Approximate completion date
              </label>
              <div className="flex justify-center rounded-lg bg-card/20 p-1">
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
                variant="outline"
                className="w-full"
                onClick={saveDeadline}
                disabled={!hasDeadlineEditAccess || deadlineForm.saving || !deadlineForm.value}
              >
                {deadlineForm.saving ? 'Saving...' : 'Save Deadline'}
              </Button>
            </div>
            {!hasDeadlineEditAccess ? (
              <p className="text-[10px] font-medium text-muted-foreground">
                You need the "Edit Request Deadline" permission to edit this date.
              </p>
            ) : null}
            {deadlineForm.error ? (
              <p className="text-[10px] font-bold text-destructive">{deadlineForm.error}</p>
            ) : null}
          </article>

          {/* Decision Matrix */}
          <article className="surface-card p-6">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-4">Operations</h3>
             <div className="space-y-4">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Transition Status</label>
                   <Select 
                      value={request.status} 
                      onChange={e => requestStatusChange(e.target.value)}
                      disabled={!canChangeStatus || actionState.busy || statusOptions.length <= 1}
                      className="w-full"
                   >
                      {statusOptions.map(s => (
                        <option key={s} value={s}>{statusLabelMap[s]}</option>
                      ))}
                   </Select>
                </div>

                {canAssignToMe && (
                   <Button variant="outline" className="w-full" onClick={handleAssignToMe} disabled={actionState.busy}>
                      Assign to me
                   </Button>
                )}

                {canManagerAssignTl && (
                  <div className="space-y-3 pt-4 border-t border-border">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Assign Team Leader</label>
                       <Select 
                          value={assignmentForm.userId}
                          onChange={e => setAssignmentForm(curr => ({ ...curr, userId: e.target.value }))}
                       >
                          <option value="">Select individual...</option>
                          {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                       </Select>
                    </div>
                    <textarea 
                       placeholder="Assignment note..."
                       className="w-full h-20 rounded-md border-2 border-ink bg-card p-2 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                       value={assignmentForm.note}
                       onChange={e => setAssignmentForm(curr => ({ ...curr, note: e.target.value }))}
                    />
                    <Button size="sm" className="w-full" onClick={handleAssignToUser} disabled={!assignmentForm.userId || actionState.busy}>
                       Assign Team Leader
                    </Button>
                  </div>
                )}
             </div>
             {actionState.error && <p className="mt-3 text-[10px] font-bold text-destructive uppercase text-center">{actionState.error}</p>}
          </article>

          {/* Routing Metadata */}
          <article className="surface-card p-6">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-5">Routing Info</h3>
             <div className="space-y-4">
                <div className="flex gap-3">
                   <Building2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                   <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Entity Origin</p>
                      <p className="text-sm font-bold truncate">{request.company_name}</p>
                   </div>
                </div>
                <div className="flex items-center gap-3 rounded-md bg-muted/20 p-3">
                   <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Source</p>
                      <p className="text-xs font-bold truncate">{request.source_entity_name}</p>
                   </div>
                   <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                   <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Target</p>
                      <p className="text-xs font-bold truncate">{request.target_entity_name}</p>
                   </div>
                </div>
             </div>
          </article>

          {/* Stakeholders */}
          <article className="surface-card p-6 space-y-4">
             <div className="flex items-center gap-3">
                <Avatar name={request.requester_name} size={32} />
                <div>
                   <p className="text-sm font-bold truncate">{request.requester_name}</p>
                   <p className="text-[10px] font-medium text-muted-foreground uppercase">Requester</p>
                </div>
             </div>
             <div className="flex items-center gap-3">
                <Avatar name={request.assignee_name || 'Unassigned'} size={32} color={request.assignee_name ? null : "#ccc"} />
                <div>
                   <p className="text-sm font-bold truncate">{request.assignee_name || 'Not assigned'}</p>
                   <p className="text-[10px] font-medium text-muted-foreground uppercase">Current Custodian</p>
                </div>
             </div>
          </article>

          {/* Timeline & Deadlines */}
          <article className="surface-card p-6 space-y-4">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Temporal Data</h3>
             <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                   <span className="text-muted-foreground font-medium">Created</span>
                   <span className="font-bold">{formatDateOnly(request.created_at)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                   <span className="text-muted-foreground font-medium">Last Interaction</span>
                   <span className="font-bold">{formatDateOnly(request.updated_at || request.created_at)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                   <span className="text-muted-foreground font-medium">Approx. Deadline</span>
                   <span className="font-bold">{request.deadline_date ? formatDateOnly(request.deadline_date) : '-'}</span>
                </div>
                {request.completed_at && (
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-border">
                     <span className="text-emerald-600 font-bold uppercase text-[10px]">Resolved At</span>
                     <span className="font-bold text-emerald-600 font-mono tracking-tighter">{formatDateTime(request.completed_at)}</span>
                  </div>
                )}
             </div>
          </article>
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
    </main>
  )
}

export default RequestDetailsPage




