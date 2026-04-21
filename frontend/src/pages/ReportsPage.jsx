import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'

// Design Tokens for Reports
const kpiCardClass = 'rounded-lg border border-border/40 bg-card p-6 shadow-sm flex flex-col'
const chartCardClass = 'rounded-lg border border-border/40 bg-card p-6 shadow-sm overflow-hidden'

const CHART_COLORS = {
  primary: 'hsl(var(--primary))',
  success: 'hsl(var(--success))',
  muted: 'hsl(var(--muted-foreground))',
  grid: 'hsl(var(--border) / 0.3)',
}

function exportCsv(filename, rows) {
  if (!rows?.length) return
  const keys = Object.keys(rows[0])
  const csv = [
    keys.join(','),
    ...rows.map((row) => keys.map((key) => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border/50 bg-card px-3 py-2 text-[10px] shadow-sm">
      <p className="font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="text-sm font-semibold text-foreground">
          {item.name}: {item.value}
        </p>
      ))}
    </div>
  )
}

function ChartCard({ title, onExport, children, className = '' }) {
  return (
    <section className={`${chartCardClass} ${className}`}>
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h3>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={onExport} 
          className="h-7 text-[10px] font-bold uppercase tracking-wider bg-primary hover:bg-primary/90 text-primary-foreground border-none"
        >
          Export CSV
        </Button>
      </div>
      <div className="relative">
        {children}
      </div>
    </section>
  )
}

function ReportsPage() {
  const { user } = useAuth()
  const roleKeys = user?.role_keys || []
  const isSuperAdmin = roleKeys.includes('super_admin')
  const [state, setState] = useState({ loading: true, error: '', data: null })

  useEffect(() => {
    async function load() {
      try {
        const response = await api.get('/admin/reports/')
        setState({ loading: false, error: '', data: response.data || {} })
      } catch (error) {
        setState({ loading: false, error: error.response?.data?.detail || 'Could not load reports.', data: null })
      }
    }
    load()
  }, [])

  const parsed = useMemo(() => {
    const data = state.data || {}
    
    // Request Trends
    const trends = (data.trend_summaries || [])
      .map((item) => ({ 
        label: item.day ? new Date(item.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '-', 
        value: Number(item.total || 0) 
      }))
      .reverse()
      .slice(-14)

    // Status Distribution (Horizontal Bar)
    const statuses = (data.requests_by_status || []).map(item => ({
      label: item.status || 'No status',
      value: Number(item.total || 0)
    })).slice(0, 10)

    // Company Distribution (Vertical Bar)
    const reportCompanies = (data.request_volume_by_company || []).map((item) => ({
      label: item.company_name || item['company__name'] || 'No company',
      value: Number(item.total || 0),
    })).slice(0, 8)

    // Workload by Assignee (Horizontal Bar)
    const assignees = (data.team_workload || []).map(item => ({
      label: item.current_assignee__username || 'Unassigned',
      value: Number(item.total || 0)
    })).slice(0, 10)

    // KPI Values
    const open = Number(data.open_vs_resolved?.open || 0)
    const resolved = Number(data.open_vs_resolved?.resolved || 0)
    const total = open + resolved
    const resolutionRate = total ? Math.round((resolved / total) * 100) : 0

    return { trends, statuses, companies: reportCompanies, assignees, open, resolved, total, resolutionRate }
  }, [state.data])

  if (state.error) {
    return (
      <main className="page-content py-12">
        <div className="rounded-lg border-2 border-destructive bg-destructive/5 p-8 text-center">
          <p className="text-destructive font-bold uppercase tracking-widest">{state.error}</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </main>
    )
  }

  return (
    <main className="page-content pb-12">
      <PageHeader
        eyebrow="Monitoring"
        title="Reports"
        description="Unified platform analytics and operational performance tracking."
        meta={
          <>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {roleKeys[0]?.replaceAll('_', ' ') || 'user'}
            </span>
            <span className="text-muted-foreground">{isSuperAdmin ? 'Global Scope' : user?.company_name || 'Personal'}</span>
          </>
        }
      />

      <div className="grid gap-6">
        {/* KPI Row - Only 4 Primary Metrics */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {state.loading ? (
             Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={kpiCardClass}>
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-8 w-12" />
              </div>
            ))
          ) : (
            <>
              <div className={kpiCardClass}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Requests</span>
                <span className="mt-2 text-3xl font-bold tabular-nums">{parsed.total}</span>
              </div>
              <div className={kpiCardClass}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Open</span>
                <span className="mt-2 text-3xl font-bold tabular-nums">{parsed.open}</span>
              </div>
              <div className={kpiCardClass}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-success">Resolved</span>
                <span className="mt-2 text-3xl font-bold tabular-nums text-success">{parsed.resolved}</span>
              </div>
              <div className={kpiCardClass}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Resolution Rate</span>
                <span className="mt-2 text-3xl font-bold tabular-nums">{parsed.resolutionRate}%</span>
              </div>
            </>
          )}
        </section>

        {/* Hero Chart: Request Trend */}
        {state.loading ? (
           <Skeleton className="h-[450px] w-full rounded-lg" />
        ) : (
          <ChartCard title="Operational Volume Trend" onExport={() => exportCsv('report_volume_trend.csv', parsed.trends)}>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={parsed.trends} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 4" vertical={false} />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fill: CHART_COLORS.muted, fontSize: 10, fontWeight: 600 }} 
                    axisLine={false} 
                    tickLine={false} 
                    dy={10}
                  />
                  <YAxis 
                    tick={{ fill: CHART_COLORS.muted, fontSize: 10, fontWeight: 600 }} 
                    axisLine={false} 
                    tickLine={false} 
                    allowDecimals={false} 
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART_COLORS.primary, strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Volume"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={3}
                    dot={{ r: 4, fill: CHART_COLORS.primary, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                    activeDot={{ r: 6, fill: CHART_COLORS.primary, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}

        {/* Secondary Grid: Status & Company */}
        {!state.loading && (
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Status Distribution" onExport={() => exportCsv('report_status_distribution.csv', parsed.statuses)}>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={parsed.statuses} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis 
                      type="category" 
                      dataKey="label" 
                      tick={{ fill: CHART_COLORS.muted, fontSize: 10, fontWeight: 600 }} 
                      axisLine={false} 
                      tickLine={false} 
                      width={80}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.2)' }} />
                    <Bar 
                      dataKey="value" 
                      name="Requests" 
                      fill={CHART_COLORS.primary} 
                      radius={[0, 4, 4, 0]} 
                      barSize={20}
                    >
                      {parsed.statuses.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.label.toLowerCase() === 'completed' || entry.label.toLowerCase() === 'closed' ? CHART_COLORS.success : CHART_COLORS.primary} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Activity by Company" onExport={() => exportCsv('report_company_distribution.csv', parsed.companies)}>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={parsed.companies} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 4" vertical={false} />
                    <XAxis 
                      dataKey="label" 
                      tick={{ fill: CHART_COLORS.muted, fontSize: 10, fontWeight: 600 }} 
                      axisLine={false} 
                      tickLine={false} 
                      dy={10}
                    />
                    <YAxis 
                      tick={{ fill: CHART_COLORS.muted, fontSize: 10, fontWeight: 600 }} 
                      axisLine={false} 
                      tickLine={false} 
                      allowDecimals={false} 
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.2)' }} />
                    <Bar 
                      dataKey="value" 
                      name="Requests" 
                      fill={CHART_COLORS.muted} 
                      radius={[4, 4, 0, 0]} 
                      barSize={32}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
        )}

        {/* Final Row: Workload */}
        {!state.loading && (
          <ChartCard title="Operational Workload by Assignee" onExport={() => exportCsv('report_workload.csv', parsed.assignees)}>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={parsed.assignees} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 4" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis 
                    type="category" 
                    dataKey="label" 
                    tick={{ fill: CHART_COLORS.muted, fontSize: 10, fontWeight: 600 }} 
                    axisLine={false} 
                    tickLine={false} 
                    width={100}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.2)' }} />
                  <Bar 
                    dataKey="value" 
                    name="Requests" 
                    fill={CHART_COLORS.primary} 
                    radius={[0, 4, 4, 0]} 
                    barSize={16}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}
      </div>
    </main>
  )
}

export default ReportsPage
