import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  senior: 'Senior',
  manager: 'Manager',
  team_leader: 'Team Leader',
  user: 'User',
}

const roleKeys = Object.keys(ROLE_LABELS)

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

function getAvatarColor(name) {
  const colors = ['#6366F1', '#14B8A6', '#22C55E', '#F59E0B', '#EC4899', '#06B6D4']
  const index = name ? name.charCodeAt(0) % colors.length : 0
  return colors[index]
}

function Avatar({ name, size = 32 }) {
  const initials = getInitials(name)
  const color = getAvatarColor(name)
  return (
    <div
      className="flex items-center justify-center rounded-sm border border-ink/10 font-bold text-foreground"
      style={{ width: size, height: size, fontSize: size * 0.36, backgroundColor: color }}
    >
      {initials}
    </div>
  )
}

function roleBadgeClass(roleKey) {
  const toneByRole = {
    super_admin: 'bg-slate-900 text-slate-50',
    senior: 'bg-slate-700 text-slate-50',
    manager: 'bg-slate-200 text-slate-800 border-slate-300',
    team_leader: 'bg-slate-100 text-slate-600 border-slate-200',
    user: 'bg-muted/30 text-muted-foreground border-transparent',
  }
  return toneByRole[roleKey] || 'bg-slate-500 text-white'
}

function DeleteConfirmModal({ open, username, loading, onCancel, onConfirm }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md border-2 border-destructive/40 shadow-elev-xl animate-in fade-in zoom-in duration-200">
        <CardHeader>
          <div className="inline-flex w-fit items-center rounded-sm border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-destructive">
            Dangerous action
          </div>
          <CardTitle className="mt-2">Remove User</CardTitle>
          <CardDescription>Delete user "{username || 'this user'}"? This action cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? 'Removing...' : 'Remove user'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function UsersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [users, setUsers] = useState([])
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    next: null,
    previous: null,
  })
  const [refreshKey, setRefreshKey] = useState(0)
  const [companies, setCompanies] = useState([])
  const [entities, setEntities] = useState([])
  const [q, setQ] = useState('')
  const [qInput, setQInput] = useState('')
  const [role, setRole] = useState('all')
  const [companyId, setCompanyId] = useState('all')
  const [entityId, setEntityId] = useState('all')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState('')
  const [deleteConfirmState, setDeleteConfirmState] = useState({
    open: false,
    userId: null,
    username: '',
    loading: false,
  })
  const importInputRef = useRef(null)
  const hasLoadedOnceRef = useRef(false)

  function applyLocalFilters(items) {
    const search = q.trim().toLowerCase()
    return (items || []).filter((u) => {
      const primaryRole = u.role || u.roles?.[0]?.key || 'user'
      if (role !== 'all' && primaryRole !== role) return false
      if (companyId !== 'all' && Number(u.company_id) !== Number(companyId)) return false
      if (entityId !== 'all' && Number(u.entity_id) !== Number(entityId)) return false
      if (!search) return true

      const username = (u.username || '').toLowerCase()
      const email = (u.email || '').toLowerCase()
      const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase()
      return username.includes(search) || email.includes(search) || fullName.includes(search)
    })
  }

  useEffect(() => {
    let active = true
    async function loadOptions() {
      try {
        const optionsRes = await api.get('/admin/users/manageable/options/')
        if (!active) return
        const optionsData = optionsRes.data || {}
        const companiesData = optionsData.company_options || []
        const entitiesData = optionsData.entity_options || []

        setCompanies(Array.isArray(companiesData) ? companiesData : [])
        setEntities(Array.isArray(entitiesData) ? entitiesData : [])
      } catch (err) {
        if (!active) return
        setError(err?.response?.data?.detail || 'Failed to load user options.')
        setCompanies([])
        setEntities([])
      }
    }
    loadOptions()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(qInput)
    }, 180)

    return () => {
      window.clearTimeout(timer)
    }
  }, [qInput])

  useEffect(() => {
    let active = true
    async function loadUsers() {
      if (!hasLoadedOnceRef.current) {
        setLoading(true)
      }
      try {
        const params = {
          page: pagination.page,
          page_size: pagination.pageSize,
        }
        if (q.trim()) params.search = q.trim()
        if (role !== 'all') params.role = role
        if (companyId !== 'all') params.company_id = Number(companyId)
        if (entityId !== 'all') params.entity_id = Number(entityId)

        const usersRes = await api.get('/admin/users/manageable/', { params })
        if (!active) return

        const payload = usersRes.data
        if (Array.isArray(payload)) {
          const filteredLocal = applyLocalFilters(payload)
          const start = (pagination.page - 1) * pagination.pageSize
          const end = start + pagination.pageSize
          setUsers(filteredLocal.slice(start, end))
          setPagination((current) => ({
            ...current,
            total: filteredLocal.length,
            next: end < filteredLocal.length ? 'local-next' : null,
            previous: start > 0 ? 'local-prev' : null,
          }))
        } else {
          const usersData = Array.isArray(payload?.results) ? payload.results : []
          const hasServerPagination =
            typeof payload?.count === 'number' ||
            payload?.next !== undefined ||
            payload?.previous !== undefined

          if (hasServerPagination && typeof payload?.count === 'number') {
            setUsers(usersData)
            setPagination((current) => ({
              ...current,
              total: Number(payload.count || 0),
              next: payload?.next || null,
              previous: payload?.previous || null,
            }))
          } else {
            const filteredLocal = applyLocalFilters(usersData)
            const start = (pagination.page - 1) * pagination.pageSize
            const end = start + pagination.pageSize
            setUsers(filteredLocal.slice(start, end))
            setPagination((current) => ({
              ...current,
              total: filteredLocal.length,
              next: end < filteredLocal.length ? 'local-next' : null,
              previous: start > 0 ? 'local-prev' : null,
            }))
          }
        }
        setError('')
      } catch (err) {
        if (!active) return
        setError(err?.response?.data?.detail || 'Failed to load users.')
        setUsers([])
      } finally {
        if (active) {
          setLoading(false)
          hasLoadedOnceRef.current = true
        }
      }
    }
    loadUsers()
    return () => {
      active = false
    }
  }, [pagination.page, pagination.pageSize, q, role, companyId, entityId, refreshKey])

  function openDeleteConfirm(userId, username) {
    setDeleteConfirmState({
      open: true,
      userId,
      username: username || '',
      loading: false,
    })
  }

  function closeDeleteConfirm() {
    if (deleteConfirmState.loading) return
    setDeleteConfirmState({ open: false, userId: null, username: '', loading: false })
  }

  async function confirmDeleteUser() {
    if (!deleteConfirmState.userId || deleteConfirmState.loading) return
    setDeleteConfirmState((current) => ({ ...current, loading: true }))
    try {
      await api.delete(`/admin/users/manageable/${deleteConfirmState.userId}/`)
      setRefreshKey((current) => current + 1)
      setDeleteConfirmState({ open: false, userId: null, username: '', loading: false })
    } catch (err) {
      setDeleteConfirmState((current) => ({ ...current, loading: false }))
      window.alert(err?.response?.data?.detail || 'Could not delete user.')
    }
  }

  async function exportUsers(format) {
    setExporting(format)
    try {
      const response = await api.get(`/admin/users/manageable/export/?file_format=${format}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `users_export_${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      window.alert(err?.response?.data?.detail || 'Could not export users.')
    } finally {
      setExporting('')
    }
  }

  async function importUsers(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/admin/users/manageable/import/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const created = response.data?.created_users || []
      if (created.length) {
        setRefreshKey((current) => current + 1)
      }
    } catch (err) {
      window.alert(err?.response?.data?.detail || 'Could not import users.')
    } finally {
      setImporting(false)
      event.target.value = ''
    }
  }

  const visibleEntities = useMemo(
    () => entities.filter((item) => companyId === 'all' || Number(item.company_id) === Number(companyId)),
    [entities, companyId],
  )
  const visibleUsers = useMemo(() => {
    const search = qInput.trim().toLowerCase()
    if (!search) return users
    return users.filter((item) => {
      const username = (item.username || '').toLowerCase()
      const email = (item.email || '').toLowerCase()
      const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim().toLowerCase()
      return username.includes(search) || email.includes(search) || fullName.includes(search)
    })
  }, [users, qInput])
  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pagination.pageSize))

  if (loading) {
    return (
      <main className="page-content">
        <PageHeader
          eyebrow="Access Control"
          title="Users"
          description="Manage all users, their roles, and entity assignments."
        />
        <div className="surface-card p-4">
          <div className="grid gap-3 lg:grid-cols-12">
            <Skeleton className="h-10 lg:col-span-5" />
            <Skeleton className="h-10 lg:col-span-3" />
            <Skeleton className="h-10 lg:col-span-2" />
            <Skeleton className="h-10 lg:col-span-2" />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Permission management"
        title="Users"
        description="Manage all users, their roles, and entity assignments."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link to="/admin/users/create">Add user</Link>
            </Button>
            <Button variant="outline" onClick={() => exportUsers('csv')} disabled={Boolean(exporting)}>
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={importing}>
              Import
            </Button>
          </div>
        }
      />

      <input ref={importInputRef} type="file" accept=".csv,.xlsx" onChange={importUsers} className="hidden" />

      {error ? (
        <div className="surface-card p-6 text-center text-destructive">{error}</div>
      ) : (
        <div className="surface-card">
          <div className="filter-bar flex-nowrap overflow-x-auto">
            <div className="relative min-w-[280px] flex-1">
              <Input
                value={qInput}
                onChange={(event) => {
                  setQInput(event.target.value)
                  setPagination((current) => ({ ...current, page: 1 }))
                }}
                placeholder="Search by name or username..."
                className="h-9"
              />
            </div>
            <Select className="app-select !w-[190px] shrink-0" value={role} onChange={(event) => {
              setRole(event.target.value)
              setPagination((current) => ({ ...current, page: 1 }))
            }}>
              <option value="all">All roles</option>
              {roleKeys.map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {ROLE_LABELS[roleKey]}
                </option>
              ))}
            </Select>
            <Select
              className="app-select !w-[210px] shrink-0"
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value)
                setEntityId('all')
                setPagination((current) => ({ ...current, page: 1 }))
              }}
            >
              <option value="all">All companies</option>
              {companies.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </Select>
            <Select className="app-select !w-[210px] shrink-0" value={entityId} onChange={(event) => {
              setEntityId(event.target.value)
              setPagination((current) => ({ ...current, page: 1 }))
            }}>
              <option value="all">All entities</option>
              {visibleEntities.map((entity) => (
                <option key={entity.id} value={String(entity.id)}>
                  {entity.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Roles</th>
                  <th>Status</th>
                  <th>Scope</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((item) => {
                  const roleKey = item.role || item.roles?.[0]?.key || 'user'
                  const roleLabel = ROLE_LABELS[roleKey] || roleKey
                  const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.username || 'User'
                  return (
                    <tr key={item.id}>
                      <td className="font-medium cursor-pointer" onClick={() => navigate(`/admin/users/${item.id}`)}>
                        <div className="flex items-center gap-3">
                          <Avatar name={fullName} size={32} />
                          <div>
                            <div>{item.username || '-'}</div>
                            <div className="text-xs text-muted-foreground">{item.email || '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td onClick={() => navigate(`/admin/users/${item.id}`)} className="cursor-pointer">
                        <Badge className={`px-1.5 py-0 text-[10px] ${roleBadgeClass(roleKey)}`}>
                          {roleLabel}
                        </Badge>
                      </td>
                      <td onClick={() => navigate(`/admin/users/${item.id}`)} className="cursor-pointer">
                        <Badge variant={item.is_active ? 'outline' : 'secondary'}>
                          {item.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td onClick={() => navigate(`/admin/users/${item.id}`)} className="cursor-pointer">
                        <div className="text-xs">
                          <div className="mb-1">
                            <span className="inline-flex items-center rounded-sm bg-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                              {item.company_name || '-'}
                            </span>
                          </div>
                          <div className="text-muted-foreground">{item.entity_name || '-'} ({item.entity_type || '-'})</div>
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-4 text-sm font-semibold">
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/users/${item.id}`)}
                            className={`${item.can_edit ? 'text-primary hover:underline' : 'text-muted-foreground cursor-not-allowed'}`}
                            disabled={!item.can_edit}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteConfirm(item.id, item.username)}
                            className={`${item.can_edit ? 'text-destructive hover:underline' : 'text-muted-foreground cursor-not-allowed'}`}
                            disabled={!item.can_edit}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!visibleUsers.length && (
              <div className="py-20 text-center space-y-2">
                <p className="text-sm font-medium">No results found</p>
                <p className="text-xs text-muted-foreground">Try adjusting your filters or search terms.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs">
            <p className="text-muted-foreground">
              Showing page {pagination.page} of {totalPages} ({pagination.total} users)
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!pagination.previous || pagination.page <= 1 || loading}
                onClick={() => setPagination((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!pagination.next || pagination.page >= totalPages || loading}
                onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmModal
        open={deleteConfirmState.open}
        username={deleteConfirmState.username}
        loading={deleteConfirmState.loading}
        onCancel={closeDeleteConfirm}
        onConfirm={confirmDeleteUser}
      />
    </main>
  )
}

export default UsersPage

