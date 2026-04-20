import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { companies, entities, users } from "@/data/mock";
import { Building2, MoreHorizontal, PlusCircle } from "lucide-react";
import { format } from "date-fns";

export default function AdminCompanies() {
  return (
    <div>
      <PageHeader
        title="Companies"
        description="Manage business units. Each company is fully isolated from the others."
        actions={<Button><PlusCircle className="mr-1 h-4 w-4" /> New company</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {companies.map((c) => {
          const entCount = entities.filter((e) => e.companyId === c.id).length;
          const userCount = users.filter((u) => u.companyId === c.id).length;
          return (
            <div key={c.id} className="surface-card p-5 transition-shadow hover:shadow-elev-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-accent-foreground">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold">{c.code}</div>
                    <div className="text-xs text-muted-foreground">{c.name}</div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{c.description}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                <div>
                  <div className="text-xs text-muted-foreground">Entities</div>
                  <div className="text-sm font-semibold">{entCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Users</div>
                  <div className="text-sm font-semibold">{userCount}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Created {format(new Date(c.createdAt), "MMM d, yyyy")}</span>
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${c.active ? "bg-success/10 text-success" : "bg-muted"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${c.active ? "bg-success" : "bg-muted-foreground"}`} />
                  {c.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
