import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { api } from '../lib/api'

function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const [stats, setStats] = useState({ loading: true, data: null, error: '' })
  
  const roleKeys = user?.role_keys || []
  const primaryRole = roleKeys[0] || user?.role || 'user'
  const isSuperAdmin = primaryRole === 'super_admin'
  const isSenior = primaryRole === 'senior'
  const isAdminView = isSuperAdmin || isSenior
  const scopeMeta = isSuperAdmin
    ? {
        headerCompany: '',
        headerEntity: 'Global Platform',
        profile: 'Global Platform',
      }
    : isSenior
      ? {
          headerCompany: user?.company_name || 'Global',
          headerEntity: '',
          profile: user?.company_name || 'Global',
        }
      : {
          headerCompany: user?.company_name || 'Global',
          headerEntity: user?.entity_name || 'No entity assigned',
          profile: `${user?.company_name || 'Global'} · ${user?.entity_name || 'No entity assigned'}`,
        }

  useEffect(() => {
    if (isAdminView) {
      async function fetchStats() {
        try {
          const response = await api.get('/admin/dashboard/')
          setStats({ loading: false, data: response.data, error: '' })
        } catch (err) {
          setStats({ loading: false, data: null, error: 'Could not load platform metrics.' })
        }
      }
      fetchStats()
    } else {
      setStats({ loading: false, data: null, error: '' })
    }
  }, [isAdminView])

  const quickActions = [
    user?.request_creation_allowed ? { label: 'Create request', to: '/requests/create', variant: 'default' } : null,
    { label: 'Open requests', to: '/requests', variant: 'outline' },
    isAdminView ? { label: 'Platform Reports', to: '/admin/reports', variant: 'secondary' } : null,
  ].filter(Boolean)

  const pageTitle = isSuperAdmin 
    ? "Platform Administration" 
    : isSenior 
      ? "Company Overview" 
      : "Operations overview"
      
  const pageDescription = isSuperAdmin
    ? "Global oversight of users, companies, and request flow across the platform."
    : isSenior
      ? "Management of company entities, teams, and request lifecycle."
      : "Monitor workload, ownership, and request flow from a single operational workspace."

  const isLoading = authLoading || stats.loading

  return (
    <main className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title={pageTitle}
        description={pageDescription}
        actions={
          <div className="flex gap-2">
            {quickActions.map((action) => (
              <Button key={action.to} variant={action.variant} asChild>
                <Link to={action.to}>{action.label}</Link>
              </Button>
            ))}
          </div>
        }
        meta={
          <>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'}
            </span>
            {!isSuperAdmin && (
              <>
                <span>{scopeMeta.headerCompany}</span>
                {scopeMeta.headerEntity ? (
                  <span className="text-muted-foreground">{scopeMeta.headerEntity}</span>
                ) : null}
              </>
            )}
            {isSuperAdmin && <span className="text-muted-foreground">{scopeMeta.profile}</span>}
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Card key={`dashboard-stat-skeleton-${index}`}>
              <CardHeader className="pb-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-10 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-3 w-28" />
              </CardContent>
            </Card>
          ))
        ) : isAdminView && stats.data ? (
          <>
            <Card className="bg-primary text-primary-foreground shadow-brutal">
              <CardHeader className="pb-2">
                <CardDescription className="text-primary-foreground/70 uppercase text-[10px] font-bold tracking-widest text-dark-primary-foreground">
                  {isSuperAdmin ? 'Total Companies' : 'Network Entities'}
                </CardDescription>
                <CardTitle className="text-4xl tabular-nums">
                  {isSuperAdmin ? stats.data.totals?.companies : stats.data.totals?.entities}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-primary-foreground/70">active operational units</p>
              </CardContent>
            </Card>

            <Card className="shadow-brutal">
              <CardHeader className="pb-2">
                <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Global Users</CardDescription>
                <CardTitle className="text-4xl tabular-nums">{stats.data.totals?.users}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">registered accounts</p>
              </CardContent>
            </Card>

            <Card className="shadow-brutal">
              <CardHeader className="pb-2">
                <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Total Requests</CardDescription>
                <CardTitle className="text-4xl tabular-nums">{stats.data.totals?.requests}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">lifetime volume</p>
              </CardContent>
            </Card>

            <Card className="shadow-brutal">
              <CardHeader className="pb-2">
                <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Stale Requests</CardDescription>
                <CardTitle className="text-4xl tabular-nums text-destructive">{stats.data.queue?.stuck || 0}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">inactive {'>'} 7 days</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="bg-primary text-primary-foreground shadow-brutal">
              <CardHeader className="pb-2">
                <CardDescription className="text-primary-foreground/70 uppercase text-[10px] font-bold tracking-widest text-dark-primary-foreground">Access scope</CardDescription>
                <CardTitle className="text-4xl tabular-nums">{user?.role_keys?.length || 0}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-primary-foreground/70">active role lane(s)</p>
              </CardContent>
            </Card>

            <Card className="shadow-brutal">
              <CardHeader className="pb-2">
                <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Company</CardDescription>
                <CardTitle className="text-xl truncate">{user?.company_name || 'Global'}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">current business scope</p>
              </CardContent>
            </Card>

            <Card className="shadow-brutal">
              <CardHeader className="pb-2">
                <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Entity</CardDescription>
                <CardTitle className="text-xl truncate">{user?.entity_name || 'Pending'}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">assigned operating unit</p>
              </CardContent>
            </Card>

            <Card className="shadow-brutal">
              <CardHeader className="pb-2">
                <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Request actions</CardDescription>
                <CardTitle className="text-xl">{user?.request_creation_allowed ? 'Enabled' : 'View only'}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">workspace permissions</p>
              </CardContent>
            </Card>
          </>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-brutal">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Queue health</CardDescription>
                <CardTitle>Request lifecycle</CardTitle>
              </div>
              <Button variant="link" size="sm" asChild>
                <Link to="/requests">View requests</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border">
                {[
                  { label: 'Pending', value: stats.data?.queue?.pending, desc: 'Awaiting review' },
                  { label: 'Open', value: stats.data?.queue?.open, desc: 'In progress' },
                  { label: 'Unassigned', value: stats.data?.queue?.unassigned, desc: 'Needs owner' },
                  { label: 'Stuck', value: stats.data?.queue?.stuck, desc: 'Inactive alerts' },
                ].map((item, i) => (
                  <div key={item.label} className={`p-4 ${i === 0 ? 'bg-primary-soft' : 'bg-background'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`}>{item.label}</p>
                    <p className="text-2xl font-bold mt-1 tabular-nums">
                      {isAdminView ? (item.value ?? 0) : '...'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-brutal">
            <CardHeader>
              <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Activity</CardDescription>
              <CardTitle>Operational focus areas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { title: 'Requests', desc: 'Use list views as the main workspace for triage and tracking.', to: '/requests', label: 'Open' },
                isAdminView ? { title: 'Platform Reports', desc: 'Visual charts and historical analytics.', to: '/admin/reports', label: 'Analyze' } : null,
              ].filter(Boolean).map((item) => (
                <div key={item.title} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={item.to}>{item.label}</Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-brutal">
            <CardHeader>
              <CardDescription className="uppercase text-[10px] font-bold tracking-widest">User profile</CardDescription>
              <CardTitle>{user?.first_name || user?.username}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {scopeMeta.profile}
              </div>
              <div className="pt-4 border-t border-border space-y-4">
                <div>
                   <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Primary role</p>
                   <p className="text-sm font-medium mt-1">{user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'}</p>
                </div>
                <div>
                   <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Access level</p>
                   <p className="text-sm text-muted-foreground mt-1">
                     {user?.request_creation_allowed ? 'Full operational access.' : 'Review and tracking focus.'}
                   </p>
                </div>
              </div>
            </CardContent>
          </Card>

           <Card className="bg-muted/50 border-dashed">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Help</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Use the sidebar for role-specific modules, tables for operational work, and detail pages for actions.
              </p>
              {isAdminView && (
                <Button variant="link" className="p-0 h-auto text-xs mt-2" asChild>
                  <Link to="/admin/reports">View Platform Analytics</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}

export default Dashboard
