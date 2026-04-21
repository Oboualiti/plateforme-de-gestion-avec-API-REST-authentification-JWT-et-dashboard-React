import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'

import PageHeader from '../components/layout/PageHeader'
import { Avatar } from '../components/Avatar'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const ENTITY_TYPE_LABELS = {
  PROD: 'PRODUCTION',
  SUPPORT: 'SUPPORT',
  TDEV: 'DEVELOPMENT',
}

function EntityTypeBadge({ type }) {
  const toneMap = {
    PROD: 'bg-primary text-primary-foreground',
    SUPPORT: 'bg-secondary text-secondary-foreground',
    TDEV: 'bg-success text-success-foreground',
  }

  return (
    <span className={`inline-flex items-center rounded-md border-2 border-ink px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${toneMap[type] || 'bg-muted text-muted-foreground'}`}>
      {ENTITY_TYPE_LABELS[type] || type || '-'}
    </span>
  )
}

function HierarchyPage() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', data: null })

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

  const entitiesByCompany = useMemo(() => {
    const map = {}
    companies.forEach((company) => {
      map[company.id] = entities.filter((entity) => entity.company_name === company.name)
    })
    return map
  }, [companies, entities])

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
          const seniorName = company.senior || ''

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
                      <span className="font-bold">{seniorName}</span>
                      <span className="text-muted-foreground"> - Senior</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {companyEntities.map((entity) => {
                  const managerName = entity.manager || ''
                  const leaders = entity.team_leaders || []
                  const membersCount = leaders.reduce((count, leader) => count + ((leader.users || []).length), 0)

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
                          <div className="flex items-center gap-1.5">
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            <Avatar name={managerName} size={22} className="border-2 border-ink" />
                            <span className="text-xs">
                              <span className="font-bold">{managerName}</span>
                              <span className="text-muted-foreground"> - Manager</span>
                            </span>
                          </div>
                        ) : null}

                        {leaders.map((leader) => (
                          <div key={leader.id} className="flex items-center gap-1.5 pl-4">
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            <Avatar name={leader.username} size={22} className="border-2 border-ink" />
                            <span className="text-xs">
                              <span className="font-bold">{leader.username}</span>
                              <span className="text-muted-foreground"> - Team Leader</span>
                            </span>
                          </div>
                        ))}

                        {membersCount > 0 ? (
                          <div className="pl-8 pt-1 text-xs text-muted-foreground">
                            + {membersCount} member{membersCount === 1 ? '' : 's'}
                          </div>
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
