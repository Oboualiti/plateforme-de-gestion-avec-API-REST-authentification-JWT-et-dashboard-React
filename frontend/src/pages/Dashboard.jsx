import { Link } from 'react-router-dom'
import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'

function Dashboard() {
  const { user } = useAuth()
  const quickActions = [
    user?.request_creation_allowed ? { label: 'Create request', to: '/requests/create', variant: 'default' } : null,
    { label: 'Open requests', to: '/requests', variant: 'outline' },
    { label: 'Admin workspace', to: '/admin/dashboard', variant: 'ghost' },
  ].filter(Boolean)

  return (
    <main className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title="Operations overview"
        description="Monitor workload, ownership, and request flow from a single operational workspace."
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
            <span>{user?.company_name || 'Global'}</span>
            <span className="text-muted-foreground">{user?.entity_name || 'No entity assigned'}</span>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="pb-2">
            <CardDescription className="text-primary-foreground/70 uppercase text-[10px] font-bold tracking-widest">Access scope</CardDescription>
            <CardTitle className="text-4xl tabular-nums">{user?.role_keys?.length || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-primary-foreground/70">active role lane(s)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Company</CardDescription>
            <CardTitle className="text-xl truncate">{user?.company_name || 'Global'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">current business scope</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Entity</CardDescription>
            <CardTitle className="text-xl truncate">{user?.entity_name || 'Pending'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">assigned operating unit</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Request actions</CardDescription>
            <CardTitle className="text-xl">{user?.request_creation_allowed ? 'Enabled' : 'View only'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">workspace permissions</p>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
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
              <div className="grid grid-cols-1 md:grid-cols-5 gap-px bg-border rounded-lg overflow-hidden border border-border">
                {['Draft', 'Accepted', 'In progress', 'Completed', 'Closed'].map((step, i) => (
                  <div key={step} className={`p-4 bg-background ${i === 0 ? 'bg-primary/5' : ''}`}>
                    <p className={`text-sm font-semibold ${i === 0 ? 'text-primary' : ''}`}>{step}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      {i === 0 ? 'Created and waiting review' : '...'}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription className="uppercase text-[10px] font-bold tracking-widest">Activity</CardDescription>
              <CardTitle>Operational focus areas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { title: 'Requests', desc: 'Use list views as the main workspace for triage and tracking.', to: '/requests', label: 'Open' },
                { title: 'Administration', desc: 'Manage users, entities, and permissions.', to: '/admin/dashboard', label: 'Review' },
                { title: 'Monitoring', desc: 'Track logs, notifications, and reporting.', to: '/admin/reports', label: 'Explore' },
              ].map((item) => (
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
          <Card>
            <CardHeader>
              <CardDescription className="uppercase text-[10px] font-bold tracking-widest">User profile</CardDescription>
              <CardTitle>{user?.first_name || user?.username}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {user?.company_name || 'Global'} · {user?.entity_name || 'No entity assigned'}
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
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}

export default Dashboard
