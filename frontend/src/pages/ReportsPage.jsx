import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'

const REPORTS = [
  { id: 'r1', title: 'Monthly request volume', description: 'Total requests created and resolved per company per month.', icon: 'BarChart3' },
  { id: 'r2', title: 'Resolution time analysis', description: 'Average time-to-resolution per type and per entity.', icon: 'FileBarChart' },
  { id: 'r3', title: 'Workload distribution', description: 'Requests per assignee, team, and entity.', icon: 'FileSpreadsheet' },
  { id: 'r4', title: 'SLA compliance', description: 'On-time vs overdue resolutions, broken down by priority.', icon: 'FileText' },
]

const ICONS = {
  BarChart3: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  FileBarChart: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  FileSpreadsheet: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  FileText: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 7H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z" />
    </svg>
  ),
}

const DOWNLOAD_ICON = (
  <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

function ReportsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalRequests: 0, avgResolution: 0, slaCompliance: 0 })

  useEffect(() => {
    async function load() {
      try {
        const response = await api.get('/admin/reports/')
        const data = response.data
        setStats({
          totalRequests: data.total_requests || 0,
          avgResolution: data.avg_resolution_days || 0,
          slaCompliance: data.sla_compliance_percent || 0,
        })
      } catch (err) {
        setStats({ totalRequests: 0, avgResolution: 0, slaCompliance: 0 })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Monitoring"
        title="Reports"
        description="Generate and export reports across the platform."
        meta={
          <>
            <span className="status-tag info">{user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'}</span>
            <span className="muted-text">{user?.company_name || 'Global'}</span>
          </>
        }
      />

      <div className="surface-card mb-4 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total requests</div>
            <div className="mt-1 text-2xl font-semibold">{stats.totalRequests}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Average resolution</div>
            <div className="mt-1 text-2xl font-semibold">{stats.avgResolution} days</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">SLA compliance</div>
            <div className="mt-1 text-2xl font-semibold">{stats.slaCompliance}%</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <div key={r.id} className="surface-card p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {ICONS[r.icon]}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold">{r.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm hover:bg-muted">
                    View
                  </button>
                  <button className="inline-flex h-8 items-center justify-center rounded-md px-3 py-1 text-sm text-muted-foreground hover:bg-muted">
                    {DOWNLOAD_ICON} Export CSV
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

export default ReportsPage