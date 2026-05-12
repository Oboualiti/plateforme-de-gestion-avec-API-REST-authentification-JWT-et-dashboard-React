import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Select } from '../components/ui/select'
import { api } from '../lib/api'

function statusLabel(status) {
  const key = String(status || '').toUpperCase()
  if (key === 'NEW') return 'New'
  if (key === 'ACCEPTED') return 'Accepted'
  if (key === 'IN_PROGRESS') return 'In Progress'
  if (key === 'COMPLETED') return 'Waiting Approval'
  if (key === 'CLOSED') return 'Closed'
  if (key === 'REJECTED') return 'Rejected'
  return key || '-'
}

function tabLabel(tab) {
  const map = {
    available: 'Available',
    assigned_to_me: 'Assigned to me',
    assigned_to_members: 'Assigned to members',
    sent_back: 'Sent back',
    waiting_approval: 'Waiting approval',
    closed: 'Closed',
    created: 'Created',
  }
  return map[tab] || tab
}

export default function TeamQueuePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [queue, setQueue] = useState({ queueMode: 'work', activeTab: 'assigned_to_me', tabs: [], counts: {}, rows: [] })
  const [busyId, setBusyId] = useState(null)

  async function loadQueue(tabOverride = '') {
    try {
      setLoading(true)
      setError('')
      const params = {}
      const tab = tabOverride || queue.activeTab
      if (tab) params.tab = tab
      const response = await api.get('/requests/team-queue/', { params })
      const payload = response.data || {}
      setQueue({
        queueMode: payload.queueMode || 'work',
        activeTab: payload.activeTab || tab || 'assigned_to_me',
        tabs: Array.isArray(payload.tabs) ? payload.tabs : [],
        counts: payload.counts || {},
        rows: Array.isArray(payload.rows) ? payload.rows : [],
      })
    } catch (_err) {
      setError('Could not load queue.')
      setQueue({ queueMode: 'work', activeTab: 'assigned_to_me', tabs: [], counts: {}, rows: [] })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadQueue('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAction(row, action) {
    setBusyId(`${action}-${row.id}`)
    try {
      if (action === 'take') {
        await api.post(`/requests/${row.id}/assign/`, {})
      } else if (action === 'complete') {
        await api.post(`/requests/${row.id}/status/`, { status: 'COMPLETED' })
      } else if (action === 'approve') {
        await api.post(`/requests/${row.id}/status/`, { status: 'CLOSED' })
      } else if (action === 'send_back') {
        await api.post(`/requests/${row.id}/status/`, {
          status: 'IN_PROGRESS',
          rejection_reason: 'Needs revision',
          rejection_note: 'Returned from queue review.',
        })
      }
      await loadQueue(queue.activeTab)
    } finally {
      setBusyId(null)
    }
  }

  const modeLabel = useMemo(() => {
    if (queue.queueMode === 'review') return 'Review Queue'
    if (queue.queueMode === 'admin') return 'Admin Queue'
    return 'Work Queue'
  }, [queue.queueMode])

  return (
    <div className="space-y-4">
      <PageHeader title="Work Queue" description="Backend-driven queue actions" />
      <Card className="rounded-xl border border-ink/10 bg-card shadow-sm">
        <CardHeader className="border-b border-ink/10">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-bold">{modeLabel}</CardTitle>
            <Select
              className="ml-auto !h-10 !w-[220px]"
              value={queue.activeTab}
              onChange={(e) => loadQueue(e.target.value)}
            >
              {queue.tabs.map((tab) => (
                <option key={tab} value={tab}>
                  {tabLabel(tab)} ({Number(queue.counts?.[tab] || 0)})
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> : null}
          {error ? <div className="p-4 text-sm text-destructive">{error}</div> : null}
          {!loading && !error ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 text-left">Request</th>
                    <th className="px-3 py-3 text-left">Requester</th>
                    <th className="px-3 py-3 text-left">Source</th>
                    <th className="px-3 py-3 text-left">Target</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.rows.map((row) => (
                    <tr key={row.id} className="border-t border-ink/10">
                      <td className="px-3 py-3">
                        <div className="font-semibold">{row.title}</div>
                        <div className="text-xs text-muted-foreground">{row.requestNumber}</div>
                      </td>
                      <td className="px-3 py-3">{row.requesterName || '-'}</td>
                      <td className="px-3 py-3">{row.sourceEntityName || '-'}</td>
                      <td className="px-3 py-3">{row.targetEntityName || '-'}</td>
                      <td className="px-3 py-3">{statusLabel(row.status)}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          {row.canAssignToMe ? <Button size="sm" variant="outline" disabled={busyId === `take-${row.id}`} onClick={() => handleAction(row, 'take')}>Take</Button> : null}
                          {row.canAssignUser ? <Button size="sm" variant="outline" disabled>Assign</Button> : null}
                          {row.canComplete ? <Button size="sm" variant="outline" disabled={busyId === `complete-${row.id}`} onClick={() => handleAction(row, 'complete')}>Complete</Button> : null}
                          {row.canResultApprove ? <Button size="sm" variant="outline" disabled={busyId === `approve-${row.id}`} onClick={() => handleAction(row, 'approve')}>Approve</Button> : null}
                          {row.canResultReject ? <Button size="sm" variant="outline" disabled={busyId === `send_back-${row.id}`} onClick={() => handleAction(row, 'send_back')}>Send back</Button> : null}
                          {row.canView ? <Button size="sm" onClick={() => navigate(`/requests/${row.id}`)}>View</Button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!queue.rows.length ? <div className="p-4 text-sm text-muted-foreground">No requests in this tab.</div> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
