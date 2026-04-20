import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { delegationRules, users } from "@/data/mock";
import { ArrowRight, PlusCircle } from "lucide-react";
import { format } from "date-fns";

export default function AdminDelegation() {
  return (
    <div>
      <PageHeader
        title="Delegation rules"
        description="Temporarily transfer responsibilities between users (vacation, leave, projects)."
        actions={<Button><PlusCircle className="mr-1 h-4 w-4" /> New rule</Button>}
      />

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Delegation</th>
                <th className="px-4 py-3 text-left font-medium">Scope</th>
                <th className="px-4 py-3 text-left font-medium">Period</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {delegationRules.map((d) => {
                const from = users.find((u) => u.id === d.fromUserId);
                const to = users.find((u) => u.id === d.toUserId);
                return (
                  <tr key={d.id} className="data-table-row border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {from && <><Avatar name={from.fullName} color={from.avatarColor} size={28} /><span className="text-sm">{from.fullName}</span></>}
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        {to && <><Avatar name={to.fullName} color={to.avatarColor} size={28} /><span className="text-sm">{to.fullName}</span></>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{d.scope}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {format(new Date(d.startsAt), "MMM d, yyyy")} → {format(new Date(d.endsAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${d.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${d.active ? "bg-success" : "bg-muted-foreground"}`} />
                        {d.active ? "Active" : "Ended"}
                      </span>
                    </td>
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
