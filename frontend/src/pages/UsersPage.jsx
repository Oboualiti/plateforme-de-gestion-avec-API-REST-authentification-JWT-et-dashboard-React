import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import PageHeader from '../components/layout/PageHeader'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { useAuth } from '../context/AuthContext'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  senior: 'Senior',
  manager: 'Manager',
  team_leader: 'Team Leader',
  user: 'User',
}

const roles = Object.keys(ROLE_LABELS)

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

function Avatar({ name, size = 32 }) {
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

const CHECK_ICON = (
  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
)

const SEARCH_ICON = (
  <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

const MAIL_ICON = (
  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

function UsersPage() {
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
    async function load() {
      try {
        const [usersRes, optionsRes] = await Promise.all([
          api.get('/admin/users/manageable/'),
          api.get('/admin/users/manageable/options/'),
        ])
        
        const usersData = usersRes.data.results !== undefined ? usersRes.data.results : usersRes.data
        const optionsData = optionsRes.data || {}
        const companiesData = optionsData.company_options || []
        const entitiesData = optionsData.entity_options || []
        
        setUsers(Array.isArray(usersData) ? usersData : [])
        setCompanies(Array.isArray(companiesData) ? companiesData : [])
        setEntities(Array.isArray(entitiesData) ? entitiesData : [])
      } catch (err) {
        console.error('Error loading:', err)
        setError('Failed to load users')
        setUsers([])
        setCompanies([])
        setEntities([])
      } finally {
        setLoading(false)
      }
    }
    load()
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
      const response = await api.post('/admin/users/manageable/import/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      const created = response.data?.created_users || []
      if (created.length) {
        setUsers((current) => {
          const existing = new Set(current.map((item) => item.id))
          const additions = created.filter((item) => !existing.has(item.id))
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

  const filtered = users.filter((u) => {
    if (role !== 'all' && u.role !== role) return false
    if (companyId !== 'all' && Number(u.company_id) !== Number(companyId)) return false
    if (entityId !== 'all' && Number(u.entity_id) !== Number(entityId)) return false
    const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase().trim()
    const email = (u.email || '').toLowerCase()
    const search = q.toLowerCase().trim()
    if (search && !name.includes(search) && !email.includes(search)) return false
    return true
  })

  if (loading) {
    return (
      <main className="page-content">
        <PageHeader
          eyebrow="Access Control"
          title="Users"
          description="Manage all users, their roles, and entity assignments."
        />
        <div className="surface-card mb-4 p-4">
          <div className="grid gap-3 lg:grid-cols-12">
            <Skeleton className="h-10 lg:col-span-5" />
            <Skeleton className="h-10 lg:col-span-3" />
            <Skeleton className="h-10 lg:col-span-2" />
            <Skeleton className="h-10 lg:col-span-2" />
          </div>
        </div>
        <div className="surface-card overflow-hidden p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">User</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Company</th>
                <th className="px-4 py-3 text-left font-medium">Entity</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, index) => (
                <tr key={`user-row-skeleton-${index}`} className="border-b border-border last:border-0">
                  <td className="px-4 py-3"><Skeleton className="h-8 w-44" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-6 w-16" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page-content">
        <PageHeader
          eyebrow="Access Control"
          title="Users"
          description="Manage all users, their roles, and entity assignments."
        />
        <div className="py-8 text-center text-destructive">{error}</div>
      </main>
    )
  }

  if (!users.length) {
    return (
      <main className="page-content">
        <PageHeader
          eyebrow="Access Control"
          title="Users"
          description="Manage all users, their roles, and entity assignments."
        />
        <div className="surface-card p-8 text-center text-muted-foreground">
          No users found.
        </div>
      </main>
    )
  }

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Access Control"
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
          <>
            <span className="status-tag info">{user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'}</span>
            <span className="muted-text">{scopeLabel}</span>
          </>
        }
      />
      <input ref={importInputRef} type="file" accept=".csv,.xlsx" onChange={importUsers} className="hidden" />

      <div className="surface-card mb-4 p-4">
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-5">
            {SEARCH_ICON}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or email…"
              className="w-full rounded-md border border-input bg-background px-4 py-2 pl-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm lg:col-span-3"
          >
            <option value="all">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </Select>
          <Select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value)
              setEntityId('all')
            }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm lg:col-span-2"
          >
            <option value="all">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
            ))}
          </Select>
          <Select
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm lg:col-span-2"
          >
            <option value="all">All entities</option>
            {entities.filter(e => !companyId || companyId === 'all' || e.company_id === Number(companyId)).map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">User</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Company</th>
                <th className="px-4 py-3 text-left font-medium">Entity</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const company = companies.find((c) => Number(c.id) === Number(u.company_id))
                const entity = entities.find((e) => Number(e.id) === Number(u.entity_id))
                const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || 'Unknown'
                const roleLabel = u.role ? ROLE_LABELS[u.role] : 'User'
                return (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={fullName} size={32} />
                        <div>
                          <div className="font-medium">{fullName}</div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {MAIL_ICON}
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{roleLabel}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(company?.name) || (company?.code) || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{entity?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${u.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? 'bg-success' : 'bg-muted-foreground'}`} />
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/admin/users/${u.id}`}
                          className="inline-flex h-8 items-center rounded-md px-2 text-xs hover:bg-muted"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => deleteUser(u.id, fullName)}
                          className="inline-flex h-8 items-center rounded-md px-2 text-xs text-destructive hover:bg-destructive/10"
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
        </div>
      </div>
    </main>
  )
}

export default UsersPage

