import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'

const ROLE_LABELS = {
  senior: 'Senior',
  manager: 'Manager',
  team_leader: 'Team Leader',
  user: 'User',
}

const ENTITY_TYPE_LABELS = {
  PROD: 'Production',
  SUPPORT: 'Support',
  TDEV: 'Technical Development',
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

function getAvatarColor(name) {
  const colors = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']
  const index = name ? name.charCodeAt(0) % colors.length : 0
  return colors[index]
}

function EntityTypeBadge({ type }) {
  const label = ENTITY_TYPE_LABELS[type] || type
  const classes = {
    PROD: 'bg-info/10 text-info',
    SUPPORT: 'bg-warning/10 text-warning',
    TDEV: 'bg-success/10 text-success',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${classes[type] || 'bg-muted text-muted-foreground'}`}>
      {label}
    </span>
  )
}

function Avatar({ name, size = 22 }) {
  const initials = getInitials(name)
  const color = getAvatarColor(name)
  return (
    <div
      className="flex items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: color }}
    >
      {initials}
    </div>
  )
}

function HierarchyGroup({ company, entities, users }) {
  const senior = users.find((u) => u.companyId === company.id && u.role === 'senior')
  const companyEntities = entities.filter((e) => e.companyId === company.id)

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3">
        <div>
          <div className="text-base font-semibold">{company.code} — {company.name}</div>
          <div className="text-xs text-muted-foreground">{companyEntities.length} entities</div>
        </div>
        {senior && (
          <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 ring-1 ring-border">
            <Avatar name={senior.fullName} size={26} />
            <div className="text-xs">
              <span className="font-medium">{senior.fullName}</span> · Senior
            </div>
          </div>
        )}
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {companyEntities.map((entity) => {
          const manager = users.find((u) => u.entityId === entity.id && u.role === 'manager')
          const leaders = users.filter((u) => u.entityId === entity.id && u.role === 'team_leader')
          const members = users.filter((u) => u.entityId === entity.id && u.role === 'user')

          return (
            <div key={entity.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs font-semibold">{entity.code}</div>
                  <div className="text-xs text-muted-foreground">{entity.name}</div>
                </div>
                <EntityTypeBadge type={entity.type} />
              </div>
              <div className="mt-3 space-y-2 text-sm">
                {manager && (
                  <div className="flex items-center gap-2">
                    <Avatar name={manager.fullName} size={22} />
                    <span className="text-xs">
                      <span className="font-medium">{manager.fullName}</span>{' '}
                      <span className="text-muted-foreground">· Manager</span>
                    </span>
                  </div>
                )}
                {leaders.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 pl-4">
                    <Avatar name={l.fullName} size={22} />
                    <span className="text-xs">
                      <span className="font-medium">{l.fullName}</span>{' '}
                      <span className="text-muted-foreground">· {ROLE_LABELS[l.role]}</span>
                    </span>
                  </div>
                ))}
                {members.length > 0 && (
                  <div className="pl-8 pt-1 text-xs text-muted-foreground">
                    + {members.length} member{members.length === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HierarchyPage() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', data: null })

  useEffect(() => {
    async function loadHierarchy() {
      try {
        const response = await api.get('/admin/hierarchy/')
        setState({ loading: false, error: '', data: response.data })
      } catch (err) {
        setState({ loading: false, error: 'Failed to load hierarchy data.', data: null })
      }
    }
    loadHierarchy()
  }, [])

  const { loading, error, data } = state

  if (loading) {
    return (
      <main className="page-content">
        <PageHeader
          eyebrow="Organization"
          title="Hierarchy"
          description="Visualize the chain of command and organizational structure across your enterprise."
        />
        <div className="py-8 text-center text-muted-foreground">Loading...</div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page-content">
        <PageHeader
          eyebrow="Organization"
          title="Hierarchy"
          description="Visualize the chain of command and organizational structure across your enterprise."
        />
        <p className="text-destructive">{error}</p>
      </main>
    )
  }

  const companies = data?.companies || []
  const entities = data?.entities || []

  const allUsers = [
    ...entities.flatMap((e) => {
      const comp = companies.find((c) => c.name === e.company_name)
      const cid = comp?.id
      return [
        ...(e.team_leaders || []).flatMap((tl) =>
          (tl.users || []).map((m) => ({
            id: m.id,
            fullName: m.username,
            entityId: e.id,
            companyId: cid,
            role: 'user',
          }))
        ),
        ...(e.team_leaders || []).map((tl) => ({
          id: tl.id,
          fullName: tl.username,
          entityId: e.id,
          companyId: cid,
          role: 'team_leader',
        })),
      ]
    }),
    ...entities.map((e) => {
      const comp = companies.find((c) => c.name === e.company_name)
      const cid = comp?.id
      return {
        id: -e.id,
        fullName: e.manager,
        entityId: e.id,
        companyId: cid,
        role: 'manager',
      }
    }),
    ...companies.map((c) => ({
      id: -c.id - 10000,
      fullName: c.senior,
      companyId: c.id,
      role: 'senior',
    })),
  ].filter((u) => u.fullName)

  const entityTypeByName = {}
  entities.forEach((e) => {
    entityTypeByName[e.name] = e.entity_type
    entityTypeByName[e.company_name] = e.company_name
  })

  const entitiesWithCompanyId = entities.map((e) => {
    const comp = companies.find((c) => c.name === e.company_name)
    return {
      ...e,
      companyId: comp?.id,
      type: e.entity_type,
    }
  })

  const entityIdToCompanyId = {}
  entitiesWithCompanyId.forEach((e) => {
    entityIdToCompanyId[e.id] = e.companyId
  })

  const companiesWithUsers = companies.map((c) => {
    const entIds = entitiesWithCompanyId.filter((e) => e.companyId === c.id).map((e) => e.id)
    return {
      ...c,
      users: allUsers.filter((u) => u.companyId === c.id),
    }
  })

  if (!companies.length) {
    return (
      <main className="page-content">
        <PageHeader
          eyebrow="Organization"
          title="Hierarchy"
          description="Visualize the chain of command and organizational structure across your enterprise."
        />
        <p className="text-muted-foreground">No companies found.</p>
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
            <span className="muted-text">{user?.company_name || 'Global'}</span>
          </>
        }
      />

      <div className="space-y-4">
        {companies.map((company) => {
          const senior = allUsers.find((u) => u.companyId === company.id && u.role === 'senior')
          const companyEntities = entitiesWithCompanyId.filter((e) => e.companyId === company.id)
          const companyUsers = allUsers.filter((u) => u.companyId === company.id)
          const managers = companyUsers.filter((u) => u.role === 'manager')
          const teamLeaders = companyUsers.filter((u) => u.role === 'team_leader')
          const membersByTL = {}
          companyUsers.filter((u) => u.role === 'user').forEach((m) => {
            const tl = teamLeaders.find((l) => l.entityId === m.entityId)
            if (tl) {
              if (!membersByTL[tl.id]) membersByTL[tl.id] = []
              membersByTL[tl.id].push(m)
            }
          })

          return (
            <div key={company.id} className="surface-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3">
                <div>
                  <div className="text-base font-semibold">{company.code} — {company.name}</div>
                  <div className="text-xs text-muted-foreground">{companyEntities.length} entities</div>
                </div>
                {senior && (
                  <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 ring-1 ring-border">
                    <Avatar name={senior.fullName} size={26} />
                    <div className="text-xs">
                      <span className="font-medium">{senior.fullName}</span> · Senior
                    </div>
                  </div>
                )}
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {companyEntities.map((entity) => {
                  const manager = companyUsers.find((u) => u.entityId === entity.id && u.role === 'manager')
                  const leaders = companyUsers.filter((u) => u.entityId === entity.id && u.role === 'team_leader')
                  const members = companyUsers.filter((u) => u.entityId === entity.id && u.role === 'user')

                  return (
                    <div key={entity.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-mono text-xs font-semibold">{entity.code}</div>
                          <div className="text-xs text-muted-foreground">{entity.name}</div>
                        </div>
                        <EntityTypeBadge type={entity.type} />
                      </div>
                      <div className="mt-3 space-y-1 text-sm">
                        {manager && (
                          <div className="flex items-center gap-2">
                            <Avatar name={manager.fullName} size={22} />
                            <span className="text-xs">
                              <span className="font-medium">{manager.fullName}</span>{' '}
                              <span className="text-muted-foreground">· Manager</span>
                            </span>
                          </div>
                        )}
                        {leaders.map((l) => (
                          <div key={l.id} className="pl-4">
                            <div className="flex items-center gap-2">
                              <Avatar name={l.fullName} size={22} />
                              <span className="text-xs">
                                <span className="font-medium">{l.fullName}</span>{' '}
                                <span className="text-muted-foreground">· Team Leader</span>
                              </span>
                            </div>
                            {members.filter((m) => m.entityId === l.id).map((m) => (
                              <div key={m.id} className="flex items-center gap-2 pl-8">
                                <Avatar name={m.fullName} size={18} />
                                <span className="text-xs text-muted-foreground">{m.fullName}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}

export default HierarchyPage