import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Coins,
  Download,
  Eye,
  Filter,
  FolderOpen,
  Info,
  Paperclip,
  Search,
  Star,
  Trophy,
  Users,
  X,
} from "lucide-react";
import PageHeader from "../components/layout/PageHeader";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select } from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import { Input } from "../components/ui/input";
import SolveDetailsModal from "../components/credits/SolveDetailsModal";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import {
  buildRoleAwareStats,
  filterSolvesByUserRole,
  getPrimaryRole,
  rankPeople,
  rankTeams,
} from "../data/credits";

const ICON_MAP = {
  solved: CheckCircle2,
  users: Users,
  teams: Building2,
  top: Trophy,
  credits: Coins,
  date: Calendar,
};

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString();
}

function getUserById(users, id) {
  return users.find((user) => String(user.id) === String(id));
}

function getEntityById(entities, id) {
  return entities.find((entity) => String(entity.id) === String(id));
}

function evidenceLabel(solve) {
  if (solve.evidenceSummary && solve.evidenceSummary !== "-") return solve.evidenceSummary;
  if (solve.evidenceList && solve.evidenceList.length > 0) {
    const fileCount = solve.evidenceList.filter(e => e.type === "file").length;
    const linkCount = solve.evidenceList.filter(e => e.type === "link").length;
    const parts = [];
    if (fileCount > 0) parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
    if (linkCount > 0) parts.push(`${linkCount} link${linkCount === 1 ? "" : "s"}`);
    return parts.join(", ") || "1 item";
  }
  return "No evidence";
}

function canEditEvidence(solve, currentUser, userRole, userEntityId, userCompanyId) {
  if (!currentUser || !solve) return false;
  
  if (String(currentUser.id) === String(solve.solverId)) return true;
  
  if (userRole === "super_admin") return true;
  
  if (userRole === "manager" || userRole === "senior") {
    if (String(userCompanyId) === String(solve.companyId)) return true;
  }
  
  if (userRole === "team_leader") {
    if (String(userEntityId) === String(solve.entityId)) return true;
  }
  
  return false;
}

function rankTone(idx) {
  if (idx === 0) return "border-warning bg-warning text-ink";
  if (idx === 1) return "border-ink/20 bg-muted text-foreground";
  if (idx === 2) return "border-orange-200 bg-orange-100 text-ink";
  return "border-ink/15 bg-card text-foreground";
}

function TopSolverBadge({ className = "" }) {
  return (
    <Badge className={`rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium text-ink shadow-none ${className}`}>
      <Star className="mr-1 h-3 w-3 fill-blue-500 text-blue-500" />
      Top Solver
    </Badge>
  );
}

function normalizeSolve(solve) {
  return {
    ...solve,
    requestTitle: solve.requestTitle || "Untitled request",
    requestReference: solve.requestReference || "No request reference",
    sourceCompanyName: solve.sourceCompanyName || "Unknown source",
    sourceEntityName: solve.sourceEntityName || "Unknown source",
    requesterName: solve.requesterName || "Unknown requester",
    targetEntityName: solve.targetEntityName || solve.solverEntityName || "Unknown team",
    completionNote: solve.completionNote || solve.note || "",
    requestUrl: solve.requestUrl || (solve.requestId ? `/requests/${solve.requestId}` : ""),
  };
}

function csvEscape(value) {
  const str = `${value ?? ""}`;
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function exportSolvesCsv(rows) {
  const header = [
    "Request",
    "Reference",
    "Solved By",
    "Team",
    "Solved For Company",
    "Solved For Entity",
    "Requester",
    "Evidence",
    "Status",
    "Credits",
    "Completed At",
  ];
  const body = rows.map((row) => [
    row.requestTitle,
    row.requestReference,
    row.solverName,
    row.targetEntityName,
    row.sourceCompanyName,
    row.sourceEntityName,
    row.requesterName,
    evidenceLabel(row),
    row.status || "",
    row.credits || 0,
    row.completedAt || "",
  ]);

  const content = [header, ...body].map((line) => line.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `credits-board-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function CreditsFiltersToolbar({ filters, onChange, onApply, entities, users, canFilterEntity, canFilterUser }) {
  const toolbarControl = "!w-[152px] shrink-0 text-sm";
  const toolbarButton = "h-10 shrink-0 px-4 text-sm font-semibold";
  return (
    <div className="flex w-max max-w-full flex-nowrap items-center justify-end gap-3">
      <div className="relative shrink-0">
        <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Select className={`${toolbarControl} [&_button]:pl-9`} value={filters.date} onChange={(e) => onChange("date", e.target.value)}>
          <option value="30d">Last 30 days</option>
          <option value="7d">Last 7 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </Select>
      </div>

      {canFilterEntity ? (
        <Select className={toolbarControl} value={filters.entityId} onChange={(e) => onChange("entityId", e.target.value)}>
          <option value="all">All teams</option>
          {entities.map((entity) => (
            <option key={entity.id} value={String(entity.id)}>{entity.name}</option>
          ))}
        </Select>
      ) : null}

      {canFilterUser ? (
        <Select className={toolbarControl} value={filters.userId} onChange={(e) => onChange("userId", e.target.value)}>
          <option value="all">All solvers</option>
          {users.map((user) => (
            <option key={user.id} value={String(user.id)}>{user.full_name || user.username}</option>
          ))}
        </Select>
      ) : null}

      <Button className={toolbarButton} onClick={onApply}>
        <Filter className="mr-2 h-4 w-4" />
        Apply
      </Button>
    </div>
  );
}

function CreditsBoardHeader({
  filters,
  onChange,
  onApply,
  entities,
  users,
  canFilterEntity,
  canFilterUser,
  isBasicUser,
}) {
return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight text-foreground">Credits Board</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isBasicUser ? "Track your solved requests and credits." : "Track solved requests and recognize support/dev work."}
        </p>
      </div>

      <div className="w-full overflow-x-auto lg:w-auto lg:overflow-visible">
        <CreditsFiltersToolbar
          filters={filters}
          onChange={onChange}
          onApply={onApply}
          entities={entities}
          users={users}
          canFilterEntity={canFilterEntity}
          canFilterUser={canFilterUser}
        />
      </div>
    </div>
  );
}

function StatsCards({ stats }) {
  const toneByIndex = [
    "border-warning/30 bg-warning/5",
    "border-info/30 bg-info/5",
    "border-primary/20 bg-primary/5",
    "border-success/30 bg-success/5",
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {stats.items.map((item, idx) => {
        const Icon = ICON_MAP[item.icon] || CheckCircle2;
        return (
          <Card key={item.label} className={`${toneByIndex[idx] || "border-ink/10 bg-card"} min-h-[126px] shadow-none`}>
            <CardContent className="flex h-full flex-col justify-between p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/20 bg-card/60">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="h-2 w-2 rounded-full bg-ink/20" />
              </div>
              <p className="text-4xl font-bold leading-none tabular-nums">{item.value}</p>
              <div className="mt-2">
                <p className="text-base font-semibold leading-none">{item.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.hint || ""}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SolvesPanel({
  open,
  onClose,
  contextType = "team",
  title,
  subtitle,
  rows,
  users,
  entities = [],
  onViewDetails,
}) {
  const [drawerSearch, setDrawerSearch] = useState("");
  const [expandedNotes, setExpandedNotes] = useState({});

  if (!open) return null;

  const q = drawerSearch.trim().toLowerCase();
  const visibleRows = q
    ? rows.filter((solve) => {
        const solver = getUserById(users, solve.solverId);
        const team = getEntityById(entities, solve.entityId);
        return [
          solve.requestTitle,
          solve.requestReference,
          solver?.full_name,
          solver?.username,
          team?.name,
          solve.sourceCompanyName,
          solve.sourceEntityName,
          solve.completionNote,
          solve.note,
        ].filter(Boolean).join(" ").toLowerCase().includes(q);
      })
    : rows;

  const totalCredits = rows.reduce((sum, solve) => sum + Number(solve.credits || 0), 0);
  const uniqueSolvers = new Set(rows.map((solve) => solve.solverId).filter(Boolean)).size;
  const firstTeam = getEntityById(entities, rows[0]?.entityId)?.name || rows[0]?.targetEntityName || "-";
  const summaryItems = contextType === "person"
    ? [
        { label: "Solved", value: rows.length, helper: "requests completed", icon: CheckCircle2, tone: "success" },
        { label: "Team", value: firstTeam, helper: "current entity/team", icon: Users, tone: "info" },
        { label: "Credits", value: totalCredits, helper: "earned", icon: Coins, tone: "warning" },
      ]
    : [
        { label: "Solved", value: rows.length, helper: "requests completed", icon: CheckCircle2, tone: "success" },
        { label: "Solvers", value: uniqueSolvers, helper: "active solver", icon: Users, tone: "warning" },
        { label: "Credits", value: totalCredits, helper: "earned", icon: Coins, tone: "info" },
      ];

  const iconTone = {
    success: "border-success/25 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    info: "border-info/25 bg-info/10 text-info",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-[620px] overflow-y-auto border-l border-ink/10 bg-card shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-ink/10 bg-card px-6 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold leading-tight text-foreground">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <Button variant="outline" className="h-10 rounded-md border-ink/20 bg-card px-3 shadow-none" onClick={onClose}>
              Close
              <X className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-3 gap-3">
            {summaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-md border border-ink/10 bg-card p-4">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${iconTone[item.tone]}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-lg font-bold leading-none">{item.value}</div>
                      <div className="mt-1 text-sm font-semibold">{item.label}</div>
                    </div>
                  </div>
                  <div className="mt-1 pl-12 text-xs text-muted-foreground">{item.helper}</div>
                </div>
              );
            })}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={drawerSearch}
              onChange={(e) => setDrawerSearch(e.target.value)}
              placeholder="Search within solved requests..."
              className="h-11 rounded-md border border-ink/10 bg-card pl-10 shadow-none"
            />
          </div>

          <div className="space-y-4">
          {visibleRows.map((solve) => {
            const solver = getUserById(users, solve.solverId);
            const team = getEntityById(entities, solve.entityId);
            const note = solve.completionNote || solve.note || "";
            const isLongNote = note.length > 150;
            const isExpanded = expandedNotes[solve.id];
            const noteText = isLongNote && !isExpanded ? `${note.slice(0, 150)}...` : note;
            return (
              <div key={solve.id} className="rounded-lg border border-ink/10 bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold leading-tight">{solve.requestTitle}</div>
                    <div className="mt-2 text-sm text-muted-foreground">{solve.requestReference}</div>
                  </div>
                  <div className="shrink-0 text-sm text-muted-foreground">{formatDate(solve.completedAt)}</div>
                </div>

                <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-md border border-ink/10">
                  {contextType === "team" ? (
                    <div className="border-b border-r border-ink/10 p-3">
                      <div className="text-xs font-bold text-muted-foreground">Solved by</div>
                      <div className="mt-1 text-sm font-semibold">{solver?.full_name || solver?.username || solve.solverName || "Unknown"}</div>
                    </div>
                  ) : (
                    <div className="border-b border-r border-ink/10 p-3">
                      <div className="text-xs font-bold text-muted-foreground">Solved for</div>
                      <div className="mt-1 text-sm font-semibold">{solve.sourceCompanyName || "-"} / {solve.sourceEntityName || "-"}</div>
                    </div>
                  )}
                  <div className="border-b border-ink/10 p-3">
                    <div className="text-xs font-bold text-muted-foreground">Evidence</div>
                    <div className="mt-1 text-sm font-semibold">{evidenceLabel(solve)}</div>
                  </div>
                  <div className="border-r border-ink/10 p-3">
                    <div className="text-xs font-bold text-muted-foreground">Team</div>
                    <div className="mt-1 text-sm font-semibold">{team?.name || solve.targetEntityName || "-"}</div>
                  </div>
<div className="p-3">
                    <div className="text-xs font-bold text-muted-foreground">Credits</div>
                    <div className="mt-1 text-sm font-semibold">{solve.credits || 0}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Base +{solve.baseCredits || 0} · SLA +{solve.slaBonus || 0} · Evidence +{solve.evidenceBonus || 0}
                    </div>
                  </div>
                </div>

                {note ? (
                  <div className="mt-4">
                    <div className="text-xs font-bold text-muted-foreground">Completion note</div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{noteText}</p>
                    {isLongNote ? (
                      <button
                        type="button"
                        onClick={() => setExpandedNotes((prev) => ({ ...prev, [solve.id]: !prev[solve.id] }))}
                        className="mt-1 text-sm font-semibold text-primary"
                      >
                        {isExpanded ? "Show less" : "Show more"}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-5 flex justify-end gap-3">
                  <Button size="sm" variant="ghost" className="h-10 px-4 shadow-none" onClick={() => onViewDetails(solve)}>Details</Button>
                    {solve.requestUrl ? (
                    <a href={solve.requestUrl}><Button size="sm" variant="outline" className="h-10 rounded-md border-ink bg-card px-4 shadow-none">Open Request</Button></a>
                    ) : null}
                </div>
              </div>
            );
          })}
          {!visibleRows.length ? <div className="rounded-md border border-ink/10 py-8 text-center text-sm text-muted-foreground">No solved requests.</div> : null}
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {visibleRows.length ? 1 : 0} to {visibleRows.length} of {visibleRows.length} request{visibleRows.length === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled><ChevronRight className="h-4 w-4 rotate-180" /></Button>
              <Button size="sm" className="h-9 w-9 rounded-md p-0 shadow-none">1</Button>
              <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamsTable({ solves, entities, users, onViewDetails, currentUser, userRole, userEntityId, userCompanyId }) {
  const teams = rankTeams(solves);
  const [panel, setPanel] = useState(null);

  return (
    <>
      <div className="overflow-x-auto px-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs text-foreground">
              <th className="px-3 py-4 text-left font-bold">Rank</th>
              <th className="px-3 py-4 text-left font-bold">Team</th>
              <th className="px-3 py-4 text-left font-bold">Solved <ArrowDown className="ml-1 inline h-3 w-3" /></th>
              <th className="px-3 py-4 text-left font-bold">Active Solvers</th>
              <th className="px-3 py-4 text-left font-bold">Credits</th>
              <th className="px-3 py-4 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team, idx) => {
              const entity = getEntityById(entities, team.entityId);
              return (
                <tr key={team.entityId} className="border-b border-ink/10">
                  <td className="px-3 py-4 align-middle">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(idx)}`}>{idx + 1}</span>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-success/25 bg-success/10">
                        <Users className="h-5 w-5 text-success" />
                      </span>
                      <div>
                        <div className="font-bold leading-tight">{entity?.name || "Unknown team"}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{entity?.description || entity?.company_name || "Team scope"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="text-lg font-bold leading-none">{team.solvedCount}</div>
                    <div className="mt-1 text-xs text-muted-foreground">solved</div>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="text-lg font-bold leading-none">{team.uniqueSolvers}</div>
                    <div className="mt-1 text-xs text-muted-foreground">active solver{team.uniqueSolvers === 1 ? "" : "s"}</div>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="text-lg font-bold leading-none">{team.totalCredits}</div>
                    <div className="mt-1 text-xs text-muted-foreground">credits</div>
                  </td>
                  <td className="px-3 py-4 text-right align-middle">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 rounded-md border-ink/10 bg-card px-4 shadow-none"
                      onClick={() => {
                        const rows = solves.filter((s) => String(s.entityId) === String(team.entityId));
                        setPanel({
                          contextType: "team",
                          title: `${entity?.name || "Team"} solved requests`,
                          subtitle: `${rows.length} solved request${rows.length === 1 ? "" : "s"} · ${team.uniqueSolvers} active solver${team.uniqueSolvers === 1 ? "" : "s"} · ${team.totalCredits} credits`,
                          rows,
                        });
                      }}
                    >
                      View solves
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!teams.length ? <div className="py-6 text-center text-sm text-muted-foreground">No teams with solved requests yet.</div> : null}
      </div>
      <div className="flex items-center justify-between px-5 py-4 text-sm text-muted-foreground">
        <span>Showing 1 to {teams.length} of {teams.length} teams</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled><ChevronRight className="h-4 w-4 rotate-180" /></Button>
          <Button size="sm" className="h-9 w-9 rounded-md p-0 shadow-none">1</Button>
          <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <SolvesPanel
        open={Boolean(panel)}
        onClose={() => setPanel(null)}
        contextType={panel?.contextType}
        title={panel?.title || ""}
        subtitle={panel?.subtitle || ""}
        rows={panel?.rows || []}
        users={users}
        entities={entities}
        onViewDetails={onViewDetails}
      />
    </>
  );
}

function PeopleTable({ solves, users, entities, onViewDetails, currentUser, userRole, userEntityId, userCompanyId }) {
  const people = rankPeople(solves);
  const total = people.reduce((sum, p) => sum + p.solvedCount, 0) || 1;
  const [panel, setPanel] = useState(null);

  return (
    <>
      <div className="overflow-x-auto px-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs text-foreground">
              <th className="px-3 py-4 text-left font-bold">Rank</th>
              <th className="px-3 py-4 text-left font-bold">Solver</th>
              <th className="px-3 py-4 text-left font-bold">Team / Entity</th>
              <th className="px-3 py-4 text-left font-bold">Solved Requests <ArrowDown className="ml-1 inline h-3 w-3" /></th>
              <th className="px-3 py-4 text-left font-bold">Credits Earned</th>
              <th className="px-3 py-4 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person, idx) => {
              const personUser = getUserById(users, person.userId);
              const entity = getEntityById(entities, person.entityId);
              const percent = ((person.solvedCount / total) * 100).toFixed(2);
              return (
                <tr key={person.userId} className="border-b border-ink/10">
                  <td className="px-3 py-4 align-middle">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(idx)}`}>{idx + 1}</span>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={personUser?.full_name || personUser?.username || "Unknown"}
                        size={40}
                        className="rounded-md border border-blue-200 bg-blue-50 text-blue-700"
                      />
                      <div className="flex items-center gap-2">
                        <div className="font-bold">{personUser?.full_name || personUser?.username || "Unknown"}</div>
                        {person.badges.includes("top_solver") ? (
                          <TopSolverBadge />
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-middle">{entity?.name || "Unknown team"}</td>
                  <td className="px-3 py-4 align-middle">
                    <div className="text-lg font-bold leading-none">{person.solvedCount}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{percent}% of total</div>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="text-lg font-bold leading-none">{person.totalCredits}</div>
                    <div className="mt-1 text-xs text-muted-foreground">credits</div>
                  </td>
                  <td className="px-3 py-4 text-right align-middle">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 rounded-md border-ink/10 bg-card px-4 shadow-none"
                      onClick={() => {
                        const rows = solves.filter((s) => String(s.solverId) === String(person.userId));
                        const teamName = entity?.name || "Unknown team";
                        setPanel({
                          contextType: "person",
                          title: `${personUser?.full_name || personUser?.username || "Solver"} solved requests`,
                          subtitle: `${teamName} · ${rows.length} solved request${rows.length === 1 ? "" : "s"} · ${person.totalCredits} credits`,
                          rows,
                        });
                      }}
                    >
                      View solves
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!people.length ? <div className="py-6 text-center text-sm text-muted-foreground">No people with solved requests yet.</div> : null}
      </div>
      <div className="flex items-center justify-between px-5 py-4 text-sm text-muted-foreground">
        <span>Showing 1 to {people.length} of {people.length} solvers</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled><ChevronRight className="h-4 w-4 rotate-180" /></Button>
          <Button size="sm" className="h-9 w-9 rounded-md p-0 shadow-none">1</Button>
          <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <SolvesPanel
        open={Boolean(panel)}
        onClose={() => setPanel(null)}
        contextType={panel?.contextType}
        title={panel?.title || ""}
        subtitle={panel?.subtitle || ""}
        rows={panel?.rows || []}
        users={users}
        entities={entities}
        onViewDetails={onViewDetails}
      />
    </>
  );
}

function SolvedRequestsTable({ solves, users, entities, onViewDetails, currentUser, userRole, userEntityId, userCompanyId }) {
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const isBasicUser = userRole === "user";
  const topSolverIds = useMemo(
    () => new Set(rankPeople(solves).filter((person) => person.badges.includes("top_solver")).map((person) => String(person.userId))),
    [solves],
  );

  const sorted = useMemo(() => {
    const copy = [...solves];
    copy.sort((a, b) => {
      if (sortBy === "date") {
        const aTime = new Date(a.completedAt || 0).getTime();
        const bTime = new Date(b.completedAt || 0).getTime();
        return sortOrder === "desc" ? bTime - aTime : aTime - bTime;
      }
      if (sortBy === "solver") {
        const aName = getUserById(users, a.solverId)?.full_name || "";
        const bName = getUserById(users, b.solverId)?.full_name || "";
        return sortOrder === "desc" ? bName.localeCompare(aName) : aName.localeCompare(bName);
      }
      return 0;
    });
    return copy;
  }, [solves, sortBy, sortOrder, users]);

  function toggleSort(next) {
    if (sortBy === next) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(next);
      setSortOrder("desc");
    }
  }

  function SortGlyph({ col }) {
    if (sortBy !== col) return null;
    return sortOrder === "desc" ? <ArrowDown className="ml-1 inline h-3 w-3" /> : <ArrowUp className="ml-1 inline h-3 w-3" />;
  }

  return (
    <div className="px-5">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
<thead>
            <tr className="border-b border-ink/10 text-xs text-foreground">
              <th className="px-3 py-4 text-left font-bold">Request</th>
              {!isBasicUser && <th className="cursor-pointer px-3 py-4 text-left font-bold" onClick={() => toggleSort("solver")}>Solved By <SortGlyph col="solver" /></th>}
              {!isBasicUser && <th className="px-3 py-4 text-left font-bold">Team</th>}
              <th className="px-3 py-4 text-left font-bold">Solved For</th>
              <th className="px-3 py-4 text-left font-bold">Evidence</th>
              <th className="cursor-pointer px-3 py-4 text-left font-bold" onClick={() => toggleSort("date")}>Solved Date <SortGlyph col="date" /></th>
              <th className="px-3 py-4 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((solve) => {
              const solver = getUserById(users, solve.solverId);
              const team = getEntityById(entities, solve.entityId);
return (
                <tr key={solve.id} className="border-b border-ink/10">
                  <td className="px-3 py-4 align-middle">
                    <div className="font-bold leading-tight">{solve.requestTitle}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{solve.requestReference}</div>
                  </td>
                  {!isBasicUser && (
                    <>
                      <td className="px-3 py-4 align-middle">
                        <div className="font-bold">{solver?.full_name || solver?.username || solve.solverName || "Unknown solver"}</div>
                        {topSolverIds.has(String(solve.solverId)) ? <TopSolverBadge className="mt-1" /> : null}
                      </td>
                      <td className="px-3 py-4 align-middle font-semibold">{team?.name || solve.targetEntityName || "Unknown team"}</td>
                    </>
                  )}
                  <td className="px-3 py-4 align-middle">
                    <div className="font-semibold">{solve.sourceCompanyName}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{solve.sourceEntityName || solve.requesterName}</div>
                  </td>
<td className="px-3 py-4 align-middle">
                    {canEditEvidence(solve, currentUser, userRole, userEntityId, userCompanyId) ? (
                      solve.evidenceList && solve.evidenceList.length > 0 ? (
                        <button
                          onClick={() => onViewDetails(solve, "evidence")}
                          className="flex items-center gap-1 rounded-md border-0 bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-none hover:bg-muted/80"
                        >
                          <Paperclip className="h-3 w-3" />
                          {evidenceLabel(solve)}
                        </button>
                      ) : (
                        <button
                          onClick={() => onViewDetails(solve, "evidence")}
                          className="flex items-center gap-1 rounded-md border border-dashed border-ink/30 bg-transparent px-2.5 py-1.5 text-xs font-semibold text-muted-foreground shadow-none hover:border-ink/50 hover:bg-muted/50 hover:text-foreground"
                        >
                          <Paperclip className="h-3 w-3" />
                          Add evidence
                        </button>
                      )
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {solve.evidenceList && solve.evidenceList.length > 0 ? (
                          <>
                            <Paperclip className="h-3 w-3" />
                            {evidenceLabel(solve)}
                          </>
                        ) : (
                          "No evidence"
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-4 align-middle text-muted-foreground">{formatDate(solve.completedAt)}</td>
                  <td className="px-3 py-4 text-right align-middle">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" className="h-9 px-3 text-sm font-semibold shadow-none" onClick={() => onViewDetails(solve)}>
                        Details
                      </Button>
                      {solve.requestUrl ? (
                        <a href={solve.requestUrl}><Button size="sm" variant="outline" className="h-10 rounded-md border-ink bg-card px-4 shadow-none">Open Request</Button></a>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!sorted.length ? <div className="py-6 text-center text-sm text-muted-foreground">No solved requests.</div> : null}
      </div>
      {sorted.length === 1 ? (
        <div className="my-5 flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-foreground">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
          <div>
            <div>Only 1 solved request in this period.</div>
            <div className="text-muted-foreground">Change filters to see more.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SolvedWorkCard({ activeTab, setActiveTab, solves, users, entities, onViewDetails, currentUser, userRole, userEntityId, userCompanyId }) {
  const isBasicUser = userRole === "user";
  const tabs = isBasicUser
    ? [
        { key: "my_solves", label: "My Solves" },
        { key: "recognition", label: "Recognition" },
      ]
    : [
        { key: "teams", label: "Teams" },
        { key: "people", label: "People" },
        { key: "requests", label: "Solved Requests" },
      ];

  return (
    <Card className="overflow-hidden rounded-lg border border-ink/10 bg-card shadow-sm">
      <CardHeader className="border-b border-ink/10 px-5 py-4">
        <CardTitle className="text-base font-bold">Solved Work</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="mx-5 flex gap-8 border-b border-ink/10 pt-5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-semibold ${activeTab === tab.key ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

{activeTab === "teams" ? <TeamsTable solves={solves} entities={entities} users={users} onViewDetails={onViewDetails} currentUser={currentUser} userRole={userRole} userEntityId={userEntityId} userCompanyId={userCompanyId} /> : null}
        {activeTab === "people" ? <PeopleTable solves={solves} users={users} entities={entities} onViewDetails={onViewDetails} currentUser={currentUser} userRole={userRole} userEntityId={userEntityId} userCompanyId={userCompanyId} /> : null}
        {activeTab === "requests" ? <SolvedRequestsTable solves={solves} users={users} entities={entities} onViewDetails={onViewDetails} currentUser={currentUser} userRole={userRole} userEntityId={userEntityId} userCompanyId={userCompanyId} /> : null}
        {activeTab === "my_solves" ? <SolvedRequestsTable solves={solves} users={users} entities={entities} onViewDetails={onViewDetails} currentUser={currentUser} userRole={userRole} userEntityId={userEntityId} userCompanyId={userCompanyId} /> : null}
        {activeTab === "recognition" ? (
          <div className="p-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-md border border-ink/20 bg-muted/10 p-4 text-center">
                <div className="text-2xl font-bold">{solves.length}</div>
                <div className="text-xs text-muted-foreground">Total Solved</div>
              </div>
              <div className="rounded-md border border-ink/20 bg-muted/10 p-4 text-center">
                <div className="text-2xl font-bold">{solves.reduce((sum, s) => sum + (s.credits || 0), 0)}</div>
                <div className="text-xs text-muted-foreground">Total Credits</div>
              </div>
              <div className="rounded-md border border-ink/20 bg-muted/10 p-4 text-center">
                <div className="text-2xl font-bold">{solves.filter(s => s.evidenceList?.length > 0).length}</div>
                <div className="text-xs text-muted-foreground">Evidence Added</div>
              </div>
            </div>
            {solves.length > 0 && (
              <div className="mt-6">
                <div className="text-sm font-medium mb-3">Recent Solved Requests</div>
                <div className="space-y-2">
                  {solves.slice(0, 5).map(solve => (
                    <div key={solve.id} className="flex items-center justify-between rounded-md border border-ink/10 bg-background px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{solve.requestTitle}</div>
                        <div className="text-xs text-muted-foreground">{solve.requestReference}</div>
                      </div>
                      <div className="ml-2 text-sm font-semibold">{solve.credits} credits</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {solves.length === 0 && (
              <div className="mt-6 text-center text-sm text-muted-foreground">
                No solved requests yet. Complete requests to earn credits.
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyStateMessage({ role }) {
  const text = role === "manager" || role === "senior"
    ? "No solved requests found in your current scope and filters."
    : role === "team_leader"
      ? "No solved requests found for your team in this period."
      : "No solved requests yet. When you solve a request, it will appear here.";

  return (
    <Card className="border border-ink/10 shadow-none">
      <CardContent className="py-10 text-center text-muted-foreground">{text}</CardContent>
    </Card>
  );
}

export default function CreditsBoard() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [solves, setSolves] = useState([]);
  const [users, setUsers] = useState([]);
  const [entities, setEntities] = useState([]);
const [selectedSolve, setSelectedSolve] = useState(null);
  const [detailsFocus, setDetailsFocus] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

const role = getPrimaryRole(user);
  const isBasicUser = role === "user";
  const canExport = !isBasicUser && ["super_admin", "senior", "manager"].includes(role);
  const canFilterEntity = !isBasicUser && ["super_admin", "senior", "manager", "team_leader"].includes(role);
  const canFilterUser = !isBasicUser && ["super_admin", "senior", "manager", "team_leader"].includes(role);

  const defaultEntityId = role === "team_leader" ? String(user?.entity ?? user?.entity_id ?? "all") : "all";

  const [draftFilters, setDraftFilters] = useState({ date: "30d", entityId: defaultEntityId, userId: "all" });
  const [appliedFilters, setAppliedFilters] = useState({ date: "30d", entityId: defaultEntityId, userId: "all" });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState(isBasicUser ? "my_solves" : "people");

  useEffect(() => {
    const nextEntity = role === "team_leader" ? defaultEntityId : "all";
    setDraftFilters((prev) => ({ ...prev, entityId: nextEntity }));
    setAppliedFilters((prev) => ({ ...prev, entityId: nextEntity }));
  }, [role, defaultEntityId]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const response = await api.get("/credits/solves/");
        const payload = response.data || {};
        const rawSolves = Array.isArray(payload) ? payload : payload.solves || [];
        setSolves(rawSolves.map(normalizeSolve));
        setUsers(payload.users || []);
        setEntities(payload.entities || []);
      } catch (error) {
        console.error("Failed to load credits board", error);
        setSolves([]);
        setUsers([]);
        setEntities([]);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading && user) loadData();
  }, [authLoading, user, reloadTick]);

  const roleScopedSolves = useMemo(() => filterSolvesByUserRole(solves, user), [solves, user]);

  const visibleUsers = useMemo(() => {
    const ids = new Set(roleScopedSolves.map((solve) => solve.solverId));
    return users.filter((row) => ids.has(row.id));
  }, [users, roleScopedSolves]);

  const visibleEntities = useMemo(() => {
    const ids = new Set(roleScopedSolves.map((solve) => solve.entityId));
    return entities.filter((row) => ids.has(row.id));
  }, [entities, roleScopedSolves]);

  const filteredSolves = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return roleScopedSolves.filter((solve) => {
      if (appliedFilters.entityId !== "all" && String(solve.entityId) !== String(appliedFilters.entityId)) return false;
      if (appliedFilters.userId !== "all" && String(solve.solverId) !== String(appliedFilters.userId)) return false;

      if (appliedFilters.date !== "all") {
        const solvedAt = new Date(solve.completedAt || 0).getTime();
        if (!Number.isFinite(solvedAt)) return false;
        const maxAge = appliedFilters.date === "7d" ? 7 * dayMs : appliedFilters.date === "30d" ? 30 * dayMs : 90 * dayMs;
        if (now - solvedAt > maxAge) return false;
      }
      return true;
    });
  }, [roleScopedSolves, appliedFilters]);

  const enrichedSolves = useMemo(() => {
    const normalized = filteredSolves.map((solve) => ({
      ...solve,
      solverName: getUserById(users, solve.solverId)?.full_name || solve.solverName || "Unknown solver",
      targetEntityName: getEntityById(entities, solve.entityId)?.name || solve.targetEntityName,
    }));

    const q = searchTerm.trim().toLowerCase();
    if (!q) return normalized;

    return normalized.filter((solve) => {
      const haystack = [
        solve.requestTitle,
        solve.requestReference,
        solve.solverName,
        solve.targetEntityName,
        solve.sourceCompanyName,
        solve.sourceEntityName,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [filteredSolves, users, entities, searchTerm]);

  const stats = useMemo(() => buildRoleAwareStats(enrichedSolves, user, { users, entities }), [enrichedSolves, user, users, entities]);

  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Credits Board" description="Loading..." />
        <Skeleton className="h-40" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!user) return <PageHeader title="Credits Board" description="Not authenticated" />;

  return (
    <div className="space-y-0">
<CreditsBoardHeader
        filters={draftFilters}
        onChange={(key, value) => setDraftFilters((prev) => ({ ...prev, [key]: value }))}
        onApply={() => setAppliedFilters(draftFilters)}
        entities={visibleEntities}
        users={visibleUsers}
        canFilterEntity={canFilterEntity}
        canFilterUser={canFilterUser}
        isBasicUser={isBasicUser}
      />

      <div className="mt-5">
        <StatsCards stats={stats} />
      </div>

      {canExport ? (
        <div className="mt-3 flex justify-end">
          <Button variant="outline" onClick={() => exportSolvesCsv(enrichedSolves)}>
            <Download className="mr-2 h-4 w-4" />Export visible solves CSV
          </Button>
        </div>
      ) : null}

<div className="mt-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={isBasicUser ? "Search your solved requests..." : "Search solved request, reference, solver, team..."}
          className="h-11 rounded-md border border-ink/10 bg-card pl-10 pr-16"
        />
        <button
          type="button"
          onClick={() => setSearchTerm("")}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      </div>

      <div className="mt-4">
        {enrichedSolves.length ? (
<SolvedWorkCard
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            solves={enrichedSolves}
            users={users}
            entities={entities}
            onViewDetails={(solve, focus) => { setSelectedSolve(solve); setDetailsFocus(focus); }}
            currentUser={user}
            userRole={role}
            userEntityId={user?.entity}
            userCompanyId={user?.company}
          />
        ) : (
          <EmptyStateMessage role={role} />
        )}
      </div>

{selectedSolve ? (
        <SolveDetailsModal
          solve={selectedSolve}
          user={getUserById(users, selectedSolve.solverId)}
          entity={getEntityById(entities, selectedSolve.entityId)}
          currentRole={role}
          currentUser={user}
          initialFocus={detailsFocus}
          onClose={() => { setSelectedSolve(null); setDetailsFocus(null); }}
          onUpdateNote={async (solveId, note) => {
            await api.patch(`/service-requests/${solveId}/`, { resolution_note: note });
          }}
          onAddEvidence={async (solveId, data) => {
            const formData = new FormData();
            const parts = ["Credits evidence"];
            if (data.file) {
              parts.push("type: file");
              formData.append("attachment", data.file);
            } else if (data.link) {
              parts.push("type: link");
              parts.push(`url: ${data.link}`);
            }
            formData.append("message", parts.join("\n"));
            await api.post(`/credits/solves/${solveId}/evidence/`, formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });
          }}
          onRemoveEvidence={async (solveId, messageId) => {
            await api.delete(`/credits/solves/${solveId}/evidence/${messageId}/`);
          }}
          onEvidenceUpdated={() => setReloadTick((x) => x + 1)}
        />
      ) : null}
    </div>
  );
}

