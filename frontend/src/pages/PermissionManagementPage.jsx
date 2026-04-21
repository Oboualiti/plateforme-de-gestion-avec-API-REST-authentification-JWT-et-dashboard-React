import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Badge } from '../components/ui/badge'

function PermissionManagementPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [state, setState] = useState({
    loading: true,
    error: '',
    users: [],
    scope: '',
    currentEntityName: '',
  })
  const [directoryOptions, setDirectoryOptions] = useState({
    companies: [],
    entities: [],
  })
  const [searchText, setSearchText] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [entityTypeFilter, setEntityTypeFilter] = useState('all')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [actionMessage, setActionMessage] = useState('')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState('')
  const importInputRef = useRef(null)
  
  const isSuccessMessage = actionMessage && !actionMessage.toLowerCase().includes('could not')
  const roleKeys = user?.role_keys || []
  const isSenior = roleKeys.includes('senior')
  const isSuperAdmin = roleKeys.includes('super_admin')
  const isManager = roleKeys.includes('manager')
  const isTeamLeader = roleKeys.includes('team_leader')
  
  const pageTitle = isSenior ? 'Company users' : isManager ? 'Entity users' : isTeamLeader ? 'My team users' : 'Manageable users'
  const pageSubtitle = isSenior ? 'Add, edit, and remove users inside your company.' : isManager ? 'Manage users assigned to your entity.' : isTeamLeader ? 'Manage your own team members.' : 'Manage users based on your access scope.'

  const showEntityTypeFilter = isSuperAdmin || isSenior
  const showCompanyFilter = isSuperAdmin
  const showEntityFilter = isSenior || isSuperAdmin

  useEffect(() => {
    let active = true
    async function loadUsers() {
      try {
        const [usersResponse, optionsResponse] = await Promise.all([
          api.get('/admin/users/manageable/'),
          api.get('/admin/users/manageable/options/'),
        ])
        if (active) {
          const results = usersResponse.data.results || []
          const optionsPayload = optionsResponse.data || {}
          setState({
            loading: false,
            error: '',
            users: results,
            scope: usersResponse.data.scope || '',
            currentEntityName: usersResponse.data.current_entity_name || results[0]?.entity_name || '-',
          })
          setDirectoryOptions({
            companies: optionsPayload.company_options || optionsPayload.companies || [],
            entities: optionsPayload.entity_options || optionsPayload.entities || [],
          })
        }
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error.response?.data?.detail || 'Could not load users.',
            users: [],
            scope: '',
            currentEntityName: '',
          })
          setDirectoryOptions({ companies: [], entities: [] })
        }
      }
    }
    loadUsers()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const message = location.state?.successMessage
    if (message) {
      setActionMessage(message)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.pathname, location.state, navigate])

  const roleOptions = useMemo(() => {
    const uniqueRoles = new Set()
    state.users.forEach((item) => item.roles.forEach((role) => uniqueRoles.add(role.key)))
    return [{ key: 'all', name: 'All roles' }].concat(
      Array.from(uniqueRoles).map((key) => ({
        key,
        name: key.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      })),
    )
  }, [state.users])

  const companyOptions = useMemo(() => {
    const fromOptions = (directoryOptions.companies || [])
      .map((item) => ({
        id: item?.id ?? item?.company_id ?? item?.company?.id ?? null,
        name: item?.name ?? item?.company_name ?? item?.company?.name ?? '',
        code: item?.code ?? item?.company_code ?? item?.company?.code ?? '',
      }))
    const fromUsers = (state.users || [])
      .filter((item) => item?.company_id || item?.company_name)
      .map((item) => ({
        id: item?.company_id ?? null,
        name: item?.company_name ?? '',
        code: item?.company_code ?? '',
      }))
    const merged = [...fromOptions, ...fromUsers]
    const deduped = Array.from(
      new Map(
        merged
          .filter((item) => item?.id || item?.name)
          .map((item) => [String(item.id ?? `${item.name}|${item.code}`), item]),
      ).values(),
    )
    return deduped
      .filter((item) => item?.id && item?.name)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [directoryOptions.companies, state.users])

  const entityOptions = useMemo(() => {
    const selectedCompany = companyOptions.find(
      (item) =>
        String(item.id) === String(companyFilter) ||
        item.name === companyFilter ||
        item.code === companyFilter,
    )
    const selectedCompanyName = (selectedCompany?.name || '').trim().toLowerCase()
    const selectedCompanyCode = (selectedCompany?.code || '').trim().toLowerCase()
    const selectedCompanyId = selectedCompany?.id ?? companyFilter

    const userMatchesSelectedCompany = (userItem) => {
      if (companyFilter === 'all') return true
      const userCompanyId = userItem?.company_id
      const userCompanyName = (userItem?.company_name || '').trim().toLowerCase()
      const userCompanyCode = (userItem?.company_code || '').trim().toLowerCase()
      if (String(userCompanyId) === String(selectedCompanyId)) return true
      if (selectedCompanyName && userCompanyName === selectedCompanyName) return true
      if (selectedCompanyCode && userCompanyCode === selectedCompanyCode) return true
      return false
    }

    const normalizedOptions = (directoryOptions.entities || []).map((item) => ({
      id: item?.id ?? item?.entity_id ?? null,
      name: item?.name ?? item?.entity_name ?? '',
      company_id: item?.company_id ?? item?.company?.id ?? null,
      company_name: item?.company_name ?? item?.company?.name ?? '',
      company_code: item?.company_code ?? item?.company?.code ?? '',
    }))
    const fallbackFromUsers = state.users
      .filter((item) => item?.entity_id)
      .filter(userMatchesSelectedCompany)
      .map((item) => ({
        id: item.entity_id,
        name: item.entity_name || `Entity ${item.entity_id}`,
        company_id: item.company_id ?? null,
        company_name: item.company_name ?? '',
        company_code: item.company_code ?? '',
      }))
    const filteredOptions = normalizedOptions.filter((item) => {
      if (companyFilter === 'all') return true
      if (item.company_id !== null && item.company_id !== undefined && item.company_id !== '') {
        return String(item.company_id) === String(selectedCompanyId)
      }
      const itemCompanyName = (item.company_name || '').trim().toLowerCase()
      const itemCompanyCode = (item.company_code || '').trim().toLowerCase()
      if (selectedCompanyName && itemCompanyName === selectedCompanyName) return true
      if (selectedCompanyCode && itemCompanyCode === selectedCompanyCode) return true
      return false
    })
    const sourceOptions = [...filteredOptions, ...fallbackFromUsers]
    const dedupedMap = new Map()
    sourceOptions.forEach((item) => {
      const key = String(item.id)
      const existing = dedupedMap.get(key)
      if (!existing) {
        dedupedMap.set(key, item)
        return
      }
      const existingHasCompany = existing.company_id !== null && existing.company_id !== undefined && existing.company_id !== ''
      const currentHasCompany = item.company_id !== null && item.company_id !== undefined && item.company_id !== ''
      if (!existingHasCompany && currentHasCompany) {
        dedupedMap.set(key, item)
      }
    })
    return Array.from(dedupedMap.values())
      .filter((item) => item?.id)
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [companyFilter, companyOptions, directoryOptions.entities, state.users])

  const usersForEntityOptions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return state.users.filter((item) => {
      const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim().toLowerCase()
      const username = (item.username || '').toLowerCase()
      const matchesSearch = normalizedSearch.length === 0 || fullName.includes(normalizedSearch) || username.includes(normalizedSearch)
      const matchesRole = roleFilter === 'all' || item.roles.some((role) => role.key === roleFilter)
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? item.is_active : !item.is_active)
      const matchesEntityType = !showEntityTypeFilter || entityTypeFilter === 'all' || item.entity_type === entityTypeFilter
      const matchesCompany =
        !showCompanyFilter ||
        companyFilter === 'all' ||
        String(item.company_id ?? item.company?.id ?? '') === String(companyFilter) ||
        (item.company_name || '').trim().toLowerCase() ===
          (companyOptions.find((c) => String(c.id) === String(companyFilter))?.name || '').trim().toLowerCase()
      return matchesSearch && matchesRole && matchesStatus && matchesEntityType && matchesCompany
    })
  }, [
    searchText,
    roleFilter,
    statusFilter,
    entityTypeFilter,
    companyFilter,
    showEntityTypeFilter,
    showCompanyFilter,
    state.users,
    companyOptions,
  ])

  const effectiveEntityOptions = useMemo(() => {
    const fromVisibleUsers = usersForEntityOptions
      .filter((item) => item?.entity_id)
      .map((item) => ({
        id: item.entity_id,
        name: item.entity_name || `Entity ${item.entity_id}`,
      }))
    const base = fromVisibleUsers.length ? fromVisibleUsers : entityOptions
    return Array.from(new Map(base.map((item) => [String(item.id), item])).values())
      .filter((item) => item?.id)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [usersForEntityOptions, entityOptions])

  useEffect(() => {
    setEntityFilter('all')
  }, [companyFilter])

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return state.users.filter((item) => {
      const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim().toLowerCase()
      const username = (item.username || '').toLowerCase()
      const matchesSearch = normalizedSearch.length === 0 || fullName.includes(normalizedSearch) || username.includes(normalizedSearch)
      const matchesRole = roleFilter === 'all' || item.roles.some((role) => role.key === roleFilter)
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? item.is_active : !item.is_active)
      const matchesEntityType = !showEntityTypeFilter || entityTypeFilter === 'all' || item.entity_type === entityTypeFilter
      const matchesCompany =
        !showCompanyFilter ||
        companyFilter === 'all' ||
        String(item.company_id ?? item.company?.id ?? '') === String(companyFilter)
      const matchesEntity =
        !showEntityFilter ||
        entityFilter === 'all' ||
        String(item.entity_id ?? item.entity?.id ?? '') === String(entityFilter)
      return matchesSearch && matchesRole && matchesStatus && matchesEntityType && matchesCompany && matchesEntity
    })
  }, [searchText, roleFilter, statusFilter, entityTypeFilter, companyFilter, entityFilter, showEntityTypeFilter, showCompanyFilter, showEntityFilter, state.users])

  async function deleteUser(event, userId, username) {
    event.stopPropagation()
    const confirmed = window.confirm(`Delete user "${username}"?`)
    if (!confirmed) return
    try {
      await api.delete(`/admin/users/manageable/${userId}/`)
      setState((current) => ({ ...current, users: current.users.filter((item) => item.id !== userId) }))
      setActionMessage('User deleted.')
    } catch (error) {
      setActionMessage(error.response?.data?.detail || 'Could not delete user.')
    }
  }

  async function exportUsers(format) {
    setExporting(format)
    setActionMessage('')
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
      setActionMessage(`Users exported as ${format.toUpperCase()}.`)
    } catch (error) {
      setActionMessage(error.response?.data?.detail || 'Could not export users.')
    } finally {
      setExporting('')
    }
  }

  async function importUsers(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setImporting(true)
    setActionMessage('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/admin/users/manageable/import/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      const data = response.data || {}
      if (data.created_users?.length) {
        setState((current) => {
          const existingIds = new Set(current.users.map((item) => item.id))
          const additions = data.created_users.filter((item) => !existingIds.has(item.id))
          return { ...current, users: [...additions, ...current.users] }
        })
      }
      setActionMessage(`Import done. Created ${data.created_count || 0} user(s). Errors: ${data.error_count || 0}.`)
    } catch (error) {
      setActionMessage('Could not import users.')
    } finally {
      setImporting(false)
      event.target.value = ''
    }
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Permission management"
        title={pageTitle}
        description={pageSubtitle}
        actions={
          <div className="flex gap-2">
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
            <span>{state.scope || '-'}</span>
            <span className="text-muted-foreground uppercase tracking-widest font-bold ml-2">Entity:</span>
            <span>{state.currentEntityName || '-'}</span>
          </div>
        }
      />

      <input ref={importInputRef} type="file" accept=".csv,.xlsx" onChange={importUsers} className="hidden" />

      {actionMessage && (
        <Card className={isSuccessMessage ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"}>
          <CardContent className="py-3 text-sm font-medium flex items-center gap-2">
            <span className={isSuccessMessage ? "text-success" : "text-destructive"}>
              {actionMessage}
            </span>
          </CardContent>
        </Card>
      )}

      <Card className="surface-card">
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[240px]">
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by name or username..."
              className="h-9"
            />
          </div>
          <Select className="app-select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            {roleOptions.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
          </Select>
          <Select className="app-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          {showEntityTypeFilter && (
            <Select className="app-select" value={entityTypeFilter} onChange={(event) => setEntityTypeFilter(event.target.value)}>
              <option value="all">All types</option>
              {['PROD', 'SUPPORT', 'TDEV'].map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          )}
          {showCompanyFilter && (
            <select className="app-select" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="all">All companies</option>
              {companyOptions.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.name}{item.code ? ` (${item.code})` : ''}
                </option>
              ))}
            </select>
          )}
          {showEntityFilter && (
            <select className="app-select" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
              <option value="all">All entities</option>
              {effectiveEntityOptions.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
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
              {filteredUsers.map((item) => (
                <tr key={item.id} className="cursor-pointer">
                  <td className="font-medium" onClick={() => navigate(`/admin/users/${item.id}`)}>{item.username}</td>
                  <td onClick={() => navigate(`/admin/users/${item.id}`)}>
                    <div className="flex flex-wrap gap-1">
                      {item.roles.length > 0 ? item.roles.map(r => (
                        <Badge key={r.key} variant="secondary" className="px-1.5 py-0 text-[10px] uppercase font-bold">
                          {r.name}
                        </Badge>
                      )) : <span className="text-xs text-muted-foreground italic">No roles</span>}
                    </div>
                  </td>
                  <td onClick={() => navigate(`/admin/users/${item.id}`)}>
                    <Badge variant={item.is_active ? "success" : "secondary"}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td onClick={() => navigate(`/admin/users/${item.id}`)}>
                    <div className="text-xs">
                      <div className="font-medium">{item.company_name || '-'}</div>
                      <div className="text-muted-foreground">{item.entity_name || '-'} ({item.entity_type || '-'})</div>
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/admin/users/${item.id}`) }} disabled={!item.can_edit}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => deleteUser(e, item.id, item.username)} disabled={!item.can_edit}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredUsers.length && !state.loading && (
            <div className="py-20 text-center space-y-2">
              <p className="text-sm font-medium">No results found</p>
              <p className="text-xs text-muted-foreground">Try adjusting your filters or search terms.</p>
            </div>
          )}
          {state.loading && <div className="py-20 text-center text-sm muted-text">Loading directory...</div>}
        </div>
      </Card>
    </main>
  )
}

export default PermissionManagementPage


