import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

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
  const [actionMessage, setActionMessage] = useState('')
  const isSuccessMessage = actionMessage && !actionMessage.toLowerCase().includes('could not')
  const showEntityTypeFilter = useMemo(() => {
    const roleKeys = user?.role_keys || []
    return roleKeys.includes('super_admin') || roleKeys.includes('senior')
  }, [user])

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

      return matchesSearch && matchesRole && matchesStatus && matchesEntityType
    })
  }, [searchText, roleFilter, statusFilter, entityTypeFilter, showEntityTypeFilter, state.users])

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
    navigate(`/admin/permissions/${userId}`)
  }

  return (
    <main className="page-content">
      <section className="panel">
        <p className="eyebrow">Permission management</p>
        <h1>Manageable users</h1>
        {!state.loading && !state.error && (
          <p className="muted-text">
            Scope: {state.scope || '-'} | Entity: {state.currentEntityName || '-'}
          </p>
        )}
        {!state.loading && !state.error && (
          <div className="filter-bar">
            <Link className="pill-link" to="/admin/users/create">
              Add user
            </Link>
          </div>
        )}
        {!state.loading && !state.error && actionMessage && (
          <p className={isSuccessMessage ? 'success-text' : 'error-text'}>{actionMessage}</p>
        )}
        {state.loading && <p className="muted-text">Loading users...</p>}
        {state.error && <p className="error-text">{state.error}</p>}
        {!state.loading && !state.error && (
          <div className="table-wrap">
            <div className="filter-bar">
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search by first or last name"
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
              {showEntityTypeFilter && (
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
              )}
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Current roles</th>
                  <th>Status</th>
                  <th>Company / Entity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((item) => (
                  <tr
                    key={item.id}
                    className={item.can_edit ? 'clickable-row' : 'readonly-row'}
                    onClick={() => navigate(`/admin/permissions/${item.id}`)}
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
          </div>
        )}
      </section>
    </main>
  )
}

export default PermissionManagementPage
