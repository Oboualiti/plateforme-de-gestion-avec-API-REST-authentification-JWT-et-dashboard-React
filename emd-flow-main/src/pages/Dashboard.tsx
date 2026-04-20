import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCurrentUser, ROLE_LABELS } from "@/store/auth";
import { requests, companies, entities, users } from "@/data/mock";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, TypeBadge } from "@/components/badges";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowUpRight, ClipboardList, Inbox, PlusCircle, TrendingUp, Users as UsersIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
  trend?: string;
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className="rounded-lg bg-primary-soft p-2 text-accent-foreground">{icon}</div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-success">
          <TrendingUp className="h-3.5 w-3.5" />
          {trend}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const user = useCurrentUser();

  const scoped = useMemo(() => {
    if (!user) return [];
    if (user.role === "super_admin") return requests;
    if (user.role === "senior") return requests.filter((r) => r.companyId === user.companyId);
    if (user.role === "manager") return requests.filter((r) => r.targetEntityId === user.entityId || r.sourceEntityId === user.entityId);
    if (user.role === "team_leader") return requests.filter((r) => r.targetEntityId === user.entityId || r.creatorId === user.id);
    return requests.filter((r) => r.creatorId === user.id);
  }, [user]);

  const open = scoped.filter((r) => !["completed", "closed", "rejected"].includes(r.status));
  const inProgress = scoped.filter((r) => r.status === "in_progress");
  const completed = scoped.filter((r) => r.status === "completed" || r.status === "closed");
  const newCount = scoped.filter((r) => r.status === "new").length;
  const recent = [...scoped].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 6);

  if (!user) return null;

  const company = companies.find((c) => c.id === user.companyId);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.fullName.split(" ")[0]}`}
        description={`${ROLE_LABELS[user.role]}${company ? ` · ${company.name}` : ""} — here's what's happening.`}
        actions={
          user.role !== "super_admin" && user.role !== "senior" ? (
            <Button asChild>
              <Link to="/requests/new">
                <PlusCircle className="mr-1 h-4 w-4" /> New request
              </Link>
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to="/requests">
                View all requests <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open requests" value={open.length} icon={<Inbox className="h-4 w-4" />} hint={`${newCount} new`} trend="+12% vs last week" />
        <StatCard label="In progress" value={inProgress.length} icon={<ClipboardList className="h-4 w-4" />} hint="Actively being handled" />
        <StatCard label="Completed" value={completed.length} icon={<ClipboardList className="h-4 w-4" />} hint="Last 30 days" />
        <StatCard label={user.role === "super_admin" ? "Active users" : "Team members"} value={user.role === "super_admin" ? users.filter((u) => u.active).length : entities.find((e) => e.id === user.entityId)?.membersCount ?? 0} icon={<UsersIcon className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="surface-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Recent activity</h2>
            <Link to="/requests" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recent.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">No recent activity yet.</div>
            ) : (
              recent.map((r) => {
                const creator = users.find((u) => u.id === r.creatorId);
                const target = entities.find((e) => e.id === r.targetEntityId);
                return (
                  <Link key={r.id} to={`/requests/${r.id}`} className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40">
                    {creator && <Avatar name={creator.fullName} color={creator.avatarColor} size={36} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{r.reference}</span>
                        <StatusBadge status={r.status} />
                        <TypeBadge type={r.type} />
                      </div>
                      <div className="mt-1 truncate text-sm font-medium text-foreground">{r.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {creator?.fullName} → {target?.code} · {formatDistanceToNow(new Date(r.updatedAt), { addSuffix: true })}
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface-card p-5">
            <h2 className="text-base font-semibold">Status breakdown</h2>
            <div className="mt-4 space-y-3">
              {(["new", "accepted", "in_progress", "completed", "rejected", "closed"] as const).map((s) => {
                const count = scoped.filter((r) => r.status === s).length;
                const pct = scoped.length ? Math.round((count / scoped.length) * 100) : 0;
                return (
                  <div key={s}>
                    <div className="flex items-center justify-between text-xs">
                      <StatusBadge status={s} />
                      <span className="font-medium text-muted-foreground">{count}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full bg-status-${s.replace("_", "")}`} style={{ width: `${pct}%`, backgroundColor: `hsl(var(--status-${s === "in_progress" ? "progress" : s}))` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="surface-card p-5">
            <h2 className="text-base font-semibold">Quick actions</h2>
            <div className="mt-3 space-y-2">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/requests/new">
                  <PlusCircle className="mr-2 h-4 w-4" /> Create a new request
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/requests">
                  <Inbox className="mr-2 h-4 w-4" /> Browse the queue
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/profile">
                  <UsersIcon className="mr-2 h-4 w-4" /> Manage your profile
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
