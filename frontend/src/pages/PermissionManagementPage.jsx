import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

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
  const pageTitle = isSenior
    ? 'Company users'
    : isManager
      ? 'Entity users'
      : isTeamLeader
        ? 'My team users'
        : 'Manageable users'
  const pageSubtitle = isSenior
    ? 'Add, edit, and remove users inside your company.'
    : isManager
      ? 'Manage users assigned to your entity.'
      : isTeamLeader
        ? 'Manage your own team members.'
        : 'Manage users based on your access scope.'
  const showEntityTypeFilter = useMemo(() => {
    return roleKeys.includes('super_admin') || roleKeys.includes('senior')
  }, [roleKeys])
  const showCompanyFilter = isSuperAdmin
  const showEntityFilter = isSenior

  useEffect(() => {
    let active = true
    async function loadUsers() {
      try {
        const usersResponse = await api.get('/admin/users/manageable/')
        if (active) {
          const results = usersResponse.data.results || []
          setState({
            loading: false,
            error: '',
            users: results,
            scope: usersResponse.data.scope || '',
            currentEntityName:
              usersResponse.data.current_entity_name || results[0]?.entity_name || '-',
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
        }
      }
    }
    loadUsers()
    return () => {
      active = false
    }
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
    const uniqueCompanies = new Set()
    state.users.forEach((item) => {
      if (item.company_name) uniqueCompanies.add(item.company_name)
    })
    return ['all', ...Array.from(uniqueCompanies).sort((a, b) => a.localeCompare(b))]
  }, [state.users])

  const entityOptions = useMemo(() => {
    const uniqueEntities = new Set()
    state.users.forEach((item) => {
      if (item.entity_name) uniqueEntities.add(item.entity_name)
    })
    return ['all', ...Array.from(uniqueEntities).sort((a, b) => a.localeCompare(b))]
  }, [state.users])

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return state.users.filter((item) => {
      const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim().toLowerCase()
      const username = (item.username || '').toLowerCase()
      const matchesSearch =
        normalizedSearch.length === 0 ||
        fullName.includes(normalizedSearch) ||
        username.includes(normalizedSearch)

      const matchesRole =
        roleFilter === 'all' || item.roles.some((role) => role.key === roleFilter)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? item.is_active : !item.is_active)
      const matchesEntityType =
        !showEntityTypeFilter || entityTypeFilter === 'all' || item.entity_type === entityTypeFilter
      const matchesCompany =
        !showCompanyFilter || companyFilter === 'all' || item.company_name === companyFilter
      const matchesEntity =
        !showEntityFilter || entityFilter === 'all' || item.entity_name === entityFilter

      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus &&
        matchesEntityType &&
        matchesCompany &&
        matchesEntity
      )
    })
  }, [
    searchText,
    roleFilter,
    statusFilter,
    entityTypeFilter,
    companyFilter,
    entityFilter,
    showEntityTypeFilter,
    showCompanyFilter,
    showEntityFilter,
    state.users,
  ])

  async function deleteUser(event, userId, username) {
    event.stopPropagation()
    const confirmed = window.confirm(`Delete user "${username}"?`)
    if (!confirmed) {
      return
    }
    try {
      await api.delete(`/admin/users/manageable/${userId}/`)
      setState((current) => ({
        ...current,
        users: current.users.filter((item) => item.id !== userId),
      }))
      setActionMessage('User deleted.')
    } catch (error) {
      setActionMessage(error.response?.data?.detail || 'Could not delete user.')
    }
  }

  function openDetailPage(event, userId) {
    event.stopPropagation()
    navigate(`/admin/users/${userId}`)
  }

  async function exportUsers(format) {
    setExporting(format)
    setActionMessage('')
    try {
      const response = await api.get(`/admin/users/manageable/export/?file_format=${format}`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = format === 'xlsx' ? 'users_export.xlsx' : 'users_export.csv'
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
      const response = await api.post('/admin/users/manageable/import/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const data = response.data || {}
      if (data.created_users?.length) {
        setState((current) => {
          const existingIds = new Set(current.users.map((item) => item.id))
          const additions = data.created_users.filter((item) => !existingIds.has(item.id))
          return { ...current, users: [...additions, ...current.users] }
        })
      }
      const summary = `Import done. Created ${data.created_count || 0} user(s). Errors: ${data.error_count || 0}.`
      if (data.error_count) {
        const firstError = data.errors?.[0]
        const errorKey = firstError ? Object.keys(firstError.errors || {})[0] : ''
        const errorText = firstError && errorKey
          ? `${errorKey}: ${Array.isArray(firstError.errors[errorKey]) ? firstError.errors[errorKey][0] : firstError.errors[errorKey]}`
          : 'Check import rows.'
        setActionMessage(`${summary} First error at line ${firstError?.line || '-'} (${errorText})`)
      } else {
        setActionMessage(summary)
      }
    } catch (error) {
      const detail = error.response?.data?.detail
      setActionMessage(typeof detail === 'string' ? detail : 'Could not import users.')
    } finally {
      setImporting(false)
      event.target.value = ''
    }
  }

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Permission management"
        title={pageTitle}
        description={pageSubtitle}
        actions={
          !state.loading && !state.error ? (
            <>
              <Link className="pill-link" to="/admin/users/create">
                Add user
              </Link>
              <button
                type="button"
                className="ghost-button"
                onClick={() => exportUsers('csv')}
                disabled={Boolean(exporting)}
              >
                {exporting === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => exportUsers('xlsx')}
                disabled={Boolean(exporting)}
              >
                {exporting === 'xlsx' ? 'Exporting Excel...' : 'Export Excel'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => importInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? 'Importing...' : 'Import file'}
              </button>
            </>
          ) : null
        }
        meta={
          !state.loading && !state.error ? (
            <>
              <span className="muted-text">Scope: {state.scope || '-'}</span>
              <span className="muted-text">Entity: {state.currentEntityName || '-'}</span>
            </>
          ) : null
        }
      />

      <input
        ref={importInputRef}
        id="import-users-file"
        type="file"
        accept=".csv,.xlsx"
        onChange={importUsers}
        disabled={importing}
        style={{ display: 'none' }}
      />
      {!state.loading && !state.error && actionMessage && (
        <p className={isSuccessMessage ? 'success-text' : 'error-text'}>{actionMessage}</p>
      )}
      {state.loading && <p className="muted-text">Loading users...</p>}
      {state.error && <p className="error-text">{state.error}</p>}

      {!state.loading && !state.error && (
        <section className="table-wrap">
          <div className="card-toolbar">
            <div>
              <p className="eyebrow">Filters</p>
              <h2>User directory</h2>
            </div>
            <span className="muted-text">{filteredUsers.length} result(s)</span>
          </div>
          <div className="filter-bar table-caption">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by name or username"
            />
            <select
              className="app-select"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              {roleOptions.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </select>
            <select
              className="app-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {showEntityTypeFilter ? (
              <>
                <select
                  className="app-select"
                  value={entityTypeFilter}
                  onChange={(event) => setEntityTypeFilter(event.target.value)}
                >
                  <option value="all">All entity types</option>
                  <option value="PROD">Prod</option>
                  <option value="SUPPORT">Support</option>
                  <option value="TDEV">T.Dev</option>
                </select>
                {showCompanyFilter && (
                  <select
                    className="app-select"
                    value={companyFilter}
                    onChange={(event) => setCompanyFilter(event.target.value)}
                  >
                    <option value="all">All companies</option>
                    {companyOptions
                      .filter((item) => item !== 'all')
                      .map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                  </select>
                )}
                {showEntityFilter && (
                  <select
                    className="app-select"
                    value={entityFilter}
                    onChange={(event) => setEntityFilter(event.target.value)}
                  >
                    <option value="all">All entities</option>
                    {entityOptions
                      .filter((item) => item !== 'all')
                      .map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                  </select>
                )}
              </>
            ) : null}
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Scope</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((item) => (
                <tr
                  key={item.id}
                  className={item.can_edit ? 'clickable-row' : 'readonly-row'}
                  onClick={() => navigate(`/admin/users/${item.id}`)}
                >
                  <td>{item.username}</td>
                  <td>{item.roles.map((role) => role.name).join(', ') || 'No roles'}</td>
                  <td>{item.is_active ? 'Active' : 'Inactive'}</td>
                  <td>
                    {item.company_name || '-'} / {item.entity_name || '-'} ({item.entity_type || '-'})
                  </td>
                  <td className="table-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={(event) => openDetailPage(event, item.id)}
                      disabled={!item.can_edit}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={(event) => deleteUser(event, item.id, item.username)}
                      disabled={!item.can_edit}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredUsers.length && <p className="muted-text">No users match the filters.</p>}
        </section>
      )}
    </main>
  )
}

export default PermissionManagementPage
