import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { Skeleton } from '../components/ui/skeleton'

function MonitoringPage() {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: '', data: null })

  useEffect(() => {
    async function load() {
      try {
        const response = await api.get('/admin/dashboard/')
        setState({ loading: false, error: '', data: response.data || {} })
      } catch (error) {
        setState({
          loading: false,
          error: error.response?.data?.detail || 'Could not load monitoring data.',
          data: null,
        })
      }
    }
    load()
  }, [])

  const parsed = useMemo(() => {
    const data = state.data || {}
    const totals = data.totals || {}
    const queue = data.queue || {}
    const statuses = (data.requests_by_status || []).map((item) => ({
      label: item.status || 'Unknown',
      value: Number(item.total || 0),
    }))
    const companies = (data.requests_by_company || []).map((item) => ({
      label: item['company__name'] || 'Unknown',
      value: Number(item.total || 0),
    }))
    const entities = (data.requests_by_entity || []).map((item) => ({
      label: item['target_entity__name'] || 'Unknown',
      value: Number(item.total || 0),
    }))
    const recent = data.recent_activity || []
    return { totals, queue, statuses, companies, entities, recent }
  }, [state.data])

  const barRows = parsed.statuses.length ? parsed.statuses : parsed.entities
  const maxBar = Math.max(1, ...barRows.map((row) => row.value || 0))

  return (
    <main className="page-content space-y-6">
      <PageHeader
        eyebrow="Monitoring"
        title="Monitoring"
        description="Live operational overview across requests, workload, and activity."
        meta={
          <>
            <span className="status-tag info">{user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'}</span>
            <span className="muted-text">{user?.company_name || 'Global'}</span>
          </>
        }
      />

      {state.loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div className="surface-card p-4" key={`monitoring-skeleton-${idx}`}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-8 w-16" />
            </div>
          ))}
        </div>
      )}

      {state.error && <div className="surface-card p-4 text-sm font-medium text-destructive">{state.error}</div>}

      {!state.loading && !state.error && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Open queue</p>
              <p className="mt-1 text-2xl font-bold">{parsed.queue.open || 0}</p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending triage</p>
              <p className="mt-1 text-2xl font-bold">{parsed.queue.pending || 0}</p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Unassigned</p>
              <p className="mt-1 text-2xl font-bold">{parsed.queue.unassigned || 0}</p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Stuck (&gt; 7 days)</p>
              <p className="mt-1 text-2xl font-bold">{parsed.queue.stuck || 0}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="surface-card p-5">
              <h3 className="text-base font-semibold">Request status distribution</h3>
              <div className="mt-4 space-y-3">
                {barRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data.</p>
                ) : (
                  barRows.slice(0, 8).map((row) => (
                    <div key={row.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{row.label}</span>
                        <span className="font-semibold">{row.value}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${Math.max(8, Math.round((row.value / maxBar) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="surface-card p-5">
              <h3 className="text-base font-semibold">Volume by company</h3>
              <div className="mt-4 space-y-2">
                {parsed.companies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No company data.</p>
                ) : (
                  parsed.companies.slice(0, 8).map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                      <span>{row.label}</span>
                      <span className="font-semibold">{row.value}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <section className="surface-card p-5">
            <h3 className="text-base font-semibold">Recent activity</h3>
            <div className="mt-4 space-y-2">
              {parsed.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                parsed.recent.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <div className="font-medium">{item.target_label || item.target_model || '-'}</div>
                    <div className="text-xs text-muted-foreground">
                      {(item.actor_name || 'System')} • {new Date(item.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total users</p>
              <p className="mt-1 text-2xl font-bold">{parsed.totals.users || 0}</p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total requests</p>
              <p className="mt-1 text-2xl font-bold">{parsed.totals.requests || 0}</p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Companies</p>
              <p className="mt-1 text-2xl font-bold">{parsed.totals.companies || 0}</p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Entities</p>
              <p className="mt-1 text-2xl font-bold">{parsed.totals.entities || 0}</p>
            </div>
          </div>
        </>
      )}
    </main>
  )
}

export default MonitoringPage
