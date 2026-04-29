import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  List,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { Avatar } from '../components/Avatar'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { ENTITY_TYPE_LABELS, getEntityTypeTone } from '../lib/entityTypeTheme'

function EntityTypeBadge({ type }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border border-ink/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${getEntityTypeTone(type, 'solid')}`}
    >
      {ENTITY_TYPE_LABELS[type] || type || '-'}
    </span>
  )
}

function getEntityUserCount(entity) {
  const direct =
    entity?.user_count ??
    entity?.users_count ??
    entity?.total_users ??
    entity?.member_count
  if (Number.isFinite(Number(direct))) return Number(direct)

  const fromLeaders = (entity?.team_leaders || []).reduce(
    (sum, leader) => sum + ((leader?.users || []).length || 0),
    0,
  )

  return fromLeaders
}

function HierarchyPage() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const [expandedManagers, setExpandedManagers] = useState({})
  const [expandedTeamLeaders, setExpandedTeamLeaders] = useState({})
  const [expandedCompanies, setExpandedCompanies] = useState({})
  const [viewMode, setViewMode] = useState('tree')

  const isSuperAdmin = (user?.role_keys || []).includes('super_admin')
  const scopeLabel = isSuperAdmin ? 'Global' : (user?.company_name || 'Global')

  useEffect(() => {
    async function loadHierarchy() {
      try {
        const response = await api.get('/admin/hierarchy/')
        setState({ loading: false, error: '', data: response.data })
      } catch (_err) {
        setState({ loading: false, error: 'Failed to load hierarchy data.', data: null })
      }
    }
    loadHierarchy()
  }, [])

  const companies = state.data?.companies || []
  const entities = state.data?.entities || []
  const managerOptions = state.data?.manager_options || []
  const seniorOptions = state.data?.senior_options || []

  const hierarchyStats = useMemo(() => {
    const totalCompanies = companies.length
    const totalEntities = entities.length
    const totalUsers = entities.reduce((sum, entity) => sum + getEntityUserCount(entity), 0)
    const totalManagers = new Set(
      managerOptions
        .map((manager) => manager.id || manager.user_id || manager.username)
        .filter(Boolean),
    ).size
    return {
      totalCompanies,
      totalEntities,
      totalUsers,
      totalManagers,
    }
  }, [companies, entities, managerOptions])

  const entitiesByCompany = useMemo(() => {
    const map = {}
    companies.forEach((company) => {
      map[company.id] = entities.filter((entity) => entity.company_name === company.name)
    })
    return map
  }, [companies, entities])

  const managersByEntityId = useMemo(() => {
    const map = {}
    managerOptions.forEach((manager) => {
      if (manager.entity_id) {
        map[manager.entity_id] = manager
      }
    })
    return map
  }, [managerOptions])

  const seniorsByCompanyId = useMemo(() => {
    const map = {}
    seniorOptions.forEach((senior) => {
      if (senior.company_id) {
        map[senior.company_id] = senior
      }
    })
    return map
  }, [seniorOptions])

  useEffect(() => {
    if (!companies.length) return
    setExpandedCompanies((current) => {
      const next = { ...current }
      companies.forEach((company) => {
        if (typeof next[company.id] !== 'boolean') {
          next[company.id] = true
        }
      })
      return next
    })
  }, [companies])

  function toggleManager(managerKey) {
    setExpandedManagers((current) => ({ ...current, [managerKey]: !current[managerKey] }))
  }

  function toggleTeamLeader(teamLeaderId) {
    setExpandedTeamLeaders((current) => ({ ...current, [teamLeaderId]: !current[teamLeaderId] }))
  }

  function toggleCompany(companyId) {
    setExpandedCompanies((current) => ({ ...current, [companyId]: !current[companyId] }))
  }

  function expandAllCompanies() {
    const next = {}
    companies.forEach((company) => {
      next[company.id] = true
    })
    setExpandedCompanies(next)
  }

  function collapseAllCompanies() {
    const next = {}
    companies.forEach((company) => {
      next[company.id] = false
    })
    setExpandedCompanies(next)
  }

  if (state.loading) {
    return (
      <main className="page-content">
        <PageHeader
          eyebrow="Organization"
          title="Hierarchy"
          description="Visualize the chain of command from Senior down to individual users."
        />
        <div className="py-8 text-center text-muted-foreground">Loading...</div>
      </main>
    )
  }

  if (state.error) {
    return (
      <main className="page-content">
        <PageHeader
          eyebrow="Organization"
          title="Hierarchy"
          description="Visualize the chain of command from Senior down to individual users."
        />
        <p className="text-destructive">{state.error}</p>
      </main>
    )
  }

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Organization"
        title="Hierarchy"
        description="Visualize the chain of command from Senior down to individual users."
        meta={
          <>
            <span className="status-tag info">{user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'}</span>
            <span className="muted-text">{scopeLabel}</span>
          </>
        }
      />

      <div className="space-y-4">
        <div className="surface-card shadow-none p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-md border border-border bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold transition ${viewMode === 'tree' ? 'bg-primary/90 text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <ChevronDown className="h-4 w-4" />
                Tree view
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold transition ${viewMode === 'list' ? 'bg-primary/90 text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <List className="h-4 w-4" />
                List view
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={expandAllCompanies} className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold hover:bg-muted/50">Expand all</button>
              <button type="button" onClick={collapseAllCompanies} className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold hover:bg-muted/50">Collapse all</button>
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold hover:bg-muted/50">
                <Download className="h-4 w-4" />
                Export
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="surface-card shadow-none p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Total Companies</p>
            <p className="mt-2 text-3xl font-extrabold text-foreground">{hierarchyStats.totalCompanies}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active companies</p>
          </div>
          <div className="surface-card shadow-none p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Total Entities</p>
            <p className="mt-2 text-3xl font-extrabold text-foreground">{hierarchyStats.totalEntities}</p>
            <p className="mt-1 text-xs text-muted-foreground">Across all companies</p>
          </div>
          <div className="surface-card shadow-none p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Total Users</p>
            <p className="mt-2 text-3xl font-extrabold text-foreground">{hierarchyStats.totalUsers}</p>
            <p className="mt-1 text-xs text-muted-foreground">Across all entities</p>
          </div>
          <div className="surface-card shadow-none p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Total Managers</p>
            <p className="mt-2 text-3xl font-extrabold text-foreground">{hierarchyStats.totalManagers}</p>
            <p className="mt-1 text-xs text-muted-foreground">Managing entities</p>
          </div>
        </div>

        {companies.map((company) => {
          const companyEntities = entitiesByCompany[company.id] || []
          const seniorOption = seniorsByCompanyId[company.id]
          const seniorId = company.senior_user_id || seniorOption?.id
          const seniorName =
            company.senior_name ||
            company.senior_username ||
            company.senior ||
            seniorOption?.username ||
            ''
          const companyExpanded = expandedCompanies[company.id] !== false

          return (
            <section key={company.id} className="surface-card shadow-none overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-surface-2 px-5 py-3">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => toggleCompany(company.id)} className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-card text-muted-foreground hover:text-foreground">
                    {companyExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-extrabold">{company.code}</div>
                    <div className="text-xs text-muted-foreground">Code: {company.code} · {companyEntities.length} entities · {companyEntities.reduce((sum, entity) => sum + getEntityUserCount(entity), 0)} users</div>
                  </div>
                </div>
                {seniorName ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 shadow-none">
                    <Avatar name={seniorName} size={24} className="border-2 border-ink" />
                    <div className="text-xs text-muted-foreground">
                      Senior:{' '}
                      {seniorId ? (
                        <Link to={`/admin/users/${seniorId}`} className="font-bold text-primary underline-offset-2 hover:underline">
                          {seniorName}
                        </Link>
                      ) : (
                        <span className="font-bold">{seniorName}</span>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              {companyExpanded ? (
                <div className={`grid gap-3 p-4 ${viewMode === 'list' ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
                  {companyEntities.map((entity) => {
                    const managerName = entity.manager || ''
                    const managerOption = managersByEntityId[entity.id]
                    const leaders = entity.team_leaders || []
                    const managerKey = `entity-${entity.id}-manager`
                    const managerExpanded = Boolean(expandedManagers[managerKey])

                    return (
                      <article key={entity.id} className="rounded-md border border-border bg-card p-3 shadow-none">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-xl font-extrabold">{entity.code}</div>
                            <div className="text-xs text-muted-foreground">{entity.name || 'Operating unit'}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <EntityTypeBadge type={entity.entity_type} />
                            <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="h-3.5 w-3.5" />
                              {getEntityUserCount(entity)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2 text-sm">
                          {managerName ? (
                            <button
                              type="button"
                              onClick={() => toggleManager(managerKey)}
                              className="flex w-full items-center gap-1.5 text-left"
                            >
                              <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${managerExpanded ? 'rotate-90' : ''}`} />
                              <Avatar name={managerName} size={22} className="border-2 border-ink" />
                              <span className="text-xs text-muted-foreground">
                                Manager{' '}
                                {managerOption?.id ? (
                                  <Link to={`/admin/users/${managerOption.id}`} className="font-bold text-primary underline-offset-2 hover:underline">
                                    {managerName}
                                  </Link>
                                ) : (
                                  <span className="font-bold">{managerName}</span>
                                )}
                              </span>
                            </button>
                          ) : null}

                          {managerExpanded ? (
                            leaders.length === 0 ? (
                              <div className="pl-6 text-xs text-muted-foreground">No team leaders assigned.</div>
                            ) : (
                              leaders.map((leader) => (
                                <div key={leader.id} className="pl-4">
                                  <button
                                    type="button"
                                    onClick={() => toggleTeamLeader(leader.id)}
                                    className="flex w-full items-center gap-1.5 text-left"
                                  >
                                    <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${expandedTeamLeaders[leader.id] ? 'rotate-90' : ''}`} />
                                    <Avatar name={leader.username} size={22} className="border-2 border-ink" />
                                    <span className="text-xs text-muted-foreground">
                                      <Link to={`/admin/users/${leader.id}`} className="font-bold text-primary underline-offset-2 hover:underline">
                                        {leader.username}
                                      </Link>
                                      {' '}Team Leader
                                    </span>
                                  </button>
                                  {expandedTeamLeaders[leader.id] ? (
                                    <div className="mt-1 space-y-1 pl-6">
                                      {(leader.users || []).length === 0 ? (
                                        <div className="text-xs text-muted-foreground">No users assigned.</div>
                                      ) : (
                                        leader.users.map((member) => (
                                          <Link
                                            key={member.id}
                                            to={`/admin/users/${member.id}`}
                                            className="block text-xs font-medium text-primary underline-offset-2 hover:underline"
                                          >
                                            {member.username}
                                          </Link>
                                        ))
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              ))
                            )
                          ) : null}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    </main>
  )
}

export default HierarchyPage
