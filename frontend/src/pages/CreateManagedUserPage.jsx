import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { Select } from '../components/ui/select'
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
        const defaultRoleKey =
          loaded.role_options?.find((item) => item.key === 'user')?.key ||
          loaded.role_options?.[0]?.key ||
          ''
        setForm((current) => ({
          ...current,
          role_key: defaultRoleKey,
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
      <main className="space-y-6">
        <section className="surface-card p-6">
          <p className="text-sm text-muted-foreground">Loading form...</p>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="space-y-6">
        <section className="surface-card p-6">
          <p className="text-sm font-medium text-destructive">{error}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="User management"
        title="Create user"
        description={subtitle}
      />

      <section className="grid gap-4 xl:grid-cols-12">
        <section className="surface-card p-5 sm:p-6 xl:col-span-8">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Profile</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">User details</h2>
            <p className="mt-1 text-sm text-muted-foreground">Define identity, role, and assignment scope.</p>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-sm font-medium text-foreground">Username</label>
                <input
                  id="username"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="Username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
                <input
                  id="email"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Email"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
                <input
                  id="password"
                  type="password"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Password"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="first_name" className="text-sm font-medium text-foreground">First name</label>
                <input
                  id="first_name"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.first_name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, first_name: event.target.value }))
                  }
                  placeholder="First name"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="last_name" className="text-sm font-medium text-foreground">Last name</label>
                <input
                  id="last_name"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.last_name}
                  onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))}
                  placeholder="Last name"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="role_key" className="text-sm font-medium text-foreground">Role</label>
                <Select
                  id="role_key"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                </Select>
              </div>
            </div>

            {canShowCompany && (
              <div className="space-y-1.5">
                <label htmlFor="company_id" className="text-sm font-medium text-foreground">Company</label>
                <Select
                  id="company_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                </Select>
              </div>
            )}

            {canShowEntity && (
              <div className="space-y-1.5">
                <label htmlFor="entity_id" className="text-sm font-medium text-foreground">Entity</label>
                <Select
                  id="entity_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                </Select>
              </div>
            )}

            {canShowTeamLeader && (
              <div className="space-y-1.5">
                <label htmlFor="team_leader_id" className="text-sm font-medium text-foreground">Team leader</label>
                <Select
                  id="team_leader_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.team_leader_id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, team_leader_id: event.target.value }))
                  }
                >
                  <option value="">Select team leader</option>
                  {filteredTeamLeaders.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {message ? (
              <p className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
                {message}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition hover:bg-muted/60"
                onClick={() => navigate('/admin/users')}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Create user
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4 xl:col-span-4">
          <section className="surface-card p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Guidance</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Assignment rules</h3>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <strong className="text-sm text-foreground">Role first</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose the role before selecting organizational assignments.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <strong className="text-sm text-foreground">Entity mapping</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  Managers, team leaders, and users must be attached to an entity.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <strong className="text-sm text-foreground">Team leader</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  Standard users can optionally be linked to a team leader.
                </p>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  )
}

export default CreateManagedUserPage

