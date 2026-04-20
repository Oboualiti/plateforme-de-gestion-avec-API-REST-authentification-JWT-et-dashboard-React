import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { useCurrentUser, ROLE_LABELS } from "@/store/auth";
import { entities, users } from "@/data/mock";
import { Mail, MoreHorizontal } from "lucide-react";
import { format } from "date-fns";

export default function Team() {
  const me = useCurrentUser();
  if (!me) return null;

  const team = users.filter((u) => u.entityId === me.entityId && u.id !== me.id);
  const entity = entities.find((e) => e.id === me.entityId);

  return (
    <div>
      <PageHeader
        title="Team members"
        description={entity ? `${entity.code} — ${entity.name}` : "Your team"}
        actions={<Button variant="outline">Invite member</Button>}
      />

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Member</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Last active</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {team.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No other members in your entity yet.</td></tr>
              ) : (
                team.map((u) => (
                  <tr key={u.id} className="data-table-row border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.fullName} color={u.avatarColor} size={36} />
                        <div>
                          <div className="font-medium text-foreground">{u.fullName}</div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{ROLE_LABELS[u.role]}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${u.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${u.active ? "bg-success" : "bg-muted-foreground"}`} />
                        {u.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(u.lastActive), "MMM d, HH:mm")}</td>
                    <td className="px-4 py-3"><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
