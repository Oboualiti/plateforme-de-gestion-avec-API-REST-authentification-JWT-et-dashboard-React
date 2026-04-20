import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, TypeBadge, PriorityBadge } from "@/components/badges";
import { Avatar } from "@/components/Avatar";
import { companies, entities, requests, users } from "@/data/mock";
import { useCurrentUser } from "@/store/auth";
import { ChevronLeft, ChevronRight, PlusCircle, Search } from "lucide-react";
import { format } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import type { RequestStatus } from "@/types";

const PAGE_SIZE = 8;

export default function RequestsList() {
  const user = useCurrentUser();
  const [params] = useSearchParams();
  const scope = params.get("scope") ?? "all";

  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState<string>("all");
  const [sourceEntityId, setSourceEntityId] = useState<string>("all");
  const [targetEntityId, setTargetEntityId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);

  const visible = useMemo(() => {
    if (!user) return [];
    let list = [...requests];
    if (user.role === "senior") list = list.filter((r) => r.companyId === user.companyId);
    if (user.role === "manager") list = list.filter((r) => r.targetEntityId === user.entityId || r.sourceEntityId === user.entityId);
    if (user.role === "team_leader") list = list.filter((r) => r.targetEntityId === user.entityId || r.creatorId === user.id || users.find((u) => u.id === r.creatorId)?.entityId === user.entityId);
    if (user.role === "user") list = list.filter((r) => r.creatorId === user.id);

    if (scope === "mine") list = list.filter((r) => r.creatorId === user.id);
    if (scope === "team" && user.entityId) list = list.filter((r) => r.targetEntityId === user.entityId);

    return list;
  }, [user, scope]);

  const filtered = useMemo(() => {
    return visible.filter((r) => {
      if (companyId !== "all" && r.companyId !== companyId) return false;
      if (sourceEntityId !== "all" && r.sourceEntityId !== sourceEntityId) return false;
      if (targetEntityId !== "all" && r.targetEntityId !== targetEntityId) return false;
      if (status !== "all" && r.status !== status) return false;
      if (q.trim()) {
        const needle = q.toLowerCase();
        if (
          !r.title.toLowerCase().includes(needle) &&
          !r.reference.toLowerCase().includes(needle) &&
          !r.description.toLowerCase().includes(needle)
        )
          return false;
      }
      return true;
    });
  }, [visible, companyId, sourceEntityId, targetEntityId, status, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const scopeTitle: Record<string, string> = {
    all: "All requests",
    mine: "My requests",
    team: "Incoming queue",
    "team-all": "Team requests",
    entity: "Entity requests",
    company: "Company requests",
  };

  return (
    <div>
      <PageHeader
        title={scopeTitle[scope] ?? "Requests"}
        description="Browse, filter, and manage requests across your scope."
        actions={
          <Button asChild>
            <Link to="/requests/new">
              <PlusCircle className="mr-1 h-4 w-4" /> New request
            </Link>
          </Button>
        }
      />

      <div className="surface-card mb-4 p-4">
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search title, reference, description…"
              className="pl-9"
            />
          </div>
          <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setPage(1); }}>
            <SelectTrigger className="lg:col-span-2"><SelectValue placeholder="Company" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceEntityId} onValueChange={(v) => { setSourceEntityId(v); setPage(1); }}>
            <SelectTrigger className="lg:col-span-2"><SelectValue placeholder="Source entity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {entities.filter((e) => e.type === "production").map((e) => <SelectItem key={e.id} value={e.id}>{e.code}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={targetEntityId} onValueChange={(v) => { setTargetEntityId(v); setPage(1); }}>
            <SelectTrigger className="lg:col-span-2"><SelectValue placeholder="Target entity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All targets</SelectItem>
              {entities.filter((e) => e.type !== "production").map((e) => <SelectItem key={e.id} value={e.id}>{e.code}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="lg:col-span-2"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(["new","accepted","in_progress","rejected","completed","closed"] as RequestStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {pageItems.length === 0 ? (
          <EmptyState
            title="No requests match your filters"
            description="Try clearing some filters or creating a new request."
            action={<Button asChild><Link to="/requests/new"><PlusCircle className="mr-1 h-4 w-4" />New request</Link></Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Reference</th>
                  <th className="px-4 py-3 text-left font-medium">Title</th>
                  <th className="px-4 py-3 text-left font-medium">Source → Target</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Priority</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Assignee</th>
                  <th className="px-4 py-3 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => {
                  const src = entities.find((e) => e.id === r.sourceEntityId);
                  const tgt = entities.find((e) => e.id === r.targetEntityId);
                  const assignee = users.find((u) => u.id === r.assigneeId);
                  return (
                    <tr key={r.id} className="data-table-row border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        <Link to={`/requests/${r.id}`} className="hover:text-primary hover:underline">{r.reference}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/requests/${r.id}`} className="font-medium text-foreground hover:text-primary">{r.title}</Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="font-medium text-foreground">{src?.code}</span>
                        <span className="mx-1.5 text-muted-foreground">→</span>
                        <span className="font-medium text-foreground">{tgt?.code}</span>
                      </td>
                      <td className="px-4 py-3"><TypeBadge type={r.type} /></td>
                      <td className="px-4 py-3"><PriorityBadge priority={r.priority} /></td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3">
                        {assignee ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={assignee.fullName} color={assignee.avatarColor} size={24} />
                            <span className="text-xs">{assignee.fullName}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(r.updatedAt), "MMM d, HH:mm")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <div className="text-xs text-muted-foreground">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs text-muted-foreground">
                Page {safePage} of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
