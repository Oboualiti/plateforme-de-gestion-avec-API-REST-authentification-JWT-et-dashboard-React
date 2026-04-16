import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

function CreateManagedUserPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [options, setOptions] = useState({
    role_options: [],
    company_options: [],
    entity_options: [],
    team_leader_options: [],
  })
  const [form, setForm] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    role_key: '',
    company_id: '',
    entity_id: '',
    team_leader_id: '',
  })
  const [message, setMessage] = useState('')
  const roleKeys = user?.role_keys || []
  const isSenior = roleKeys.includes('senior')
  const isManager = roleKeys.includes('manager')
  const isTeamLeader = roleKeys.includes('team_leader')
  const subtitle = isSenior
    ? 'Create a user inside your company scope.'
    : isManager
      ? 'Create a user for your current entity.'
      : isTeamLeader
        ? 'Create a user inside your own team.'
        : 'Create a managed user.'

  useEffect(() => {
    let active = true
    async function loadOptions() {
      try {
        const response = await api.get('/admin/users/manageable/options/')
        if (!active) {
          return
        }
        const loaded = response.data || {
          role_options: [],
          company_options: [],
          entity_options: [],
          team_leader_options: [],
        }
        setOptions(loaded)
        setForm((current) => ({
          ...current,
          role_key: loaded.role_options?.[0]?.key || '',
          company_id: loaded.company_options?.[0]?.id || '',
          entity_id: '',
        }))
        setLoading(false)
      } catch (nextError) {
        if (active) {
          setError(nextError.response?.data?.detail || 'Could not load form options.')
          setLoading(false)
        }
      }
    }
    loadOptions()
    return () => {
      active = false
    }
  }, [])

  const isSuperAdmin = (user?.role_keys || []).includes('super_admin')
  const canShowCompany = isSuperAdmin
  const canShowEntity = ['manager', 'team_leader', 'user'].includes(form.role_key)
  const canShowTeamLeader = form.role_key === 'user'

  const filteredEntities = useMemo(() => {
    const companyId = Number(form.company_id)
    if (!companyId) {
      return options.entity_options
    }
    return options.entity_options.filter((item) => item.company_id === companyId)
  }, [form.company_id, options.entity_options])

  const filteredTeamLeaders = useMemo(() => {
    if (!canShowTeamLeader) {
      return []
    }
    const companyId = Number(form.company_id)
    const entityId = Number(form.entity_id)
    return options.team_leader_options.filter(
      (item) =>
        (!companyId || item.company_id === companyId) &&
        (!entityId || item.entity_id === entityId),
    )
  }, [canShowTeamLeader, form.company_id, form.entity_id, options.team_leader_options])

  async function onSubmit(event) {
    event.preventDefault()
    setMessage('')
    try {
      const payload = {
        username: form.username,
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        password: form.password,
        role_key: form.role_key,
      }
      if (canShowCompany && form.company_id) {
        payload.company_id = Number(form.company_id)
      }
      if (canShowEntity && form.entity_id) {
        payload.entity_id = Number(form.entity_id)
      }
      if (canShowTeamLeader && form.team_leader_id) {
        payload.team_leader_id = Number(form.team_leader_id)
      }
      await api.post('/admin/users/manageable/', payload)
      setMessage('User created.')
      navigate('/admin/users')
    } catch (nextError) {
      const data = nextError.response?.data
      if (typeof data?.detail === 'string') {
        setMessage(data.detail)
      } else if (data && typeof data === 'object') {
        const key = Object.keys(data)[0]
        const value = data[key]
        setMessage(Array.isArray(value) ? String(value[0]) : String(value))
      } else {
        setMessage('Could not create user.')
      }
    }
  }

  if (loading) {
    return (
      <main className="page-content">
        <section className="panel">
          <p className="muted-text">Loading form...</p>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page-content">
        <section className="panel">
          <p className="error-text">{error}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page-content">
      <section className="panel">
        <p className="eyebrow">User management</p>
        <h1>Create user</h1>
        <p className="muted-text">{subtitle}</p>
        <form className="stack-form" onSubmit={onSubmit}>
          <input
            value={form.username}
            onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
            placeholder="Username"
            required
          />
          <input
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="Email"
          />
          <input
            value={form.first_name}
            onChange={(event) =>
              setForm((current) => ({ ...current, first_name: event.target.value }))
            }
            placeholder="First name"
          />
          <input
            value={form.last_name}
            onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))}
            placeholder="Last name"
          />
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            placeholder="Password (optional)"
          />
          <select
            className="app-select"
            value={form.role_key}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                role_key: event.target.value,
                team_leader_id: '',
              }))
            }
            required
          >
            {options.role_options.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
              </option>
            ))}
          </select>
          {canShowCompany && (
            <select
              className="app-select"
              value={form.company_id}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  company_id: event.target.value,
                  entity_id: '',
                  team_leader_id: '',
                }))
              }
              required
            >
              <option value="">Select company</option>
              {options.company_options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          {canShowEntity && (
            <select
              className="app-select"
              value={form.entity_id}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  entity_id: event.target.value,
                  team_leader_id: '',
                }))
              }
              required
            >
              <option value="">Select entity</option>
              {filteredEntities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          )}
          {canShowTeamLeader && (
            <select
              className="app-select"
              value={form.team_leader_id}
              onChange={(event) =>
                setForm((current) => ({ ...current, team_leader_id: event.target.value }))
              }
            >
              <option value="">Auto / Select TL</option>
              {filteredTeamLeaders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          )}
          <button type="submit">Create user</button>
        </form>
        {message && <p className="muted-text">{message}</p>}
      </section>
    </main>
  )
}

export default CreateManagedUserPage
