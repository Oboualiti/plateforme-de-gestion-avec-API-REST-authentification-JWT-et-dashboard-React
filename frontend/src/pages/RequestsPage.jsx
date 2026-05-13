import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, PlusCircle, Search, XCircle } from 'lucide-react'

import { Avatar } from '../components/Avatar'
import SolveDetailsModal from '../components/credits/SolveDetailsModal'
import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const PAGE_SIZE = 8
const REQUESTS_FILTERS_STORAGE_KEY_PREFIX = 'requests_page_filters_v1'

const statusLabelMap = {
  NEW: 'New',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
}

const statusToneMap = {
  NEW: 'bg-primary/10 text-primary border-primary/20 dark:bg-primary/10 dark:text-primary dark:border-primary/20',
  ACCEPTED: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:text-indigo-400',
  IN_PROGRESS: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-500',
  REJECTED: 'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-500',
  COMPLETED: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-500',
  CLOSED: 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400',
}

const priorityToneMap = {
  HIGH: 'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-500',
  MEDIUM: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-500',
  LOW: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-500',
}

function statusPillClass(status) {
  return `inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusToneMap[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`
}

function priorityPillClass(priority) {
  return `inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${priorityToneMap[priority] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`
}

function getStatusLabel(status, isPendingScope) {
  if (isPendingScope && status === 'NEW') return 'Pending'
  return statusLabelMap[status] || status || '-'
}

function typePillClass(type) {
  let baseClass = 'bg-primary/10 text-primary border-primary/20'
  if (type === 'SCRIPT') baseClass = 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:text-indigo-400'
  if (type === 'TOOL') baseClass = 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20 dark:text-cyan-400'
  if (type === 'APP_PROJECT') baseClass = 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-400'
  return `inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${baseClass}`
}

function extractEvidenceFromComments(comments = []) {
  return comments
    .filter((item) => {
      const message = String(item?.message || '').trim().toLowerCase()
      return message.startsWith('credits evidence') || message.startsWith('credits proof')
    })
    .map((item) => {
      const attachmentUrl = item?.attachment_url || ''
      const message = String(item?.message || '')
      const linkMatch = message.match(/https?:\/\/[^\s]+/i)
      const linkUrl = linkMatch ? linkMatch[0] : ''
      if (attachmentUrl) {
        return {
          id: item.id,
          type: 'file',
          name: item.attachment_name || 'Evidence file',
          url: attachmentUrl,
          createdAt: item.created_at || null,
        }
      }
      if (linkUrl) {
        return {
          id: item.id,
          type: 'link',
          name: linkUrl,
          url: linkUrl,
          createdAt: item.created_at || null,
        }
      }
      return null
    })
    .filter(Boolean)
}

function isSentBackRequest(item) {
  if (!item) return false
  return Boolean(
    item.was_rejected
    || item.rejection_reason
    || item.rejected_by_name
    || item.rejected_at,
  )
}

function formatUpdated(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function loadSavedRequestFilters(scopeKey) {
  try {
    const raw = window.sessionStorage.getItem(`${REQUESTS_FILTERS_STORAGE_KEY_PREFIX}:${scopeKey}`)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function RequestsPage({ forcedScope = '' }) {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const [searchParams] = useSearchParams()
  const scope = forcedScope || searchParams.get('scope') || 'all'
  const resolvedScope = scope
  const savedFilters = loadSavedRequestFilters(resolvedScope)
  const initialSearch = searchParams.get('search') || ''
  const initialAssignee = searchParams.get('assignee') || ''
  const initialStatus = searchParams.get('status') || ''

  const [state, setState] = useState({ loading: true, error: '', requests: [] })
  const [filters, setFilters] = useState({
    search: initialSearch || savedFilters?.search || '',
    company_id: savedFilters?.company_id || '',
    source_entity_id: savedFilters?.source_entity_id || '',
    target_entity_id: savedFilters?.target_entity_id || '',
    status: initialStatus || savedFilters?.status || '',
    assignee: initialAssignee || savedFilters?.assignee || '',
  })
  const [options, setOptions] = useState({
    companies: [],
    sourceEntities: [],
    targetEntities: [],
  })
  const [pagination, setPagination] = useState({
    page: Number(savedFilters?.page) > 0 ? Number(savedFilters.page) : 1,
    pageSize: PAGE_SIZE,
    count: 0,
    next: null,
    previous: null,
  })
  const [selectedPendingIds, setSelectedPendingIds] = useState([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({
    active: false,
    label: '',
    done: 0,
    total: 0,
  })
  const [waitingActionLoadingId, setWaitingActionLoadingId] = useState(null)
  const [rejectDialog, setRejectDialog] = useState({
    open: false,
    mode: 'single',
    requestIds: [],
    reason: '',
  })

  const location = useLocation()
  const [rejectedInfo, setRejectedInfo] = useState({ open: false, payload: null })
  const [pendingPreview, setPendingPreview] = useState({
    open: false,
    loading: false,
    error: '',
    data: null,
  })

  const roleKeys = useMemo(() => user?.role_keys || [], [user?.role_keys])
  const effectivePermissionKeys = useMemo(
    () => new Set(user?.effective_permission_keys || []),
    [user?.effective_permission_keys],
  )
  const hasPermission = (permissionKey) => effectivePermissionKeys.has(permissionKey)
  const isGlobalAdmin = roleKeys.includes('super_admin')
  const isSenior = roleKeys.includes('senior')
  const isManager = roleKeys.includes('manager')
  const isTeamLeader = roleKeys.includes('team_leader')
  const isBasicUser = roleKeys.includes('user')
  const isManagerRequestsBoard = isManager && resolvedScope === 'all'
  const [managerRequestsTab, setManagerRequestsTab] = useState('requests')
  const [managerTabCounts, setManagerTabCounts] = useState({ requests: 0, waiting: 0, sent_back: 0 })
  const isIncomingQueueTeamLeader = isTeamLeader && resolvedScope === 'team'
  const isPendingScope = resolvedScope === 'pending'
  const shouldRedirectBasicApproverFromPending = isPendingScope
    && isBasicUser
    && hasPermission('approve_request')
  const canDecidePending = isPendingScope
    && hasPermission('approve_request')
    && (
      isGlobalAdmin
      || isSenior
      || ((isManager || isTeamLeader) && user?.entity_type === 'PROD')
    )
  const actorCompanyId = useMemo(
    () => user?.company_id || user?.company || '',
    [user?.company_id, user?.company],
  )
  const isSingleEntityRole = !isGlobalAdmin && !isSenior && (isManager || isTeamLeader || isBasicUser)
  const scopeTitle = {
    all: 'All requests',
    mine: 'My requests',
    pending: 'Pending requests',
    team: 'Incoming queue',
    'team-all': 'Team requests',
    entity: 'Entity requests',
    company: 'Company requests',
  }

  useEffect(() => {
    if (!shouldRedirectBasicApproverFromPending) return
    navigate('/requests?scope=mine', { replace: true })
  }, [navigate, shouldRedirectBasicApproverFromPending])

  const applyScopeFilter = (items) => {
    if (!Array.isArray(items)) return []
    if (resolvedScope !== 'team' || !user?.entity_id) return items

    const currentEntityId = Number(user.entity_id)
    const currentEntityName = (user.entity_name || '').trim().toLowerCase()
    const currentEntityCode = (user.entity_code || user.entity?.code || '').trim().toLowerCase()

    return items.filter((item) => {
      const targetId = Number(item.target_entity_id || item.target_entity?.id || 0)
      if (targetId && currentEntityId && targetId === currentEntityId) return true

      const targetName = (item.target_entity_name || item.target_entity?.name || '').trim().toLowerCase()
      const targetCode = (item.target_entity_code || item.target_entity?.code || item.target_unit?.code || '').trim().toLowerCase()

      if (currentEntityName && targetName && targetName === currentEntityName) return true
      if (currentEntityCode && targetCode && targetCode === currentEntityCode) return true
      return false
    })
  }

  useEffect(() => {
    const nextSearch = searchParams.get('search') || ''
    const nextAssignee = searchParams.get('assignee') || ''
    const nextStatus = searchParams.get('status') || ''
    setFilters((current) => (
      current.search === nextSearch && current.assignee === nextAssignee && current.status === nextStatus
        ? current
        : { ...current, search: nextSearch, assignee: nextAssignee, status: nextStatus }
    ))
    setPagination((current) => (current.page === 1 ? current : { ...current, page: 1 }))
  }, [searchParams])

  useEffect(() => {
    const payload = {
      search: filters.search || '',
      company_id: filters.company_id || '',
      source_entity_id: filters.source_entity_id || '',
      target_entity_id: filters.target_entity_id || '',
      status: filters.status || '',
      assignee: filters.assignee || '',
      page: pagination.page,
    }
    window.sessionStorage.setItem(
      `${REQUESTS_FILTERS_STORAGE_KEY_PREFIX}:${resolvedScope}`,
      JSON.stringify(payload),
    )
  }, [filters, pagination.page, resolvedScope])

  useEffect(() => {
    if (!isGlobalAdmin) return
    let active = true
    async function fetchCompanies() {
      try {
        const response = await api.get('/admin/companies/')
        if (!active) return
        const payload = response.data
        const companies = Array.isArray(payload) ? payload : payload?.results || payload?.companies || []
        setOptions((current) => ({ ...current, companies }))
      } catch (_err) {
        if (!active) return
        setOptions((current) => ({ ...current, companies: [] }))
      }
    }
    fetchCompanies()
    return () => {
      active = false
    }
  }, [isGlobalAdmin])

  useEffect(() => {
    if (isSingleEntityRole) {
      const sourceEntity = user?.source_entity?.id
        ? user.source_entity
        : (user?.entity_id
          ? {
              id: user.entity_id,
              code: user.entity_code || '',
              name: user.entity_name || '',
              entity_type: user.entity_type || 'PROD',
            }
          : null)
      const targetEntities = Array.isArray(user?.available_target_teams) ? user.available_target_teams : []
      setOptions((current) => ({
        ...current,
        sourceEntities: sourceEntity ? [sourceEntity] : [],
        targetEntities,
      }))
      return
    }

    const companyId = isGlobalAdmin ? filters.company_id : actorCompanyId
    if (!companyId) {
      setOptions((current) => ({ ...current, sourceEntities: [], targetEntities: [] }))
      return
    }

    let active = true
    async function fetchEntities() {
      try {
        const response = await api.get('/admin/entities/', { params: { company_id: companyId } })
        if (!active) return
        const payload = response.data
        const entities = Array.isArray(payload) ? payload : payload?.results || payload?.entities || []
        setOptions((current) => ({
          ...current,
          sourceEntities: entities.filter((item) => item.entity_type === 'PROD'),
          targetEntities: entities.filter((item) => item.entity_type !== 'PROD'),
        }))
      } catch (_err) {
        if (!active) return
        setOptions((current) => ({ ...current, sourceEntities: [], targetEntities: [] }))
      }
    }
    fetchEntities()
    return () => {
      active = false
    }
  }, [actorCompanyId, filters.company_id, isGlobalAdmin, isSingleEntityRole, user?.available_target_teams, user?.entity_code, user?.entity_id, user?.entity_name, user?.entity_type, user?.source_entity])

  async function loadRequests() {
    try {
      await refreshUser()
      const isTeamScope = resolvedScope === 'team'
      const canViewAllRequests = hasPermission('view_all_requests')
      const isManagerScopedList = isManagerRequestsBoard && resolvedScope === 'all'
      const normalizedStatusFilter = isManagerRequestsBoard
        ? (
          managerRequestsTab === 'waiting'
            ? 'COMPLETED'
            : managerRequestsTab === 'sent_back'
              ? 'IN_PROGRESS'
              : (filters.status || undefined)
        )
        : (filters.status || undefined)
      const params = {
        page: (isTeamScope || isManagerScopedList) ? 1 : pagination.page,
        page_size: isTeamScope ? 200 : isManagerScopedList ? 500 : pagination.pageSize,
        scope: resolvedScope !== 'all' ? resolvedScope : undefined,
        search: filters.search || undefined,
        // Keep company filtering explicit from UI only.
        // Backend visibility + per-request overrides already enforce scope/security.
        company_id: (isGlobalAdmin && !canViewAllRequests) ? filters.company_id || undefined : undefined,
        source_entity_id: filters.source_entity_id || undefined,
        target_entity_id: filters.target_entity_id || undefined,
        status: normalizedStatusFilter,
        assignee: filters.assignee || undefined,
      }
      const response = await api.get('/requests/', { params })
      const payload = response.data || {}
      const rawResults = Array.isArray(payload.results) ? payload.results : []
      const scopedResults = applyScopeFilter(rawResults)
      const filteredResults = isManagerRequestsBoard
        ? (
          managerRequestsTab === 'waiting'
            ? scopedResults.filter((item) => item.status === 'COMPLETED')
            : managerRequestsTab === 'sent_back'
              ? scopedResults.filter((item) => item.status === 'IN_PROGRESS' && isSentBackRequest(item))
              : scopedResults.filter((item) => item.status !== 'COMPLETED' && !isSentBackRequest(item))
        )
        : scopedResults

      if (isTeamScope) {
        const totalCount = filteredResults.length
        const totalPages = Math.max(1, Math.ceil(totalCount / pagination.pageSize))
        const safePage = Math.min(Math.max(1, pagination.page), totalPages)
        const startIndex = (safePage - 1) * pagination.pageSize
        const endIndex = startIndex + pagination.pageSize
        const pagedResults = filteredResults.slice(startIndex, endIndex)

        setState({ loading: false, error: '', requests: pagedResults })
        setPagination((current) => ({
          ...current,
          page: safePage,
          count: totalCount,
          next: safePage < totalPages ? `local-page-${safePage + 1}` : null,
          previous: safePage > 1 ? `local-page-${safePage - 1}` : null,
        }))
        return
      }

      if (isManagerScopedList) {
        const totalCount = filteredResults.length
        const totalPages = Math.max(1, Math.ceil(totalCount / pagination.pageSize))
        const safePage = Math.min(Math.max(1, pagination.page), totalPages)
        const startIndex = (safePage - 1) * pagination.pageSize
        const endIndex = startIndex + pagination.pageSize
        const pagedResults = filteredResults.slice(startIndex, endIndex)

        setState({ loading: false, error: '', requests: pagedResults })
        setPagination((current) => ({
          ...current,
          page: safePage,
          count: totalCount,
          next: safePage < totalPages ? `local-page-${safePage + 1}` : null,
          previous: safePage > 1 ? `local-page-${safePage - 1}` : null,
        }))
        return
      }

      setState({ loading: false, error: '', requests: filteredResults })
      setPagination((current) => ({
        ...current,
        count: Number(payload.count || 0),
        next: payload.next || null,
        previous: payload.previous || null,
      }))
    } catch (error) {
      setState({
        loading: false,
        error: error.response?.data?.detail || 'Could not load requests.',
        requests: [],
      })
      setPagination((current) => ({ ...current, count: 0, next: null, previous: null }))
    }
  }

  async function loadManagerTabCounts() {
    if (!isManagerRequestsBoard) return
    try {
      const baseParams = {
        page: 1,
        page_size: 500,
        scope: resolvedScope !== 'all' ? resolvedScope : undefined,
        search: filters.search || undefined,
        company_id: (isGlobalAdmin && !hasPermission('view_all_requests')) ? filters.company_id || undefined : undefined,
        source_entity_id: filters.source_entity_id || undefined,
        target_entity_id: filters.target_entity_id || undefined,
        assignee: filters.assignee || undefined,
      }
      const allRes = await api.get('/requests/', { params: baseParams })
      const rawResults = Array.isArray(allRes?.data?.results) ? allRes.data.results : []
      const rows = applyScopeFilter(rawResults)
      const waitingCount = rows.filter((item) => item.status === 'COMPLETED').length
      const sentBackCount = rows.filter((item) => item.status === 'IN_PROGRESS' && isSentBackRequest(item)).length
      const requestsCount = rows.filter((item) => item.status !== 'COMPLETED' && !isSentBackRequest(item)).length
      setManagerTabCounts({
        requests: Math.max(0, requestsCount),
        waiting: waitingCount,
        sent_back: sentBackCount,
      })
    } catch (_error) {
      setManagerTabCounts({ requests: 0, waiting: 0, sent_back: 0 })
    }
  }

  async function handlePendingDecision(requestId, nextStatus, note = '') {
    try {
      await api.post(`/requests/${requestId}/status/`, { status: nextStatus, note })
      await loadRequests()
    } catch (error) {
      window.alert(error.response?.data?.detail || 'Could not update pending request.')
    }
  }

  useEffect(() => {
    setState({ loading: true, error: '', requests: [] })
    loadRequests()
  }, [filters, pagination.page, resolvedScope, refreshUser, managerRequestsTab])

  useEffect(() => {
    // If navigated from a notification about a rejected request, show a popup with details
    try {
      const state = location.state || {}
      if (state.rejectedFromNotification) {
        setRejectedInfo({
          open: true,
          payload: {
            requestId: state.requestId,
            requestNumber: state.requestNumber,
            title: state.title,
            priority: state.priority,
            sourceEntityName: state.sourceEntityName,
            targetEntityName: state.targetEntityName,
            reason: state.reason,
          },
        })
        // clear location state so popup isn't shown again on refresh/navigation
        navigate(location.pathname + location.search, { replace: true })
      }
    } catch (err) {
      // ignore
    }
  }, [location.state])

  useEffect(() => {
    if (shouldRedirectBasicApproverFromPending) return
    setState((current) => ({ ...current, loading: true, error: '' }))
    loadRequests()
  }, [filters, pagination.page, resolvedScope, refreshUser, shouldRedirectBasicApproverFromPending, managerRequestsTab])

  useEffect(() => {
    loadManagerTabCounts()
  }, [filters.search, filters.company_id, filters.source_entity_id, filters.target_entity_id, filters.assignee, resolvedScope, isManagerRequestsBoard])

  useEffect(() => {
    if (!canDecidePending) {
      setSelectedPendingIds([])
      return
    }
    const visibleIds = new Set(state.requests.map((item) => item.id))
    setSelectedPendingIds((current) => current.filter((id) => visibleIds.has(id)))
  }, [canDecidePending, state.requests])

  useEffect(() => {
    if (shouldRedirectBasicApproverFromPending) return undefined
    if (resolvedScope !== 'pending') return undefined

    const refreshPending = () => {
      loadRequests()
    }

    const timer = window.setInterval(refreshPending, 8000)
    window.addEventListener('focus', refreshPending)
    document.addEventListener('visibilitychange', refreshPending)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshPending)
      document.removeEventListener('visibilitychange', refreshPending)
    }
  }, [resolvedScope, filters, pagination.page, refreshUser, shouldRedirectBasicApproverFromPending])

  function handleFilterChange(key, value) {
    setFilters((current) => {
      const next = { ...current, [key]: value }
      if (key === 'company_id') {
        next.source_entity_id = ''
        next.target_entity_id = ''
      }
      return next
    })
    setPagination((current) => ({ ...current, page: 1 }))
  }

  function resetFilters() {
    setFilters({
      search: '',
      company_id: '',
      source_entity_id: '',
      target_entity_id: '',
      status: '',
      assignee: '',
    })
    setPagination((current) => ({ ...current, page: 1 }))
  }

  async function openPendingPreview(requestId) {
    if (!requestId) return
    setPendingPreview({
      open: true,
      loading: true,
      error: '',
      data: null,
    })
    try {
      const response = await api.get(`/requests/${requestId}/`)
      setPendingPreview({
        open: true,
        loading: false,
        error: '',
        data: response.data || null,
      })
    } catch (error) {
      setPendingPreview({
        open: true,
        loading: false,
        error: error.response?.data?.detail || 'Could not load request details.',
        data: null,
      })
    }
  }

  function closePendingPreview() {
    setPendingPreview({
      open: false,
      loading: false,
      error: '',
      data: null,
    })
  }

  function togglePendingSelection(requestId) {
    setSelectedPendingIds((current) => (
      current.includes(requestId)
        ? current.filter((id) => id !== requestId)
        : [...current, requestId]
    ))
  }

  function toggleSelectAllPendingOnPage(event) {
    const checked = event.target.checked
    const visiblePendingIds = state.requests
      .filter((item) => item.status === 'NEW')
      .map((item) => item.id)
    setSelectedPendingIds((current) => {
      if (checked) {
        const merged = new Set([...current, ...visiblePendingIds])
        return Array.from(merged)
      }
      return current.filter((id) => !visiblePendingIds.includes(id))
    })
  }

  async function processPendingDecisions(requestIds, nextStatus, reason = '') {
    if (!requestIds.length) return
    setBulkActionLoading(true)
    setBulkProgress({
      active: true,
      label: nextStatus === 'ACCEPTED' ? 'Approving' : 'Rejecting',
      done: 0,
      total: requestIds.length,
    })
    try {
      for (let index = 0; index < requestIds.length; index += 1) {
        const requestId = requestIds[index]
        await api.post(`/requests/${requestId}/status/`, {
          status: nextStatus,
          ...(nextStatus === 'REJECTED' ? { note: reason } : {}),
        })
        setBulkProgress((current) => ({ ...current, done: index + 1 }))
      }
      setSelectedPendingIds([])
      await loadRequests()
    } catch (error) {
      window.alert(error.response?.data?.detail || `Could not ${nextStatus === 'ACCEPTED' ? 'approve' : 'reject'} requests.`)
    } finally {
      setBulkActionLoading(false)
      setBulkProgress({ active: false, label: '', done: 0, total: 0 })
    }
  }

  function openRejectDialog(mode, requestIds) {
    setRejectDialog({
      open: true,
      mode,
      requestIds,
      reason: '',
    })
  }

  function closeRejectDialog() {
    if (bulkActionLoading) return
    setRejectDialog({
      open: false,
      mode: 'single',
      requestIds: [],
      reason: '',
    })
  }

  async function submitRejectDialog() {
    const reason = rejectDialog.reason.trim()
    if (!reason) return
    const ids = rejectDialog.requestIds
    await processPendingDecisions(ids, 'REJECTED', reason)
    closeRejectDialog()
  }

  async function approveSelectedPending() {
    const ids = selectedPendingIds.slice()
    await processPendingDecisions(ids, 'ACCEPTED')
  }

  function rejectSelectedPending() {
    if (!selectedPendingIds.length) return
    openRejectDialog('selected', selectedPendingIds.slice())
  }

  async function approveManagerWaitingRequest(requestId) {
    if (!requestId || !canManagerWaitingReview) return
    setWaitingActionLoadingId(requestId)
    try {
      await api.post(`/requests/${requestId}/status/`, {
        status: 'CLOSED',
        note: 'Approved by requester-side PROD manager.',
      })
      closePendingPreview()
      await loadRequests()
    } catch (error) {
      window.alert(error.response?.data?.detail || 'Could not approve request.')
    } finally {
      setWaitingActionLoadingId(null)
    }
  }

  async function sendBackManagerWaitingRequest(requestId) {
    if (!requestId || !canManagerWaitingReview) return
    const note = window.prompt('Reason for sending back to in progress:')
    if (note === null) return
    const trimmed = String(note).trim()
    if (!trimmed) {
      window.alert('Reason is required to send back a completed request.')
      return
    }
    setWaitingActionLoadingId(requestId)
    try {
      await api.post(`/requests/${requestId}/status/`, {
        status: 'IN_PROGRESS',
        note: trimmed,
      })
      closePendingPreview()
      await loadRequests()
    } catch (error) {
      window.alert(error.response?.data?.detail || 'Could not send request back.')
    } finally {
      setWaitingActionLoadingId(null)
    }
  }

  const canShowCompanyFilter = hasPermission('view_all_requests') || isIncomingQueueTeamLeader
  const canManagerWaitingReview = isManagerRequestsBoard
    && managerRequestsTab === 'waiting'
    && user?.entity_type === 'PROD'
    && hasPermission('approve_request')
  const pendingSolve = useMemo(() => {
    const data = pendingPreview.data
    if (!data) return null
    const evidenceList = extractEvidenceFromComments(data.comments || [])
    return {
      requestId: data.id,
      requestTitle: data.title || `Request #${data.id}`,
      requestReference: data.reference_code || data.request_number || '',
      requestUrl: `/requests/${data.id}`,
      requestStatus: data.status || 'COMPLETED',
      completionNote: data.completion_note || data.resolution_note || data.note || 'No completion note.',
      completedAt: data.completed_at || data.updated_at || null,
      requestType: data.type || '-',
      priority: data.priority_label || data.priority || '-',
      solverId: data.assignee_id || null,
      solverName: data.assignee_name || data.assignee_username || 'Unknown',
      solverRole: data.assignee_role_label || data.assignee_role || 'Support/Dev',
      solverEntityName: data.target_entity_name || '-',
      sourceCompanyName: data.source_company_name || data.source_entity_name || '-',
      sourceEntityName: data.source_entity_name || '-',
      requesterName: data.requested_by_name || data.requester_name || data.creator_name || '-',
      evidenceList,
      wasRejected: Boolean(data.was_rejected || data.rejection_reason || data.rejected_by_name),
      rejectedByName: data.rejected_by_name || 'Requester reviewer',
      rejectionReason: data.rejection_reason || 'No reason provided',
      rejectionNote: data.rejection_note || '',
      rejectedAt: data.rejected_at || null,
      canResultApprove: canManagerWaitingReview && data.status === 'COMPLETED',
      canResultReject: canManagerWaitingReview && data.status === 'COMPLETED',
    }
  }, [pendingPreview.data, canManagerWaitingReview])
  const totalPages = Math.max(1, Math.ceil((pagination.count || 0) / pagination.pageSize))
  const fromIndex = pagination.count ? (pagination.page - 1) * pagination.pageSize + 1 : 0
  const toIndex = Math.min(pagination.page * pagination.pageSize, pagination.count || 0)

  if (shouldRedirectBasicApproverFromPending) return null

  return (
    <main className="space-y-6 px-1 sm:px-2 lg:px-3">
      <PageHeader
        eyebrow="Operations"
        title={scopeTitle[resolvedScope] || 'Requests'}
        description="Browse, filter, and manage requests across your scope."
        actions={
          user?.request_creation_allowed && hasPermission('create_request') ? (
            <Button asChild>
              <Link to="/requests/create">
                <PlusCircle className="mr-1 h-4 w-4" /> New request
              </Link>
            </Button>
          ) : null
        }
      />

      {isIncomingQueueTeamLeader ? <div className="h-0.5 w-full bg-border" /> : null}

      <div className="surface-card p-5 lg:p-6 shadow-sm border-border/50">
        {isManagerRequestsBoard ? (
          <div className="mb-4 border-b border-border">
            <div className="flex flex-wrap items-end gap-6">
              {[['requests', 'Requests'], ['waiting', 'waiting approval'], ['sent_back', 'Sent back']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setManagerRequestsTab(key); setPagination((current) => ({ ...current, page: 1 })) }}
                  className={`border-b-2 pb-2 text-sm font-semibold transition-colors ${managerRequestsTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                    {key === 'waiting' ? managerTabCounts.waiting : key === 'sent_back' ? managerTabCounts.sent_back : managerTabCounts.requests}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 xl:flex-nowrap">
          <div className="relative min-w-[260px] flex-1 xl:flex-[2_1_0%]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(event) => handleFilterChange('search', event.target.value)}
              placeholder="Search title, reference, description..."
              className="pl-9"
            />
          </div>

          {canShowCompanyFilter && (
            <Select
              className="flex h-10 min-w-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm xl:flex-1"
              value={isGlobalAdmin ? filters.company_id : (actorCompanyId ? String(actorCompanyId) : '')}
              onChange={(event) => handleFilterChange('company_id', event.target.value)}
              disabled={!isGlobalAdmin}
            >
              {isGlobalAdmin ? (
                [
                  <option key="company-default" value="">Company</option>,
                  ...options.companies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code ? `${item.code} - ${item.name}` : item.name}
                    </option>
                  )),
                ]
              ) : (
                <option value={actorCompanyId ? String(actorCompanyId) : ''}>{(user?.company_name || 'My company').toUpperCase()}</option>
              )}
            </Select>
          )}

          <Select
            className="flex h-10 min-w-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm xl:flex-1"
            value={filters.source_entity_id}
            onChange={(event) => handleFilterChange('source_entity_id', event.target.value)}
            disabled={canShowCompanyFilter ? !filters.company_id : !options.sourceEntities.length}
          >
            <option value="">All sources</option>
            {options.sourceEntities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || item.code}
              </option>
            ))}
          </Select>

          <Select
            className="flex h-10 min-w-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm xl:flex-1"
            value={filters.target_entity_id}
            onChange={(event) => handleFilterChange('target_entity_id', event.target.value)}
            disabled={canShowCompanyFilter ? !filters.company_id : !options.targetEntities.length}
          >
            <option value="">All targets</option>
            {options.targetEntities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || item.code}
              </option>
            ))}
          </Select>

          {!isManagerRequestsBoard ? (
            <Select
              className="flex h-10 min-w-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm xl:flex-1"
              value={filters.status}
              onChange={(event) => handleFilterChange('status', event.target.value)}
            >
              <option value="">All statuses</option>
              {Object.entries(statusLabelMap).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            className="h-10 min-w-[140px] xl:ml-auto font-bold text-xs"
            onClick={resetFilters}
          >
            Clear filters
          </Button>

          {!isPendingScope ? (
            <Button
              type="button"
              size="sm"
              variant={filters.assignee === 'unassigned' ? 'default' : 'outline'}
              className="h-10 min-w-[170px]"
              onClick={() => handleFilterChange('assignee', filters.assignee === 'unassigned' ? '' : 'unassigned')}
            >
              Unassigned only
            </Button>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {`${pagination.count || 0} result(s)`}
            {filters.assignee && filters.assignee !== 'unassigned' ? ` assigned to ${filters.assignee}` : ''}
          </p>
        </div>
      </div>

      <div className="surface-card shadow-sm border-border/50 overflow-hidden">
        {canDecidePending && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3 bg-card backdrop-blur-sm">
            <div className="text-xs text-muted-foreground">
              <p>{selectedPendingIds.length} selected</p>
              {bulkProgress.active && (
                <p className="mt-1 flex items-center gap-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {bulkProgress.label} {bulkProgress.done}/{bulkProgress.total}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={approveSelectedPending} 
                disabled={!selectedPendingIds.length || bulkActionLoading}
                className="border-indigo-500/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-500/10 shadow-none !rounded-md h-9 px-4 font-bold text-[11px] uppercase tracking-widest disabled:opacity-40 disabled:bg-muted"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve selected
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={rejectSelectedPending} 
                disabled={!selectedPendingIds.length || bulkActionLoading}
                className="border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 shadow-none !rounded-md h-9 px-4 font-bold text-[11px] uppercase tracking-widest disabled:opacity-40 disabled:bg-muted"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject selected
              </Button>
            </div>
          </div>
        )}

        {state.loading && state.requests.length === 0 ? (
          <div className="overflow-x-auto p-5 lg:p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-muted/10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                  {canDecidePending && <th className="px-4 py-3 text-left font-medium">Select</th>}
                  <th className="px-4 py-3 text-left font-medium">Reference</th>
                  <th className="px-4 py-3 text-left font-medium">Title</th>
                  <th className="px-4 py-3 text-left font-medium">Source - Target</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Priority</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Assignee</th>
                  <th className="px-4 py-3 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, index) => (
                  <tr key={`request-row-skeleton-${index}`} className="border-b border-border last:border-0">
                    {canDecidePending && <td className="px-4 py-3"><Skeleton className="h-4 w-4" /></td>}
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-44" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : state.error ? (
          <div className="py-16 text-center text-sm font-medium text-destructive">{state.error}</div>
        ) : state.requests.length === 0 ? (
          <div className={`${isIncomingQueueTeamLeader ? 'm-3 rounded-md border border-dashed border-ink/20 p-16 text-center' : 'py-16 text-center'}`}>
            <p className="text-sm font-medium">No requests match your filters</p>
            <p className="mt-1 text-xs text-muted-foreground">Try clearing filters or creating a new request.</p>
            {user?.request_creation_allowed && hasPermission('create_request') ? (
              <div className="mt-4">
                <Button asChild>
                  <Link to="/requests/create">
                    <PlusCircle className="mr-1 h-4 w-4" /> New request
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-muted/10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                  {canDecidePending && (
                    <th className="px-4 py-3 text-left font-medium">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={state.requests.filter((item) => item.status === 'NEW').length > 0
                          && state.requests.filter((item) => item.status === 'NEW').every((item) => selectedPendingIds.includes(item.id))}
                        onChange={toggleSelectAllPendingOnPage}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left font-medium">Reference</th>
                  <th className="px-4 py-3 text-left font-medium">Title</th>
                  <th className="px-4 py-3 text-left font-medium">Source - Target</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Priority</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  {(!isPendingScope || !canDecidePending) && <th className="px-4 py-3 text-left font-medium">Assignee</th>}
                  <th className="px-4 py-3 text-left font-medium">Updated</th>
                  {(canDecidePending || canManagerWaitingReview) && <th className="px-4 py-3 text-right font-medium">{canManagerWaitingReview ? 'Actions' : 'Decision'}</th>}
                </tr>
              </thead>
              <tbody>
                {state.requests.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-ink/5 last:border-0 hover:bg-muted/10 transition-colors ${isPendingScope ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (isPendingScope) openPendingPreview(item.id)
                    }}
                  >
                    {canDecidePending && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={selectedPendingIds.includes(item.id)}
                          disabled={item.status !== 'NEW' || bulkActionLoading}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => togglePendingSelection(item.id)}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {isPendingScope ? (
                        <span>{item.reference_code || item.request_number || '-'}</span>
                      ) : (
                        <Link to={`/requests/${item.id}`} className="hover:text-primary hover:underline">
                          {item.reference_code || item.request_number || '-'}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isPendingScope ? (
                        <span className="font-medium text-foreground">{item.title || '-'}</span>
                      ) : (
                        <Link to={`/requests/${item.id}`} className="font-medium text-foreground hover:text-primary">
                          {item.title || '-'}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="font-medium text-foreground">{item.source_entity_name || '-'}</span>
                      <span className="mx-1.5 text-muted-foreground">-</span>
                      <span className="font-medium text-foreground">{item.target_entity_name || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={typePillClass(item.type)}>
                        {item.type || 'INFO'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={priorityPillClass(item.priority)}>
                        {(item.priority_label || item.priority || 'MEDIUM').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {item.status === 'IN_PROGRESS' && isSentBackRequest(item) && !canManagerWaitingReview ? (
                          <span className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-600">
                            SENT BACK
                          </span>
                        ) : (
                          <span className={statusPillClass(item.status)}>
                            {getStatusLabel(item.status, isPendingScope)}
                          </span>
                        )}
                        {item.status === 'IN_PROGRESS' && isSentBackRequest(item) && item.rejected_by_name ? (
                          <div className="text-[11px] text-muted-foreground">
                            by {item.rejected_by_name}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    {(!isPendingScope || !canDecidePending) && (
                      <td className="px-4 py-3">
                        {item.assignee_name ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={item.assignee_name} size={24} />
                            <span className="text-xs">{item.assignee_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatUpdated(item.updated_at || item.created_at)}
                    </td>
                    {(canDecidePending || canManagerWaitingReview) && (
                      <td className="px-4 py-3 text-right">
                        {canManagerWaitingReview ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest"
                            onClick={(event) => {
                              event.stopPropagation()
                              openPendingPreview(item.id)
                            }}
                            disabled={waitingActionLoadingId === item.id}
                          >
                            Review
                          </Button>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 border border-indigo-500/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-500/10 shadow-none font-bold text-[10px] uppercase tracking-widest px-3"
                              onClick={(event) => {
                                event.stopPropagation()
                                handlePendingDecision(item.id, 'ACCEPTED')
                              }}
                              disabled={item.status !== 'NEW' || bulkActionLoading}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              Accept
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 border border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 shadow-none font-bold text-[10px] uppercase tracking-widest px-3"
                              onClick={(event) => {
                                event.stopPropagation()
                                openRejectDialog('single', [item.id])
                              }}
                              disabled={item.status !== 'NEW' || bulkActionLoading}
                            >
                              <XCircle className="mr-1.5 h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!state.loading && !state.error && pagination.count > pagination.pageSize && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <div className="text-xs text-muted-foreground">
              Showing {fromIndex}-{toIndex} of {pagination.count}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.previous}
                onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs text-muted-foreground">
                Page {pagination.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.next}
                onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
      {rejectDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-md border-2 border-border bg-card p-5 shadow-none">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Reject request</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Rejection reason</h3>
            <p className="mt-1 text-sm text-muted-foreground">This reason is required and will be saved in the request history.</p>
            <textarea
              className="mt-4 min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              value={rejectDialog.reason}
              onChange={(event) => setRejectDialog((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Write the rejection reason..."
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={closeRejectDialog} disabled={bulkActionLoading}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={submitRejectDialog}
                disabled={!rejectDialog.reason.trim() || bulkActionLoading}
              >
                {bulkActionLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rejecting...
                  </span>
                ) : (
                  'Reject'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
      {pendingPreview.open && pendingPreview.loading ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <section className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl">
            <Skeleton className="h-40" />
            <div className="mt-4 flex justify-end"><Button type="button" variant="outline" size="sm" onClick={closePendingPreview}>Close</Button></div>
          </section>
        </div>
      ) : null}

      {pendingPreview.open && !pendingPreview.loading && pendingPreview.error ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <p className="text-sm text-destructive">{pendingPreview.error}</p>
            <div className="mt-4 flex justify-end"><Button type="button" variant="outline" size="sm" onClick={closePendingPreview}>Close</Button></div>
          </section>
        </div>
      ) : null}

      {pendingPreview.open && !pendingPreview.loading && !pendingPreview.error && pendingSolve ? (
        <SolveDetailsModal
          solve={pendingSolve}
          user={{ full_name: pendingSolve.solverName }}
          entity={{ name: pendingSolve.solverEntityName }}
          currentRole=""
          currentUser={null}
          onClose={closePendingPreview}
          onApproveResult={(solve) => approveManagerWaitingRequest(solve.requestId)}
          onRejectResult={(solve) => sendBackManagerWaitingRequest(solve.requestId)}
          statusActionBusyId={waitingActionLoadingId}
        />
      ) : null}
      {rejectedInfo.open && rejectedInfo.payload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-md border-2 border-border bg-card p-5 shadow-none">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Request rejected</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">{rejectedInfo.payload.title || rejectedInfo.payload.requestNumber || 'Request'}</h3>
            <p className="mt-1 text-sm text-muted-foreground">Reference: <span className="font-mono">{rejectedInfo.payload.requestNumber || '-'}</span></p>
            <p className="mt-1 text-sm text-muted-foreground">Priority: <strong>{(rejectedInfo.payload.priority || 'MEDIUM').toUpperCase()}</strong></p>
            <p className="mt-1 text-sm text-muted-foreground">From: <strong>{rejectedInfo.payload.sourceEntityName || '-'}</strong> — To: <strong>{rejectedInfo.payload.targetEntityName || '-'}</strong></p>
            <div className="mt-4 rounded-md border border-input bg-background p-3 text-sm">
              <p className="text-xs font-bold text-muted-foreground">Rejection reason</p>
              <p className="mt-1 text-sm text-foreground">{rejectedInfo.payload.reason || 'No rejection reason provided.'}</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectedInfo({ open: false, payload: null })}>Close</Button>
              <Button
                onClick={() => {
                  setRejectedInfo({ open: false, payload: null })
                  navigate(`/requests/${rejectedInfo.payload.requestId}`)
                }}
              >
                View details
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default RequestsPage
