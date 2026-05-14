import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
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
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
import { DeadlinePlanner } from '../components/ui/deadline-planner'
import PageHeader from '../components/layout/PageHeader'
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
const prodLifecycleStatuses = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED']
const acceptedFlowStatuses = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED']
const rejectedFlowStatuses = ['NEW', 'REJECTED']
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

function getFileNameFromUrl(url) {
  if (!url) return 'Attached file'
  try {
    const cleanUrl = String(url).split('?')[0]
    const lastPart = cleanUrl.split('/').filter(Boolean).pop()
    return lastPart || 'Attached file'
  } catch {
    return 'Attached file'
  }
}

function isImageAttachment(url, fallbackName = '') {
  const value = String(url || fallbackName || '').toLowerCase()
  return (
    value.includes('.png')
    || value.includes('.jpg')
    || value.includes('.jpeg')
    || value.includes('.gif')
    || value.includes('.webp')
    || value.includes('.bmp')
    || value.includes('.svg')
    || value.includes('.avif')
  )
}

function isCreditsEvidenceComment(comment) {
  const message = String(comment?.message || '').trim().toLowerCase()
  return message.startsWith('credits evidence') || message.startsWith('credits proof')
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

function StatusStepper({ currentStatus, onSelectStatus, enabledStatuses = new Set(), disabled = false, statuses = stepperStatuses }) {
  const currentIndex = statuses.indexOf(currentStatus)
  const isTerminal = terminalStatuses.has(currentStatus) && currentStatus !== 'COMPLETED'

  return (
    <div className="flex w-full items-center gap-0 overflow-hidden rounded-lg border border-border bg-card">
      {statuses.map((status, i) => {
        const isPast = i < currentIndex
        const isCurrent = i === currentIndex
        const isFuture = i > currentIndex && !isTerminal
        const isEnabled = enabledStatuses.has(status) && !disabled

        return (
          <button
            key={status}
            type="button"
            onClick={() => {
              if (isEnabled && onSelectStatus) onSelectStatus(status)
            }}
            disabled={!isEnabled}
            className={cn(
              "flex flex-1 items-center justify-center py-3 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors relative",
              isCurrent && "bg-primary text-primary-foreground shadow-none border-x border-ink/20 z-10",
              isPast && "bg-primary/5 text-primary",
              isFuture && "text-muted-foreground bg-card",
              isTerminal && i >= currentIndex && "opacity-40 grayscale",
              isEnabled ? "cursor-pointer hover:bg-primary/10" : "cursor-not-allowed opacity-80"
            )}
          >
            {statusLabelMap[status]}
            {isPast && <CheckCircle2 className="ml-1.5 h-3 w-3" />}
          </button>
        )
      })}
    </div>
  )
}

function StatusNoteModal({
  open,
  targetStatus,
  rejectMode,
  rejectionReason,
  note,
  evidenceLinks,
  evidenceAttachments,
  deadlineDate,
  requireDeadline,
  required,
  error,
  loading,
  onChangeNote,
  onChangeRejectionReason,
  onChangeEvidenceLinkAt,
  onAddEvidenceLink,
  onRemoveEvidenceLink,
  onChangeEvidenceAttachmentAt,
  onAddEvidenceAttachment,
  onRemoveEvidenceAttachment,
  onChangeDeadlineDate,
  onCancel,
  onConfirm,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <section className="w-full max-w-lg rounded-xl border border-ink/10 bg-card shadow-xl animate-in fade-in zoom-in duration-200">
        <div className="border-b border-border px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Status update</p>
          <h3 className="mt-1 text-lg font-extrabold text-foreground">Move request to {statusLabelMap[targetStatus]}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {rejectMode ? 'Why are you sending this back?' : (required ? 'Resolution note is required for this terminal status.' : 'Add an optional note for this transition.')}
          </p>
        </div>
        <div className="space-y-3 px-6 py-5">
          {rejectMode ? (
            <>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Reason *
              </label>
              <Select
                value={rejectionReason}
                onChange={(event) => onChangeRejectionReason(event.target.value)}
              >
                <option value="">Select reason...</option>
                <option value="Missing evidence">Missing evidence</option>
                <option value="Not resolved">Not resolved</option>
                <option value="Wrong target">Wrong target</option>
                <option value="Incomplete work">Incomplete work</option>
                <option value="Other">Other</option>
              </Select>
            </>
          ) : null}
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {rejectMode ? 'Note' : (required ? 'Resolution note *' : 'Note')}
          </label>
          <textarea
            value={note}
            onChange={(event) => onChangeNote(event.target.value)}
            className="w-full min-h-[110px] rounded-lg border border-input bg-card p-3 text-sm font-medium focus:ring-1 focus:ring-ring focus:outline-none placeholder:text-muted-foreground"
            placeholder={rejectMode ? 'Add a short note for the support/dev team...' : (required ? 'Write the resolution note...' : 'Optional note...')}
          />
          {targetStatus === 'COMPLETED' ? (
            <>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Evidence links (optional)
              </label>
              <div className="space-y-2">
                {(evidenceLinks || []).map((value, index) => (
                  <div key={`evidence-link-${index}`} className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={value}
                      onChange={(event) => onChangeEvidenceLinkAt(index, event.target.value)}
                      placeholder="https://..."
                    />
                    {(evidenceLinks || []).length > 1 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 px-2 text-[10px] font-bold"
                        onClick={() => onRemoveEvidenceLink(index)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-2 text-[10px] font-bold uppercase tracking-wider"
                  onClick={onAddEvidenceLink}
                >
                  Add another link
                </Button>
              </div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Evidence files (optional)
              </label>
              <div className="space-y-2">
                {(evidenceAttachments || []).map((file, index) => (
                  <div key={`evidence-file-${index}`} className="flex items-center gap-2">
                    <Input
                      type="file"
                      onChange={(event) => onChangeEvidenceAttachmentAt(index, event.target.files?.[0] || null)}
                    />
                    {(evidenceAttachments || []).length > 1 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 px-2 text-[10px] font-bold"
                        onClick={() => onRemoveEvidenceAttachment(index)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-2 text-[10px] font-bold uppercase tracking-wider"
                  onClick={onAddEvidenceAttachment}
                >
                  Add another file
                </Button>
                {evidenceAttachments?.some(Boolean) ? (
                  <p className="text-xs text-muted-foreground">
                    Selected: {evidenceAttachments.filter(Boolean).map((item) => item.name).join(', ')}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
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
      <section className="w-full max-w-lg rounded-xl border border-ink/10 bg-card shadow-xl">
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
            className="w-full min-h-[110px] rounded-lg border border-input bg-card p-3 text-sm font-medium focus:ring-1 focus:ring-ring focus:outline-none placeholder:text-muted-foreground"
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

function ImageViewerModal({ open, imageUrl, fileName, zoom, onZoomIn, onZoomOut, onClose }) {
  if (!open || !imageUrl) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onZoomOut}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/30 bg-black/40 text-white"
          title="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/30 bg-black/40 text-white"
          title="Zoom in"
        >
          +
        </button>
        <a
          href={imageUrl}
          download
          className="inline-flex h-9 items-center justify-center rounded-md border border-white/30 bg-black/40 px-3 text-xs font-bold uppercase tracking-wider text-white"
          title="Download"
        >
          Download
        </a>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center justify-center rounded-md border border-white/30 bg-black/40 px-3 text-xs font-bold uppercase tracking-wider text-white"
          title="Close"
        >
          Close
        </button>
      </div>

      <div className="max-h-[90vh] max-w-[90vw] overflow-auto rounded-md border border-white/20 bg-black/20 p-2">
        <img
          src={imageUrl}
          alt={fileName || 'Image attachment'}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          className="max-h-[82vh] w-auto object-contain transition-transform duration-150"
        />
      </div>
    </div>
  )
}

function RequestDetailsPage() {
  const { requestId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', request: null })
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') === 'history' ? 'history' : 'comments')
  const [comment, setComment] = useState('')
  const [commentAttachment, setCommentAttachment] = useState(null)
  const [imageViewer, setImageViewer] = useState({
    open: false,
    imageUrl: '',
    fileName: '',
    zoom: 1,
  })
  const [mentionState, setMentionState] = useState({
    open: false,
    query: '',
    start: -1,
    end: -1,
    activeIndex: 0,
  })
  const [assignmentForm, setAssignmentForm] = useState({ userId: '', note: '' })
  const [actionState, setActionState] = useState({ busy: false, error: '' })
  const [assignTlDialogOpen, setAssignTlDialogOpen] = useState(false)
  const [reassignTeamDialogOpen, setReassignTeamDialogOpen] = useState(false)
  const [reassignTeamForm, setReassignTeamForm] = useState({ targetTeamId: '', note: '' })
  const [lifecycleMenuOpen, setLifecycleMenuOpen] = useState(false)
  const [editCommentId, setEditCommentId] = useState(null)
  const [editCommentText, setEditCommentText] = useState('')
  const [editCommentError, setEditCommentError] = useState('')
  const [replyToComment, setReplyToComment] = useState(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [statusDialog, setStatusDialog] = useState({
    open: false,
    targetStatus: '',
    rejectionReason: '',
    note: '',
    evidenceLinks: [''],
    evidenceAttachments: [null],
    deadlineDate: '',
    requireDeadline: false,
    required: false,
    rejectMode: false,
    error: '',
  })
  const [deadlineForm, setDeadlineForm] = useState({ value: '', saving: false, error: '' })
  const discussionRef = useRef(null)
  const commentInputRef = useRef(null)
  const commentNodeRefs = useRef({})
  const jumpHighlightTimeoutRef = useRef(null)
  const [highlightedCommentId, setHighlightedCommentId] = useState(null)

  const request = state.request
  const roleKeys = user?.role_keys || []
  const normalizedRoleKeys = useMemo(() => {
    const roles = new Set()
    const push = (value) => {
      const clean = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_')
      if (clean) roles.add(clean)
    }
    roleKeys.forEach(push)
    push(user?.role)
    push(user?.primary_role)
    ;(user?.roles || []).forEach((role) => {
      push(role?.key)
      push(role?.name)
    })
    return roles
  }, [roleKeys, user?.primary_role, user?.role, user?.roles])
  const effectivePermissionKeys = new Set(user?.effective_permission_keys || [])
  const isSuperAdmin = normalizedRoleKeys.has('super_admin')
    || normalizedRoleKeys.has('superadmin')
    || Boolean(user?.is_superuser)
    || String(user?.username || '').toLowerCase() === 'superadmin'
  const isManager = normalizedRoleKeys.has('manager')
  const isSenior = normalizedRoleKeys.has('senior')
  const isTeamLeader = normalizedRoleKeys.has('team_leader') || normalizedRoleKeys.has('teamleader')
  const isUser = normalizedRoleKeys.has('user')
  const isProdEntityUser = String(user?.entity_type || '').toUpperCase() === 'PROD'
  const isSupportOrDevEntity = ['SUPPORT', 'TDEV'].includes(String(user?.entity_type || '').toUpperCase())
  const hideProdActionPanels = isProdEntityUser && (isUser || isTeamLeader || isManager)
  const canUseAdvancedLifecycle = isSupportOrDevEntity || isSenior || isSuperAdmin
  const canViewRequestDiscussion = Boolean(
    request?.can_view_request_discussion ?? effectivePermissionKeys.has('view_request_discussion'),
  )
  const isDiscussionClosed = request?.status === 'REJECTED' || request?.status === 'CLOSED'
  const canCommentRequest = Boolean(
    canViewRequestDiscussion
    && (request?.can_comment_request ?? effectivePermissionKeys.has('comment_request'))
    && !isDiscussionClosed
  )
  const canPinMessages = Boolean(
    canViewRequestDiscussion && (request?.can_pin_request_messages ?? false),
  )
  const canChangeStatus = Boolean(request?.can_update_status)
  const allowedStatusTransitions = request?.allowed_status_transitions || []
  const lifecycleSelectableStatuses = useMemo(
    () => new Set([request?.status, ...allowedStatusTransitions].filter(Boolean)),
    [allowedStatusTransitions, request?.status],
  )
  const lifecycleDisplayStatuses = useMemo(() => {
    if (request?.status === 'REJECTED') {
      return rejectedFlowStatuses
    }
    if (isProdEntityUser && (isUser || isTeamLeader || isManager)) {
      return prodLifecycleStatuses
    }
    if (canUseAdvancedLifecycle) {
      return acceptedFlowStatuses
    }
    return stepperStatuses
  }, [canUseAdvancedLifecycle, isManager, isProdEntityUser, isTeamLeader, isUser, request?.status])
  const canSwitchAcceptedRejected = useMemo(() => {
    if (!canChangeStatus || actionState.busy) return false
    if (!request?.status) return false
    if (request.status === 'ACCEPTED') return lifecycleSelectableStatuses.has('REJECTED')
    if (request.status === 'REJECTED') return lifecycleSelectableStatuses.has('ACCEPTED')
    return false
  }, [actionState.busy, canChangeStatus, lifecycleSelectableStatuses, request?.status])
  const statusOptions = useMemo(() => {
    const options = [request?.status, ...allowedStatusTransitions].filter(Boolean)
    return [...new Set(options)]
  }, [allowedStatusTransitions, request?.status])
  const canEditDeadline = Boolean(request?.can_edit_deadline)
  const hasDeadlineEditAccess = canEditDeadline && effectivePermissionKeys.has('edit_request_deadline')
  const canAssignToMe = Boolean(request?.can_assign_to_me) && isTeamLeader && isSupportOrDevEntity
  const canAssignToMember = isTeamLeader && isSupportOrDevEntity && !request?.current_assignee && request?.can_assign_to_me
  const canReassignTargetTeam = Boolean(request?.can_reassign_target_team) && isSupportOrDevEntity
  const hasReassignmentTargets = (request?.available_reassignment_targets || []).length > 0
  const hasTargetTeamLeader = Boolean(
    request?.target_team_leader?.id || request?.target_team_leader || request?.target_team_leader_name
  )
  const reassignTeamActionLabel = hasTargetTeamLeader ? 'Reassign Team' : 'Assign to Team'
  const currentTargetTeamId = Number(
    request?.target_team_id || request?.target_team_leader?.id || request?.target_team_leader || 0
  )
  const potentialAssignees = request?.potential_assignees || []
  const assignmentActions = (canAssignToMe || canAssignToMember || canReassignTargetTeam) ? (
    <div className="flex items-center gap-2">
      {canAssignToMe ? (
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 text-[10px] uppercase tracking-wider font-extrabold border border-ink/10"
          onClick={handleAssignToMe}
          disabled={actionState.busy}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Take
        </Button>
      ) : null}
      {canAssignToMember ? (
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 text-[10px] uppercase tracking-wider font-extrabold border border-ink/10"
          onClick={() => setAssignTlDialogOpen(true)}
          disabled={actionState.busy}
        >
          <Users className="h-3.5 w-3.5 mr-1.5" />
          Assign
        </Button>
      ) : null}
      {canReassignTargetTeam ? (
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 text-[10px] uppercase tracking-wider font-extrabold border border-ink/10"
          onClick={() => setReassignTeamDialogOpen(true)}
          disabled={actionState.busy}
        >
          <Building2 className="h-3.5 w-3.5 mr-1.5" />
          {reassignTeamActionLabel}
        </Button>
      ) : null}
    </div>
  ) : null

  const comments = request?.comments || []
  const pinnedComment = useMemo(
    () => comments.find((item) => Boolean(item.is_pinned)) || null,
    [comments],
  )
  const commentsById = useMemo(() => {
    const map = new Map()
    comments.forEach((item) => {
      map.set(Number(item.id), item)
    })
    return map
  }, [comments])
  const evidenceItems = useMemo(() => {
    return comments
      .filter((item) => isCreditsEvidenceComment(item) && (item?.attachment_url || item?.message))
      .map((item) => {
        const lines = String(item?.message || '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
        const noteLine = lines.find((line) => line.toLowerCase().startsWith('note:'))
        const linkLine = lines.find((line) => line.toLowerCase().startsWith('link:'))
        const note = noteLine ? noteLine.slice(noteLine.indexOf(':') + 1).trim() : ''
        const link = linkLine ? linkLine.slice(linkLine.indexOf(':') + 1).trim() : ''
        return {
          id: item.id,
          createdAt: item.created_at,
          createdBy: item.sender_name || item.sender_username || 'Unknown',
          note,
          link,
          attachmentUrl: item.attachment_url || '',
          attachmentName: getFileNameFromUrl(item.attachment_url || ''),
        }
      })
  }, [comments])

  const downloadEvidenceAttachment = async (evidence) => {
    if (!evidence?.id || !requestId) return
    try {
      const response = await api.get(`/requests/${requestId}/comments/${evidence.id}/download/`, {
        responseType: 'blob',
      })
      const blob = response.data
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      const disposition = response.headers?.['content-disposition'] || ''
      const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i)
      const filename = decodeURIComponent((match?.[1] || match?.[2] || '').trim() || evidence.attachmentName || 'evidence-file')
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
    } catch (_error) {
      if (evidence?.attachmentUrl) window.open(evidence.attachmentUrl, '_blank', 'noopener,noreferrer')
    }
  }

  function jumpToComment(commentId) {
    const numericId = Number(commentId)
    if (!numericId) return
    const node = commentNodeRefs.current[numericId]
    if (!node) return

    const container = discussionRef.current
    if (container && container.contains(node)) {
      const containerRect = container.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      const margin = Math.min(96, Math.max(32, Math.floor(container.clientHeight * 0.18)))
      const isFullyVisible = nodeRect.top >= (containerRect.top + margin)
        && nodeRect.bottom <= (containerRect.bottom - margin)

      if (!isFullyVisible) {
        const offsetWithinContainer = nodeRect.top - containerRect.top
        const preferredTop = container.scrollTop + offsetWithinContainer - margin
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
        const targetTop = Math.max(0, Math.min(preferredTop, maxScrollTop))

        // Gentle 2-step easing instead of a rigid hard-center jump.
        const firstStepTop = container.scrollTop + (targetTop - container.scrollTop) * 0.65
        container.scrollTo({ top: firstStepTop, behavior: 'smooth' })
        window.setTimeout(() => {
          container.scrollTo({ top: targetTop, behavior: 'smooth' })
        }, 90)
      }
    } else {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    if (jumpHighlightTimeoutRef.current) {
      window.clearTimeout(jumpHighlightTimeoutRef.current)
    }
    setHighlightedCommentId(numericId)
    jumpHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedCommentId((current) => (current === numericId ? null : current))
      jumpHighlightTimeoutRef.current = null
    }, 1800)
  }
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
    return () => {
      if (jumpHighlightTimeoutRef.current) {
        window.clearTimeout(jumpHighlightTimeoutRef.current)
      }
    }
  }, [])

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
      return { ok: true, data: response.data }
    } catch (error) {
      const detail = error.response?.data?.detail
      const noteError = error.response?.data?.note?.[0]
      const evidenceLinkError = error.response?.data?.evidence_link?.[0]
      const evidenceAttachmentError = error.response?.data?.evidence_attachment?.[0]
      setActionState({ 
        busy: false, 
        error: detail || noteError || evidenceLinkError || evidenceAttachmentError || 'Action failed.' 
      })
      return { ok: false, error }
    }
  }


  async function submitComment(e) {
    e.preventDefault()
    if (!canCommentRequest) return
    if (!comment.trim() && !commentAttachment) return
    const formData = new FormData()
    formData.append('message', comment)
    if (replyToComment?.id) {
      formData.append('reply_to_comment_id', String(replyToComment.id))
    }
    if (commentAttachment) formData.append('attachment', commentAttachment)
    await handleAction(api.post(`/requests/${requestId}/comments/`, formData))
    setReplyToComment(null)
  }

  async function toggleCommentPin(commentItem, shouldPin) {
    await handleAction(
      api.post(`/requests/${requestId}/comments/${commentItem.id}/pin/`, {
        pinned: shouldPin,
      }),
    )
  }

  function startEditComment(commentItem) {
    setEditCommentId(commentItem.id)
    setEditCommentText(commentItem.message || '')
    setEditCommentError('')
  }

  function cancelEditComment() {
    setEditCommentId(null)
    setEditCommentText('')
    setEditCommentError('')
  }

  async function saveEditedComment(commentId) {
    const trimmed = (editCommentText || '').trim()
    if (!trimmed) {
      setEditCommentError('Message cannot be empty.')
      return
    }
    setActionState({ busy: true, error: '' })
    try {
      const response = await api.patch(`/requests/${requestId}/comments/${commentId}/`, {
        message: trimmed,
      })
      setState((current) => ({ ...current, request: response.data }))
      cancelEditComment()
      setActionState({ busy: false, error: '' })
    } catch (error) {
      setEditCommentError(error.response?.data?.detail || 'Could not update comment.')
      setActionState({ busy: false, error: '' })
    }
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

  function handleCommentPaste(event) {
    const clipboardItems = event.clipboardData?.items || []
    if (!clipboardItems.length) return

    for (const item of clipboardItems) {
      if (item.kind === 'file' && item.type?.startsWith('image/')) {
        const pastedFile = item.getAsFile()
        if (!pastedFile) continue
        setCommentAttachment(pastedFile)
        event.preventDefault()
        return
      }
    }
  }

  function requestStatusChange(status) {
    if (!status || status === request?.status) return
    setLifecycleMenuOpen(false)
    const required = terminalStatuses.has(status)
    const rejectMode = request?.status === 'COMPLETED' && status === 'IN_PROGRESS'
    const requireDeadline = status === 'ACCEPTED' && hasDeadlineEditAccess
    setStatusDialog({
      open: true,
      targetStatus: status,
      rejectionReason: '',
      note: '',
      evidenceLinks: [''],
      evidenceAttachments: [null],
      deadlineDate: request?.deadline_date || '',
      requireDeadline,
      required: rejectMode ? false : required,
      rejectMode,
      error: '',
    })
  }

  function closeStatusDialog() {
    if (actionState.busy) return
    setStatusDialog({
      open: false,
      targetStatus: '',
      rejectionReason: '',
      note: '',
      evidenceLinks: [''],
      evidenceAttachments: [null],
      deadlineDate: '',
      requireDeadline: false,
      required: false,
      rejectMode: false,
      error: '',
    })
  }

  async function confirmStatusChange() {
    const note = statusDialog.note.trim()
    if (statusDialog.rejectMode && !statusDialog.rejectionReason) {
      setStatusDialog((current) => ({
        ...current,
        error: 'Reason is required.',
      }))
      return
    }
    if (statusDialog.rejectMode && statusDialog.rejectionReason === 'Other' && !note) {
      setStatusDialog((current) => ({
        ...current,
        error: 'Add a short note when using Other.',
      }))
      return
    }
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
    const parsedEvidenceLinks = (statusDialog.evidenceLinks || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
    const parsedEvidenceAttachments = (statusDialog.evidenceAttachments || []).filter(Boolean)
    const hasEvidence = parsedEvidenceAttachments.length > 0 || parsedEvidenceLinks.length > 0
    const useFormData = statusDialog.targetStatus === 'COMPLETED' && hasEvidence
    if (useFormData) {
      const payload = new FormData()
      payload.append('status', statusDialog.targetStatus)
      payload.append('note', note)
      if (statusDialog.deadlineDate) payload.append('deadline_date', statusDialog.deadlineDate)
      parsedEvidenceLinks.forEach((link) => {
        payload.append('evidence_links', link)
        payload.append('evidence_links[]', link)
      })
      if (parsedEvidenceLinks.length > 0) payload.append('evidence_link', parsedEvidenceLinks[0])
      parsedEvidenceAttachments.forEach((file) => payload.append('evidence_attachments', file))
      if (parsedEvidenceAttachments.length > 0) payload.append('evidence_attachment', parsedEvidenceAttachments[0])
      const result = await handleAction(api.post(`/requests/${requestId}/status/`, payload))
      if (!result?.ok) {
        const apiError =
          result?.error?.response?.data?.detail
          || result?.error?.response?.data?.note?.[0]
          || result?.error?.response?.data?.evidence_link?.[0]
          || result?.error?.response?.data?.evidence_attachment?.[0]
          || 'Could not update status.'
        setStatusDialog((current) => ({ ...current, error: apiError }))
        return
      }
    } else {
      const payload = { status: statusDialog.targetStatus, note }
      if (statusDialog.rejectMode) {
        payload.rejection_reason = statusDialog.rejectionReason
        payload.rejection_note = note
      }
      if (statusDialog.deadlineDate) payload.deadline_date = statusDialog.deadlineDate
      const result = await handleAction(api.post(`/requests/${requestId}/status/`, payload))
      if (!result?.ok) {
        const apiError =
          result?.error?.response?.data?.detail
          || result?.error?.response?.data?.note?.[0]
          || 'Could not update status.'
        setStatusDialog((current) => ({ ...current, error: apiError }))
        return
      }
    }
    setStatusDialog({
      open: false,
      targetStatus: '',
      rejectionReason: '',
      note: '',
      evidenceLinks: [''],
      evidenceAttachments: [null],
      deadlineDate: '',
      requireDeadline: false,
      required: false,
      rejectMode: false,
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
    setAssignTlDialogOpen(false)
  }

  async function handleReassignTargetTeam() {
    if (!reassignTeamForm.targetTeamId) return
    await handleAction(api.post(`/requests/${requestId}/reassign/`, {
      target_team: reassignTeamForm.targetTeamId,
      note: reassignTeamForm.note || 'Assigned to team'
    }))
    setReassignTeamDialogOpen(false)
    setReassignTeamForm({ targetTeamId: '', note: '' })
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
      <PageHeader
        eyebrow="Workspace"
        title="Request Details"
        description="Review request information, status, discussion, and assignment activity."
        actions={assignmentActions}
      />
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
      <PageHeader
        eyebrow="Workspace"
        title="Request Details"
        description="Review request information, status, discussion, and assignment activity."
        actions={assignmentActions}
      />
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
      <PageHeader
        eyebrow="Workspace"
        title="Request Details"
        description="Review request information, status, discussion, and assignment activity."
        actions={assignmentActions}
      />
      {/* Top bar: back link */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Requests
      </button>

      {/* Header row */}
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Request</span>
            <span className="text-muted-foreground/60">•</span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] tracking-tight text-foreground border border-ink/10 shadow-sm">
              {request.reference_code || `#${request.request_number}`}
            </span>
            <button className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Copy reference" onClick={() => navigator.clipboard.writeText(request.reference_code || request.request_number)}>
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">{request.title || 'Untitled Request'}</h1>
          <div className="flex flex-wrap items-center gap-2 pt-1 mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-card px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-foreground shadow-sm">
              <FileText className="h-3 w-3 text-muted-foreground" />
              Type: {request.type || 'Standard'}
            </span>
            {request.priority && (
               <span className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-card px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-foreground shadow-sm">
                 <span className={cn("h-1.5 w-1.5 rounded-full", request.priority === 'High' ? "bg-destructive" : request.priority === 'Medium' ? "bg-warning" : "bg-info")} />
                 Priority: {request.priority}
               </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-card px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground shadow-sm">
              <Calendar className="h-3 w-3" />
              Opened {formatRelative(request.created_at)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0 w-56">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary border border-ink/10 shadow-none px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-primary-foreground">
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

      {request.was_rejected ? (
        <section className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
          <div className="text-sm font-extrabold text-foreground">Sent back by {request.rejected_by_name || 'Requester reviewer'}</div>
          <div className="mt-1 text-sm text-muted-foreground">Reason: {request.rejection_reason || 'No reason provided'}</div>
          {request.rejection_note ? <div className="mt-1 text-sm text-muted-foreground">Note: {request.rejection_note}</div> : null}
          {request.rejected_at ? <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Date: {formatDateTime(request.rejected_at)}</div> : null}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column */}
        <div className={cn('space-y-6', hideProdActionPanels ? 'lg:col-span-12' : 'lg:col-span-8')}>
          {/* Lifecycle */}
          <article className="surface-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground pl-1">Request Lifecycle</p>
              {canUseAdvancedLifecycle && canSwitchAcceptedRejected ? (
                <div className="relative">
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-ink/10 bg-card text-muted-foreground hover:text-foreground"
                    onClick={() => setLifecycleMenuOpen((current) => !current)}
                    aria-label="More lifecycle actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {lifecycleMenuOpen ? (
                    <div className="absolute right-0 top-9 z-20 min-w-[150px] rounded-md border border-ink/10 bg-card p-1 shadow-lg">
                      {request.status === 'ACCEPTED' ? (
                        <button
                          type="button"
                          className="w-full rounded px-2 py-1.5 text-left text-xs font-semibold hover:bg-muted/60"
                          onClick={() => requestStatusChange('REJECTED')}
                        >
                          Change to Rejected
                        </button>
                      ) : null}
                      {request.status === 'REJECTED' ? (
                        <button
                          type="button"
                          className="w-full rounded px-2 py-1.5 text-left text-xs font-semibold hover:bg-muted/60"
                          onClick={() => requestStatusChange('ACCEPTED')}
                        >
                          Change to Accepted
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {canUseAdvancedLifecycle && request.status === 'NEW' ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-10 items-center justify-center rounded-md border text-xs font-extrabold uppercase tracking-wider",
                    lifecycleSelectableStatuses.has('ACCEPTED') && canChangeStatus && !actionState.busy
                      ? "border-ink/10 bg-card hover:bg-primary/10"
                      : "border-ink/10 bg-card opacity-60 cursor-not-allowed",
                  )}
                  disabled={!lifecycleSelectableStatuses.has('ACCEPTED') || !canChangeStatus || actionState.busy}
                  onClick={() => requestStatusChange('ACCEPTED')}
                >
                  Accepted
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-10 items-center justify-center rounded-md border text-xs font-extrabold uppercase tracking-wider",
                    lifecycleSelectableStatuses.has('REJECTED') && canChangeStatus && !actionState.busy
                      ? "border-ink/10 bg-card hover:bg-primary/10"
                      : "border-ink/10 bg-card opacity-60 cursor-not-allowed",
                  )}
                  disabled={!lifecycleSelectableStatuses.has('REJECTED') || !canChangeStatus || actionState.busy}
                  onClick={() => requestStatusChange('REJECTED')}
                >
                  Rejected
                </button>
              </div>
            ) : (
              <StatusStepper
                currentStatus={request.status}
                onSelectStatus={requestStatusChange}
                enabledStatuses={lifecycleSelectableStatuses}
                disabled={!canChangeStatus || actionState.busy}
                statuses={lifecycleDisplayStatuses}
              />
            )}
          </article>

          {/* Request Context */}
          <article className="surface-card p-5">
            <div className="mb-3 flex items-center gap-2 text-muted-foreground pl-1">
              <FileText className="h-4 w-4" />
              <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-foreground">Request Context</h3>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90 font-medium pl-1">{request.description}</p>
            {request.attachment_url && (
              <a href={request.attachment_url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-md border border-ink/10 bg-muted/30 px-4 py-2 text-[11px] uppercase tracking-wider font-extrabold hover:bg-muted shadow-brutal transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ml-1">
                <Paperclip className="h-3.5 w-3.5" /> View original attachment
              </a>
            )}
          </article>

          <article className="surface-card p-5">
            <div className="mb-3 flex items-center gap-2 text-muted-foreground pl-1">
              <Paperclip className="h-4 w-4" />
              <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-foreground">
                Evidence{evidenceItems.length ? ` (${evidenceItems.length})` : ''}
              </h3>
            </div>
            {evidenceItems.length === 0 ? (
              <p className="pl-1 text-sm font-medium text-muted-foreground">No evidence attached yet.</p>
            ) : (
              <div className="space-y-3">
                {evidenceItems.map((evidence) => (
                  <div key={evidence.id} className="rounded-md border border-ink/10 bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-foreground">
                        Added by {evidence.createdBy} on {formatDateTime(evidence.createdAt)}
                      </p>
                    </div>
                    {evidence.note ? (
                      <p className="mt-2 text-sm text-foreground/90">{evidence.note}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {evidence.link ? (
                        <a
                          href={evidence.link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-card px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-primary hover:bg-muted/40"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open link
                        </a>
                      ) : null}
                      {evidence.attachmentUrl ? (
                        <>
                          <a
                            href={evidence.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-card px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider hover:bg-muted/40"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            {evidence.attachmentName}
                          </a>
                          <button
                            type="button"
                            onClick={() => downloadEvidenceAttachment(evidence)}
                            className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-card px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider hover:bg-muted/40"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                            Download
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          {/* Discussion / History Tab Box */}
          <article className="surface-card overflow-hidden flex flex-col">
            <div className="flex border-b-2 border-ink bg-card font-extrabold text-xs">
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
                      {pinnedComment ? (
                        <button
                          type="button"
                          onClick={() => jumpToComment(pinnedComment.id)}
                          className="sticky top-0 z-20 w-full rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-left"
                        >
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-primary">
                            Pinned message {pinnedComment.pinned_by_name ? `by ${pinnedComment.pinned_by_name}` : ''}
                          </p>
                          <p className="mt-1 truncate text-sm font-medium text-foreground">
                            {pinnedComment.message || (pinnedComment.attachment_url ? 'Attachment' : 'Pinned message')}
                          </p>
                        </button>
                      ) : null}
                      <div ref={discussionRef} className="max-h-[420px] overflow-y-auto space-y-5 pr-2 custom-scrollbar">
                        {comments.length === 0 ? (
                           <div className="py-12 text-center text-muted-foreground">
                             <MessageSquarePlus className="mx-auto h-8 w-8 mb-3 opacity-20" />
                             <p className="text-[10px] font-bold uppercase tracking-widest">No messages yet</p>
                           </div>
                        ) : (
                          comments.map(c => (
                            <div
                              key={c.id}
                              ref={(node) => {
                                if (node) commentNodeRefs.current[c.id] = node
                              }}
                              id={`comment-${c.id}`}
                              className={cn(
                                'flex gap-4 rounded-md transition-all',
                                highlightedCommentId === c.id ? 'bg-primary/15 ring-2 ring-primary/50' : '',
                              )}
                            >
                              <Avatar name={c.sender_name} size={32} photoUrl={c.sender_avatar_url} identifiers={[c.sender_username, c.sender_name]} />
                              <div className="flex-1 min-w-0">
                                 <div className="flex items-baseline justify-between gap-4 mb-1">
                                   <div className="flex items-baseline gap-2 min-w-0">
                                      <span className="text-sm font-extrabold text-foreground truncate">{c.sender_name}</span>
                                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                        {c.sender_entity_name ? `${c.sender_entity_name} • ` : ''}{c.sender_role_keys?.join(', ')}
                                      </span>
                                   </div>
                                   <div className="flex items-center gap-2 shrink-0">
                                     <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{formatRelative(c.created_at)}</span>
                                     {c.is_edited ? (
                                       <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                                         edited
                                       </span>
                                     ) : null}
                                     {canCommentRequest ? (
                                       <button
                                         type="button"
                                         className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
                                         onClick={() => setReplyToComment(c)}
                                       >
                                         Reply
                                       </button>
                                     ) : null}
                                     {canPinMessages ? (
                                       <button
                                         type="button"
                                         className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
                                         disabled={actionState.busy}
                                         onClick={() => toggleCommentPin(c, !Boolean(c.is_pinned))}
                                       >
                                         {c.is_pinned ? 'Unpin' : 'Pin'}
                                       </button>
                                     ) : null}
                                     {canCommentRequest && Number(c.sender) === Number(user?.id) ? (
                                       <button
                                         type="button"
                                         className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
                                         onClick={() => startEditComment(c)}
                                       >
                                         Edit
                                       </button>
                                     ) : null}
                                   </div>
                                </div>
                                <div className="rounded-lg rounded-tl-none border border-ink/10 bg-card p-4 text-sm font-medium text-foreground/95 whitespace-pre-line shadow-sm">
                                  {c.is_pinned ? (
                                    <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-primary">
                                      Pinned {c.pinned_by_name ? `by ${c.pinned_by_name}` : ''}
                                    </p>
                                  ) : null}
                                  {c.reply_to_comment_id ? (
                                    <button
                                      type="button"
                                      className="mb-2 block w-full rounded-md border border-ink/10 bg-muted/30 px-3 py-2 text-left text-xs hover:bg-primary/10"
                                      onClick={() => jumpToComment(c.reply_to_comment_id)}
                                    >
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                        Replying to #{c.reply_to_comment_id}
                                      </p>
                                      <p className="mt-1 truncate font-medium text-foreground">
                                        {(() => {
                                          const repliedComment = commentsById.get(Number(c.reply_to_comment_id))
                                          if (!repliedComment) return 'Original message'
                                          if (repliedComment.message) return repliedComment.message
                                          return repliedComment.attachment_url ? 'Attachment' : 'Original message'
                                        })()}
                                      </p>
                                    </button>
                                  ) : null}
                                  {editCommentId === c.id ? (
                                    <div className="space-y-2">
                                      <textarea
                                        value={editCommentText}
                                        onChange={(event) => setEditCommentText(event.target.value)}
                                        className="w-full min-h-[88px] rounded-md border border-ink/10 bg-background p-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                                      />
                                      {editCommentError ? (
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-destructive">{editCommentError}</p>
                                      ) : null}
                                      <div className="flex items-center gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          className="h-7 px-3 text-[10px] font-extrabold uppercase tracking-wider"
                                          disabled={actionState.busy}
                                          onClick={() => saveEditedComment(c.id)}
                                        >
                                          Save
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-3 text-[10px] font-extrabold uppercase tracking-wider"
                                          disabled={actionState.busy}
                                          onClick={cancelEditComment}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>{c.message || ''}</>
                                  )}
                                  {c.attachment_url ? (
                                    <div className="mt-3 space-y-2">
                                      {isImageAttachment(c.attachment_url, c.attachment) ? (
                                        <button
                                          type="button"
                                          onClick={() => setImageViewer({
                                            open: true,
                                            imageUrl: c.attachment_url,
                                            fileName: getFileNameFromUrl(c.attachment_url),
                                            zoom: 1,
                                          })}
                                          className="block"
                                        >
                                          <img
                                            src={c.attachment_url}
                                            alt={getFileNameFromUrl(c.attachment_url)}
                                            className="max-h-64 w-auto rounded-md border border-ink/10 object-contain"
                                          />
                                        </button>
                                      ) : null}
                                      <div className="flex flex-wrap items-center gap-2">
                                        <a
                                          href={c.attachment_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-muted/30 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-primary hover:bg-muted"
                                        >
                                          <Paperclip className="h-3.5 w-3.5" />
                                          {getFileNameFromUrl(c.attachment_url)}
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                        <a
                                          href={c.attachment_url}
                                          download
                                          className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-card px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider hover:bg-muted/40"
                                        >
                                          <ArrowDown className="h-3.5 w-3.5" />
                                          Download
                                        </a>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {canCommentRequest ? (
                        <form onSubmit={submitComment} className="mt-4 rounded-xl border border-ink/10 shadow-brutal bg-background overflow-visible relative z-20">
                          {replyToComment ? (
                            <div className="border-b border-ink/10 bg-muted/30 px-4 py-2 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate">
                                  Replying to <span className="font-extrabold">{replyToComment.sender_name}</span>: {replyToComment.message || 'Attachment'}
                                </p>
                                <button
                                  type="button"
                                  className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
                                  onClick={() => setReplyToComment(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <div className="relative flex items-start gap-2 p-1">
                             <textarea
                              ref={commentInputRef}
                              value={comment}
                              onChange={e => handleCommentInputChange(e.target.value)}
                              onKeyDown={handleCommentInputKeyDown}
                              onPaste={handleCommentPaste}
                              placeholder="Type your message..."
                              className="flex-1 bg-transparent p-3 text-sm font-medium outline-none placeholder:text-muted-foreground resize-none min-h-[60px]"
                             />
                             {mentionState.open && filteredMentions.length > 0 ? (
                               <div className="absolute bottom-[calc(100%+6px)] left-3 z-40 max-h-56 w-96 max-w-[calc(100%-7.5rem)] overflow-y-auto rounded-md border border-ink/10 bg-card p-1 shadow-elev-lg">
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
                                 className="h-8 px-4 text-[10px] font-extrabold uppercase tracking-wider border border-ink/10 shadow-sm"
                               >
                                 <Send className="h-3 w-3 mr-1.5" /> Send
                               </Button>
                             </div>
                          </div>
                          <div className="border-t-2 border-ink bg-card px-4 py-2 flex items-center justify-between">
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
                           {isDiscussionClosed
                             ? `Discussion is closed because request is ${statusLabelMap[request?.status] || request?.status}.`
                             : 'You do not have permission to comment in this discussion.'}
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
                        <span className="absolute -left-[33px] mt-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary border border-ink/10" />
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
                          className="h-8 px-3 text-[10px] uppercase border border-ink/10 shadow-brutal active:translate-y-0.5 active:translate-x-0.5"
                         >
                           Previous
                         </Button>
                         <Button
                          variant="outline"
                          size="sm"
                          disabled={historyPage === totalHistoryPages}
                          onClick={() => setHistoryPage(p => p + 1)}
                          className="h-8 px-3 text-[10px] uppercase border border-ink/10 shadow-brutal active:translate-y-0.5 active:translate-x-0.5"
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
        <aside className={cn('space-y-6', hideProdActionPanels ? 'lg:col-span-12' : 'lg:col-span-4')}>
          <div className={cn('space-y-6', hideProdActionPanels ? '' : 'lg:sticky lg:top-6')}>
            {!hideProdActionPanels ? (
              <article className="surface-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-[11px] font-extrabold uppercase tracking-widest">Deadline Planner</h3>
                </div>
                <p className="mb-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Approximate completion date</p>
                <div className="rounded-xl border border-ink/10 bg-card p-2 shadow-sm mb-4">
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
                  className="w-full text-[11px] uppercase tracking-wider font-extrabold border border-ink/10 shadow-brutal active:translate-y-[2px] active:translate-x-[2px] active:shadow-none"
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
            ) : null}

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
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-ink/10 bg-card p-4 shadow-sm">
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
                      {request.target_team_leader_name || 'Unassigned'} • Team Owner
                    </p>
                    <p className="truncate text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-wide">
                      {request.assignee_name || 'Not assigned'} • Assignee
                    </p>
                  </div>
                </div>
              </div>
            </article>

          </div>
        </aside>
      </div>

      <StatusNoteModal
        open={statusDialog.open}
        targetStatus={statusDialog.targetStatus}
        rejectMode={statusDialog.rejectMode}
        rejectionReason={statusDialog.rejectionReason}
        note={statusDialog.note}
        evidenceLinks={statusDialog.evidenceLinks}
        evidenceAttachments={statusDialog.evidenceAttachments}
        deadlineDate={statusDialog.deadlineDate}
        requireDeadline={statusDialog.requireDeadline}
        required={statusDialog.required}
        error={statusDialog.error}
        loading={actionState.busy}
        onChangeRejectionReason={(value) =>
          setStatusDialog((current) => ({ ...current, rejectionReason: value, error: '' }))
        }
        onChangeNote={(value) =>
          setStatusDialog((current) => ({ ...current, note: value, error: '' }))
        }
        onChangeEvidenceLinkAt={(index, value) =>
          setStatusDialog((current) => ({
            ...current,
            evidenceLinks: current.evidenceLinks.map((item, i) => (i === index ? value : item)),
            error: '',
          }))
        }
        onAddEvidenceLink={() =>
          setStatusDialog((current) => ({
            ...current,
            evidenceLinks: [...(current.evidenceLinks || ['']), ''],
            error: '',
          }))
        }
        onRemoveEvidenceLink={(index) =>
          setStatusDialog((current) => ({
            ...current,
            evidenceLinks: current.evidenceLinks.filter((_, i) => i !== index),
            error: '',
          }))
        }
        onChangeEvidenceAttachmentAt={(index, value) =>
          setStatusDialog((current) => ({
            ...current,
            evidenceAttachments: current.evidenceAttachments.map((item, i) => (i === index ? value : item)),
            error: '',
          }))
        }
        onAddEvidenceAttachment={() =>
          setStatusDialog((current) => ({
            ...current,
            evidenceAttachments: [...(current.evidenceAttachments || [null]), null],
            error: '',
          }))
        }
        onRemoveEvidenceAttachment={(index) =>
          setStatusDialog((current) => ({
            ...current,
            evidenceAttachments: current.evidenceAttachments.filter((_, i) => i !== index),
            error: '',
          }))
        }
        onChangeDeadlineDate={(value) =>
          setStatusDialog((current) => ({ ...current, deadlineDate: value, error: '' }))
        }
        onCancel={closeStatusDialog}
        onConfirm={confirmStatusChange}
      />
      <ImageViewerModal
        open={imageViewer.open}
        imageUrl={imageViewer.imageUrl}
        fileName={imageViewer.fileName}
        zoom={imageViewer.zoom}
        onZoomIn={() =>
          setImageViewer((current) => ({ ...current, zoom: Math.min(4, Number((current.zoom + 0.2).toFixed(2))) }))
        }
        onZoomOut={() =>
          setImageViewer((current) => ({ ...current, zoom: Math.max(0.4, Number((current.zoom - 0.2).toFixed(2))) }))
        }
        onClose={() => setImageViewer({ open: false, imageUrl: '', fileName: '', zoom: 1 })}
      />
      {assignTlDialogOpen ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 p-4">
          <section className="w-full max-w-md rounded-xl border border-ink/10 bg-card shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Team Assignment
              </p>
              <h3 className="mt-1 text-base font-extrabold text-foreground">
                Assign Request To Team Member
              </h3>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  Team Member
                </label>
                <Select
                  value={assignmentForm.userId}
                  onChange={(e) => setAssignmentForm((curr) => ({ ...curr, userId: e.target.value }))}
                  className="w-full font-bold border border-ink/10 shadow-sm bg-card"
                >
                  <option value="">Select team member...</option>
                  {potentialAssignees.map((u) => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </Select>
                {potentialAssignees.length === 0 ? (
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    No team members available to assign.
                  </p>
                ) : null}
              </div>
              <textarea
                placeholder="Assignment note..."
                className="w-full h-20 rounded-md border border-ink/10 bg-card p-3 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                value={assignmentForm.note}
                onChange={(e) => setAssignmentForm((curr) => ({ ...curr, note: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setAssignTlDialogOpen(false); setAssignmentForm({ userId: '', note: '' }); }}
                disabled={actionState.busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAssignToUser}
                disabled={!assignmentForm.userId || actionState.busy}
              >
                Save
              </Button>
            </div>
          </section>
        </div>
      ) : null}
      {reassignTeamDialogOpen ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 p-4">
          <section className="w-full max-w-md rounded-xl border border-ink/10 bg-card shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Team Reassignment
              </p>
              <h3 className="mt-1 text-base font-extrabold text-foreground">
                {hasTargetTeamLeader ? 'Reassign Request To Team' : 'Assign Request To Team'}
              </h3>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  Target Team
                </label>
                <Select
                  value={reassignTeamForm.targetTeamId}
                  onChange={(e) => setReassignTeamForm((curr) => ({ ...curr, targetTeamId: e.target.value }))}
                  className="w-full font-bold border border-ink/10 shadow-sm bg-card"
                >
                  <option value="">Select team...</option>
                  {(request?.available_reassignment_targets || []).map((team) => (
                    <option key={team.id} value={team.id} disabled={Number(team.id) === currentTargetTeamId}>
                      {team.label || `${team.name || team.team_leader_name}'s Team - ${team.entity_name || 'Unknown Entity'}`}
                    </option>
                  ))}
                </Select>
                {!hasReassignmentTargets ? (
                  <p className="text-xs text-muted-foreground">
                    No assignable team leaders found for this company/entity.
                  </p>
                ) : null}
              </div>
              <textarea
                placeholder="Assignment note..."
                className="w-full h-20 rounded-md border border-ink/10 bg-card p-3 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                value={reassignTeamForm.note}
                onChange={(e) => setReassignTeamForm((curr) => ({ ...curr, note: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setReassignTeamDialogOpen(false); setReassignTeamForm({ targetTeamId: '', note: '' }); }}
                disabled={actionState.busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleReassignTargetTeam}
                disabled={!reassignTeamForm.targetTeamId || !hasReassignmentTargets || actionState.busy}
              >
                {hasTargetTeamLeader ? 'Reassign' : 'Assign'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default RequestDetailsPage
