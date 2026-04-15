import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../lib/api'

function PermissionManagementPage() {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, error: '', users: [] })

  useEffect(() => {
    let active = true
    async function loadUsers() {
      try {
        const response = await api.get('/admin/users/manageable/')
        if (active) {
          setState({ loading: false, error: '', users: response.data.results })
        }
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            error: error.response?.data?.detail || 'Could not load users.',
            users: [],
          })
        }
      }
    }
    loadUsers()
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="page-content">
      <section className="panel">
        <p className="eyebrow">Permission management</p>
        <h1>Manageable users</h1>
        {state.loading && <p className="muted-text">Loading users...</p>}
        {state.error && <p className="error-text">{state.error}</p>}
        {!state.loading && !state.error && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Current roles</th>
                  <th>Company / Entity</th>
                </tr>
              </thead>
              <tbody>
                {state.users.map((item) => (
                  <tr
                    key={item.id}
                    className="clickable-row"
                    onClick={() => navigate(`/admin/permissions/${item.id}`)}
                  >
                    <td>{item.username}</td>
                    <td>{item.roles.map((role) => role.name).join(', ') || 'No roles'}</td>
                    <td>
                      {item.company_name || '-'} / {item.entity_name || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

export default PermissionManagementPage
