import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock3, ShieldCheck, Sparkles, Target, UploadCloud, Workflow } from 'lucide-react'

import PageHeader from '../components/layout/PageHeader'
import { Select } from '../components/ui/select'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const requestTypes = ['INFO', 'SCRIPT', 'TOOL', 'APP_PROJECT', 'OTHER']
const requestPriorities = ['HIGH', 'MEDIUM', 'LOW']

function CreateRequestPage() {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'INFO',
    priority: 'MEDIUM',
    target_team: '',
    company_id: '',
    source_entity_id: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const [companies, setCompanies] = useState([])
  const [scopeEntities, setScopeEntities] = useState([])
  const [scopeLoading, setScopeLoading] = useState(false)
  const [aiImprove, setAiImprove] = useState({
    loading: false,
    error: '',
    result: null,
  })

  const roleKeys = user?.role_keys || []
  const isSuperAdmin = roleKeys.includes('super_admin')
  const isSenior = roleKeys.includes('senior')
  const isNormalUser = roleKeys.includes('user')
  const effectivePermissionKeys = new Set(user?.effective_permission_keys || [])
  const canApproveRequest = effectivePermissionKeys.has('approve_request')

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

  function getTargetLabel(team) {
    const baseLabel = team.label || team.name || `Team ${team.id}`
    return team.entity_type ? ` ${baseLabel} (${team.entity_type}) ` : baseLabel
  }

  async function handleImproveWithAi() {
    if (aiImprove.loading) return
    if (!form.title.trim() && !form.description.trim()) {
      setAiImprove({
        loading: false,
        error: 'Add at least a title or description before running AI improvement.',
        result: null,
      })
      return
    }
    setAiImprove({ loading: true, error: '', result: null })
    try {
      const response = await api.post('/requests/ai/improve/', {
        title: form.title,
        description: form.description,
        type: form.type,
        available_targets: targetOptions.map((team) => ({
          id: team.id,
          label: getTargetLabel(team),
          entity_type: team.entity_type,
        })),
      })
      setAiImprove({
        loading: false,
        error: '',
        result: response.data || null,
      })
    } catch (nextError) {
      setAiImprove({
        loading: false,
        error: nextError.response?.data?.detail || 'Could not improve request text with AI.',
        result: null,
      })
    }
  }

  function applyAllAiSuggestions() {
    if (!aiImprove.result) return
    setForm((current) => ({
      ...current,
      title: aiImprove.result.suggested_title || current.title,
      description: aiImprove.result.improved_description || current.description,
      type: aiImprove.result.suggested_type || current.type,
      target_team: aiImprove.result.suggested_target_team_id
        ? String(aiImprove.result.suggested_target_team_id)
        : current.target_team,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = new FormData()
      payload.append('title', form.title)
      payload.append('description', form.description)
      payload.append('type', form.type)
      payload.append('priority', form.priority)
      payload.append('target_team', String(Number(form.target_team)))
      if (attachment) {
        payload.append('attachment', attachment)
      }
      if (isSuperAdmin) {
        payload.append('company_id', String(Number(form.company_id)))
        payload.append('source_entity_id', String(Number(form.source_entity_id)))
      } else if (isSenior) {
        payload.append('source_entity_id', String(Number(form.source_entity_id)))
      }
      const response = await api.post('/requests/', payload)
      const createdRequestId = response?.data?.id
      const shouldRouteNormalUserToPending = isNormalUser && !canApproveRequest

      if (isNormalUser && canApproveRequest) {
        navigate('/requests?scope=mine', { replace: true })
      } else {
        navigate(shouldRouteNormalUserToPending ? '/pending-requests' : '/requests', { replace: true })
      }
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
    <main className="space-y-5">
      <PageHeader
        eyebrow="Create request"
        title="Create Request"
        description="Route your request to the right support or development team for fast and accurate triage."
      />

      <section className="grid gap-5 xl:grid-cols-12">
        <section className="surface-card border border-border p-5 sm:p-6 xl:col-span-9">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <section className="space-y-3 rounded-lg border border-border bg-muted/10 p-5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  1
                </span>
                <p className="text-base font-semibold text-foreground">Request Details</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-1">
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
                <div className="space-y-1.5">
                  <label htmlFor="type" className="text-sm font-medium text-foreground">Request type</label>
                  <Select
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
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="priority" className="text-sm font-medium text-foreground">Priority</label>
                  <Select
                    id="priority"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.priority}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, priority: event.target.value }))
                    }
                  >
                    {requestPriorities.map((option) => (
                      <option key={option} value={option}>
                        {option.charAt(0) + option.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border bg-muted/10 p-5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  2
                </span>
                <p className="text-base font-semibold text-foreground">Routing</p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  {isSuperAdmin ? (
                    <>
                      <label htmlFor="company_id" className="text-sm font-medium text-foreground">Company</label>
                      <Select
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
                      </Select>
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
                    <Select
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
                    </Select>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label htmlFor="target_team" className="text-sm font-medium text-foreground">Target team</label>
                  <Select
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
                        {getTargetLabel(team)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border bg-muted/10 p-5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  3
                </span>
                <p className="text-base font-semibold text-foreground">Description</p>
              </div>
              <label htmlFor="description" className="text-sm font-medium text-foreground">
                Describe the request, expected result, and relevant context
              </label>
              <textarea
                id="description"
                className="min-h-36 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Describe the request, expected result, and relevant context"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
              <p className="text-right text-xs text-muted-foreground">{form.description.length} / 5000</p>
            </section>

            <section className="space-y-3 rounded-lg border border-border bg-muted/10 p-5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  4
                </span>
                <p className="text-base font-semibold text-foreground">Attachments (optional)</p>
              </div>
              <div className="space-y-2">
                <input
                  id="request-attachment"
                  type="file"
                  className="sr-only"
                  onChange={(event) => setAttachment(event.target.files?.[0] || null)}
                />
                <label
                  htmlFor="request-attachment"
                  className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center transition hover:bg-muted/30"
                >
                  <UploadCloud className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium text-foreground">
                    Drag and drop files here, or <span className="text-primary">browse</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Maximum file size: 25 MB</p>
                </label>
                {attachment ? (
                  <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <span className="truncate pr-2">{attachment.name}</span>
                    <button
                      type="button"
                      className="font-semibold text-foreground hover:underline"
                      onClick={() => setAttachment(null)}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/10 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                <p>AI can improve title and description, suggest type/team, and highlight missing details.</p>
              </div>
              <button
                type="button"
                onClick={handleImproveWithAi}
                disabled={aiImprove.loading}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {aiImprove.loading ? 'Improving...' : 'Improve with AI'}
              </button>
            </div>

            {aiImprove.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {aiImprove.error}
              </p>
            ) : null}

            {aiImprove.result ? (
              <section className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">AI suggestions</h3>
                  <button
                    type="button"
                    onClick={applyAllAiSuggestions}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                  >
                    Apply all
                  </button>
                </div>

                {aiImprove.result.suggested_title ? (
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Suggested title</p>
                    <p className="mt-1 text-sm text-foreground">{aiImprove.result.suggested_title}</p>
                    <button
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, title: aiImprove.result.suggested_title }))}
                      className="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60"
                    >
                      Apply title
                    </button>
                  </div>
                ) : null}

                {aiImprove.result.improved_description ? (
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Improved description</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{aiImprove.result.improved_description}</p>
                    <button
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, description: aiImprove.result.improved_description }))}
                      className="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60"
                    >
                      Apply description
                    </button>
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  {aiImprove.result.suggested_type ? (
                    <div className="rounded-md border border-border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Suggested type</p>
                      <p className="mt-1 text-sm text-foreground">{aiImprove.result.suggested_type}</p>
                      <button
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, type: aiImprove.result.suggested_type }))}
                        className="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60"
                      >
                        Apply type
                      </button>
                    </div>
                  ) : null}

                  {aiImprove.result.suggested_target_team_name ? (
                    <div className="rounded-md border border-border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Suggested target team</p>
                      <p className="mt-1 text-sm text-foreground">{aiImprove.result.suggested_target_team_name}</p>
                      <button
                        type="button"
                        disabled={!aiImprove.result.suggested_target_team_id}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            target_team: String(aiImprove.result.suggested_target_team_id),
                          }))
                        }
                        className="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Apply team
                      </button>
                    </div>
                  ) : null}
                </div>

                {Array.isArray(aiImprove.result.missing_information) && aiImprove.result.missing_information.length > 0 ? (
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Missing information</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-foreground">
                      {aiImprove.result.missing_information.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5">
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

        <aside className="space-y-4 xl:col-span-3 xl:sticky xl:top-6 xl:self-start">
          <section className="surface-card border border-border p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Submission rules</p>
            <p className="mt-2 text-sm text-muted-foreground">Follow these guidelines for faster triage.</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md text-primary">
                    <Workflow className="h-5 w-5" />
                  </span>
                  <div>
                    <strong className="text-sm text-foreground">Routing</strong>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Only support and development entities are available as targets.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md text-primary">
                    <Target className="h-5 w-5" />
                  </span>
                  <div>
                    <strong className="text-sm text-foreground">Scope</strong>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Requests stay scoped to your company and source production entity.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <strong className="text-sm text-foreground">Quality</strong>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Use clear descriptions so the target team can triage quickly.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="surface-card border border-border p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">What helps reviewers</p>
            <ul className="mt-3 space-y-2 text-sm text-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Be clear and concise</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Include expected result</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Add screenshots or logs if relevant</span>
              </li>
            </ul>
          </section>

          <section className="surface-card border border-border p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Triage expectation</p>
            <div className="mt-3 flex items-start gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md text-primary">
                <Clock3 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Average triage: same day</p>
                <p className="mt-1 text-sm text-muted-foreground">During business hours</p>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  )
}

export default CreateRequestPage
