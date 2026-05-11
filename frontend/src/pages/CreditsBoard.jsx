import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  Download,
  Eye,
  Filter,
  FolderOpen,
  Info,
  Bug,
  FileCode2,
  Gauge,
  ReceiptText,
  Paperclip,
  Search,
  Shield,
  Star,
  Timer,
  Trophy,
  Users,
  Wrench,
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
import {
  CreditsCell,
  CountCell,
  PendingApprovalCell,
  EvidenceCell,
  DurationCell,
  CoverageCell,
} from "../components/credits/MetricCell";
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

const CREDITS_PAGE_SIZE = 5;

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function formatDurationHours(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return "-";
  if (hours >= 48) return `${(hours / 24).toFixed(1)} days`;
  if (hours >= 1) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
  return `${Math.max(1, Math.round(hours * 60))}m`;
}

function requestStatus(row) {
  return String(row?.requestStatus || row?.status || "").toUpperCase();
}

function completedOnly(row) {
  return requestStatus(row) === "COMPLETED";
}

function closedOnly(row) {
  return requestStatus(row) === "CLOSED";
}

function isEarned(row) {
  return closedOnly(row);
}

function getEarnedCredits(row) {
  return isEarned(row) ? Number(row?.credits || 0) : 0;
}

function getPreviewCredits(row) {
  return Number(row?.previewCredits ?? row?.creditBreakdown?.total ?? row?.credits ?? 0);
}

function hasEvidence(row) {
  return Boolean(row?.hasEvidence) || Boolean(row?.evidenceList?.length);
}

function getSolveTeamLeaderId(solve) {
  return solve?.targetTeamLeaderId ?? solve?.target_team_leader ?? null;
}

function getSolveTeamLeaderName(solve) {
  return solve?.targetTeamLeaderName || solve?.target_team_leader_name || "";
}

function buildTeamLabel(solve) {
  if (solve?.targetTeamLabel) return solve.targetTeamLabel;
  const teamLeaderName = getSolveTeamLeaderName(solve);
  if (teamLeaderName) return `${teamLeaderName}'s Team`;
  if (solve?.targetEntityName) return `${solve.targetEntityName} Legacy Queue`;
  return "Unassigned Team";
}

function matchesCreditsFilter(row, filterKey) {
  switch (filterKey) {
    case "with_evidence":
      return hasEvidence(row);
    case "needs_evidence":
      return completedOnly(row) && !hasEvidence(row);
    case "without_evidence":
      return !hasEvidence(row);
    default:
      return true;
  }
}

function filterRowsForCreditsView(rows, filterKey) {
  return rows.filter((row) => matchesCreditsFilter(row, filterKey));
}

function getCreditsQuickFilters(tabKey) {
  if (tabKey === "closed_requests") {
    return [
      { key: "all", label: "All" },
      { key: "with_evidence", label: "With evidence" },
      { key: "without_evidence", label: "No evidence" },
    ];
  }
  return [
    { key: "all", label: "All" },
    { key: "with_evidence", label: "With evidence" },
    { key: "needs_evidence", label: "Needs evidence" },
  ];
}

function isRequestListTab(tabKey) {
  return ["requests", "resolved_requests", "closed_requests", "my_solves"].includes(tabKey);
}

function CreditsQuickFilters({ value, onChange, tabKey }) {
  const chips = getCreditsQuickFilters(tabKey);

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onChange(chip.key)}
          className={`h-8 rounded-md border px-3 text-xs font-semibold shadow-none transition-colors ${
            value === chip.key
              ? "border-warning bg-warning text-ink"
              : "border-ink/10 bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

function sortByEarnedCreditsThenClosedCount(a, b) {
  const creditDiff = Number(b.totalCredits || 0) - Number(a.totalCredits || 0);
  if (creditDiff) return creditDiff;
  const countDiff = Number(b.closedCount || b.completed || b.solvedCount || 0) - Number(a.closedCount || a.completed || a.solvedCount || 0);
  if (countDiff) return countDiff;
  const aHours = Number.isFinite(Number(a.avgHours)) && Number(a.avgHours) > 0 ? Number(a.avgHours) : Number.POSITIVE_INFINITY;
  const bHours = Number.isFinite(Number(b.avgHours)) && Number(b.avgHours) > 0 ? Number(b.avgHours) : Number.POSITIVE_INFINITY;
  if (aHours !== bHours) return aHours - bHours;
  return String(a.name || a.team || "").localeCompare(String(b.name || b.team || ""));
}

function buildEntityRankings(rows, entities = []) {
  const map = new Map();
  rows.forEach((solve) => {
    const key = solve.entityId || solve.targetEntityName || "unknown";
    const entity = getEntityById(entities, key);
    const current = map.get(key) || {
      entityId: key,
      name: entity?.name || solve.targetEntityName || "Unknown",
      completed: 0,
      solvedCount: 0,
      closedCount: 0,
      pendingCount: 0,
      hoursTotal: 0,
      hoursCount: 0,
      withEvidence: 0,
      totalCredits: 0,
      solverIds: new Set(),
      teamLeaderIds: new Set(),
      lastCompleted: null,
    };
    const teamLeaderId = getSolveTeamLeaderId(solve);
    if (teamLeaderId) current.teamLeaderIds.add(String(teamLeaderId));
    if (closedOnly(solve)) {
      current.completed += 1;
      current.solvedCount += 1;
      current.closedCount += 1;
      current.totalCredits += getEarnedCredits(solve);
      if (solve.solverId) current.solverIds.add(String(solve.solverId));
      if (Number.isFinite(Number(solve.timeToResolveHours))) {
        current.hoursTotal += Number(solve.timeToResolveHours);
        current.hoursCount += 1;
      }
      if (solve.hasEvidence) current.withEvidence += 1;
      const doneAt = solve.closedAt || solve.completedAt;
      const doneTime = doneAt ? new Date(doneAt).getTime() : 0;
      const lastTime = current.lastCompleted ? new Date(current.lastCompleted).getTime() : 0;
      if (doneTime > lastTime) current.lastCompleted = doneAt;
    } else if (completedOnly(solve)) {
      current.pendingCount += 1;
      if (solve.solverId) current.solverIds.add(String(solve.solverId));
    }
    map.set(key, current);
  });

  return [...map.values()].map((item) => ({
    ...item,
    uniqueSolvers: item.solverIds.size,
    activeSolvers: item.solverIds.size,
    teamsCount: item.teamLeaderIds.size,
    avgHours: item.hoursCount ? item.hoursTotal / item.hoursCount : 0,
    coverage: item.closedCount ? Math.round((item.withEvidence / item.closedCount) * 100) : 0,
  })).sort(sortByEarnedCreditsThenClosedCount);
}

function buildTeamLeaderRankings(rows, entities = []) {
  const map = new Map();
  rows.forEach((solve) => {
    const teamLeaderId = getSolveTeamLeaderId(solve);
    const entityId = solve.entityId || "unknown";
    const key = teamLeaderId ? `tl-${teamLeaderId}` : `legacy-${entityId}`;
    const entity = getEntityById(entities, entityId);
    const current = map.get(key) || {
      teamKey: key,
      teamLeaderId: teamLeaderId || null,
      name: buildTeamLabel(solve),
      entityId,
      entityName: entity?.name || solve.targetEntityName || "Unknown",
      completed: 0,
      solvedCount: 0,
      closedCount: 0,
      pendingCount: 0,
      hoursTotal: 0,
      hoursCount: 0,
      withEvidence: 0,
      totalCredits: 0,
      memberIds: new Set(),
      lastCompleted: null,
    };
    if (closedOnly(solve)) {
      current.completed += 1;
      current.solvedCount += 1;
      current.closedCount += 1;
      current.totalCredits += getEarnedCredits(solve);
      if (solve.solverId) current.memberIds.add(String(solve.solverId));
      if (Number.isFinite(Number(solve.timeToResolveHours))) {
        current.hoursTotal += Number(solve.timeToResolveHours);
        current.hoursCount += 1;
      }
      if (solve.hasEvidence) current.withEvidence += 1;
      const doneAt = solve.closedAt || solve.completedAt;
      const doneTime = doneAt ? new Date(doneAt).getTime() : 0;
      const lastTime = current.lastCompleted ? new Date(current.lastCompleted).getTime() : 0;
      if (doneTime > lastTime) current.lastCompleted = doneAt;
    } else if (completedOnly(solve)) {
      current.pendingCount += 1;
      if (solve.solverId) current.memberIds.add(String(solve.solverId));
    }
    map.set(key, current);
  });

  return [...map.values()].map((item) => ({
    ...item,
    membersCount: item.memberIds.size,
    avgHours: item.hoursCount ? item.hoursTotal / item.hoursCount : 0,
    coverage: item.closedCount ? Math.round((item.withEvidence / item.closedCount) * 100) : 0,
  })).sort(sortByEarnedCreditsThenClosedCount);
}

function buildPeopleRankings(rows, users = [], entities = []) {
  const map = new Map();
  rows.forEach((solve) => {
    const key = String(solve.solverId || "unknown");
    const user = getUserById(users, key);
    const entity = getEntityById(entities, solve.entityId);
    const teamLabel = buildTeamLabel(solve);
    const current = map.get(key) || {
      userId: key,
      name: user?.full_name || solve.solverName || "Unknown",
      team: teamLabel,
      entityId: solve.entityId,
      entityName: entity?.name || solve.targetEntityName || "Unknown",
      companyId: solve.companyId,
      completed: 0,
      solvedCount: 0,
      closedCount: 0,
      pendingCount: 0,
      evidenceAdded: 0,
      totalCredits: 0,
      hoursTotal: 0,
      hoursCount: 0,
      firstSolve: solve,
      badges: [],
    };
    if (closedOnly(solve)) {
      current.completed += 1;
      current.solvedCount += 1;
      current.closedCount += 1;
      current.totalCredits += getEarnedCredits(solve);
      if (solve.hasEvidence) current.evidenceAdded += 1;
      if (Number.isFinite(Number(solve.timeToResolveHours))) {
        current.hoursTotal += Number(solve.timeToResolveHours);
        current.hoursCount += 1;
      }
    } else if (completedOnly(solve)) {
      current.pendingCount += 1;
    }
    map.set(key, current);
  });

  const rankings = [...map.values()].map((item) => ({
    ...item,
    avgHours: item.hoursCount ? item.hoursTotal / item.hoursCount : 0,
  })).sort(sortByEarnedCreditsThenClosedCount);
  if (rankings[0]) rankings[0].badges.push("top_solver");
  return rankings;
}

function getRequestTypeMeta(type) {
  const key = String(type || "").toUpperCase();
  if (key === "SCRIPT") {
    return {
      icon: FileCode2,
      tone: "border-blue-200 bg-blue-50 text-blue-700",
      labelTone: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }
  if (key === "TOOL") {
    return {
      icon: Wrench,
      tone: "border-amber-200 bg-amber-50 text-amber-700",
      labelTone: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (key === "APP_PROJECT") {
    return {
      icon: Gauge,
      tone: "border-purple-200 bg-purple-50 text-purple-700",
      labelTone: "border-purple-200 bg-purple-50 text-purple-700",
    };
  }
  if (key === "INFO") {
    return {
      icon: ReceiptText,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      labelTone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  return {
    icon: Bug,
    tone: "border-ink/20 bg-muted text-foreground",
    labelTone: "border-ink/20 bg-muted text-foreground",
  };
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
  if (!["user", "team_leader", "manager"].includes(userRole)) return false;
  if (String(userEntityId) !== String(solve.entityId)) return false;
  if (userRole === "manager") return true;
  if (String(currentUser.id) !== String(solve.solverId)) return false;
  return true;
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
  const status = String(solve.requestStatus || solve.status || "").toUpperCase();
  const earned = status === "CLOSED";
  const targetTeamLeaderId = solve.targetTeamLeaderId ?? solve.target_team_leader ?? null;
  const targetTeamLeaderName = solve.targetTeamLeaderName || solve.target_team_leader_name || "";
  return {
    ...solve,
    requestStatus: status || solve.requestStatus,
    credits: earned ? Number(solve.credits || 0) : 0,
    previewCredits: Number(solve.previewCredits ?? solve.creditBreakdown?.total ?? solve.credits ?? 0),
    isEarned: earned,
    requestTitle: solve.requestTitle || "Untitled request",
    requestReference: solve.requestReference || "No request reference",
    sourceCompanyName: solve.sourceCompanyName || "Unknown source",
    sourceEntityName: solve.sourceEntityName || "Unknown source",
    requesterName: solve.requesterName || "Unknown requester",
    targetEntityName: solve.targetEntityName || solve.solverEntityName || "Unknown team",
    targetTeamLeaderId,
    targetTeamLeaderName,
    targetTeamLabel: solve.targetTeamLabel || buildTeamLabel({
      ...solve,
      targetTeamLeaderId,
      targetTeamLeaderName,
      targetEntityName: solve.targetEntityName || solve.solverEntityName || "Unknown",
    }),
    completionNote: solve.completionNote || solve.note || "",
    requestId: solve.requestId || solve.request_id || solve.id,
    requestUrl: solve.requestUrl || ((solve.requestId || solve.request_id || solve.id) ? `/requests/${solve.requestId || solve.request_id || solve.id}` : ""),
  };
}

function getRequestIdFromSolve(solve) {
  return solve?.requestId || solve?.request_id || solve?.id || null;
}

function extractApiError(error, fallbackMessage) {
  const data = error?.response?.data;
  if (typeof data?.detail === "string" && data.detail.trim()) return data.detail.trim();
  if (data && typeof data === "object") {
    const firstEntry = Object.values(data).flat().find(Boolean);
    if (typeof firstEntry === "string" && firstEntry.trim()) return firstEntry.trim();
  }
  return fallbackMessage;
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
    row.requestStatus || row.status || "",
    getEarnedCredits(row),
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
        <h1 className="text-2xl font-bold leading-tight text-foreground">Resolved Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isBasicUser ? "Review request outcomes for your scope." : "Track solved requests and recognize support/dev work."}
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

function buildProdStats(solves, user, users = []) {
  const earnedRows = solves.filter(closedOnly);
  const teamSolved = earnedRows.length;
  const mySolved = earnedRows.filter((solve) => String(solve.solverId) === String(user?.id)).length;
  const activeMembers = new Set(earnedRows.map((solve) => solve.solverId).filter(Boolean)).size;
  const topMember = buildPeopleRankings(earnedRows, users)[0];
  const topMemberName = topMember
    ? topMember.name
    : "-";

  return {
    label: "Team Metrics",
    items: [
      { label: "Team Solved", value: teamSolved, hint: "in selected period", icon: "solved" },
      { label: "My Solved", value: mySolved, hint: "your completed work", icon: "users" },
      { label: "Active Members", value: activeMembers, hint: "members who solved", icon: "teams" },
      {
        label: "Top Member",
        value: topMemberName,
        hint: topMember ? `${topMember.solvedCount} approved` : "No approved work yet",
        icon: "top",
      },
    ],
    secondary: "",
  };
}

function ProdCreditsHeader({ filters, onDateChange, onApply, entityName = "-" }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight text-foreground">Resolved Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review requests completed by support and development teams for your entity.
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center justify-end gap-3 lg:w-auto">
        <div className="relative shrink-0">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Select className="!w-[170px] [&_button]:pl-9" value={filters.date} onChange={(e) => onDateChange(e.target.value)}>
            <option value="30d">Last 30 days</option>
            <option value="7d">Last 7 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </Select>
        </div>
        <span className="inline-flex h-10 items-center rounded-md border border-ink/20 bg-muted/20 px-3 text-sm font-semibold text-foreground">
          Entity: {entityName}
        </span>
        <Button className="h-10 px-4 text-sm font-semibold" onClick={onApply}>
          <Filter className="mr-2 h-4 w-4" />
          Apply
        </Button>
      </div>
    </div>
  );
}

function ProdSummaryCards({ metrics }) {
  const cards = [
    {
      key: "completed",
      label: "Awaiting Approval",
      value: metrics.completedRequestsCount,
      hint: metrics.completedDeltaText,
      icon: CheckCircle2,
      tone: "border-success/30 bg-success/5",
    },
    {
      key: "in_progress",
      label: "In Progress",
      value: metrics.inProgressCount,
      hint: "currently being handled",
      icon: Clock3,
      tone: "border-warning/30 bg-warning/5",
    },
    {
      key: "avg_time",
      label: "Avg Resolution Time",
      value: metrics.avgResolutionTimeText,
      hint: "for resolved requests",
      icon: Timer,
      tone: "border-info/30 bg-info/5",
    },
    {
      key: "evidence",
      label: "Evidence Coverage",
      value: metrics.evidenceCoverageText,
      hint: `${metrics.withEvidenceCount} of ${metrics.resolvedMetricsCount} resolved requests`,
      icon: Shield,
      tone: "border-primary/20 bg-primary/5",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.key} className={`${item.tone} min-h-[126px] shadow-none`}>
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
                <p className="mt-1 text-sm text-muted-foreground">{item.hint}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ProdResolvedRequestsTable({
  rows,
  onViewDetails,
}) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  const totalPages = Math.max(1, Math.ceil(rows.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pageRows = rows.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

  return (
    <>
      <div className="px-5">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "26%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-ink/10">
              <th className="px-3 py-3 text-left">Request</th>
              <th className="px-3 py-3 text-left">Handled By</th>
              <th className="px-3 py-3 text-left">Support Team</th>
              <th className="px-3 py-3 text-center">Evidence</th>
              <th className="px-3 py-3 text-center">Resolved On</th>
              <th className="px-2 py-3 text-center">Time</th>
              <th className="px-2 py-3 text-center">Status</th>
              <th className="px-2 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((solve) => (
              <tr key={solve.id} className="border-t border-ink/10">
                <td className="px-3 py-4 align-middle">
                  {(() => {
                    const typeMeta = getRequestTypeMeta(solve.requestType);
                    const TypeIcon = typeMeta.icon;
                    return (
                      <div className="flex items-start gap-3">
                        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${typeMeta.tone}`}>
                          <TypeIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold leading-tight">{solve.requestTitle}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{solve.requestReference}</div>
                          {solve.requestType ? (
                            <Badge className={`mt-2 rounded-md border text-[10px] uppercase shadow-none ${typeMeta.labelTone}`}>{solve.requestType}</Badge>
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-3 py-4 align-middle">
                  <div className="flex items-center gap-2">
                    <Avatar name={solve.solverName || "Unknown"} size={28} />
                    <span className="font-medium truncate">{solve.solverName || "Unknown"}</span>
                  </div>
                </td>
                <td className="px-3 py-4 align-middle truncate">{solve.targetEntityName || "-"}</td>
                <td className="px-3 py-4 text-center align-middle">
                  {solve.hasEvidence ? (
                    <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => onViewDetails(solve)}>
                      <Paperclip className="h-3.5 w-3.5" />
                      {evidenceLabel(solve)}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">No evidence</span>
                  )}
                </td>
                <td className="px-3 py-4 text-center align-middle">{formatDateTime(solve.completedAt)}</td>
                <td className="px-2 py-4 text-center align-middle">{formatDurationHours(solve.timeToResolveHours)}</td>
                <td className="px-2 py-4 text-center align-middle">
                  {solve.wasRejected ? (
                    <Badge className="whitespace-nowrap rounded-md border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive shadow-none">
                      Sent back
                    </Badge>
                  ) : closedOnly(solve) ? (
                    <Badge className="whitespace-nowrap rounded-md border-ink/20 bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground shadow-none">
                      Approved
                    </Badge>
                  ) : (
                    <Badge className="whitespace-nowrap rounded-md border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning shadow-none">
                      Awaiting
                    </Badge>
                  )}
                </td>
                <td className="px-2 py-4 text-center align-middle">
                  <Button size="sm" variant="outline" className="h-8 whitespace-nowrap rounded-md border-ink/20 bg-card px-2.5 text-xs font-semibold shadow-none" onClick={() => onViewDetails(solve)}>
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? <div className="py-6 text-center text-sm text-muted-foreground">No resolved requests found.</div> : null}
      <div className="flex items-center justify-between px-5 py-4 text-sm text-muted-foreground">
        <span>Showing {rows.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, rows.length)} of {rows.length} requests</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
            <Button size="sm" className="h-9 w-9 rounded-md p-0 shadow-none">{currentPage}</Button>
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function ProdEntitiesRankingTable({ entitiesRankings, onViewSolves }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [entitiesRankings.length]);

  const totalPages = Math.max(1, Math.ceil(entitiesRankings.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pageEntities = entitiesRankings.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

  return (
    <>
      <div className="px-5">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "9%" }} />
          </colgroup>
          <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-ink/10">
              <th className="px-3 py-3 text-center">Rank</th>
              <th className="px-3 py-3 text-left">Entity</th>
              <th className="px-3 py-3 text-center">Credits</th>
              <th className="px-3 py-3 text-center">Closed</th>
              <th className="px-3 py-3 text-center" title="Completed work waiting for requester approval">Pending</th>
              <th className="px-3 py-3 text-center">Teams</th>
              <th className="px-3 py-3 text-center" title="Active solvers">Solvers</th>
              <th className="px-3 py-3 text-center" title="Evidence coverage">Evidence</th>
              <th className="px-3 py-3 text-center" title="Average resolution time">Avg Time</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pageEntities.map((entity, idx) => {
              const entitySolves = entity.solves || [];
              return (
                <tr key={entity.entityId} className="border-t border-ink/10 transition-colors hover:bg-muted/30">
                  <td className="px-3 py-4 text-center align-middle">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(idx)}`}>{idx + 1}</span>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <Users className="h-4 w-4" />
                      </span>
                      <span className="font-medium truncate">{entity.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CreditsCell value={entity.totalCredits} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CountCell value={entity.closedCount} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <PendingApprovalCell value={entity.pendingCount} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CountCell value={entity.teamsCount} tone="blue" />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CountCell value={entity.activeSolvers} tone="blue" />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CoverageCell value={entity.coverage} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <DurationCell value={formatDurationHours(entity.avgHours)} />
                  </td>
                  <td className="px-3 py-4 text-right align-middle">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-sm font-semibold"
                      onClick={() => onViewSolves(entity)}
                    >
                      Solves →
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!entitiesRankings.length ? <div className="py-6 text-center text-sm text-muted-foreground">No entities with solved requests yet.</div> : null}
      <div className="flex items-center justify-between px-5 py-4 text-sm text-muted-foreground">
        <span>Showing {entitiesRankings.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, entitiesRankings.length)} of {entitiesRankings.length} entities</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
            <Button size="sm" className="h-9 w-9 rounded-md p-0 shadow-none">{currentPage}</Button>
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function ProdTeamsRankingTable({ teams, onViewSolves }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [teams.length]);

  const totalPages = Math.max(1, Math.ceil(teams.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pageTeams = teams.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

  return (
    <>
      <div className="px-5">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-ink/10">
              <th className="px-3 py-3 text-center">Rank</th>
              <th className="px-3 py-3 text-left">Team</th>
              <th className="px-3 py-3 text-left">Entity</th>
              <th className="px-3 py-3 text-center">Credits</th>
              <th className="px-3 py-3 text-center">Closed</th>
              <th className="px-3 py-3 text-center">Pending</th>
              <th className="px-3 py-3 text-center">Members</th>
              <th className="px-3 py-3 text-center">Evidence</th>
              <th className="px-3 py-3 text-center">Avg Time</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pageTeams.map((team, idx) => (
              <tr key={team.teamKey || team.teamLeaderId || team.name} className="border-t border-ink/10 transition-colors hover:bg-muted/30">
                <td className="px-3 py-4 text-center align-middle">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(idx)}`}>{idx + 1}</span>
                </td>
                <td className="px-3 py-4 align-middle">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                      <Users className="h-4 w-4" />
                    </span>
                    <span className="font-medium truncate">{team.name || "Unassigned Team"}</span>
                  </div>
                </td>
                <td className="px-3 py-4 align-middle truncate">{team.entityName || "Unknown"}</td>
                <td className="px-3 py-4 text-center align-middle"><CreditsCell value={team.totalCredits} /></td>
                <td className="px-3 py-4 text-center align-middle"><CountCell value={team.closedCount} /></td>
                <td className="px-3 py-4 text-center align-middle"><PendingApprovalCell value={team.pendingCount} /></td>
                <td className="px-3 py-4 text-center align-middle"><CountCell value={team.membersCount} tone="blue" /></td>
                <td className="px-3 py-4 text-center align-middle"><CoverageCell value={team.coverage} /></td>
                <td className="px-3 py-4 text-center align-middle"><DurationCell value={formatDurationHours(team.avgHours)} /></td>
                <td className="px-3 py-4 text-right align-middle">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3 text-sm font-semibold"
                    onClick={() => onViewSolves(team)}
                  >
                    Solves →
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!teams.length ? <div className="py-6 text-center text-sm text-muted-foreground">No teams with solved requests yet.</div> : null}
      <div className="flex items-center justify-between px-5 py-4 text-sm text-muted-foreground">
        <span>Showing {teams.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, teams.length)} of {teams.length} teams</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
            <Button size="sm" className="h-9 w-9 rounded-md p-0 shadow-none">{currentPage}</Button>
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function ProdPeopleRankingTable({ people, onViewSolves }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [people.length]);

  const totalPages = Math.max(1, Math.ceil(people.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pagePeople = people.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

  return (
    <>
      <div className="px-5">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "9%" }} />
          </colgroup>
          <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-ink/10">
              <th className="px-3 py-3 text-center">Rank</th>
              <th className="px-3 py-3 text-left">Solver</th>
              <th className="px-3 py-3 text-left">Team</th>
              <th className="px-3 py-3 text-left">Entity</th>
              <th className="px-3 py-3 text-center">Credits</th>
              <th className="px-3 py-3 text-center">Closed</th>
              <th className="px-3 py-3 text-center" title="Completed work waiting for requester approval">Pending</th>
              <th className="px-3 py-3 text-center" title="Evidence added">Evidence</th>
              <th className="px-3 py-3 text-center" title="Average resolution time">Avg Time</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pagePeople.map((person, idx) => (
              <tr key={person.userId} className="border-t border-ink/10 transition-colors hover:bg-muted/30">
                <td className="px-3 py-4 text-center align-middle">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(idx)}`}>{idx + 1}</span>
                </td>
                <td className="px-3 py-4 align-middle">
                  <div className="flex items-center gap-2 truncate">
                    <Avatar name={person.name} size={28} />
                    <div className="min-w-0">
                      <span className="block truncate font-medium">{person.name}</span>
                      {idx === 0 && (
                        <Badge className="mt-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 shadow-none">
                          <BadgeCheck className="mr-1 h-2.5 w-2.5" />
                          Top Resolver
                        </Badge>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-4 align-middle truncate">
                  <span className="text-sm">{person.team}</span>
                </td>
                <td className="px-3 py-4 align-middle truncate">
                  <span className="text-sm">{person.entityName || "Unknown entity"}</span>
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CreditsCell value={person.totalCredits} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CountCell value={person.closedCount} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <PendingApprovalCell value={person.pendingCount} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <EvidenceCell value={person.evidenceAdded} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <DurationCell value={formatDurationHours(person.avgHours)} />
                </td>
                <td className="px-3 py-4 text-right align-middle">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3 text-sm font-semibold"
                    onClick={() => onViewSolves(person)}
                  >
                    Solves →
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!people.length ? <div className="py-6 text-center text-sm text-muted-foreground">No people with solved requests yet.</div> : null}
      <div className="flex items-center justify-between px-5 py-4 text-sm text-muted-foreground">
        <span>Showing {people.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, people.length)} of {people.length} solvers</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
            <Button size="sm" className="h-9 w-9 rounded-md p-0 shadow-none">{currentPage}</Button>
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </>
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

  const totalCredits = rows.reduce((sum, solve) => sum + getEarnedCredits(solve), 0);
  const uniqueSolvers = new Set(rows.map((solve) => solve.solverId).filter(Boolean)).size;
  const firstTeam = getEntityById(entities, rows[0]?.entityId)?.name || rows[0]?.targetEntityName || "-";
  const summaryItems = contextType === "person"
    ? [
        { label: "Approved", value: rows.length, helper: "closed requests", icon: CheckCircle2, tone: "success" },
        { label: "Team", value: firstTeam, helper: "current entity/team", icon: Users, tone: "info" },
        { label: "Credits", value: totalCredits, helper: "earned", icon: Coins, tone: "warning" },
      ]
    : [
        { label: "Approved", value: rows.length, helper: "closed requests", icon: CheckCircle2, tone: "success" },
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
                    <div className="mt-1 text-sm font-semibold">{getEarnedCredits(solve)}</div>
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

function EntitiesTable({ solves, entities, users, onViewDetails, currentUser, userRole, userEntityId, userCompanyId }) {
  const entitiesRankings = buildEntityRankings(solves, entities);
  const [panel, setPanel] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [entitiesRankings.length]);

  const totalPages = Math.max(1, Math.ceil(entitiesRankings.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pageEntities = entitiesRankings.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

  return (
    <>
      <div className="px-5">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "9%" }} />
          </colgroup>
          <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-ink/10">
              <th className="px-3 py-3 text-center">Rank</th>
              <th className="px-3 py-3 text-left">Entity</th>
              <th className="px-3 py-3 text-center">Credits</th>
              <th className="px-3 py-3 text-center">Closed</th>
              <th className="px-3 py-3 text-center" title="Completed work waiting for requester approval">Pending</th>
              <th className="px-3 py-3 text-center" title="Distinct TL-owned teams in this entity">Teams</th>
              <th className="px-3 py-3 text-center" title="Active solvers">Solvers</th>
              <th className="px-3 py-3 text-center" title="Evidence coverage">Evidence</th>
              <th className="px-3 py-3 text-center" title="Average resolution time">Avg Time</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pageEntities.map((entityRanking, idx) => {
              const entity = getEntityById(entities, entityRanking.entityId);
              const teamSolves = solves.filter((s) => closedOnly(s) && String(s.entityId) === String(entityRanking.entityId));
              return (
                <tr key={entityRanking.entityId} className="border-t border-ink/10 transition-colors hover:bg-muted/30">
                  <td className="px-3 py-4 text-center align-middle">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(idx)}`}>{idx + 1}</span>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <Users className="h-4 w-4" />
                      </span>
                      <span className="font-medium truncate">{entity?.name || entityRanking.name || "Unknown entity"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CreditsCell value={entityRanking.totalCredits} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CountCell value={entityRanking.closedCount} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <PendingApprovalCell value={entityRanking.pendingCount} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CountCell value={entityRanking.teamsCount} tone="blue" />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CountCell value={entityRanking.uniqueSolvers} tone="blue" />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CoverageCell value={entityRanking.coverage} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <DurationCell value={formatDurationHours(entityRanking.avgHours)} />
                  </td>
                  <td className="px-3 py-4 text-right align-middle">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-sm font-semibold"
                      onClick={() => {
                        setPanel({
                          contextType: "team",
                          title: `${entity?.name || entityRanking.name || "Entity"} solved requests`,
                          subtitle: `${teamSolves.length} solved request${teamSolves.length === 1 ? "" : "s"} · ${entityRanking.uniqueSolvers} active solver${entityRanking.uniqueSolvers === 1 ? "" : "s"} · ${entityRanking.totalCredits} credits`,
                          rows: teamSolves,
                        });
                      }}
                    >
                      Solves →
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!entitiesRankings.length ? <div className="py-6 text-center text-sm text-muted-foreground">No entities with solved requests yet.</div> : null}
      </div>
      <div className="flex items-center justify-between px-5 py-4 text-sm text-muted-foreground">
        <span>Showing {entitiesRankings.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, entitiesRankings.length)} of {entitiesRankings.length} entities</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
            <Button size="sm" className="h-9 w-9 rounded-md p-0 shadow-none">{currentPage}</Button>
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
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

function TeamsTable({ solves, entities, users, onViewDetails }) {
  const teams = buildTeamLeaderRankings(solves, entities);
  const [panel, setPanel] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [teams.length]);

  const totalPages = Math.max(1, Math.ceil(teams.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pageTeams = teams.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

  return (
    <>
      <div className="px-5">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-ink/10">
              <th className="px-3 py-3 text-center">Rank</th>
              <th className="px-3 py-3 text-left">Team</th>
              <th className="px-3 py-3 text-left">Entity</th>
              <th className="px-3 py-3 text-center">Credits</th>
              <th className="px-3 py-3 text-center">Closed</th>
              <th className="px-3 py-3 text-center" title="Completed work waiting for requester approval">Pending</th>
              <th className="px-3 py-3 text-center">Members</th>
              <th className="px-3 py-3 text-center" title="Evidence coverage">Evidence</th>
              <th className="px-3 py-3 text-center" title="Average resolution time">Avg Time</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pageTeams.map((team, idx) => {
              const teamSolves = solves.filter((s) => {
                const solveTeamLeaderId = getSolveTeamLeaderId(s);
                if (team.teamLeaderId) {
                  return closedOnly(s) && String(solveTeamLeaderId) === String(team.teamLeaderId);
                }
                return closedOnly(s) && !solveTeamLeaderId && String(s.entityId) === String(team.entityId);
              });
              return (
                <tr key={team.teamKey} className="border-t border-ink/10 transition-colors hover:bg-muted/30">
                  <td className="px-3 py-4 text-center align-middle">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(idx)}`}>{idx + 1}</span>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <Users className="h-4 w-4" />
                      </span>
                      <span className="font-medium truncate">{team.name || "Unassigned Team"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-middle truncate">
                    <span className="text-sm">{team.entityName || "Unknown"}</span>
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CreditsCell value={team.totalCredits} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CountCell value={team.closedCount} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <PendingApprovalCell value={team.pendingCount} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CountCell value={team.membersCount} tone="blue" />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CoverageCell value={team.coverage} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <DurationCell value={formatDurationHours(team.avgHours)} />
                  </td>
                  <td className="px-3 py-4 text-right align-middle">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-sm font-semibold"
                      onClick={() => {
                        setPanel({
                          contextType: "team",
                          title: `${team.name || "Team"} solved requests`,
                          subtitle: `${teamSolves.length} solved request${teamSolves.length === 1 ? "" : "s"} · ${team.membersCount} member${team.membersCount === 1 ? "" : "s"} · ${team.totalCredits} credits`,
                          rows: teamSolves,
                        });
                      }}
                    >
                      Solves →
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
        <span>Showing {teams.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, teams.length)} of {teams.length} teams</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
            <Button size="sm" className="h-9 w-9 rounded-md p-0 shadow-none">{currentPage}</Button>
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
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
  const people = buildPeopleRankings(solves, users, entities);
  const [panel, setPanel] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [people.length]);

  const totalPages = Math.max(1, Math.ceil(people.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pagePeople = people.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

  return (
    <>
      <div className="px-5">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-ink/10">
              <th className="px-3 py-3 text-center">Rank</th>
              <th className="px-3 py-3 text-left">Solver</th>
              <th className="px-3 py-3 text-left">Team</th>
              <th className="px-3 py-3 text-left">Entity</th>
              <th className="px-3 py-3 text-center">Credits</th>
              <th className="px-3 py-3 text-center">Closed</th>
              <th className="px-3 py-3 text-center" title="Completed work waiting for requester approval">Pending</th>
              <th className="px-3 py-3 text-center" title="Evidence added">Evidence</th>
              <th className="px-3 py-3 text-center" title="Average resolution time">Avg Time</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pagePeople.map((person, idx) => {
              const personUser = getUserById(users, person.userId);
              const entity = getEntityById(entities, person.entityId);
              const personSolves = solves.filter((s) => closedOnly(s) && String(s.solverId) === String(person.userId));
              return (
                <tr key={person.userId} className="border-t border-ink/10 transition-colors hover:bg-muted/30">
                  <td className="px-3 py-4 text-center align-middle">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(idx)}`}>{idx + 1}</span>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="flex items-center gap-2 truncate">
                      <Avatar
                        name={personUser?.full_name || personUser?.username || person.name || "Unknown"}
                        size={28}
                      />
                      <div className="min-w-0">
                        <span className="block truncate font-medium">{personUser?.full_name || personUser?.username || person.name || "Unknown"}</span>
                        {person.badges.includes("top_solver") && (
                          <Badge className="mt-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 shadow-none">
                            <BadgeCheck className="mr-1 h-2.5 w-2.5" />
                            Top Resolver
                          </Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-middle truncate">
                    <span className="text-sm">{person.team || "Unassigned Team"}</span>
                  </td>
                  <td className="px-3 py-4 align-middle truncate">
                    <span className="text-sm">{entity?.name || person.entityName || "Unknown entity"}</span>
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CreditsCell value={person.totalCredits} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <CountCell value={person.closedCount} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <PendingApprovalCell value={person.pendingCount} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <EvidenceCell value={person.evidenceAdded} />
                  </td>
                  <td className="px-3 py-4 text-center align-middle">
                    <DurationCell value={formatDurationHours(person.avgHours)} />
                  </td>
                  <td className="px-3 py-4 text-right align-middle">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-sm font-semibold"
                      onClick={() => {
                        const teamName = person.team || "Unassigned Team";
                        const entityName = entity?.name || person.entityName || "Unknown entity";
                        setPanel({
                          contextType: "person",
                          title: `${personUser?.full_name || personUser?.username || person.name || "Solver"} solved requests`,
                          subtitle: `${teamName} · ${entityName} · ${personSolves.length} solved request${personSolves.length === 1 ? "" : "s"} · ${person.totalCredits} credits`,
                          rows: personSolves,
                        });
                      }}
                    >
                      Solves →
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
        <span>Showing {people.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, people.length)} of {people.length} solvers</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
            <Button size="sm" className="h-9 w-9 rounded-md p-0 shadow-none">{currentPage}</Button>
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
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

function SolvedRequestsTable({
  solves,
  users,
  entities,
  onViewDetails,
  currentUser,
  userRole,
  userEntityId,
  userCompanyId,
  isProdEntityUser = false,
  onApproveResult,
  onRejectResult,
  statusActionBusyId = null,
}) {
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const isBasicUser = userRole === "user";
  const topSolverIds = useMemo(
    () => new Set(rankPeople(solves).filter((person) => person.badges.includes("top_solver")).map((person) => String(person.userId))),
    [solves],
  );

  useEffect(() => {
    setPage(1);
  }, [solves.length, sortBy, sortOrder]);

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

  const totalPages = Math.max(1, Math.ceil(sorted.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pageRows = sorted.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs text-foreground">
              <th className="px-3 py-4 text-left font-bold">Request</th>
              {!isBasicUser && <th className="cursor-pointer px-3 py-4 text-left font-bold" onClick={() => toggleSort("solver")}>Solver <SortGlyph col="solver" /></th>}
              {!isBasicUser && <th className="px-3 py-4 text-left font-bold">Team</th>}
              <th className="px-3 py-4 text-left font-bold">Solved For</th>
              <th className="px-3 py-4 text-left font-bold">Evidence</th>
              <th className="cursor-pointer px-3 py-4 text-left font-bold" onClick={() => toggleSort("date")}>Date <SortGlyph col="date" /></th>
              <th className="px-3 py-4 text-left font-bold">Status</th>
              <th className="px-3 py-4 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((solve) => {
              const solver = getUserById(users, solve.solverId);
              const team = getEntityById(entities, solve.entityId);
return (
                <tr key={solve.id} className="border-b border-ink/10">
                  <td className="px-3 py-4 align-middle">
                    {(() => {
                      const typeMeta = getRequestTypeMeta(solve.requestType);
                      const TypeIcon = typeMeta.icon;
                      return (
                        <div className="flex items-start gap-3">
                          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${typeMeta.tone}`}>
                            <TypeIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            {solve.requestUrl ? (
                              <>
                                <a
                                  href={solve.requestUrl}
                                  className="font-bold leading-tight text-foreground hover:text-primary"
                                >
                                  {solve.requestTitle}
                                </a>
                                <a
                                  href={solve.requestUrl}
                                  className="mt-0.5 block text-xs text-muted-foreground hover:text-primary"
                                >
                                  {solve.requestReference}
                                </a>
                              </>
                            ) : (
                              <>
                                <div className="font-bold leading-tight">{solve.requestTitle}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">{solve.requestReference}</div>
                              </>
                            )}
                            {solve.requestType ? (
                              <Badge className={`mt-2 rounded-md border text-[10px] uppercase shadow-none ${typeMeta.labelTone}`}>
                                {solve.requestType}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      );
                    })()}
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
                  <td className="px-3 py-4 align-middle">
                    {solve.wasRejected ? (
                      <div>
                        <Badge className="border-destructive/30 bg-destructive/10 text-destructive shadow-none">Sent back</Badge>
                        {solve.rejectionReason ? <div className="mt-1 text-xs text-muted-foreground">{solve.rejectionReason}</div> : null}
                      </div>
                    ) : closedOnly(solve) ? (
                      <Badge className="border-ink/20 bg-muted text-foreground shadow-none">Approved</Badge>
                    ) : (
                      <Badge className="border-warning/30 bg-warning/10 text-warning shadow-none">Pending approval</Badge>
                    )}
                  </td>
                  <td className="px-3 py-4 text-right align-middle">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-sm font-semibold"
                      onClick={() => onViewDetails(solve)}
                    >
                      Details →
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!sorted.length ? <div className="py-6 text-center text-sm text-muted-foreground">No solved requests.</div> : null}
      <div className="flex items-center justify-between px-5 py-4 text-sm text-muted-foreground">
        <span>Showing {sorted.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, sorted.length)} of {sorted.length} requests</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
            <Button size="sm" className="h-9 w-9 rounded-md p-0 shadow-none">{currentPage}</Button>
            <Button size="sm" variant="outline" className="h-9 w-9 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
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

function SolvedWorkCard({
  activeTab,
  activeQuickFilter,
  setActiveTab,
  setActiveQuickFilter,
  solves,
  allSolves = [],
  users,
  entities,
  onViewDetails,
  currentUser,
  userRole,
  userEntityId,
  userCompanyId,
  isProdEntityUser = false,
  onApproveResult,
  onRejectResult,
  statusActionBusyId = null,
}) {
  const isBasicUser = userRole === "user";
  const isProdReviewer = isProdEntityUser && (userRole === "manager" || userRole === "team_leader");
  const sourceRows = Array.isArray(allSolves) && allSolves.length ? allSolves : solves;
  const rankingRows = isProdEntityUser ? sourceRows : allSolves;
  const completedRows = filterRowsForCreditsView(sourceRows.filter(completedOnly), activeQuickFilter);
  const closedRows = filterRowsForCreditsView(sourceRows.filter(closedOnly), activeQuickFilter);
  const mySolveRows = filterRowsForCreditsView(sourceRows.filter(completedOnly), activeQuickFilter);
  const showQuickFilters = isRequestListTab(activeTab);
  const tabs = isProdReviewer
    ? [
        { key: "entities", label: "Entities" },
        { key: "teams", label: "Teams" },
        { key: "people", label: "People" },
        { key: "requests", label: "Solved Requests" },
        { key: "closed_requests", label: "Closed Requests" },
      ]
    : isProdEntityUser
    ? [
        { key: "entities", label: "Entities" },
        { key: "teams", label: "Teams" },
        { key: "people", label: "People" },
        { key: "requests", label: "Solved Requests" },
        { key: "closed_requests", label: "Closed Requests" },
      ]
    : isBasicUser
    ? [
        { key: "entities", label: "Entities" },
        { key: "teams", label: "Teams" },
        { key: "people", label: "People" },
        { key: "my_solves", label: "My Solves" },
        { key: "closed_requests", label: "Closed Requests" },
        { key: "recognition", label: "Recognition" },
      ]
    : [
        { key: "entities", label: "Entities" },
        { key: "teams", label: "Teams" },
        { key: "people", label: "People" },
        { key: "requests", label: "Solved Requests" },
        { key: "closed_requests", label: "Closed Requests" },
      ];

  return (
    <Card className="overflow-hidden rounded-lg border border-ink/10 bg-card shadow-sm">
      <CardHeader className="border-b border-ink/10 px-5 py-4">
        <CardTitle className="text-base font-bold">Resolution Activity</CardTitle>
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

        {showQuickFilters ? (
          <div className="mx-5 mt-4">
            <CreditsQuickFilters value={activeQuickFilter} onChange={setActiveQuickFilter} tabKey={activeTab} />
          </div>
        ) : null}

        {activeTab === "entities" ? <EntitiesTable solves={rankingRows} entities={entities} users={users} onViewDetails={onViewDetails} currentUser={currentUser} userRole={userRole} userEntityId={userEntityId} userCompanyId={userCompanyId} /> : null}
        {activeTab === "teams" ? <TeamsTable solves={rankingRows} entities={entities} users={users} onViewDetails={onViewDetails} /> : null}
        {activeTab === "people" ? <PeopleTable solves={rankingRows} users={users} entities={entities} onViewDetails={onViewDetails} currentUser={currentUser} userRole={userRole} userEntityId={userEntityId} userCompanyId={userCompanyId} /> : null}
        {activeTab === "requests" ? (
          <SolvedRequestsTable
            solves={completedRows}
            users={users}
            entities={entities}
            onViewDetails={onViewDetails}
            currentUser={currentUser}
            userRole={userRole}
            userEntityId={userEntityId}
            userCompanyId={userCompanyId}
            isProdEntityUser={isProdEntityUser}
            onApproveResult={onApproveResult}
            onRejectResult={onRejectResult}
            statusActionBusyId={statusActionBusyId}
          />
        ) : null}
        {activeTab === "closed_requests" ? (
          <SolvedRequestsTable
            solves={closedRows}
            users={users}
            entities={entities}
            onViewDetails={onViewDetails}
            currentUser={currentUser}
            userRole={userRole}
            userEntityId={userEntityId}
            userCompanyId={userCompanyId}
            isProdEntityUser={false}
            onApproveResult={onApproveResult}
            onRejectResult={onRejectResult}
            statusActionBusyId={statusActionBusyId}
          />
        ) : null}
        {activeTab === "my_solves" ? (
          <SolvedRequestsTable
            solves={mySolveRows}
            users={users}
            entities={entities}
            onViewDetails={onViewDetails}
            currentUser={currentUser}
            userRole={userRole}
            userEntityId={userEntityId}
            userCompanyId={userCompanyId}
            isProdEntityUser={isProdEntityUser}
            onApproveResult={onApproveResult}
            onRejectResult={onRejectResult}
            statusActionBusyId={statusActionBusyId}
          />
        ) : null}
        {activeTab === "recognition" ? (
          <div className="p-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-md border border-ink/20 bg-muted/10 p-4 text-center">
                <div className="text-2xl font-bold">{solves.length}</div>
                <div className="text-xs text-muted-foreground">Total Solved</div>
              </div>
              <div className="rounded-md border border-ink/20 bg-muted/10 p-4 text-center">
                <div className="text-2xl font-bold">{solves.reduce((sum, s) => sum + getEarnedCredits(s), 0)}</div>
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
                      <div className="ml-2 text-sm font-semibold">{getEarnedCredits(solve)} credits</div>
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

function EmptyStateMessage({ role, isProdEntityUser = false }) {
  const text = isProdEntityUser
    ? "No completed requests are waiting for your validation in this period."
    : role === "manager" || role === "senior"
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
  const [backendEntityRankings, setBackendEntityRankings] = useState([]);
  const [backendTeamRankings, setBackendTeamRankings] = useState([]);
  const [backendPeopleRankings, setBackendPeopleRankings] = useState([]);
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [detailsFocus, setDetailsFocus] = useState(null);
  const [prodPanel, setProdPanel] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  const role = getPrimaryRole(user);
  const entityType = String(user?.entity_type || user?.entity?.entity_type || "").toUpperCase();
  const isProdEntityUser = entityType === "PROD";
  const isProdRequesterView = isProdEntityUser;
  const isBasicUser = role === "user";
  const canExport = !isBasicUser && ["super_admin", "senior", "manager"].includes(role);
  const canFilterEntity = !isBasicUser && ["super_admin", "senior", "manager", "team_leader"].includes(role);
  const canFilterUser = !isBasicUser && ["super_admin", "senior", "manager", "team_leader"].includes(role);

  const defaultEntityId = role === "team_leader" && !isProdEntityUser
    ? String(user?.entity ?? user?.entity_id ?? "all")
    : "all";

  const [draftFilters, setDraftFilters] = useState({ date: "30d", entityId: defaultEntityId, userId: "all" });
  const [appliedFilters, setAppliedFilters] = useState({ date: "30d", entityId: defaultEntityId, userId: "all" });
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeQuickFilter, setActiveQuickFilter] = useState("all");

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  const [activeTab, setActiveTab] = useState(isProdRequesterView ? "entities" : (isProdEntityUser ? "requests" : (isBasicUser ? "my_solves" : "people")));
  const [statusActionBusyId, setStatusActionBusyId] = useState(null);
  const [prodRequestCounts, setProdRequestCounts] = useState({ inProgress: 0 });

  useEffect(() => {
    const nextEntity = role === "team_leader" ? defaultEntityId : "all";
    setDraftFilters((prev) => ({ ...prev, entityId: nextEntity }));
    setAppliedFilters((prev) => ({ ...prev, entityId: nextEntity }));
  }, [role, defaultEntityId]);

  useEffect(() => {
    if (isProdRequesterView) {
      setActiveTab("entities");
      return;
    }
    if (isProdEntityUser) setActiveTab("requests");
  }, [isProdEntityUser, isProdRequesterView]);

  useEffect(() => {
    if (!isRequestListTab(activeTab)) {
      if (activeQuickFilter !== "all") setActiveQuickFilter("all");
      return;
    }
    const validFilters = new Set(getCreditsQuickFilters(activeTab).map((chip) => chip.key));
    if (!validFilters.has(activeQuickFilter)) {
      setActiveQuickFilter("all");
    }
  }, [activeTab, activeQuickFilter]);

  async function changeSolvedResultStatus(solve, nextStatus, extra = {}) {
    const requestId = getRequestIdFromSolve(solve);
    if (!requestId) {
      throw new Error("Could not find the request ID for this result.");
    }
    setStatusActionBusyId(requestId);
    try {
      const payload = {
        status: nextStatus,
        note:
          nextStatus === "CLOSED"
            ? "Result approved by requester-side PROD team."
            : (extra.rejectionNote || "Result rejected by requester-side PROD team. Returned to in progress."),
      };
      if (nextStatus === "IN_PROGRESS") {
        payload.rejection_reason = extra.rejectionReason || "";
        payload.rejection_note = extra.rejectionNote || "";
      }
      const response = await api.post(`/requests/${requestId}/status/`, payload);
      if (nextStatus === "CLOSED" && isProdEntityUser) {
        setActiveTab("closed_requests");
      }
      setReloadTick((x) => x + 1);
      return response?.data;
    } catch (error) {
      console.error("Credits status update failed", error?.response?.status, error?.response?.data || error);
      throw new Error(
        extractApiError(
          error,
          nextStatus === "IN_PROGRESS"
            ? "Could not send request back. Please try again."
            : "Could not approve request result. Please try again.",
        ),
      );
    } finally {
      setStatusActionBusyId(null);
    }
  }

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const response = await api.get("/credits/solves/", { params: { include_rankings: true } });
        const payload = response.data || {};
        const rawSolves = Array.isArray(payload) ? payload : payload.solves || [];
        setSolves(rawSolves.map(normalizeSolve));
        setUsers(payload.users || []);
        setEntities(payload.entities || []);
        setBackendEntityRankings(payload.entityRankings || payload.teamRankings || []);
        setBackendTeamRankings(payload.teamRankings || []);
        setBackendPeopleRankings(payload.peopleRankings || []);
        if (isProdRequesterView) {
          const statuses = ["NEW", "ACCEPTED", "IN_PROGRESS"];
          const countCalls = statuses.map((status) => (
            api.get("/requests/", { params: { scope: "all", status, page: 1, page_size: 1 } })
          ));
          const countResponses = await Promise.all(countCalls);
          const inProgress = countResponses.reduce((sum, item) => {
            const data = item?.data || {};
            return sum + Number(data.count || 0);
          }, 0);
          setProdRequestCounts({ inProgress });
        } else {
          setProdRequestCounts({ inProgress: 0 });
        }
      } catch (error) {
        console.error("Failed to load credits board", error);
        setSolves([]);
        setUsers([]);
        setEntities([]);
        setBackendEntityRankings([]);
        setBackendTeamRankings([]);
        setBackendPeopleRankings([]);
        setProdRequestCounts({ inProgress: 0 });
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading && user) loadData();
  }, [authLoading, user, reloadTick, isProdRequesterView]);

  // TODO: Implement server-side pagination when backend supports:
  // GET /credits/solves/?status=COMPLETED&page=2&page_size=5
  // Currently using client-side pagination after fetching all rows.

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

    const q = debouncedSearch.trim().toLowerCase();
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
  }, [filteredSolves, users, entities, debouncedSearch]);

  const closedOnlySolves = useMemo(
    () => enrichedSolves.filter(closedOnly),
    [enrichedSolves],
  );
  const completedOnlySolves = useMemo(
    () => enrichedSolves.filter(completedOnly),
    [enrichedSolves],
  );

  const stats = useMemo(() => buildRoleAwareStats(closedOnlySolves, user, { users, entities }), [closedOnlySolves, user, users, entities]);
  const prodStats = useMemo(() => buildProdStats(closedOnlySolves, user, users), [closedOnlySolves, user, users]);
  const visibleStats = isProdEntityUser ? prodStats : stats;
  const prodSummaryMetrics = useMemo(() => {
    const completedRequestsCount = completedOnlySolves.length;
    const previousCompleted = roleScopedSolves.filter((solve) => {
      if (!completedOnly(solve)) return false;
      const resolvedAt = new Date(solve.completedAt || 0).getTime();
      if (!Number.isFinite(resolvedAt)) return false;
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const selectedDays = appliedFilters.date === "7d" ? 7 : appliedFilters.date === "30d" ? 30 : appliedFilters.date === "90d" ? 90 : 30;
      return resolvedAt < (now - selectedDays * dayMs) && resolvedAt >= (now - selectedDays * 2 * dayMs);
    }).length;
    const delta = completedRequestsCount - previousCompleted;
    const completedDeltaText = Number.isFinite(delta) && previousCompleted >= 0
      ? `${delta >= 0 ? "+" : ""}${delta} vs previous period`
      : "in selected period";

    const resolvedSolves = [...completedOnlySolves, ...closedOnlySolves];
    const resolvedCount = resolvedSolves.length;
    const resolvedWithEvidence = resolvedSolves.filter(s => s.hasEvidence).length;

    const validResolutionHours = resolvedSolves
      .map((solve) => Number(solve.timeToResolveHours))
      .filter((hours) => Number.isFinite(hours) && hours > 0);

    const avgHoursRaw = validResolutionHours.length
      ? validResolutionHours.reduce((sum, hours) => sum + hours, 0) / validResolutionHours.length
      : null;

    const evidenceCoveragePercent = resolvedCount
      ? Math.round((resolvedWithEvidence / resolvedCount) * 100)
      : 0;

    return {
      completedRequestsCount,
      completedDeltaText,
      inProgressCount: prodRequestCounts.inProgress || 0,
      avgResolutionTimeText: avgHoursRaw ? formatDurationHours(avgHoursRaw) : "—",
      evidenceCoverageText: `${evidenceCoveragePercent}%`,
      withEvidenceCount: resolvedWithEvidence,
      resolvedMetricsCount: resolvedCount,
    };
  }, [completedOnlySolves, closedOnlySolves, roleScopedSolves, appliedFilters.date, prodRequestCounts.inProgress]);

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
      {isProdRequesterView ? (
        <ProdCreditsHeader
          filters={draftFilters}
          onDateChange={(value) => setDraftFilters((prev) => ({ ...prev, date: value }))}
          onApply={() => setAppliedFilters(draftFilters)}
          entityName={user?.entity_name || user?.entity?.name || user?.entity_code || "My Entity"}
        />
      ) : (
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
      )}

      <div className="mt-5">
        {isProdRequesterView ? <ProdSummaryCards metrics={prodSummaryMetrics} /> : <StatsCards stats={visibleStats} />}
      </div>

      {canExport ? (
        <div className="mt-3 flex justify-end">
          <Button variant="outline" onClick={() => exportSolvesCsv(enrichedSolves)}>
            <Download className="mr-2 h-4 w-4" />Export visible solves CSV
          </Button>
        </div>
      ) : null}

      {!isProdRequesterView ? (
        <div className="mt-4">
          <div className="relative">
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
        </div>
      ) : null}

      <div className="mt-4">
        {isProdRequesterView ? (
          <Card className="overflow-hidden rounded-lg border border-ink/10 bg-card shadow-sm">
            <CardHeader className="border-b border-ink/10 px-5 py-4">
              <CardTitle className="text-base font-bold">Resolution Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="mx-5 flex gap-8 border-b border-ink/10 pt-5">
                {[
                  { key: "entities", label: "Entities" },
                  { key: "teams", label: "Teams" },
                  { key: "people", label: "People" },
                  { key: "requests", label: "Solved Requests" },
                  { key: "closed_requests", label: "Closed Requests" },
                ].map((tab) => (
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
              <div className="mx-5 mt-4 space-y-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={
                        activeTab === "entities"
                          ? "Search entities..."
                          : activeTab === "teams"
                          ? "Search teams..."
                          : activeTab === "people"
                          ? "Search resolvers..."
                          : "Search by request ID, title, or reference..."
                      }
                      className="h-10 border border-ink/10 pl-10"
                    />
                  </div>
                </div>
                {isRequestListTab(activeTab) ? (
                  <CreditsQuickFilters value={activeQuickFilter} onChange={setActiveQuickFilter} tabKey={activeTab} />
                ) : null}
              </div>
              {activeTab === "entities" ? (
                <ProdEntitiesRankingTable
                  entitiesRankings={(backendEntityRankings.length > 0 ? backendEntityRankings : buildEntityRankings(enrichedSolves, entities)).filter((entity) => (entity.name || "").toLowerCase().includes(debouncedSearch.trim().toLowerCase()))}
                  onViewSolves={(entity) => {
                    const rows = enrichedSolves.filter((solve) => closedOnly(solve) && String(solve.entityId) === String(entity.entityId));
                    setProdPanel({
                      contextType: "team",
                      title: `${entity.name || "Entity"} solved requests`,
                      subtitle: `${rows.length} solved request${rows.length === 1 ? "" : "s"} · ${entity.activeSolvers || 0} active solver${(entity.activeSolvers || 0) === 1 ? "" : "s"} · ${entity.totalCredits} credits`,
                      rows,
                    });
                  }}
                />
              ) : null}
              {activeTab === "teams" ? (
                <ProdTeamsRankingTable
                  teams={(backendTeamRankings.length > 0 ? backendTeamRankings : buildTeamLeaderRankings(enrichedSolves, entities)).filter((team) => (team.name || "").toLowerCase().includes(debouncedSearch.trim().toLowerCase()))}
                  onViewSolves={(team) => {
                    const rows = enrichedSolves.filter((solve) => {
                      const solveTeamLeaderId = getSolveTeamLeaderId(solve);
                      if (team.teamLeaderId) {
                        return closedOnly(solve) && String(solveTeamLeaderId) === String(team.teamLeaderId);
                      }
                      return closedOnly(solve) && !solveTeamLeaderId && String(solve.entityId) === String(team.entityId);
                    });
                    setProdPanel({
                      contextType: "team",
                      title: `${team.name || "Team"} solved requests`,
                      subtitle: `${rows.length} solved request${rows.length === 1 ? "" : "s"} · ${team.membersCount || 0} member${(team.membersCount || 0) === 1 ? "" : "s"} · ${team.totalCredits} credits`,
                      rows,
                    });
                  }}
                />
              ) : null}
              {activeTab === "people" ? (
                <ProdPeopleRankingTable
                  people={(backendPeopleRankings.length > 0 ? backendPeopleRankings : buildPeopleRankings(enrichedSolves, users, entities)).filter((person) => (person.name || "").toLowerCase().includes(debouncedSearch.trim().toLowerCase()))}
                  onViewSolves={(person) => {
                    const rows = enrichedSolves.filter((solve) => closedOnly(solve) && String(solve.solverId) === String(person.userId));
                    setProdPanel({
                      contextType: "person",
                      title: `${person.name || "Solver"} solved requests`,
                      subtitle: `${person.team || "Unknown team"} · ${rows.length} solved request${rows.length === 1 ? "" : "s"} · ${person.totalCredits} credits`,
                      rows,
                    });
                  }}
                />
              ) : null}
              {activeTab === "requests" ? (
                <ProdResolvedRequestsTable
                  rows={filterRowsForCreditsView(enrichedSolves.filter(completedOnly), activeQuickFilter).filter((solve) => {
                    const q = debouncedSearch.trim().toLowerCase();
                    if (!q) return true;
                    return [
                      solve.requestTitle,
                      solve.requestReference,
                    ].filter(Boolean).join(" ").toLowerCase().includes(q);
                  })}
                  onViewDetails={(solve) => { setSelectedSolve(solve); setDetailsFocus(null); }}
                />
              ) : null}
              {activeTab === "closed_requests" ? (
                <ProdResolvedRequestsTable
                  rows={filterRowsForCreditsView(enrichedSolves.filter(closedOnly), activeQuickFilter).filter((solve) => {
                    const q = debouncedSearch.trim().toLowerCase();
                    if (!q) return true;
                    return [
                      solve.requestTitle,
                      solve.requestReference,
                    ].filter(Boolean).join(" ").toLowerCase().includes(q);
                  })}
                  onViewDetails={(solve) => { setSelectedSolve(solve); setDetailsFocus(null); }}
                />
              ) : null}
              <SolvesPanel
                open={Boolean(prodPanel)}
                onClose={() => setProdPanel(null)}
                contextType={prodPanel?.contextType}
                title={prodPanel?.title || ""}
                subtitle={prodPanel?.subtitle || ""}
                rows={prodPanel?.rows || []}
                users={users}
                entities={entities}
                onViewDetails={(solve) => { setSelectedSolve(solve); setDetailsFocus(null); }}
              />
            </CardContent>
          </Card>
        ) : enrichedSolves.length ? (
<SolvedWorkCard
            activeTab={activeTab}
            activeQuickFilter={activeQuickFilter}
            setActiveTab={setActiveTab}
            setActiveQuickFilter={setActiveQuickFilter}
            solves={closedOnlySolves}
            allSolves={enrichedSolves}
            users={users}
            entities={entities}
            onViewDetails={(solve, focus) => { setSelectedSolve(solve); setDetailsFocus(focus); }}
            currentUser={user}
            userRole={role}
            userEntityId={user?.entity}
            userCompanyId={user?.company}
            isProdEntityUser={isProdEntityUser}
            onApproveResult={(solve) => changeSolvedResultStatus(solve, "CLOSED")}
            onRejectResult={(solve, extra) => changeSolvedResultStatus(solve, "IN_PROGRESS", extra)}
            statusActionBusyId={statusActionBusyId}
          />
        ) : (
          <EmptyStateMessage role={role} isProdEntityUser={isProdEntityUser} />
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
          onApproveResult={(solve) => changeSolvedResultStatus(solve, "CLOSED")}
          onRejectResult={(solve, extra) => changeSolvedResultStatus(solve, "IN_PROGRESS", extra)}
          statusActionBusyId={statusActionBusyId}
          onEvidenceUpdated={() => setReloadTick((x) => x + 1)}
        />
      ) : null}
    </div>
  );
}
