import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { auditLogs, users } from "@/data/mock";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState } from "react";

export default function AdminAudit() {
  const [q, setQ] = useState("");
  const filtered = auditLogs.filter((l) => {
    if (!q.trim()) return true;
    const n = q.toLowerCase();
    return l.action.toLowerCase().includes(n) || l.resource.toLowerCase().includes(n) || l.resourceId.toLowerCase().includes(n);
  });

  return (
    <div>
      <PageHeader title="Audit logs" description="Immutable record of every privileged action across the platform." />

      <div className="surface-card mb-4 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by action or resource…" className="pl-9 max-w-md" />
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Actor</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
                <th className="px-4 py-3 text-left font-medium">Resource</th>
                <th className="px-4 py-3 text-left font-medium">IP</th>
                <th className="px-4 py-3 text-left font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const actor = users.find((u) => u.id === l.actorId);
                return (
                  <tr key={l.id} className="data-table-row border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      {actor && (
                        <div className="flex items-center gap-2">
                          <Avatar name={actor.fullName} color={actor.avatarColor} size={26} />
                          <span className="text-sm">{actor.fullName}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{l.action}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{l.resource} <span className="font-mono">{l.resourceId}</span></td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{l.ip}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(l.createdAt), "MMM d, yyyy · HH:mm")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
