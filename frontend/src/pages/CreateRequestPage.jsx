import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const requestTypes = ['INFO', 'SCRIPT', 'TOOL', 'APP_PROJECT']

function CreateRequestPage() {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'INFO',
    target_team: '',
    company_id: '',
    source_entity_id: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [companies, setCompanies] = useState([])
  const [scopeEntities, setScopeEntities] = useState([])
  const [scopeLoading, setScopeLoading] = useState(false)

  const roleKeys = user?.role_keys || []
  const isSuperAdmin = roleKeys.includes('super_admin')
  const isSenior = roleKeys.includes('senior')

  useEffect(() => {
    refreshUser().catch(() => {})
  }, [refreshUser])

  useEffect(() => {
    if (!user) return
    if (!isSuperAdmin && !isSenior) return
    if (isSenior && !user.company) return

    let active = true
    async function bootstrapScope() {
      setScopeLoading(true)
      try {
        if (isSuperAdmin) {
          const companiesResponse = await api.get('/admin/companies/')
          const companiesPayload = companiesResponse.data
          const nextCompanies = Array.isArray(companiesPayload)
            ? companiesPayload
            : companiesPayload?.companies || []
          if (!active) return
          setCompanies(nextCompanies)
        }
      } catch {
        if (!active) return
        setCompanies([])
      } finally {
        if (active) {
          setScopeLoading(false)
        }
      }
    }

    bootstrapScope()
    return () => {
      active = false
    }
  }, [isSenior, isSuperAdmin, user])

  useEffect(() => {
    if (!user) return
    if (!isSuperAdmin && !isSenior) return

    const selectedCompanyId = isSuperAdmin ? Number(form.company_id || 0) : user.company
    if (!selectedCompanyId) {
      setScopeEntities([])
      return
    }

    let active = true
    async function loadEntities() {
      setScopeLoading(true)
      try {
        const response = await api.get('/admin/entities/', {
          params: { company_id: selectedCompanyId },
        })
        const payload = response.data
        const entities = Array.isArray(payload) ? payload : payload?.entities || []
        if (!active) return
        setScopeEntities(entities)
      } catch {
        if (!active) return
        setScopeEntities([])
      } finally {
        if (active) {
          setScopeLoading(false)
        }
      }
    }

    loadEntities()
    return () => {
      active = false
    }
  }, [form.company_id, isSenior, isSuperAdmin, user])

  useEffect(() => {
    if (!isSuperAdmin) return
    setForm((current) => ({ ...current, source_entity_id: '', target_team: '' }))
  }, [form.company_id, isSuperAdmin])

  const sourceEntityOptions = useMemo(
    () => scopeEntities.filter((item) => item.entity_type === 'PROD'),
    [scopeEntities],
  )
  const scopedTargetOptions = useMemo(
    () => scopeEntities.filter((item) => item.entity_type !== 'PROD'),
    [scopeEntities],
  )
  const targetOptions = isSuperAdmin || isSenior ? scopedTargetOptions : user?.available_target_teams || []

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = {
        title: form.title,
        description: form.description,
        type: form.type,
        target_team: Number(form.target_team),
      }
      if (isSuperAdmin) {
        payload.company_id = Number(form.company_id)
        payload.source_entity_id = Number(form.source_entity_id)
      } else if (isSenior) {
        payload.source_entity_id = Number(form.source_entity_id)
      }
      await api.post('/requests/', payload)
      navigate('/requests', { replace: true })
    } catch (nextError) {
      setError(nextError.response?.data?.detail || 'Could not create request.')
    } finally {
      setLoading(false)
    }
  }

  if (!user?.request_creation_allowed) {
    return (
      <main className="space-y-6">
        <section className="surface-card p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Access</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Request creation is unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You do not have permission to create requests in your current scope.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Create request"
        title="New request"
        description="Create a request with a clear title, request type, target team, and supporting details."
      />

      <section className="grid gap-4 xl:grid-cols-12">
        <section className="surface-card p-5 sm:p-6 xl:col-span-8">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Form</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">Request information</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Provide clear routing details so the target team can triage quickly.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="title" className="text-sm font-medium text-foreground">Request title</label>
              <input
                id="title"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Enter a short request title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="type" className="text-sm font-medium text-foreground">Request type</label>
                <select
                  id="type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, type: event.target.value }))
                  }
                >
                  {requestTypes.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                {isSuperAdmin ? (
                  <>
                    <label htmlFor="company_id" className="text-sm font-medium text-foreground">Company</label>
                    <select
                      id="company_id"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                      value={form.company_id}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, company_id: event.target.value }))
                      }
                      disabled={scopeLoading}
                    >
                      <option value="">Select company</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </>
                ) : isSenior ? (
                  <>
                    <label htmlFor="company_name" className="text-sm font-medium text-foreground">Company</label>
                    <input
                      id="company_name"
                      className="flex h-10 w-full rounded-md border border-input bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
                      value={user.company_name || ''}
                      disabled
                      readOnly
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor="source_entity" className="text-sm font-medium text-foreground">Source entity</label>
                    <input
                      id="source_entity"
                      className="flex h-10 w-full rounded-md border border-input bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
                      value={user.source_entity?.label || ''}
                      disabled
                      readOnly
                    />
                  </>
                )}
              </div>

              {isSuperAdmin || isSenior ? (
                <div className="space-y-1.5">
                  <label htmlFor="source_entity_id" className="text-sm font-medium text-foreground">Source prod entity</label>
                  <select
                    id="source_entity_id"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    value={form.source_entity_id}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, source_entity_id: event.target.value }))
                    }
                    disabled={scopeLoading || (isSuperAdmin && !form.company_id)}
                  >
                    <option value="">Select production entity</option>
                    {sourceEntityOptions.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <label htmlFor="target_team" className="text-sm font-medium text-foreground">Target team</label>
                <select
                  id="target_team"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  value={form.target_team}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, target_team: event.target.value }))
                  }
                  disabled={
                    (isSuperAdmin && (!form.company_id || !form.source_entity_id))
                    || (isSenior && !form.source_entity_id)
                    || scopeLoading
                  }
                >
                  <option value="">Select a support or development team</option>
                  {targetOptions.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.label || team.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="description" className="text-sm font-medium text-foreground">Description</label>
              <textarea
                id="description"
                className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Describe the request, expected result, and relevant context"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>

            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition hover:bg-muted/60"
                onClick={() => navigate('/requests')}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Submitting...' : 'Submit request'}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4 xl:col-span-4">
          <section className="surface-card p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Guidance</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Submission rules</h3>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <strong className="text-sm text-foreground">Routing</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  Only support and development entities are available as targets.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <strong className="text-sm text-foreground">Scope</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  Requests stay scoped to your company and source production entity.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <strong className="text-sm text-foreground">Quality</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use clear descriptions so the target team can triage quickly.
                </p>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  )
}

export default CreateRequestPage
