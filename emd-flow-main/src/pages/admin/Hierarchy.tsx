import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { ROLE_LABELS } from "@/store/auth";
import { companies, entities, users } from "@/data/mock";
import { ChevronRight } from "lucide-react";
import { EntityTypeBadge } from "@/components/badges";

export default function AdminHierarchy() {
  return (
    <div>
      <PageHeader title="Hierarchy" description="Visualize the chain of command from Senior down to individual users." />

      <div className="space-y-4">
        {companies.map((company) => {
          const senior = users.find((u) => u.companyId === company.id && u.role === "senior");
          const companyEntities = entities.filter((e) => e.companyId === company.id);
          return (
            <div key={company.id} className="surface-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-surface-2 px-5 py-3">
                <div>
                  <div className="text-base font-semibold">{company.code} — {company.name}</div>
                  <div className="text-xs text-muted-foreground">{companyEntities.length} entities</div>
                </div>
                {senior && (
                  <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 ring-1 ring-border">
                    <Avatar name={senior.fullName} color={senior.avatarColor} size={26} />
                    <div className="text-xs"><span className="font-medium">{senior.fullName}</span> · Senior</div>
                  </div>
                )}
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {companyEntities.map((entity) => {
                  const manager = users.find((u) => u.entityId === entity.id && u.role === "manager");
                  const leaders = users.filter((u) => u.entityId === entity.id && u.role === "team_leader");
                  const members = users.filter((u) => u.entityId === entity.id && u.role === "user");
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
                          <div className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-muted-foreground" /><Avatar name={manager.fullName} color={manager.avatarColor} size={22} /><span className="text-xs"><span className="font-medium">{manager.fullName}</span> <span className="text-muted-foreground">· Manager</span></span></div>
                        )}
                        {leaders.map((l) => (
                          <div key={l.id} className="flex items-center gap-2 pl-4"><ChevronRight className="h-3 w-3 text-muted-foreground" /><Avatar name={l.fullName} color={l.avatarColor} size={22} /><span className="text-xs"><span className="font-medium">{l.fullName}</span> <span className="text-muted-foreground">· {ROLE_LABELS[l.role]}</span></span></div>
                        ))}
                        {members.length > 0 && (
                          <div className="pl-8 pt-1 text-xs text-muted-foreground">+ {members.length} member{members.length === 1 ? "" : "s"}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
