import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, Search, Shield, Users, X } from 'lucide-react'

import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
import { api } from '../lib/api'

const PERMISSION_OPTIONS = [
  { key: 'request.view', label: 'View Requests' },
  { key: 'request.approve', label: 'Approve Completed Result' },
  { key: 'request.assign', label: 'Assign Requests' },
  { key: 'request.update_status', label: 'Update Status' },
  { key: 'request.comment', label: 'Comment' },
  { key: 'request.view_discussion', label: 'View Discussion' },
  { key: 'request.edit_deadline', label: 'Edit Deadline' },
  { key: 'request.invite_members', label: 'Invite Members' },
]
const PERMISSION_LABELS = Object.fromEntries(
  PERMISSION_OPTIONS.map((item) => [item.key, item.label]),
)
const REQUESTS_PER_PAGE = 10
const USER_CONTROLS = [
  { key: 'view_users', label: 'View Users' },
  { key: 'manage_users', label: 'Manage Users' },
  { key: 'permission_management', label: 'Permission Management' },
]
const USERS_PER_PAGE = 10

function chipClass(type, value) {
  const base = 'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider'
  if (type === 'status') {
    if (value === 'NEW') return `${base} border-primary/20 bg-primary/10 text-primary`
    if (value === 'IN_PROGRESS') return `${base} border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400`
    if (value === 'ACCEPTED') return `${base} border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400`
    if (value === 'COMPLETED') return `${base} border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`
    if (value === 'CLOSED') return `${base} border-slate-500/20 bg-slate-500/10 text-slate-500`
  }
  if (value === 'HIGH') return `${base} border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400`
  if (value === 'MEDIUM') return `${base} border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400`
  if (value === 'LOW') return `${base} border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`
  return `${base} border-border bg-muted/30 text-muted-foreground`
}

function RequestListCard({
  title,
  description,
  requests,
  actionLabel,
  onAction,
  emptyText,
  search,
  setSearch,
  status,
  setStatus,
  priority,
  setPriority,
  icon,
  selectedIds,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
  bulkActionLabel,
  onBulkAction,
  page,
  setPage,
  listKey,
  onDropItem,
  onDragStartItem,
  onDragMoveItem,
  onDragEndItem,
  isDragOver,
  onDragOverList,
  draggingItemId,
  draggingFromList,
}) {
  const filtered = useMemo(() => {
    return requests.filter((item) => {
      const searchValue = search.trim().toLowerCase()
      const matchesSearch = !searchValue
        || String(item.reference || '').toLowerCase().includes(searchValue)
        || String(item.title || '').toLowerCase().includes(searchValue)
      const matchesStatus = !status || item.status === status
      const matchesPriority = !priority || item.priority === priority
      return matchesSearch && matchesStatus && matchesPriority
    })
  }, [requests, search, status, priority])

  const totalPages = Math.max(1, Math.ceil(filtered.length / REQUESTS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * REQUESTS_PER_PAGE, safePage * REQUESTS_PER_PAGE)

  return (
    <section
      className={`rounded-md border bg-card p-4 transition-colors ${
        isDragOver ? 'border-primary bg-primary/15' : 'border-border'
      }`}
      onDragOver={(event) => {
        event.preventDefault()
        onDragOverList?.(listKey)
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDropItem?.(listKey)
      }}
    >
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-foreground">
          {requests.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_140px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search requests..."
            className="pl-9"
          />
        </div>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="NEW">New</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="REJECTED">Rejected</option>
          <option value="COMPLETED">Completed</option>
          <option value="CLOSED">Closed</option>
        </Select>
        <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
          <option value="">All priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </Select>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={filtered.length > 0 && filtered.every((item) => selectedIds.includes(item.id))}
            onChange={(event) => onSelectAllVisible(filtered, event.target.checked)}
          />
          <span>Select visible</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{selectedIds.length} selected</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onClearSelection}
            disabled={selectedIds.length === 0}
          >
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={onBulkAction}
            disabled={selectedIds.length === 0}
          >
            {bulkActionLabel}
          </Button>
        </div>
      </div>

      <div className={`mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1 ${isDragOver ? 'rounded-md bg-primary/10 p-1' : ''}`}>
        {paged.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          paged.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => onDragStartItem?.(event, item, listKey)}
              onDrag={(event) => onDragMoveItem?.(event)}
              onDragEnd={() => onDragEndItem?.()}
              className={`flex cursor-grab items-start justify-between gap-3 rounded-md border border-border bg-background p-3 active:cursor-grabbing ${
                draggingItemId === item.id && draggingFromList === listKey ? 'opacity-0' : ''
              }`}
            >
              <div className="flex min-w-0 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => onToggleSelect(item.id)}
                />
                <div className="min-w-0">
                  <div className="font-mono text-xs text-muted-foreground">{item.reference}</div>
                  <div className="truncate text-sm font-medium text-foreground">{item.title || '-'}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={chipClass('status', item.status)}>{item.status}</span>
                    <span className={chipClass('priority', item.priority)}>{item.priority}</span>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onAction(item)}
                aria-label={actionLabel}
              >
                {actionLabel === 'add' ? <Plus className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </Button>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Page {safePage} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={safePage <= 1}
          >
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={safePage >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  )
}

function UserListCard({
  title,
  description,
  users,
  actionLabel,
  onAction,
  emptyText,
  search,
  setSearch,
  role,
  setRole,
  icon,
  selectedIds,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
  bulkActionLabel,
  onBulkAction,
  page,
  setPage,
}) {
  const filtered = useMemo(() => {
    return users.filter((item) => {
      const searchValue = search.trim().toLowerCase()
      const matchesSearch = !searchValue
        || String(item.username || '').toLowerCase().includes(searchValue)
        || String(item.email || '').toLowerCase().includes(searchValue)
      const itemRole = String(item.role || item.role_key || '').toLowerCase()
      const matchesRole = !role || itemRole === role.toLowerCase()
      return matchesSearch && matchesRole
    })
  }, [users, search, role])

  const totalPages = Math.max(1, Math.ceil(filtered.length / USERS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * USERS_PER_PAGE, safePage * USERS_PER_PAGE)

  const roleOptions = useMemo(
    () => Array.from(new Set(users.map((item) => String(item.role || item.role_key || '').toLowerCase()).filter(Boolean))).sort(),
    [users],
  )

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-foreground">
          {users.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users..." className="pl-9" />
        </div>
        <Select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="">All roles</option>
          {roleOptions.map((roleKey) => (
            <option key={roleKey} value={roleKey}>{roleKey}</option>
          ))}
        </Select>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={filtered.length > 0 && filtered.every((item) => selectedIds.includes(item.id))}
            onChange={(event) => onSelectAllVisible(filtered, event.target.checked)}
          />
          <span>Select visible</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{selectedIds.length} selected</span>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onClearSelection} disabled={selectedIds.length === 0}>Clear</Button>
          <Button type="button" size="sm" className="h-7 text-xs" onClick={onBulkAction} disabled={selectedIds.length === 0}>{bulkActionLabel}</Button>
        </div>
      </div>

      <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
        {paged.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          paged.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3">
              <div className="flex min-w-0 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => onToggleSelect(item.id)}
                />
                <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
                  {String(item.username || 'U').charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{item.username}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.email || '-'}</div>
                  <div className="mt-1 inline-flex items-center rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {item.role || item.role_key || 'user'}
                  </div>
                </div>
              </div>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => onAction(item)} aria-label={actionLabel}>
                {actionLabel === 'add' ? <Plus className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Page {safePage} of {totalPages}</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1}>Prev</Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages}>Next</Button>
        </div>
      </div>
    </section>
  )
}

function PermissionControlRequestPermissionsPage() {
  const [mainTab, setMainTab] = useState('requests_access')
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [loadingUserData, setLoadingUserData] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [users, setUsers] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [userPickerOpen, setUserPickerOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [permissionKey, setPermissionKey] = useState('request.view')
  const [availablePermissions, setAvailablePermissions] = useState(['request.view'])

  const [allowedRequests, setAllowedRequests] = useState([])
  const [deniedRequests, setDeniedRequests] = useState([])
  const [initialSnapshot, setInitialSnapshot] = useState({ allowed: [], denied: [] })

  const [allowedSearch, setAllowedSearch] = useState('')
  const [allowedStatus, setAllowedStatus] = useState('')
  const [allowedPriority, setAllowedPriority] = useState('')
  const [deniedSearch, setDeniedSearch] = useState('')
  const [deniedStatus, setDeniedStatus] = useState('')
  const [deniedPriority, setDeniedPriority] = useState('')
  const [selectedAllowedIds, setSelectedAllowedIds] = useState([])
  const [selectedDeniedIds, setSelectedDeniedIds] = useState([])
  const [allowedPage, setAllowedPage] = useState(1)
  const [deniedPage, setDeniedPage] = useState(1)
  const [aiCommand, setAiCommand] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPreview, setAiPreview] = useState(null)
  const [aiPreviewKey, setAiPreviewKey] = useState('')
  const [dragPreview, setDragPreview] = useState(null)
  const [dragOverList, setDragOverList] = useState('')

  const [userControlKey, setUserControlKey] = useState('view_users')
  const [availableUserControls, setAvailableUserControls] = useState(['view_users'])
  const [allowedUsers, setAllowedUsers] = useState([])
  const [deniedUsers, setDeniedUsers] = useState([])
  const [initialUserSnapshot, setInitialUserSnapshot] = useState({ allowed: [], denied: [] })
  const [allowedUserSearch, setAllowedUserSearch] = useState('')
  const [allowedUserRole, setAllowedUserRole] = useState('')
  const [deniedUserSearch, setDeniedUserSearch] = useState('')
  const [deniedUserRole, setDeniedUserRole] = useState('')
  const [selectedAllowedUserIds, setSelectedAllowedUserIds] = useState([])
  const [selectedDeniedUserIds, setSelectedDeniedUserIds] = useState([])
  const [allowedUserPage, setAllowedUserPage] = useState(1)
  const [deniedUserPage, setDeniedUserPage] = useState(1)

  const dirty = useMemo(() => {
    const currentAllowed = allowedRequests.map((item) => item.id).sort((a, b) => a - b)
    const currentDenied = deniedRequests.map((item) => item.id).sort((a, b) => a - b)
    const initialAllowed = [...initialSnapshot.allowed].sort((a, b) => a - b)
    const initialDenied = [...initialSnapshot.denied].sort((a, b) => a - b)
    return JSON.stringify(currentAllowed) !== JSON.stringify(initialAllowed)
      || JSON.stringify(currentDenied) !== JSON.stringify(initialDenied)
  }, [allowedRequests, deniedRequests, initialSnapshot])
  const userDirty = useMemo(() => {
    const currentAllowed = allowedUsers.map((item) => item.id).sort((a, b) => a - b)
    const currentDenied = deniedUsers.map((item) => item.id).sort((a, b) => a - b)
    const initialAllowed = [...initialUserSnapshot.allowed].sort((a, b) => a - b)
    const initialDenied = [...initialUserSnapshot.denied].sort((a, b) => a - b)
    return JSON.stringify(currentAllowed) !== JSON.stringify(initialAllowed)
      || JSON.stringify(currentDenied) !== JSON.stringify(initialDenied)
  }, [allowedUsers, deniedUsers, initialUserSnapshot])

  const selectedUser = useMemo(
    () => users.find((item) => String(item.id) === String(selectedUserId)) || null,
    [users, selectedUserId],
  )
  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase()
    if (!term) return users
    return users.filter((item) =>
      String(item.username || '').toLowerCase().includes(term)
      || String(item.email || '').toLowerCase().includes(term),
    )
  }, [users, userSearch])

  useEffect(() => {
    let active = true
    async function loadUsers() {
      try {
        setLoadingOptions(true)
        setError('')
        const response = await api.get('/admin/users/manageable/', { params: { page_size: 200 } })
        if (!active) return
        const rows = response.data?.results || []
        setUsers(rows)
      } catch (nextError) {
        if (!active) return
        setError(nextError.response?.data?.detail || 'Failed to load users.')
      } finally {
        if (active) setLoadingOptions(false)
      }
    }
    loadUsers()
    return () => {
      active = false
    }
  }, [])

  async function loadPermissionData(userId, selectedPermission) {
    if (!userId || !selectedPermission) return
    try {
      setLoadingData(true)
      setError('')
      setSuccess('')
      const response = await api.get(`/admin/permission-control/request-permissions/${userId}/`, {
        params: { permission_key: selectedPermission },
      })
      const payload = response.data || {}
      const backendPermissions = Array.isArray(payload.available_permissions) && payload.available_permissions.length > 0
        ? payload.available_permissions
        : ['request.view']
      setAvailablePermissions(backendPermissions)
      if (!backendPermissions.includes(selectedPermission)) {
        setPermissionKey(backendPermissions[0])
        return
      }
      const nextAllowed = payload.allowed_requests || []
      const nextDenied = payload.denied_requests || []
      setAllowedRequests(nextAllowed)
      setDeniedRequests(nextDenied)
      setSelectedAllowedIds([])
      setSelectedDeniedIds([])
      setAllowedPage(1)
      setDeniedPage(1)
      setInitialSnapshot({
        allowed: nextAllowed.map((item) => item.id),
        denied: nextDenied.map((item) => item.id),
      })
    } catch (nextError) {
      const backendPermissions = nextError.response?.data?.available_permissions
      if (Array.isArray(backendPermissions) && backendPermissions.length > 0) {
        setAvailablePermissions(backendPermissions)
        if (!backendPermissions.includes(selectedPermission)) {
          setPermissionKey(backendPermissions[0])
          return
        }
      }
      setError(nextError.response?.data?.detail || 'Failed to load request permissions.')
      setAllowedRequests([])
      setDeniedRequests([])
      setSelectedAllowedIds([])
      setSelectedDeniedIds([])
      setAllowedPage(1)
      setDeniedPage(1)
      setInitialSnapshot({ allowed: [], denied: [] })
    } finally {
      setLoadingData(false)
    }
  }

  async function loadUserAccessData(userId, selectedControl) {
    if (!userId || !selectedControl) return
    try {
      setLoadingUserData(true)
      setError('')
      setSuccess('')
      const response = await api.get(`/admin/permission-control/user-access/${userId}/`, {
        params: { control_key: selectedControl },
      })
      const payload = response.data || {}
      const backendControls = Array.isArray(payload.available_controls) && payload.available_controls.length > 0
        ? payload.available_controls
        : ['view_users']
      setAvailableUserControls(backendControls)
      if (!backendControls.includes(selectedControl)) {
        setUserControlKey(backendControls[0])
        return
      }
      const nextAllowed = payload.allowed_users || []
      const nextDenied = payload.denied_users || []
      setAllowedUsers(nextAllowed)
      setDeniedUsers(nextDenied)
      setSelectedAllowedUserIds([])
      setSelectedDeniedUserIds([])
      setAllowedUserPage(1)
      setDeniedUserPage(1)
      setInitialUserSnapshot({
        allowed: nextAllowed.map((item) => item.id),
        denied: nextDenied.map((item) => item.id),
      })
    } catch (nextError) {
      const backendControls = nextError.response?.data?.available_controls
      if (Array.isArray(backendControls) && backendControls.length > 0) {
        setAvailableUserControls(backendControls)
        if (!backendControls.includes(selectedControl)) {
          setUserControlKey(backendControls[0])
          return
        }
      }
      setError(nextError.response?.data?.detail || 'Failed to load user access permissions.')
      setAllowedUsers([])
      setDeniedUsers([])
      setSelectedAllowedUserIds([])
      setSelectedDeniedUserIds([])
      setAllowedUserPage(1)
      setDeniedUserPage(1)
      setInitialUserSnapshot({ allowed: [], denied: [] })
    } finally {
      setLoadingUserData(false)
    }
  }

  useEffect(() => {
    if (!selectedUserId) return
    if (mainTab === 'requests_access') {
      loadPermissionData(selectedUserId, permissionKey)
    } else {
      loadUserAccessData(selectedUserId, userControlKey)
    }
  }, [selectedUserId, permissionKey, userControlKey, mainTab])

  useEffect(() => {
    const beforeUnload = (event) => {
      if (!dirty && !userDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty, userDirty])

  function moveToDenied(item) {
    setAllowedRequests((current) => current.filter((row) => row.id !== item.id))
    setDeniedRequests((current) => [item, ...current.filter((row) => row.id !== item.id)])
    setSelectedAllowedIds((current) => current.filter((id) => id !== item.id))
  }

  function moveToAllowed(item) {
    setDeniedRequests((current) => current.filter((row) => row.id !== item.id))
    setAllowedRequests((current) => [item, ...current.filter((row) => row.id !== item.id)])
    setSelectedDeniedIds((current) => current.filter((id) => id !== item.id))
  }

  function onRequestDragStart(event, item, fromList) {
    if (!item) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(item.id))
    const rect = event.currentTarget?.getBoundingClientRect?.()
    const offsetX = (event.clientX || 0) - (rect?.left || 0)
    const offsetY = (event.clientY || 0) - (rect?.top || 0)
    // Hide native drag image so our custom preview behaves like the grabbed card.
    const transparent = document.createElement('img')
    transparent.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
    event.dataTransfer.setDragImage(transparent, 0, 0)
    setDragPreview({
      item,
      fromList,
      x: event.clientX || 0,
      y: event.clientY || 0,
      offsetX,
      offsetY,
      width: rect?.width || 340,
    })
  }

  function onRequestDragMove(event) {
    if (!dragPreview) return
    if (!event.clientX && !event.clientY) return
    setDragPreview((current) => (current
      ? { ...current, x: event.clientX, y: event.clientY }
      : current))
  }

  function onRequestDragEnd() {
    setDragPreview(null)
    setDragOverList('')
  }

  function onRequestDrop(targetList) {
    if (!dragPreview?.item) {
      setDragOverList('')
      return
    }
    const { item, fromList } = dragPreview
    if (fromList === targetList) {
      setDragPreview(null)
      setDragOverList('')
      return
    }
    if (targetList === 'allowed') moveToAllowed(item)
    if (targetList === 'denied') moveToDenied(item)
    setDragPreview(null)
    setDragOverList('')
  }

  function moveUserToDenied(item) {
    setAllowedUsers((current) => current.filter((row) => row.id !== item.id))
    setDeniedUsers((current) => [item, ...current.filter((row) => row.id !== item.id)])
    setSelectedAllowedUserIds((current) => current.filter((id) => id !== item.id))
  }

  function moveUserToAllowed(item) {
    setDeniedUsers((current) => current.filter((row) => row.id !== item.id))
    setAllowedUsers((current) => [item, ...current.filter((row) => row.id !== item.id)])
    setSelectedDeniedUserIds((current) => current.filter((id) => id !== item.id))
  }

  function toggleAllowedSelected(requestId) {
    setSelectedAllowedIds((current) =>
      current.includes(requestId)
        ? current.filter((id) => id !== requestId)
        : [...current, requestId],
    )
  }

  function toggleDeniedSelected(requestId) {
    setSelectedDeniedIds((current) =>
      current.includes(requestId)
        ? current.filter((id) => id !== requestId)
        : [...current, requestId],
    )
  }

  function toggleAllowedUserSelected(userId) {
    setSelectedAllowedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    )
  }

  function toggleDeniedUserSelected(userId) {
    setSelectedDeniedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    )
  }

  function selectAllAllowedVisible(items, checked) {
    const ids = items.map((item) => item.id)
    setSelectedAllowedIds((current) => {
      if (checked) return Array.from(new Set([...current, ...ids]))
      return current.filter((id) => !ids.includes(id))
    })
  }

  function selectAllDeniedVisible(items, checked) {
    const ids = items.map((item) => item.id)
    setSelectedDeniedIds((current) => {
      if (checked) return Array.from(new Set([...current, ...ids]))
      return current.filter((id) => !ids.includes(id))
    })
  }

  function selectAllAllowedUsersVisible(items, checked) {
    const ids = items.map((item) => item.id)
    setSelectedAllowedUserIds((current) => (checked ? Array.from(new Set([...current, ...ids])) : current.filter((id) => !ids.includes(id))))
  }

  function selectAllDeniedUsersVisible(items, checked) {
    const ids = items.map((item) => item.id)
    setSelectedDeniedUserIds((current) => (checked ? Array.from(new Set([...current, ...ids])) : current.filter((id) => !ids.includes(id))))
  }

  function bulkMoveAllowedToDenied() {
    if (selectedAllowedIds.length === 0) return
    const selectedSet = new Set(selectedAllowedIds)
    const moving = allowedRequests.filter((item) => selectedSet.has(item.id))
    setAllowedRequests((current) => current.filter((item) => !selectedSet.has(item.id)))
    setDeniedRequests((current) => [...moving, ...current.filter((item) => !selectedSet.has(item.id))])
    setSelectedAllowedIds([])
  }

  function bulkMoveDeniedToAllowed() {
    if (selectedDeniedIds.length === 0) return
    const selectedSet = new Set(selectedDeniedIds)
    const moving = deniedRequests.filter((item) => selectedSet.has(item.id))
    setDeniedRequests((current) => current.filter((item) => !selectedSet.has(item.id)))
    setAllowedRequests((current) => [...moving, ...current.filter((item) => !selectedSet.has(item.id))])
    setSelectedDeniedIds([])
  }

  function bulkMoveAllowedUsersToDenied() {
    if (selectedAllowedUserIds.length === 0) return
    const selectedSet = new Set(selectedAllowedUserIds)
    const moving = allowedUsers.filter((item) => selectedSet.has(item.id))
    setAllowedUsers((current) => current.filter((item) => !selectedSet.has(item.id)))
    setDeniedUsers((current) => [...moving, ...current.filter((item) => !selectedSet.has(item.id))])
    setSelectedAllowedUserIds([])
  }

  function bulkMoveDeniedUsersToAllowed() {
    if (selectedDeniedUserIds.length === 0) return
    const selectedSet = new Set(selectedDeniedUserIds)
    const moving = deniedUsers.filter((item) => selectedSet.has(item.id))
    setDeniedUsers((current) => current.filter((item) => !selectedSet.has(item.id)))
    setAllowedUsers((current) => [...moving, ...current.filter((item) => !selectedSet.has(item.id))])
    setSelectedDeniedUserIds([])
  }

  useEffect(() => {
    setAllowedPage(1)
  }, [allowedSearch, allowedStatus, allowedPriority])

  useEffect(() => {
    setDeniedPage(1)
  }, [deniedSearch, deniedStatus, deniedPriority])
  useEffect(() => {
    setAllowedUserPage(1)
  }, [allowedUserSearch, allowedUserRole])
  useEffect(() => {
    setDeniedUserPage(1)
  }, [deniedUserSearch, deniedUserRole])

  async function saveChanges() {
    if (!selectedUserId) return
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      if (mainTab === 'user_management') {
        const currentAllowed = new Set(allowedUsers.map((item) => item.id))
        const currentDenied = new Set(deniedUsers.map((item) => item.id))
        const initialAllowed = new Set(initialUserSnapshot.allowed || [])
        const initialDenied = new Set(initialUserSnapshot.denied || [])
        const grantUserIds = []
        const revokeUserIds = []
        for (const id of currentAllowed) {
          if (!initialAllowed.has(id)) grantUserIds.push(id)
        }
        for (const id of currentDenied) {
          if (!initialDenied.has(id)) revokeUserIds.push(id)
        }
        await api.post(`/admin/permission-control/user-access/${selectedUserId}/`, {
          control_key: userControlKey,
          grant_user_ids: grantUserIds,
          revoke_user_ids: revokeUserIds,
        })
        setInitialUserSnapshot({
          allowed: allowedUsers.map((item) => item.id),
          denied: deniedUsers.map((item) => item.id),
        })
        setSuccess('User access overrides saved successfully.')
        return
      }
      const currentAllowed = new Set(allowedRequests.map((item) => item.id))
      const currentDenied = new Set(deniedRequests.map((item) => item.id))
      const initialAllowed = new Set(initialSnapshot.allowed || [])
      const initialDenied = new Set(initialSnapshot.denied || [])

      const grantRequestIds = []
      const revokeRequestIds = []

      for (const id of currentAllowed) {
        if (!initialAllowed.has(id)) grantRequestIds.push(id)
      }
      for (const id of currentDenied) {
        if (!initialDenied.has(id)) revokeRequestIds.push(id)
      }

      await api.post(`/admin/permission-control/request-permissions/${selectedUserId}/`, {
        permission_key: permissionKey,
        grant_request_ids: grantRequestIds,
        revoke_request_ids: revokeRequestIds,
      })
      setInitialSnapshot({
        allowed: allowedRequests.map((item) => item.id),
        denied: deniedRequests.map((item) => item.id),
      })
      setSuccess('Request permission overrides saved successfully.')
    } catch (nextError) {
      setError(nextError.response?.data?.detail || 'Failed to save request permission overrides.')
    } finally {
      setSaving(false)
    }
  }

  async function runAiAssistant(apply) {
    if (!selectedUserId || !aiCommand.trim()) return
    const requestKey = `${selectedUserId}::${aiCommand.trim()}`
    if (apply && aiPreviewKey !== requestKey) {
      setError('Please click Preview AI first for this exact command before applying.')
      return
    }
    try {
      setAiLoading(true)
      setError('')
      setSuccess('')
      const response = await api.post('/admin/permission-control/request-permissions/ai-assistant/', {
        user_id: Number(selectedUserId),
        command: aiCommand.trim(),
        apply,
      })
      setAiPreview(response.data || null)
      setAiPreviewKey(requestKey)
      if (apply) {
        setSuccess('AI changes applied successfully.')
        await loadPermissionData(selectedUserId, permissionKey)
      }
    } catch (nextError) {
      const detail = nextError.response?.data?.detail
      const debug = nextError.response?.data?.debug_message
      const statusCode = nextError.response?.status
      const fallback = nextError.message || 'AI assistant failed.'
      const composed = [
        detail || fallback,
        debug ? `(${debug})` : '',
        statusCode ? `[HTTP ${statusCode}]` : '',
      ]
        .filter(Boolean)
        .join(' ')
      setError(composed)
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    setAiPreview(null)
    setAiPreviewKey('')
  }, [selectedUserId])

  const selectedPermissionLabel = PERMISSION_LABELS[permissionKey] || permissionKey

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Access Control"
        title="Permission Control Center"
        subtitle="Control request-level permissions for a selected user."
      />

      {(error || success) ? (
        <div className={`rounded-md border px-4 py-3 text-sm ${error ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
          {error || success}
        </div>
      ) : null}

      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted/20 p-1">
          <button
            type="button"
            onClick={() => setMainTab('requests_access')}
            className={`rounded px-3 py-1.5 text-sm font-medium ${mainTab === 'requests_access' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Requests Access
          </button>
          <button
            type="button"
            onClick={() => setMainTab('user_management')}
            className={`rounded px-3 py-1.5 text-sm font-medium ${mainTab === 'user_management' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            User Management
          </button>
        </div>
        {loadingOptions ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserPickerOpen((current) => !current)}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
                >
                  <span className="truncate text-left">
                    {selectedUser
                      ? `${selectedUser.username} (${selectedUser.role || selectedUser.role_key || 'user'})`
                      : 'Select User'}
                  </span>
                  <span className="text-muted-foreground">▾</span>
                </button>
                {userPickerOpen ? (
                  <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-elev-md">
                    <div className="border-b border-border p-2">
                      <Input
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.target.value)}
                        placeholder="Search user by username or email..."
                        className="h-8"
                      />
                    </div>
                    <div className="border-b border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Username
                    </div>
                    {filteredUsers.map((user) => {
                      const active = String(user.id) === String(selectedUserId)
                      const initial = (user.username || 'U').charAt(0).toUpperCase()
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            setSelectedUserId(String(user.id))
                            setUserPickerOpen(false)
                          }}
                          className={`flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left hover:bg-muted/30 ${active ? 'bg-muted/40' : ''}`}
                        >
                          <span className="inline-flex h-7 w-7 items-center justify-center bg-primary text-xs font-bold text-primary-foreground">
                            {initial}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {user.username}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {user.email || '-'}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                    {filteredUsers.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-muted-foreground">No user found.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {mainTab === 'requests_access' ? (
                <Select value={permissionKey} onChange={(event) => setPermissionKey(event.target.value)}>
                  {availablePermissions.map((key) => (
                    <option key={key} value={key}>
                      {(PERMISSION_LABELS[key] || key)} - {key}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="rounded-md border border-input bg-background p-1">
                  <div className="flex flex-wrap items-center gap-1">
                    {availableUserControls.map((key) => {
                      const label = USER_CONTROLS.find((item) => item.key === key)?.label || key
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setUserControlKey(key)}
                          className={`rounded px-3 py-2 text-sm font-medium ${userControlKey === key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <Button
                type="button"
                onClick={saveChanges}
                disabled={
                  (mainTab === 'requests_access' ? !dirty : !userDirty)
                  || saving
                  || (mainTab === 'requests_access' ? loadingData : loadingUserData)
                  || !selectedUserId
                }
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>

              <div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Shield className="h-3.5 w-3.5" /> Request Permission Override
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {mainTab === 'requests_access' ? (
                <>Active permission: <strong>{selectedPermissionLabel}</strong> ({permissionKey})</>
              ) : (
                <>Active user control: <strong>{USER_CONTROLS.find((item) => item.key === userControlKey)?.label || userControlKey}</strong></>
              )}
            </p>
          </>
        )}
      </section>

      {mainTab === 'requests_access' ? (
      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Assistant</h3>
            <p className="text-xs text-muted-foreground">
              Example: deny request.view for REQ-2026-001, REQ-2026-002
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => runAiAssistant(false)}
              disabled={aiLoading || !selectedUserId || !aiCommand.trim()}
            >
              {aiLoading ? 'Working...' : 'Preview AI'}
            </Button>
            <Button
              type="button"
              onClick={() => runAiAssistant(true)}
              disabled={
                aiLoading
                || !selectedUserId
                || !aiCommand.trim()
                || aiPreviewKey !== `${selectedUserId}::${aiCommand.trim()}`
                || !!aiPreview?.intent?.needs_confirmation
              }
            >
              Apply AI
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <Input
            value={aiCommand}
            onChange={(event) => {
              setAiCommand(event.target.value)
              setAiPreviewKey('')
            }}
            placeholder="Tell AI what to allow/deny for this user..."
          />
        </div>
        {aiPreview ? (
          <div className="mt-3 rounded-md border border-border bg-muted/20 p-3 text-xs">
            {aiPreview.multi ? (
              <div>
                Parsed: <strong>{(aiPreview.operations || []).length}</strong> operations
              </div>
            ) : (
              <div>
                Parsed: <strong>{aiPreview.action}</strong> <strong>{aiPreview.permission_key}</strong>
              </div>
            )}
            {aiPreview.intent ? (
              <div className="mt-1">
                Intent confidence: <strong>{Math.round((Number(aiPreview.intent.confidence || 0)) * 100)}%</strong>
                {' | '}Needs confirmation: <strong>{aiPreview.intent.needs_confirmation ? 'YES' : 'NO'}</strong>
              </div>
            ) : null}
            <div className="mt-1">
              Mode: <strong>{aiPreview.selection_mode === 'filters' ? 'Filter-based selection' : 'Reference list'}</strong>
              {aiPreview.selection_mode === 'filters' ? (
                <span>
                  {' '}| Filters:
                  {' '}status=<strong>{aiPreview.resolved_filters?.status || '-'}</strong>,
                  {' '}priority=<strong>{aiPreview.resolved_filters?.priority || '-'}</strong>,
                  {' '}category=<strong>{aiPreview.resolved_filters?.category || '-'}</strong>,
                  {' '}search=<strong>{aiPreview.resolved_filters?.search_text || '-'}</strong>
                </span>
              ) : null}
            </div>
            {(aiPreview.intent?.warnings || []).length ? (
              <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                {(aiPreview.intent.warnings || []).join(' ')}
              </div>
            ) : null}
            <div className="mt-1">
              Matched: <strong>{aiPreview.summary?.matched_count ?? (aiPreview.matched_requests || []).length}</strong>
              {' | '}Will change: <strong>{aiPreview.summary?.will_change_count || 0}</strong>
              {' | '}Unchanged: <strong>{aiPreview.summary?.unchanged_count || 0}</strong>
              {(aiPreview.unmatched_references || []).length ? (
                <span> | Unmatched: {(aiPreview.unmatched_references || []).join(', ')}</span>
              ) : null}
            </div>
            {aiPreview.multi ? (
              <div className="mt-2 space-y-1">
                {(aiPreview.operations || []).map((op, idx) => (
                  <div key={`${op.permission_key}-${idx}`} className="rounded border border-border bg-background px-2 py-1">
                    <strong>{op.action}</strong> <strong>{op.permission_key}</strong> | matched <strong>{op.matched_count}</strong> | will change <strong>{op.will_change_count}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {(aiPreview.change_plan || []).length ? (
              <div className="mt-3 max-h-52 overflow-y-auto rounded-md border border-border bg-background">
                {(aiPreview.change_plan || []).map((item) => (
                  <div key={item.id} className="border-b border-border px-3 py-2 last:border-b-0">
                    <div className="font-mono text-[11px] text-muted-foreground">{item.reference}</div>
                    <div className="truncate text-xs font-medium text-foreground">{item.title}</div>
                    <div className="mt-1 text-[11px]">
                      Current: <strong>{item.current_effective ? 'ALLOW' : 'DENY'}</strong>
                      {' -> '}Target: <strong>{item.target_effective ? 'ALLOW' : 'DENY'}</strong>
                      {' | '}
                      <strong className={item.will_change ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                        {item.will_change ? 'WILL CHANGE' : 'NO CHANGE'}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-2 text-[11px] text-muted-foreground">
              Apply AI is enabled only after preview for the exact current command.
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {mainTab === 'requests_access' ? (loadingData ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <RequestListCard
            title={`Requests WITH ${permissionKey}`}
            description="The selected user has this permission on these requests."
            requests={allowedRequests}
            actionLabel="remove"
            onAction={moveToDenied}
            emptyText="No allowed requests for this permission."
            search={allowedSearch}
            setSearch={setAllowedSearch}
            status={allowedStatus}
            setStatus={setAllowedStatus}
            priority={allowedPriority}
            setPriority={setAllowedPriority}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            selectedIds={selectedAllowedIds}
            onToggleSelect={toggleAllowedSelected}
            onSelectAllVisible={selectAllAllowedVisible}
            onClearSelection={() => setSelectedAllowedIds([])}
            bulkActionLabel="Remove Selected"
            onBulkAction={bulkMoveAllowedToDenied}
            page={allowedPage}
            setPage={setAllowedPage}
            listKey="allowed"
            onDropItem={onRequestDrop}
            onDragStartItem={onRequestDragStart}
            onDragMoveItem={onRequestDragMove}
            onDragEndItem={onRequestDragEnd}
            isDragOver={dragOverList === 'allowed'}
            onDragOverList={setDragOverList}
            draggingItemId={dragPreview?.item?.id || null}
            draggingFromList={dragPreview?.fromList || ''}
          />

          <RequestListCard
            title={`Requests WITHOUT ${permissionKey}`}
            description="The selected user does not have this permission on these requests."
            requests={deniedRequests}
            actionLabel="add"
            onAction={moveToAllowed}
            emptyText="No denied requests for this permission."
            search={deniedSearch}
            setSearch={setDeniedSearch}
            status={deniedStatus}
            setStatus={setDeniedStatus}
            priority={deniedPriority}
            setPriority={setDeniedPriority}
            icon={<X className="h-5 w-5 text-rose-500" />}
            selectedIds={selectedDeniedIds}
            onToggleSelect={toggleDeniedSelected}
            onSelectAllVisible={selectAllDeniedVisible}
            onClearSelection={() => setSelectedDeniedIds([])}
            bulkActionLabel="Add Selected"
            onBulkAction={bulkMoveDeniedToAllowed}
            page={deniedPage}
            setPage={setDeniedPage}
            listKey="denied"
            onDropItem={onRequestDrop}
            onDragStartItem={onRequestDragStart}
            onDragMoveItem={onRequestDragMove}
            onDragEndItem={onRequestDragEnd}
            isDragOver={dragOverList === 'denied'}
            onDragOverList={setDragOverList}
            draggingItemId={dragPreview?.item?.id || null}
            draggingFromList={dragPreview?.fromList || ''}
          />
        </div>
      )) : (loadingUserData ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <UserListCard
            title={`Users WITH ${userControlKey}`}
            description="The selected user has this control on these users."
            users={allowedUsers}
            actionLabel="remove"
            onAction={moveUserToDenied}
            emptyText="No allowed users for this control."
            search={allowedUserSearch}
            setSearch={setAllowedUserSearch}
            role={allowedUserRole}
            setRole={setAllowedUserRole}
            icon={<Users className="h-5 w-5 text-emerald-500" />}
            selectedIds={selectedAllowedUserIds}
            onToggleSelect={toggleAllowedUserSelected}
            onSelectAllVisible={selectAllAllowedUsersVisible}
            onClearSelection={() => setSelectedAllowedUserIds([])}
            bulkActionLabel="Remove Selected"
            onBulkAction={bulkMoveAllowedUsersToDenied}
            page={allowedUserPage}
            setPage={setAllowedUserPage}
          />
          <UserListCard
            title={`Users WITHOUT ${userControlKey}`}
            description="The selected user does not have this control on these users."
            users={deniedUsers}
            actionLabel="add"
            onAction={moveUserToAllowed}
            emptyText="No denied users for this control."
            search={deniedUserSearch}
            setSearch={setDeniedUserSearch}
            role={deniedUserRole}
            setRole={setDeniedUserRole}
            icon={<X className="h-5 w-5 text-rose-500" />}
            selectedIds={selectedDeniedUserIds}
            onToggleSelect={toggleDeniedUserSelected}
            onSelectAllVisible={selectAllDeniedUsersVisible}
            onClearSelection={() => setSelectedDeniedUserIds([])}
            bulkActionLabel="Add Selected"
            onBulkAction={bulkMoveDeniedUsersToAllowed}
            page={deniedUserPage}
            setPage={setDeniedUserPage}
          />
        </div>
      ))}
      {dragPreview?.item ? (
        <div
          className="pointer-events-none fixed z-[70] rounded-md border border-border bg-card/95 p-3 shadow-elev-md backdrop-blur-sm"
          style={{
            left: Math.max(0, dragPreview.x - (dragPreview.offsetX || 0)),
            top: Math.max(0, dragPreview.y - (dragPreview.offsetY || 0)),
            width: dragPreview.width || 340,
          }}
        >
          <div className="font-mono text-xs text-muted-foreground">{dragPreview.item.reference}</div>
          <div className="truncate text-sm font-semibold text-foreground">{dragPreview.item.title || '-'}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={chipClass('status', dragPreview.item.status)}>{dragPreview.item.status}</span>
            <span className={chipClass('priority', dragPreview.item.priority)}>{dragPreview.item.priority}</span>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default PermissionControlRequestPermissionsPage
