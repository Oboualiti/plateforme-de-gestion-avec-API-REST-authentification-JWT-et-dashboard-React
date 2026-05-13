import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'

import PageHeader from '../components/layout/PageHeader'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import SolveDetailsModal from '../components/credits/SolveDetailsModal'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const STATUS_LABEL = {
  NEW: 'NEW',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN PROGRESS',
  COMPLETED: 'COMPLETED',
  CLOSED: 'CLOSED',
  REJECTED: 'SENT BACK',
}

function statusPillClass(status) {
  const base = 'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider'
  if (status === 'REJECTED') return `${base} border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400`
  if (status === 'IN_PROGRESS') return `${base} border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400`
  if (status === 'ACCEPTED') return `${base} border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400`
  if (status === 'COMPLETED') return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`
  if (status === 'CLOSED') return `${base} border-slate-500/30 bg-slate-500/10 text-slate-500`
  return `${base} border-primary/30 bg-primary/10 text-primary`
}

function priorityPillClass(priority) {
  const base = 'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider'
  if (priority === 'HIGH') return `${base} border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400`
  if (priority === 'LOW') return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`
  return `${base} border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400`
}

function typePillClass(type) {
  const base = 'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider'
  if (type === 'SCRIPT') return `${base} border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400`
  if (type === 'TOOL') return `${base} border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400`
  if (type === 'APP_PROJECT') return `${base} border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400`
  return `${base} border-primary/30 bg-primary/10 text-primary`
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
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

function TeamQueuePage() {
  const { user } = useAuth()
  const roleKeys = user?.role_keys || []
  const isTeamLeader = roleKeys.includes('team_leader')
  const isProdEntity = String(user?.entity_type || '').toUpperCase() === 'PROD'
  const isProdTL = isTeamLeader && isProdEntity

  const [initialLoading, setInitialLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState(null)
  const [detailModal, setDetailModal] = useState({ open: false, loading: false, error: '', requestId: null, data: null })
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('assigned')
  const [page, setPage] = useState(1)
  const UI_PAGE_SIZE = 8
  const [pagination, setPagination] = useState({ count: 0, next: null, previous: null })
  const [tabCountsApi, setTabCountsApi] = useState({ assigned: null, waiting: null, sent_back: null, closed: null })

  async function fetchTeamRequests(currentPage = 1) {
    const teamBucket = activeTab === 'sent_back' ? 'sent_back' : activeTab
    const response = await api.get('/requests/', {
      params: {
        scope: 'team',
        team_queue: 1,
        team_bucket: teamBucket,
        actor_scope: assigneeFilter,
        page: currentPage,
        page_size: UI_PAGE_SIZE,
        search: search.trim() || undefined,
      },
    })
    const payload = response.data || {}
    return {
      rows: Array.isArray(payload.results) ? payload.results : [],
      count: Number(payload.count || 0),
      next: payload.next || null,
      previous: payload.previous || null,
    }
  }

  useEffect(() => {
    let active = true
    async function loadTeamRequests() {
      try {
        if (initialLoading) setInitialLoading(true)
        else setTableLoading(true)
        setError('')
        const payload = await fetchTeamRequests(page)
        if (!active) return
        setRows(payload.rows)
        setPagination({ count: payload.count, next: payload.next, previous: payload.previous })
      } catch (nextError) {
        if (!active) return
        setError(nextError.response?.data?.detail || 'Could not load team queue.')
      } finally {
        if (active) {
          setInitialLoading(false)
          setTableLoading(false)
        }
      }
    }
    loadTeamRequests()
    return () => {
      active = false
    }
  }, [page, activeTab, search, assigneeFilter])

  useEffect(() => {
    let active = true
    async function loadTabCounts() {
      try {
        const response = await api.get('/requests/', {
          params: {
            scope: 'team',
            team_queue: 1,
            team_queue_counts: 1,
            actor_scope: assigneeFilter,
            search: search.trim() || undefined,
          },
        })
        if (!active) return
        const payload = response.data || {}
        setTabCountsApi({
          assigned: Number.isFinite(Number(payload.assigned)) ? Number(payload.assigned) : 0,
          waiting: Number.isFinite(Number(payload.waiting)) ? Number(payload.waiting) : 0,
          sent_back: Number.isFinite(Number(payload.sent_back)) ? Number(payload.sent_back) : 0,
          closed: Number.isFinite(Number(payload.closed)) ? Number(payload.closed) : 0,
        })
      } catch {
        if (!active) return
        setTabCountsApi({ assigned: null, waiting: null, sent_back: null, closed: null })
      }
    }
    loadTabCounts()
    return () => {
      active = false
    }
  }, [search, assigneeFilter])

  const totalPages = Math.max(1, Math.ceil(pagination.count / UI_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const startItem = pagination.count === 0 ? 0 : (safePage - 1) * UI_PAGE_SIZE + 1
  const endItem = Math.min(safePage * UI_PAGE_SIZE, pagination.count)

  const tabCounts = {
    assigned: tabCountsApi.assigned ?? 0,
    waiting: tabCountsApi.waiting ?? 0,
    sent_back: tabCountsApi.sent_back ?? 0,
    closed: tabCountsApi.closed ?? 0,
  }

  useEffect(() => {
    setPage(1)
  }, [activeTab, assigneeFilter, search])

  async function refreshRows() {
    const payload = await fetchTeamRequests(page)
    setRows(payload.rows)
    setPagination({ count: payload.count, next: payload.next, previous: payload.previous })
  }

  async function approveCompletedRequest(requestId) {
    if (!isProdTL) return
    setActionLoadingId(requestId)
    try {
      await api.post(`/requests/${requestId}/status/`, { status: 'CLOSED', note: 'Approved by requester-side PROD team.' })
      await refreshRows()
    } catch (nextError) {
      setError(nextError.response?.data?.detail || 'Could not approve request.')
    } finally {
      setActionLoadingId(null)
    }
  }

  async function rejectCompletedRequest(requestId, extra = null) {
    if (!isProdTL) return
    let trimmed = ''
    if (extra && (extra.rejectionReason || extra.rejectionNote)) {
      const reason = String(extra.rejectionReason || '').trim()
      const note = String(extra.rejectionNote || '').trim()
      trimmed = note ? `${reason}: ${note}` : reason
    } else {
      const note = window.prompt('Reason for sending back to in progress:')
      if (note === null) return
      trimmed = String(note).trim()
    }
    if (!trimmed) {
      setError('Reason is required to send back a completed request.')
      return
    }
    setActionLoadingId(requestId)
    try {
      await api.post(`/requests/${requestId}/status/`, { status: 'IN_PROGRESS', note: trimmed })
      await refreshRows()
    } catch (nextError) {
      setError(nextError.response?.data?.detail || 'Could not send request back.')
    } finally {
      setActionLoadingId(null)
    }
  }

  async function openDetailsModal(requestId) {
    setDetailModal({ open: true, loading: true, error: '', requestId, data: null })
    try {
      const response = await api.get(`/requests/${requestId}/`)
      setDetailModal((current) => ({ ...current, loading: false, data: response.data || null }))
    } catch (nextError) {
      setDetailModal((current) => ({ ...current, loading: false, error: nextError.response?.data?.detail || 'Could not load request details.' }))
    }
  }

  function closeDetailsModal() {
    setDetailModal({ open: false, loading: false, error: '', requestId: null, data: null })
  }

  const detailSolve = useMemo(() => {
    const data = detailModal.data
    if (!data) return null
    const evidenceList = extractEvidenceFromComments(data.comments || [])
    return {
      requestId: data.id,
      requestTitle: data.title || `Request #${data.id}`,
      requestReference: data.request_number || '',
      requestUrl: `/requests/${data.id}`,
      requestStatus: data.status || 'COMPLETED',
      completionNote: data.resolution_note || 'No completion note.',
      completedAt: data.completed_at,
      requestType: data.type || '-',
      priority: data.priority || '-',
      solverId: data.assignee_id || null,
      solverName: data.assignee_name || 'Unknown',
      solverRole: 'Support/Dev',
      solverEntityName: data.target_entity_name || '-',
      sourceCompanyName: data.source_company_name || '-',
      sourceEntityName: data.source_entity_name || '-',
      requesterName: data.creator_name || '-',
      evidenceList,
      wasRejected: Boolean(data.was_rejected || data.rejection_reason || data.rejected_by_name),
      rejectedByName: data.rejected_by_name || 'Requester reviewer',
      rejectionReason: data.rejection_reason || 'No reason provided',
      rejectionNote: data.rejection_note || '',
      rejectedAt: data.rejected_at || null,
      canResultApprove: data.status === 'COMPLETED',
      canResultReject: data.status === 'COMPLETED',
    }
  }, [detailModal.data])

  if (initialLoading) {
    return (
      <main className="space-y-6">
        <PageHeader eyebrow="Workspace" title="Team Queue" description="Assigned requests, waiting approvals, and sent-back work for your team." />
        <Skeleton className="h-14" />
        <Skeleton className="h-[560px]" />
      </main>
    )
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Team Queue"
        description={isProdTL
          ? 'Created requests, waiting approvals, and sent-back work for your PROD team.'
          : 'Assigned requests, waiting approvals, and sent-back work for your team.'}
      />

      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search requests..." />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={assigneeFilter === 'me' ? 'default' : 'outline'}
              className="h-10"
              onClick={() => setAssigneeFilter((current) => (current === 'me' ? 'all' : 'me'))}
            >
              {isProdTL ? 'Created by me' : 'Assigned to me'}
            </Button>
            <Button
              type="button"
              variant={assigneeFilter === 'members' ? 'default' : 'outline'}
              className="h-10"
              onClick={() => setAssigneeFilter((current) => (current === 'members' ? 'all' : 'members'))}
            >
              {isProdTL ? 'Created by my members' : 'Assigned to my members'}
            </Button>
          </div>
        </div>
        {error ? <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-5 pt-4">
          <div className="flex flex-wrap items-end gap-6">
            {[['assigned', isProdTL ? 'Created' : 'Assigned'], ['waiting', 'Completed / waiting approval'], ['sent_back', 'Sent back'], ['closed', 'Closed requests']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`border-b-2 pb-2 text-sm font-semibold transition-colors ${activeTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {label}
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground">{tabCounts[key] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Source - Target</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">{isProdTL ? 'Creator' : 'Assignee'}</th>
                <th className="px-4 py-3 text-left">Updated</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                Array.from({ length: UI_PAGE_SIZE }).map((_, index) => (
                  <tr key={`loading-row-${index}`} className="border-b border-border/80 last:border-b-0">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-56" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-7 w-16" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">No requests in this section.</td></tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.id} className="border-b border-border/80 last:border-b-0 hover:bg-muted/20">
                    <td className="px-4 py-3"><Link to={`/requests/${item.id}`} className="font-mono text-xs text-muted-foreground hover:text-primary">{item.request_number}</Link></td>
                    <td className="px-4 py-3 font-semibold text-foreground">{item.title || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{item.source_entity_name || '-'} - {item.target_entity_name || '-'}</td>
                    <td className="px-4 py-3"><span className={typePillClass(item.type)}>{item.type || '-'}</span></td>
                    <td className="px-4 py-3"><span className={priorityPillClass(item.priority)}>{item.priority || '-'}</span></td>
                    <td className="px-4 py-3"><span className={statusPillClass(item.status)}>{STATUS_LABEL[item.status] || item.status}</span></td>
                    <td className="px-4 py-3 text-foreground">{isProdTL ? (item.creator_name || '-') : (item.assignee_name || 'Unassigned')}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(item.created_at)}</td>
                    <td className="px-4 py-3">
                      {isProdTL && activeTab === 'waiting' ? (
                        <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-[10px]" disabled={actionLoadingId === item.id || detailModal.loading} onClick={() => openDetailsModal(item.id)}>Review</Button>
                      ) : (
                        (() => {
                          // View action is available only in the Closed requests tab.
                          if (activeTab !== 'closed') {
                            return null
                          }
                          return (
                            <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-[10px]" onClick={() => openDetailsModal(item.id)}>View</Button>
                          )
                        })()
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>Showing {startItem}-{endItem} of {pagination.count} (page {safePage} of {totalPages})</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={tableLoading || !pagination.previous || safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Prev</Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={tableLoading || !pagination.next || safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
          </div>
        </div>
      </section>

      {detailModal.open && detailModal.loading ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <section className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl">
            <Skeleton className="h-40" />
            <div className="mt-4 flex justify-end"><Button type="button" variant="outline" size="sm" onClick={closeDetailsModal}>Close</Button></div>
          </section>
        </div>
      ) : null}

      {detailModal.open && !detailModal.loading && !detailModal.error && detailSolve ? (
        <SolveDetailsModal
          solve={detailSolve}
          user={{ full_name: detailSolve.solverName }}
          entity={{ name: detailSolve.solverEntityName }}
          currentRole=""
          currentUser={null}
          hideCredits
          onClose={closeDetailsModal}
          onApproveResult={(solve) => approveCompletedRequest(solve.requestId)}
          onRejectResult={(solve, extra) => rejectCompletedRequest(solve.requestId, extra)}
          statusActionBusyId={actionLoadingId}
        />
      ) : null}
    </main>
  )
}

export default TeamQueuePage
