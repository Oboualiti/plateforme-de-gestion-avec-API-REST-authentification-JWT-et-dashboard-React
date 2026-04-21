import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

function getAvatarColor(name) {
  const colors = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']
  const index = name ? name.charCodeAt(0) % colors.length : 0
  return colors[index]
}

function Avatar({ name, size = 28 }) {
  const initials = getInitials(name)
  const color = getAvatarColor(name)
  return (
    <div
      className="flex items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: color }}
    >
      {initials}
    </div>
  )
}

const ARROW_ICON = (
  <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
)

function buildUserLabel(user) {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim()
  const base = fullName || user.username || `User ${user.id}`
  return `${base} (${(user.role || 'user').replaceAll('_', ' ')})`
}

function NewDelegationModal({ open, users, actorPermissionKeys, submitting, onSubmit, onClose }) {
  const [delegatorUserId, setDelegatorUserId] = useState('')
  const [delegateUserId, setDelegateUserId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('Vacation cover')
  const [permissionText, setPermissionText] = useState('')

  useEffect(() => {
    if (!open) return
    setDelegatorUserId('')
    setDelegateUserId('')
    setStartDate(new Date().toISOString().slice(0, 10))
    setEndDate(new Date().toISOString().slice(0, 10))
    setReason('Vacation cover')
    setPermissionText(actorPermissionKeys[0] || '')
  }, [open, actorPermissionKeys])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        <div className="border-b border-border px-6 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Leave Delegation</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">New temporary delegation</h2>
          <p className="mt-1 text-sm text-muted-foreground">Delegate access during vacation, sickness, or leave.</p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">From user</label>
              <Select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={delegatorUserId}
                onChange={(e) => setDelegatorUserId(e.target.value)}
              >
                <option value="">Select delegator</option>
                {users.map((item) => <option key={item.id} value={item.id}>{buildUserLabel(item)}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">To user</label>
              <Select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={delegateUserId}
                onChange={(e) => setDelegateUserId(e.target.value)}
              >
                <option value="">Select delegate</option>
                {users.map((item) => <option key={item.id} value={item.id}>{buildUserLabel(item)}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Start date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">End date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reason</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vacation / Sick leave / Project handover" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Permission keys (comma separated)</label>
            <Input
              value={permissionText}
              onChange={(e) => setPermissionText(e.target.value)}
              placeholder="view_own_requests, assign_request"
            />
            <p className="text-xs text-muted-foreground">Tip: use keys delegator is allowed to delegate.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            disabled={!delegatorUserId || !delegateUserId || !startDate || !endDate || !permissionText.trim() || submitting}
            onClick={() =>
              onSubmit({
                delegator_user_id: Number(delegatorUserId),
                delegate_user_id: Number(delegateUserId),
                start_date: startDate,
                end_date: endDate,
                reason,
                permission_keys: permissionText.split(',').map((item) => item.trim()).filter(Boolean),
              })
            }
          >
            {submitting ? 'Saving...' : 'Create delegation'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function DelegationPage() {
  const { user } = useAuth()
  const isSuperAdmin = (user?.role_keys || []).includes('super_admin')
  const scopeLabel = isSuperAdmin ? 'All companies' : (user?.company_name || 'Global')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [rows, setRows] = useState([])
  const [users, setUsers] = useState([])
  const [actorPermissionKeys, setActorPermissionKeys] = useState([])
  const [q, setQ] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const response = await api.get('/admin/users/delegations/')
      const payload = response.data || {}
      setRows(Array.isArray(payload.results) ? payload.results : [])
      setUsers(Array.isArray(payload.user_options) ? payload.user_options : [])
      setActorPermissionKeys(Array.isArray(payload.actor_delegatable_permission_keys) ? payload.actor_delegatable_permission_keys : [])
      setError('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load delegation records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredRows = useMemo(() => {
    const search = q.trim().toLowerCase()
    if (!search) return rows
    return rows.filter((item) => {
      const permissionText = (item.permission_keys || []).join(' ').toLowerCase()
      return (
        (item.delegator_name || '').toLowerCase().includes(search) ||
        (item.delegate_name || '').toLowerCase().includes(search) ||
        permissionText.includes(search) ||
        (item.reason || '').toLowerCase().includes(search)
      )
    })
  }, [q, rows])

  async function createDelegation(payload) {
    setSaving(true)
    setNotice('')
    try {
      await api.post('/admin/users/delegations/', payload)
      setShowModal(false)
      setNotice('Delegation created.')
      await load()
    } catch (err) {
      setNotice(err.response?.data?.detail || 'Could not create delegation.')
    } finally {
      setSaving(false)
    }
  }

  async function revokeDelegation(id) {
    const confirmed = window.confirm('Revoke this delegation now?')
    if (!confirmed) return
    try {
      await api.delete(`/admin/users/delegations/${id}/`)
      setNotice('Delegation revoked.')
      await load()
    } catch (err) {
      setNotice(err.response?.data?.detail || 'Could not revoke delegation.')
    }
  }

  async function createTestDelegation() {
    const fallbackDelegate = users.find((item) => item.id !== user?.id)
    if (!fallbackDelegate || !actorPermissionKeys.length || !user?.id) {
      setNotice('Cannot create test delegation with current data.')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    await createDelegation({
      delegator_user_id: Number(user.id),
      delegate_user_id: Number(fallbackDelegate.id),
      start_date: today,
      end_date: today,
      reason: 'Test leave delegation',
      permission_keys: [actorPermissionKeys[0]],
    })
  }

  if (loading) {
    return (
      <main className="page-content">
        <PageHeader
          eyebrow="Access Control"
          title="Delegation rules"
          description="Temporarily delegate user permissions during leave."
        />
        <div className="py-8 text-center text-muted-foreground">Loading...</div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page-content">
        <PageHeader
          eyebrow="Access Control"
          title="Delegation rules"
          description="Temporarily delegate user permissions during leave."
        />
        <div className="py-8 text-center text-destructive">{error}</div>
      </main>
    )
  }

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Access Control"
        title="Delegation rules"
        description="Delegate access from one user to another for vacation, sickness, or temporary leave."
        actions={
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
              onClick={createTestDelegation}
              disabled={saving}
            >
              Create test delegation
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => setShowModal(true)}
              disabled={saving}
            >
              New rule
            </button>
          </div>
        }
        meta={
          <>
            <span className="status-tag info">{user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'}</span>
            <span className="muted-text">{scopeLabel}</span>
          </>
        }
      />

      {notice && <div className="mb-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{notice}</div>}

      <div className="surface-card mb-4 p-4">
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search by users, permission, or reason..."
            />
          </div>
          <div className="lg:col-span-6 flex items-center justify-end text-xs text-muted-foreground">
            {filteredRows.length} delegation(s)
          </div>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Delegation</th>
                <th className="px-4 py-3 text-left font-medium">Period</th>
                <th className="px-4 py-3 text-left font-medium">Permissions</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No delegations found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={item.delegator_name} size={28} />
                        <span className="text-sm">{item.delegator_name}</span>
                        {ARROW_ICON}
                        <Avatar name={item.delegate_name} size={28} />
                        <span className="text-sm">{item.delegate_name}</span>
                      </div>
                      {item.reason ? <div className="mt-1 text-xs text-muted-foreground">{item.reason}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {item.start_date} to {item.end_date}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {(item.permission_keys || []).length ? item.permission_keys.join(', ') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${item.is_active ? 'bg-success/10 text-success' : item.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${item.is_active ? 'bg-success' : item.status === 'scheduled' ? 'bg-blue-600' : 'bg-muted-foreground'}`} />
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!item.is_revoked ? (
                        <Button variant="outline" size="sm" onClick={() => revokeDelegation(item.id)}>
                          Revoke
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Revoked</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewDelegationModal
        open={showModal}
        users={users}
        actorPermissionKeys={actorPermissionKeys}
        submitting={saving}
        onSubmit={createDelegation}
        onClose={() => setShowModal(false)}
      />
    </main>
  )
}

export default DelegationPage


