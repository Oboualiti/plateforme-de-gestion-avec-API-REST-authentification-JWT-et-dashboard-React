import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { requests } from "@/data/mock";
import { BarChart3, Download, FileBarChart, FileSpreadsheet, FileText } from "lucide-react";

const reports = [
  { id: "r1", title: "Monthly request volume", description: "Total requests created and resolved per company per month.", icon: BarChart3 },
  { id: "r2", title: "Resolution time analysis", description: "Average time-to-resolution per type and per entity.", icon: FileBarChart },
  { id: "r3", title: "Workload distribution", description: "Requests per assignee, team, and entity.", icon: FileSpreadsheet },
  { id: "r4", title: "SLA compliance", description: "On-time vs overdue resolutions, broken down by priority.", icon: FileText },
];

export default function AdminReports() {
  return (
    <div>
      <PageHeader title="Reports" description="Generate and export reports across the platform." />

      <div className="surface-card mb-4 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total requests</div>
            <div className="mt-1 text-2xl font-semibold">{requests.length}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Average resolution</div>
            <div className="mt-1 text-2xl font-semibold">3.2 days</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">SLA compliance</div>
            <div className="mt-1 text-2xl font-semibold">87%</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {reports.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.id} className="surface-card p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold">{r.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" variant="outline">View</Button>
                    <Button size="sm" variant="ghost"><Download className="mr-1 h-4 w-4" /> Export CSV</Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
