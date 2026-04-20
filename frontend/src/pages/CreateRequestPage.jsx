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
      <main className="page-content">
        <section className="panel state-card">
          <p className="eyebrow">Access</p>
          <h1 className="empty-state-title">Request creation is unavailable</h1>
          <p className="subtitle">You do not have permission to create requests in your current scope.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Create request"
        title="New request"
        description="Create a request with a clear title, request type, target team, and supporting details."
      />

      <section className="request-create-grid">
        <div className="request-create-main">
          <section className="panel">
            <div className="workspace-section-title">
              <div>
                <p className="eyebrow">Form</p>
                <h2>Request information</h2>
              </div>
            </div>

            <form className="stack-form" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="title">Request title</label>
                <input
                  id="title"
                  placeholder="Enter a short request title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>

              <div className="filter-grid-wide">
                <div>
                  <label htmlFor="type">Request type</label>
                  <select
                    id="type"
                    className="app-select"
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

                <div>
                  {isSuperAdmin ? (
                    <>
                      <label htmlFor="company_id">Company</label>
                      <select
                        id="company_id"
                        className="app-select"
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
                      <label htmlFor="company_name">Company</label>
                      <input id="company_name" value={user.company_name || ''} disabled readOnly />
                    </>
                  ) : (
                    <>
                      <label htmlFor="source_entity">Source entity</label>
                      <input
                        id="source_entity"
                        value={user.source_entity?.label || ''}
                        disabled
                        readOnly
                      />
                    </>
                  )}
                </div>

                {isSuperAdmin || isSenior ? (
                  <div>
                    <label htmlFor="source_entity_id">Source prod entity</label>
                    <select
                      id="source_entity_id"
                      className="app-select"
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

                <div>
                  <label htmlFor="target_team">Target team</label>
                  <select
                    id="target_team"
                    className="app-select"
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

              <div>
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  className="app-textarea"
                  placeholder="Describe the request, expected result, and relevant context"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </div>

              <div className="page-actions">
                <button type="submit" disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit request'}
                </button>
                <button type="button" className="ghost-button" onClick={() => navigate('/requests')}>
                  Cancel
                </button>
              </div>
              {error && <p className="error-text">{error}</p>}
            </form>
          </section>
        </div>

        <aside className="request-create-side">
          <section className="panel">
            <p className="eyebrow">Guidance</p>
            <h3>Submission rules</h3>
            <div className="workspace-list">
              <div className="workspace-list-item">
                <div>
                  <strong>Routing</strong>
                  <p className="muted-text">Only support and development entities are available as targets.</p>
                </div>
              </div>
              <div className="workspace-list-item">
                <div>
                  <strong>Scope</strong>
                  <p className="muted-text">Requests stay scoped to your company and source production entity.</p>
                </div>
              </div>
              <div className="workspace-list-item">
                <div>
                  <strong>Quality</strong>
                  <p className="muted-text">Use clear descriptions so the target team can triage quickly.</p>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  )
}

export default CreateRequestPage
