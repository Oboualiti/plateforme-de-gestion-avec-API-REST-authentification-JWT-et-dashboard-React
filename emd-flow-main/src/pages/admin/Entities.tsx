import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { companies, entities } from "@/data/mock";
import { EntityTypeBadge } from "@/components/badges";
import { MoreHorizontal, PlusCircle, Search } from "lucide-react";

export default function AdminEntities() {
  const [companyId, setCompanyId] = useState("all");
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");

  const filtered = entities.filter((e) => {
    if (companyId !== "all" && e.companyId !== companyId) return false;
    if (type !== "all" && e.type !== type) return false;
    if (q.trim() && !e.code.toLowerCase().includes(q.toLowerCase()) && !e.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Entities"
        description="Production, support, and development entities across all companies."
        actions={<Button><PlusCircle className="mr-1 h-4 w-4" /> New entity</Button>}
      />

      <div className="surface-card mb-4 p-4">
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code or name…" className="pl-9" />
          </div>
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger className="lg:col-span-3"><SelectValue placeholder="Company" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.code}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="lg:col-span-2"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="development">Development</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Company</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Members</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const company = companies.find((c) => c.id === e.companyId);
                return (
                  <tr key={e.id} className="data-table-row border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{e.code}</td>
                    <td className="px-4 py-3 font-medium">{e.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{company?.code}</td>
                    <td className="px-4 py-3"><EntityTypeBadge type={e.type} /></td>
                    <td className="px-4 py-3 text-sm">{e.membersCount}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${e.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${e.active ? "bg-success" : "bg-muted-foreground"}`} />
                        {e.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3"><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></td>
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
