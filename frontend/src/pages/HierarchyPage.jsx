import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { Avatar } from '../components/Avatar'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { ENTITY_TYPE_LABELS, getEntityTypeTone } from '../lib/entityTypeTheme'

function EntityTypeBadge({ type }) {
  return (
    <span className={`inline-flex items-center rounded-md border-2 border-ink px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${getEntityTypeTone(type, 'solid')}`}>
      {ENTITY_TYPE_LABELS[type] || type || '-'}
    </span>
  )
}

function HierarchyPage() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const [expandedManagers, setExpandedManagers] = useState({})
  const [expandedTeamLeaders, setExpandedTeamLeaders] = useState({})

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

  function toggleManager(managerKey) {
    setExpandedManagers((current) => ({ ...current, [managerKey]: !current[managerKey] }))
  }

  function toggleTeamLeader(teamLeaderId) {
    setExpandedTeamLeaders((current) => ({ ...current, [teamLeaderId]: !current[teamLeaderId] }))
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
        {companies.map((company) => {
          const companyEntities = entitiesByCompany[company.id] || []
          const seniorOption = seniorsByCompanyId[company.id]
          const seniorId = seniorOption?.id
          const seniorName = seniorOption?.username || company.senior || ''

          return (
            <section key={company.id} className="surface-card overflow-hidden">
              <div className="flex items-center justify-between border-b-2 border-ink bg-surface-2 px-5 py-3">
                <div>
                  <div className="text-base font-extrabold">{company.code} - {company.name}</div>
                  <div className="text-xs text-muted-foreground">{companyEntities.length} entities</div>
                </div>
                {seniorName ? (
                  <div className="flex items-center gap-2 rounded-md border-2 border-ink bg-card px-3 py-1.5 shadow-elev-sm">
                    <Avatar name={seniorName} size={24} className="border-2 border-ink" />
                    <div className="text-xs">
                      {seniorId ? (
                        <Link to={`/admin/users/${seniorId}`} className="font-bold text-primary underline-offset-2 hover:underline">
                          {seniorName}
                        </Link>
                      ) : (
                        <span className="font-bold">{seniorName}</span>
                      )}
                      <span className="text-muted-foreground"> - Senior</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {companyEntities.map((entity) => {
                  const managerName = entity.manager || ''
                  const managerOption = managersByEntityId[entity.id]
                  const leaders = entity.team_leaders || []
                  const managerKey = `entity-${entity.id}-manager`
                  const managerExpanded = Boolean(expandedManagers[managerKey])

                  return (
                    <article key={entity.id} className="rounded-md border-2 border-ink bg-card p-3 shadow-elev-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-mono text-xs font-bold">{entity.code}</div>
                          <div className="text-xs text-muted-foreground">{entity.name}</div>
                        </div>
                        <EntityTypeBadge type={entity.entity_type} />
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
                            <span className="text-xs">
                              {managerOption?.id ? (
                                <Link to={`/admin/users/${managerOption.id}`} className="font-bold text-primary underline-offset-2 hover:underline">
                                  {managerName}
                                </Link>
                              ) : (
                                <span className="font-bold">{managerName}</span>
                              )}
                              <span className="text-muted-foreground"> - Manager</span>
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
                                  <span className="text-xs">
                                    <Link to={`/admin/users/${leader.id}`} className="font-bold text-primary underline-offset-2 hover:underline">
                                      {leader.username}
                                    </Link>
                                    <span className="text-muted-foreground"> - Team Leader</span>
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
            </section>
          )
        })}
      </div>
    </main>
  )
}

export default HierarchyPage
