import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
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
      className="flex items-center justify-center rounded-sm border-2 border-ink font-black text-foreground"
      style={{ width: size, height: size, fontSize: size * 0.36, backgroundColor: color }}
    >
      {initials}
    </div>
  )
}

function roleBadgeClass(roleKey) {
  const toneByRole = {
    super_admin: 'bg-rose-600 text-white',
    senior: 'bg-amber-500 text-foreground',
    manager: 'bg-violet-600 text-white',
    team_leader: 'bg-indigo-600 text-white',
    user: 'bg-blue-600 text-white',
  }
  return toneByRole[roleKey] || 'bg-slate-600 text-white'
}

function UsersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const isSuperAdmin = (user?.role_keys || []).includes('super_admin')
  const scopeLabel = isSuperAdmin ? 'All companies' : (user?.company_name || 'Global')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [entities, setEntities] = useState([])
  const [q, setQ] = useState('')
  const [role, setRole] = useState('all')
  const [companyId, setCompanyId] = useState('all')
  const [entityId, setEntityId] = useState('all')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState('')
  const importInputRef = useRef(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [usersRes, optionsRes] = await Promise.all([
          api.get('/admin/users/manageable/'),
          api.get('/admin/users/manageable/options/'),
        ])
        if (!active) return

        const usersData = usersRes.data?.results !== undefined ? usersRes.data.results : usersRes.data
        const optionsData = optionsRes.data || {}
        const companiesData = optionsData.company_options || []
        const entitiesData = optionsData.entity_options || []

        setUsers(Array.isArray(usersData) ? usersData : [])
        setCompanies(Array.isArray(companiesData) ? companiesData : [])
        setEntities(Array.isArray(entitiesData) ? entitiesData : [])
        setError('')
      } catch (err) {
        if (!active) return
        setError(err?.response?.data?.detail || 'Failed to load users.')
        setUsers([])
        setCompanies([])
        setEntities([])
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  async function deleteUser(userId, username) {
    const confirmed = window.confirm(`Delete user "${username || 'this user'}"?`)
    if (!confirmed) return
    try {
      await api.delete(`/admin/users/manageable/${userId}/`)
      setUsers((current) => current.filter((item) => item.id !== userId))
    } catch (err) {
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
        setUsers((current) => {
          const existingIds = new Set(current.map((item) => item.id))
          const additions = created.filter((item) => !existingIds.has(item.id))
          return [...additions, ...current]
        })
      }
    } catch (err) {
      window.alert(err?.response?.data?.detail || 'Could not import users.')
    } finally {
      setImporting(false)
      event.target.value = ''
    }
  }

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase()
    return users.filter((u) => {
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
  }, [users, q, role, companyId, entityId])

  const visibleEntities = useMemo(
    () => entities.filter((item) => companyId === 'all' || Number(item.company_id) === Number(companyId)),
    [entities, companyId],
  )

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
        meta={
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground uppercase tracking-widest font-bold">Scope:</span>
            <span>{isSuperAdmin ? 'manage_users_global' : 'manage_users_entity'}</span>
            <span className="text-muted-foreground uppercase tracking-widest font-bold ml-2">Entity:</span>
            <span>{scopeLabel}</span>
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
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search by name or username..."
                className="h-9"
              />
            </div>
            <Select className="app-select !w-[190px] shrink-0" value={role} onChange={(event) => setRole(event.target.value)}>
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
              }}
            >
              <option value="all">All companies</option>
              {companies.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </Select>
            <Select className="app-select !w-[210px] shrink-0" value={entityId} onChange={(event) => setEntityId(event.target.value)}>
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
                {filtered.map((item) => {
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
                            <span className="inline-flex items-center rounded-sm bg-[#4338CA] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">
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
                            onClick={() => deleteUser(item.id, item.username)}
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
            {!filtered.length && (
              <div className="py-20 text-center space-y-2">
                <p className="text-sm font-medium">No results found</p>
                <p className="text-xs text-muted-foreground">Try adjusting your filters or search terms.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

export default UsersPage
