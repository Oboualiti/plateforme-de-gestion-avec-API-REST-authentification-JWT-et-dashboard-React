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
  History,
} from 'lucide-react'

import { Avatar } from '../components/Avatar'
import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
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

const statusToneMap = {
  NEW: 'bg-slate-100 text-slate-700 border-slate-200',
  ACCEPTED: 'bg-blue-100 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 border-amber-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-slate-200 text-slate-700 border-slate-300',
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

function RequestDetailsPage() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', request: null })
  const [activeTab, setActiveTab] = useState('comments')
  const [comment, setComment] = useState('')
  const [commentAttachment, setCommentAttachment] = useState(null)
  const [actionState, setActionState] = useState({ busy: false, error: '' })
  const [aiSummary, setAiSummary] = useState({ loading: false, error: '', data: null })
  const discussionRef = useRef(null)

  const request = state.request
  const comments = request?.comments || []
  const canChangeStatus = Boolean(request?.can_update_status)
  const canAssignToMe = Boolean(request?.can_assign_to_me)

  const historyItems = useMemo(() => {
    const backendHistory = request?.history || request?.status_history || []
    if (backendHistory.length) return backendHistory
    if (!request) return []
    return [{
      id: `created-${request.id}`,
      type: 'created',
      actor_name: request.requester_name,
      created_at: request.created_at,
    }]
  }, [request])

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
           // Only update if something meaningful changed to avoid flash
           const hasChange = curr.request.status !== response.data.status || 
                            (curr.request.comments || []).length !== (response.data.comments || []).length ||
                            curr.request.current_assignee !== response.data.current_assignee
           return hasChange ? { ...curr, request: response.data } : curr
         })
       } catch {}
    }, 3000)
    return () => clearInterval(intervalId)
  }, [requestId])

  async function handleAction(promise) {
    setActionState({ busy: true, error: '' })
    try {
      const response = await promise
      setState(curr => ({ ...curr, request: response.data }))
      setComment('')
      setCommentAttachment(null)
      setActionState({ busy: false, error: '' })
    } catch (error) {
      setActionState({ busy: false, error: error.response?.data?.detail || 'Action failed.' })
    }
  }

  async function submitComment(e) {
    e.preventDefault()
    if (!comment.trim() && !commentAttachment) return
    const formData = new FormData()
    formData.append('message', comment)
    if (commentAttachment) formData.append('attachment', commentAttachment)
    await handleAction(api.post(`/requests/${requestId}/comments/`, formData))
    // Scroll to bottom after post
    if (discussionRef.current) {
        discussionRef.current.scrollTop = discussionRef.current.scrollHeight
    }
  }

  async function updateStatus(status) {
    const isTerminal = terminalStatuses.has(status)
    const promptMsg = isTerminal ? 'Resolution note is required:' : 'Optional note for this change:'
    const note = window.prompt(promptMsg)?.trim()
    if (isTerminal && !note) {
      alert('Resolution note is required for terminal statuses.')
      return
    }
    await handleAction(api.post(`/requests/${requestId}/status/`, { status, note: note || '' }))
  }

  async function handleAssignToMe() {
    await handleAction(api.post(`/requests/${requestId}/assign/`, {}))
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
          <Link to="/requests"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Requests</Link>
        </Button>
      </div>
    </main>
  )

  return (
    <main className="page-content pb-12 space-y-6">
      <PageHeader
        eyebrow={request.reference_code || `#${request.request_number}`}
        title={request.title || 'Untitled Request'}
        description={request.description?.slice(0, 100) + (request.description?.length > 100 ? '...' : '')}
        meta={
            <Button variant="ghost" size="sm" asChild className="-ml-3 text-muted-foreground hover:text-foreground">
              <Link to="/requests"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Workspace</Link>
            </Button>
        }
      />

      {/* Process Stepper */}
      <section className="animate-fade-in">
        <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          <span>Operational Lifecycle</span>
          <span className="text-primary">{statusLabelMap[request.status]}</span>
        </div>
        <StatusStepper currentStatus={request.status} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content Column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Detailed Description */}
          <article className="surface-card p-8">
             <div className="mb-6 flex flex-wrap gap-3">
               <span className={badgeClass("bg-slate-100 text-slate-700")}>{request.type || 'Standard'}</span>
               <span className={badgeClass(request.priority === 'HIGH' ? "bg-red-50 text-red-600 border-red-100" : "bg-emerald-50 text-emerald-600 border-emerald-100")}>
                 {request.priority} PRIORITY
               </span>
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

          {/* Discussion & History Area */}
          <article className="surface-card overflow-hidden">
            <div className="flex border-b border-border bg-muted/5">
              <button 
                onClick={() => setActiveTab('comments')}
                className={cn("flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2", 
                  activeTab === 'comments' ? "border-primary text-foreground bg-card" : "border-transparent text-muted-foreground hover:text-foreground")}
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
                  {/* Message List */}
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
                              {item.attachment_url && (
                                <div className="mt-3 pt-3 border-t border-border/50">
                                   <a href={item.attachment_url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-primary hover:underline">
                                     📎 VIEW ATTACHMENT
                                   </a>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Comment Input */}
                  <form onSubmit={submitComment} className="mt-8 border-t border-border pt-8">
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Type your message..."
                      className="w-full min-h-[120px] rounded-lg border-2 border-ink bg-card p-4 text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder:text-muted-foreground"
                    />
                    <div className="mt-3 flex items-center justify-between">
                      <input 
                        type="file" 
                        id="file-upload" 
                        className="hidden" 
                        onChange={e => setCommentAttachment(e.target.files?.[0])}
                      />
                      <label htmlFor="file-upload" className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                        {commentAttachment ? `📎 ${commentAttachment.name}` : 'Attach File'}
                      </label>
                      <Button size="sm" type="submit" disabled={actionState.busy || (!comment.trim() && !commentAttachment)}>
                        Post Message
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="space-y-6">
                  {historyItems.map((item, i) => (
                    <div key={i} className="flex gap-4 relative">
                       {i !== historyItems.length - 1 && <div className="absolute left-4 top-8 bottom-[-24px] w-0.5 bg-border" />}
                       <div className="h-8 w-8 rounded-full border-2 border-border bg-card flex items-center justify-center shrink-0 z-10">
                          <History className="h-3.5 w-3.5 text-muted-foreground" />
                       </div>
                       <div className="pb-8">
                          <p className="text-sm font-bold text-foreground">
                            {item.actor_name || item.sender_name || 'System User'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.type === 'status_changed' ? `Transitioned status to ${item.to_status || 'Next'}` : 
                             item.type === 'comment' ? 'Added a new comment' : 
                             item.type === 'assigned' ? 'Updated the assignment' : 'Initialized the request'}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-2 font-mono uppercase">
                             {formatDateTime(item.created_at || item.timestamp)}
                          </p>
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        </div>

        {/* Sidebar Column */}
        <aside className="space-y-6">
          {/* Actions Card */}
          <div className="surface-card p-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4">Operations</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Update Status</label>
                <div className="flex gap-2">
                  <Select 
                    value={request.status} 
                    onChange={e => updateStatus(e.target.value)}
                    disabled={!canChangeStatus || actionState.busy}
                    className="flex-1"
                  >
                    {Object.keys(statusLabelMap).map(k => (
                      <option key={k} value={k}>{statusLabelMap[k]}</option>
                    ))}
                  </Select>
                </div>
              </div>
              {canAssignToMe && (
                <Button variant="outline" className="w-full" onClick={handleAssignToMe} disabled={actionState.busy}>
                  Assign to me
                </Button>
              )}
            </div>
            {actionState.error && <p className="mt-3 text-[10px] font-bold text-destructive uppercase text-center">{actionState.error}</p>}
          </div>

          {/* Metadata Card */}
          <div className="surface-card p-6 space-y-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Entity Mapping</h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <Building2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Originating Company</p>
                  <p className="text-sm font-bold text-foreground truncate">{request.company_name || 'Global'}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <ArrowRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Source Entity</p>
                  <p className="text-sm font-bold text-foreground truncate">{request.source_entity_name || '-'}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <ArrowRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Target Destination</p>
                  <p className="text-sm font-bold text-foreground truncate">{request.target_entity_name || '-'}</p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-border">
                <User2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Current Owner</p>
                  <p className="text-sm font-bold text-foreground truncate">{request.current_assignee_name || 'Unassigned'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* AI Summary Sidebar Card */}
          <div className="surface-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">AI Review</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={loadAiSummary} disabled={aiSummary.loading} className="h-7 px-2">
                {aiSummary.loading ? 'Updating...' : 'Refresh'}
              </Button>
            </div>
            {aiSummary.data ? (
              <div className="space-y-4 text-sm">
                <div className="bg-primary-soft p-3 rounded-lg border border-primary/20">
                   <p className="text-[10px] font-bold text-primary uppercase mb-1">Brief</p>
                   <p className="text-xs font-medium text-foreground leading-snug">{aiSummary.data.short_summary}</p>
                </div>
                <div>
                   <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Next Action</p>
                   <p className="text-xs font-medium text-foreground">{aiSummary.data.next_action || 'Pending follow-up'}</p>
                </div>
                <div>
                   <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Pending From</p>
                   <p className="text-xs font-bold text-primary uppercase">{aiSummary.data.pending_from || 'Unknown'}</p>
                </div>
              </div>
            ) : (
                <div className="py-8 text-center bg-muted/20 rounded-lg border border-dashed border-border">
                   <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">No AI Insight yet</p>
                   <Button variant="link" size="sm" onClick={loadAiSummary} className="mt-1 h-auto text-xs">Generate Summary</Button>
                </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}

export default RequestDetailsPage
