import { PageHeader } from "@/components/PageHeader";
import { requests, companies, entities } from "@/data/mock";
import { Activity, AlertCircle, CheckCircle2, Clock } from "lucide-react";

function MetricCard({ icon, label, value, hint, accent }: { icon: React.ReactNode; label: string; value: string | number; hint?: string; accent: string }) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>{icon}</div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">{value}</div>
        </div>
      </div>
      {hint && <div className="mt-3 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function AdminMonitoring() {
  const open = requests.filter((r) => !["completed", "closed", "rejected"].includes(r.status)).length;
  const inProgress = requests.filter((r) => r.status === "in_progress").length;
  const overdue = requests.filter((r) => r.dueDate && new Date(r.dueDate) < new Date() && !["completed", "closed"].includes(r.status)).length;
  const completed = requests.filter((r) => r.status === "completed" || r.status === "closed").length;

  return (
    <div>
      <PageHeader title="Monitoring" description="Real-time view of platform load and request flow." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={<Activity className="h-5 w-5 text-info" />} label="Open" value={open} hint="Awaiting action" accent="bg-info/10" />
        <MetricCard icon={<Clock className="h-5 w-5 text-warning" />} label="In progress" value={inProgress} accent="bg-warning/10" />
        <MetricCard icon={<AlertCircle className="h-5 w-5 text-destructive" />} label="Overdue" value={overdue} accent="bg-destructive/10" />
        <MetricCard icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Resolved" value={completed} hint="All time" accent="bg-success/10" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h3 className="text-base font-semibold">Workload by company</h3>
          <div className="mt-4 space-y-4">
            {companies.map((c) => {
              const count = requests.filter((r) => r.companyId === c.id).length;
              const pct = Math.max(4, (count / requests.length) * 100);
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.code}</span>
                    <span className="text-muted-foreground">{count} requests</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-gradient-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface-card p-5">
          <h3 className="text-base font-semibold">Top entities by incoming volume</h3>
          <div className="mt-4 space-y-3">
            {entities
              .filter((e) => e.type !== "production")
              .map((e) => ({ e, count: requests.filter((r) => r.targetEntityId === e.id).length }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 6)
              .map(({ e, count }) => (
                <div key={e.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <div className="font-mono text-sm font-semibold">{e.code}</div>
                    <div className="text-xs text-muted-foreground">{e.name}</div>
                  </div>
                  <div className="text-sm font-semibold">{count}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
