import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Building2,
  Calendar,
  ChevronDown,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  Download,
  Eye,
  Filter,
  FolderOpen,
  Info,
  MoreHorizontal,
  Bug,
  FileCode2,
  Gauge,
  ReceiptText,
  Paperclip,
  Search,
  Shield,
  ShieldAlert,
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
import { getBoardContext, resolveActiveMode, resolveActiveTab } from "../lib/creditsBoardContext";

const ICON_MAP = {
  solved: CheckCircle2,
  users: Users,
  teams: Building2,
  top: Trophy,
  credits: Coins,
  date: Calendar,
};

const CREDITS_PAGE_SIZE = 5;
const creditsSolvesInFlight = new Map();

function fetchCreditsSolves(params) {
  const key = JSON.stringify(params || {});
  const existing = creditsSolvesInFlight.get(key);
  if (existing) return existing;
  const request = api.get("/credits/solves/", { params }).finally(() => {
    creditsSolvesInFlight.delete(key);
  });
  creditsSolvesInFlight.set(key, request);
  return request;
}

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
  const teamLeaderName = getSolveTeamLeaderName(solve);
  if (teamLeaderName) return `${teamLeaderName}'s Team`;
  if (solve?.targetTeamLabel) return solve.targetTeamLabel;
  if (solve?.targetEntityName) return `${solve.targetEntityName} Legacy Queue`;
  return "Unassigned Team";
}

function getTeamLeaderDisplayName(row, userNameById = new Map()) {
  const directLeaderName = (
    row?.teamLeaderName
    || row?.team_leader_name
    || row?.targetTeamLeaderName
    || row?.target_team_leader_name
    || row?.sourceTeamLeaderName
    || row?.source_team_leader_name
    || ""
  ).trim();
  if (directLeaderName) return `${directLeaderName}'s Team`;

  const leaderId = row?.teamLeaderId
    ?? row?.team_leader_id
    ?? row?.targetTeamLeaderId
    ?? row?.target_team_leader
    ?? row?.sourceTeamLeaderId
    ?? row?.source_team_leader
    ?? null;
  if (leaderId != null) {
    const mappedName = (userNameById.get(String(leaderId)) || "").trim();
    if (mappedName) return `${mappedName}'s Team`;
  }

  return row?.teamLabel || row?.name || row?.team || row?.entityName || "Unknown Team";
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

function buildCompanyRankings(rows) {
  const map = new Map();
  rows.forEach((solve) => {
    const companyId = solve.companyId || "unknown";
    const companyName = solve.sourceCompanyName || solve.solverCompanyName || `Company ${companyId}`;
    const key = String(companyId);
    const current = map.get(key) || {
      companyId,
      name: companyName,
      closedCount: 0,
      pendingCount: 0,
      hoursTotal: 0,
      hoursCount: 0,
      withEvidence: 0,
      totalCredits: 0,
      entityIds: new Set(),
      teamLeaderIds: new Set(),
      solverIds: new Set(),
    };
    if (solve.entityId) current.entityIds.add(String(solve.entityId));
    const teamLeaderId = getSolveTeamLeaderId(solve);
    if (teamLeaderId) current.teamLeaderIds.add(String(teamLeaderId));
    if (solve.solverId) current.solverIds.add(String(solve.solverId));

    if (closedOnly(solve)) {
      current.closedCount += 1;
      current.totalCredits += getEarnedCredits(solve);
      if (Number.isFinite(Number(solve.timeToResolveHours))) {
        current.hoursTotal += Number(solve.timeToResolveHours);
        current.hoursCount += 1;
      }
      if (solve.hasEvidence) current.withEvidence += 1;
    } else if (completedOnly(solve)) {
      current.pendingCount += 1;
    }
    map.set(key, current);
  });

  return [...map.values()]
    .map((item) => ({
      ...item,
      entitiesCount: item.entityIds.size,
      teamsCount: item.teamLeaderIds.size,
      activeSolvers: item.solverIds.size,
      avgHours: item.hoursCount ? item.hoursTotal / item.hoursCount : 0,
      coverage: item.closedCount ? Math.round((item.withEvidence / item.closedCount) * 100) : 0,
    }))
    .filter((item) => Number(item.closedCount || 0) > 0)
    .sort(sortByEarnedCreditsThenClosedCount);
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

  return [...map.values()]
    .map((item) => ({
      ...item,
      uniqueSolvers: item.solverIds.size,
      activeSolvers: item.solverIds.size,
      teamsCount: item.teamLeaderIds.size,
      avgHours: item.hoursCount ? item.hoursTotal / item.hoursCount : 0,
      coverage: item.closedCount ? Math.round((item.withEvidence / item.closedCount) * 100) : 0,
    }))
    .filter((item) => Number(item.closedCount || 0) > 0)
    .sort(sortByEarnedCreditsThenClosedCount);
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

  return [...map.values()]
    .map((item) => ({
      ...item,
      membersCount: item.memberIds.size,
      avgHours: item.hoursCount ? item.hoursTotal / item.hoursCount : 0,
      coverage: item.closedCount ? Math.round((item.withEvidence / item.closedCount) * 100) : 0,
    }))
    .filter((item) => Number(item.closedCount || 0) > 0)
    .sort(sortByEarnedCreditsThenClosedCount);
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

  const rankings = [...map.values()]
    .filter((item) => Number(item.closedCount || 0) > 0)
    .map((item) => ({
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

function getRequesterRowKey(requester, index) {
  if (requester?.userId != null) return `user-${requester.userId}`;
  const name = String(requester?.name || "").trim().toLowerCase();
  const entityName = String(requester?.entityName || "").trim().toLowerCase();
  if (name || entityName) return `requester-${name}-${entityName}`;
  return `requester-row-${index}`;
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
  if (idx === 0) return "border-yellow-400 bg-yellow-300 text-yellow-950 shadow-sm dark:border-yellow-500 dark:bg-yellow-400 dark:text-yellow-950";
  if (idx === 1) return "border-slate-300 bg-slate-200 text-slate-700 shadow-sm dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100";
  if (idx === 2) return "border-amber-300 bg-amber-200 text-amber-900 shadow-sm dark:border-amber-500 dark:bg-amber-600 dark:text-amber-50";
  return "border-ink/15 bg-card text-foreground shadow-sm dark:border-ink/25 dark:bg-surface-2";
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

function sameFilters(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeDemandRow(row = {}) {
  const createdCount = Number(row.created_count ?? row.createdCount ?? row.created ?? 0);
  const closedCount = Number(row.closed_count ?? row.closedCount ?? row.closed ?? 0);
  const pendingCount = Number(row.pending_count ?? row.pendingCount ?? row.pending ?? 0);
  const sentBackCount = Number(row.sent_back_count ?? row.sentBackCount ?? row.sent_back ?? 0);
  const completionRate = Number(row.completion_rate ?? row.completionRate ?? 0);
  const avgHours = Number(row.avg_hours ?? row.avgHours ?? 0);
  return {
    ...row,
    createdCount,
    closedCount,
    pendingCount,
    sentBackCount,
    completionRate,
    avgHours,
  };
}

function normalizeRequesterDemandPayload(payload) {
  const raw = payload?.requestDemandRankings || {};
  return {
    sourceCompanies: (raw?.sourceCompanies || raw?.source_companies || []).map(normalizeDemandRow),
    sourceEntities: (raw?.sourceEntities || raw?.source_entities || []).map(normalizeDemandRow),
    sourceTeams: (raw?.sourceTeams || raw?.source_teams || []).map(normalizeDemandRow),
    requesters: (raw?.requesters || []).map(normalizeDemandRow),
  };
}

function exportRankingCsv(rows, columns, filenamePrefix = "credits-rankings") {
  const header = columns.map((c) => c.label);
  const body = rows.map((row, idx) => columns.map((c) => c.value(row, idx)));
  const content = [header, ...body].map((line) => line.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function CreditsFiltersToolbar({
  filters,
  onChange,
  exportAction,
  companies,
  entities,
  teams,
  people,
  canFilterCompany,
  canFilterEntity,
  canFilterTeam,
  canFilterUser,
  showRequestType = false,
  requestTypeOptions = [],
  allPeopleLabel = "All people",
}) {
  const controlShell = "relative h-[46px] min-w-[150px] rounded-lg border border-slate-200 bg-white px-0";
  const selectClass = "absolute inset-0 z-10 w-full [&>button]:h-full [&>button]:w-full [&>button]:justify-start [&>button]:rounded-lg [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-2.5 [&>button]:pb-1 [&>button]:pt-5 [&>button]:text-[13px] [&>button]:font-medium [&>button]:text-slate-900 [&>button]:shadow-none [&>button]:focus:ring-0 [&>button>svg]:hidden";

  const Field = ({ icon: Icon, label, children }) => (
    <div className={controlShell}>
      <div className="pointer-events-none absolute left-2.5 top-1.5 z-20 flex items-center gap-1 text-[10px] leading-none font-semibold text-slate-500">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 z-20 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
      {children}
    </div>
  );

  return (
    <div className="mb-5 flex flex-wrap items-end gap-2.5 md:flex-nowrap">
      <Field icon={Calendar} label="Date Range">
        <Select className={selectClass} value={filters.date} onChange={(e) => onChange("date", e.target.value)}>
          <option value="30d">Last 30 days</option>
          <option value="7d">Last 7 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </Select>
      </Field>

      {canFilterCompany ? (
        <Field icon={Building2} label="Company">
          <Select className={selectClass} value={filters.companyId} onChange={(e) => onChange("companyId", e.target.value)}>
            <option value="all">All companies</option>
            {companies.map((company) => <option key={company.id} value={String(company.id)}>{company.name}</option>)}
          </Select>
        </Field>
      ) : null}

      {canFilterEntity ? (
        <Field icon={Building2} label="Entity">
          <Select className={selectClass} value={filters.entityId} onChange={(e) => onChange("entityId", e.target.value)}>
            <option value="all">All entities</option>
            {entities.map((entity) => <option key={entity.id} value={String(entity.id)}>{entity.name}</option>)}
          </Select>
        </Field>
      ) : null}

      {canFilterTeam ? (
        <Field icon={Users} label="Team">
          <Select className={selectClass} value={filters.teamId} onChange={(e) => onChange("teamId", e.target.value)}>
            <option value="all">All teams</option>
            {teams.map((team) => <option key={team.id} value={String(team.id)}>{team.name}</option>)}
          </Select>
        </Field>
      ) : null}

      {canFilterUser ? (
        <Field icon={Users} label="Person">
          <Select className={selectClass} value={filters.personId} onChange={(e) => onChange("personId", e.target.value)}>
            <option value="all">{allPeopleLabel}</option>
            {people.map((person) => <option key={person.id} value={String(person.id)}>{person.name}</option>)}
          </Select>
        </Field>
      ) : null}

      {showRequestType ? (
        <Field icon={Filter} label="Request Type">
          <Select className={selectClass} value={filters.requestType || "all"} onChange={(e) => onChange("requestType", e.target.value)}>
            <option value="all">All Request Types</option>
            {requestTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </Select>
        </Field>
      ) : null}

      {exportAction ? <div className="ml-auto flex shrink-0 items-end gap-2">{exportAction}</div> : null}
    </div>
  );
}

function CompactCreditsFiltersToolbar({
  filters,
  onChange,
  companies,
  entities,
  teams,
  people,
  allPeopleLabel,
  canFilterCompany,
  canFilterEntity,
  canFilterTeam,
  canFilterUser,
  dateLabel = "Date Range",
  companyLabel = "Company",
  entityLabel = "Entity",
  teamLabel = "Team",
  personLabel = "Person",
  allEntitiesLabel = "All entities",
  allTeamsLabel = "All teams",
  allPeopleLabelOverride = null,
  showRequestType = false,
  requestTypeOptions = [],
  exportAction
}) {
  const toolbarControl = "absolute inset-0 z-10 w-full [&>button]:h-full [&>button]:w-full [&>button]:justify-start [&>button]:rounded-lg [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-2.5 [&>button]:pb-1 [&>button]:pt-5 [&>button]:text-[13px] [&>button]:font-medium [&>button]:text-slate-900 [&>button]:shadow-none [&>button]:focus:ring-0 [&>button>svg]:hidden";
  const wrapClass = "relative h-[46px] min-w-[150px] rounded-lg border border-slate-200 bg-white";
  return (
    <div className="mb-5 flex w-full flex-wrap items-end gap-2.5 md:flex-nowrap">
      <div className={`${wrapClass} shrink-0`}>
        <div className="pointer-events-none absolute left-2.5 top-1.5 z-20 flex items-center gap-1 text-[10px] leading-none font-semibold text-slate-500"><Calendar className="h-3.5 w-3.5" /> {dateLabel}</div>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 z-20 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <Select className={`${toolbarControl}`} value={filters.date} onChange={(e) => onChange("date", e.target.value)}>
          <option value="30d">Last 30 days</option>
          <option value="7d">Last 7 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </Select>
      </div>

      {canFilterCompany ? (
        <div className={wrapClass}>
          <div className="pointer-events-none absolute left-2.5 top-1.5 z-20 flex items-center gap-1 text-[10px] leading-none font-semibold text-slate-500"><Building2 className="h-3.5 w-3.5" /> {companyLabel}</div>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 z-20 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Select className={toolbarControl} value={filters.companyId} onChange={(e) => onChange("companyId", e.target.value)}>
            <option value="all">All companies</option>
            {companies.map((company) => (
              <option key={company.id} value={String(company.id)}>{company.name}</option>
            ))}
          </Select>
        </div>
      ) : null}

      {canFilterEntity ? (
        <div className={wrapClass}>
          <div className="pointer-events-none absolute left-2.5 top-1.5 z-20 flex items-center gap-1 text-[10px] leading-none font-semibold text-slate-500"><Building2 className="h-3.5 w-3.5" /> {entityLabel}</div>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 z-20 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Select className={toolbarControl} value={filters.entityId} onChange={(e) => onChange("entityId", e.target.value)}>
            <option value="all">{allEntitiesLabel}</option>
            {entities.map((entity) => (
              <option key={entity.id} value={String(entity.id)}>{entity.name}</option>
            ))}
          </Select>
        </div>
      ) : null}

      {canFilterTeam ? (
        <div className={wrapClass}>
          <div className="pointer-events-none absolute left-2.5 top-1.5 z-20 flex items-center gap-1 text-[10px] leading-none font-semibold text-slate-500"><Users className="h-3.5 w-3.5" /> {teamLabel}</div>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 z-20 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Select className={toolbarControl} value={filters.teamId} onChange={(e) => onChange("teamId", e.target.value)}>
            <option value="all">{allTeamsLabel}</option>
            {teams.map((team) => (
              <option key={team.id} value={String(team.id)}>{team.name}</option>
            ))}
          </Select>
        </div>
      ) : null}

      {canFilterUser ? (
        <div className={wrapClass}>
          <div className="pointer-events-none absolute left-2.5 top-1.5 z-20 flex items-center gap-1 text-[10px] leading-none font-semibold text-slate-500"><Users className="h-3.5 w-3.5" /> {personLabel}</div>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 z-20 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Select className={toolbarControl} value={filters.personId} onChange={(e) => onChange("personId", e.target.value)}>
            <option value="all">{allPeopleLabelOverride || allPeopleLabel}</option>
            {people.map((person) => (
              <option key={person.id} value={String(person.id)}>{person.name}</option>
            ))}
          </Select>
        </div>
      ) : null}

      {showRequestType ? (
        <div className={wrapClass}>
          <div className="pointer-events-none absolute left-2.5 top-1.5 z-20 flex items-center gap-1 text-[10px] leading-none font-semibold text-slate-500"><Filter className="h-3.5 w-3.5" /> Request Type</div>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 z-20 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Select className={toolbarControl} value={filters.requestType || "all"} onChange={(e) => onChange("requestType", e.target.value)}>
            <option value="all">All Request Types</option>
            {requestTypeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>
        </div>
      ) : null}
      {exportAction ? <div className="ml-auto shrink-0">{exportAction}</div> : null}

    </div>
  );
}

function CreditsBoardHeader({
  filters,
  onChange,
  companies,
  entities,
  teams,
  people,
  allPeopleLabel,
  canFilterCompany,
  canFilterEntity,
  canFilterTeam,
  canFilterUser,
  showRequestType = false,
  requestTypeOptions = [],
  subtitle,
  titleSuffix = "",
  exportAction,
  showFilters = true,
}) {
  return (
    <section className="mb-5">
      <div className="mb-5 flex flex-col gap-1">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Ranking
            {titleSuffix ? <span className="ml-2 text-xl text-muted-foreground">{titleSuffix}</span> : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {showFilters ? (
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <CreditsFiltersToolbar
            filters={filters}
            onChange={onChange}
            exportAction={exportAction}
            companies={companies}
            entities={entities}
            teams={teams}
            people={people}
            allPeopleLabel={allPeopleLabel}
            canFilterCompany={canFilterCompany}
            canFilterEntity={canFilterEntity}
            canFilterTeam={canFilterTeam}
            canFilterUser={canFilterUser}
            showRequestType={showRequestType}
            requestTypeOptions={requestTypeOptions}
          />
        </div>
      ) : null}
    </section>
  );
}

function CreditsBoardHeaderCompact({
  filters,
  onChange,
  companies,
  entities,
  teams,
  people,
  allPeopleLabel,
  canFilterCompany,
  canFilterEntity,
  canFilterTeam,
  canFilterUser,
  showRequestType = false,
  requestTypeOptions = [],
  subtitle,
  exportAction,
}) {
  return (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-4xl font-bold leading-tight text-foreground">Ranking</h1>
        <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>
      </div>
      <div className="mb-5 flex flex-wrap items-end gap-3 lg:mb-0">
        <CompactCreditsFiltersToolbar
          filters={filters}
          onChange={onChange}
          exportAction={exportAction}
          companies={companies}
          entities={entities}
          teams={teams}
          people={people}
          allPeopleLabel={allPeopleLabel}
          canFilterCompany={canFilterCompany}
          canFilterEntity={canFilterEntity}
          canFilterTeam={canFilterTeam}
          canFilterUser={canFilterUser}
          showRequestType={showRequestType}
          requestTypeOptions={requestTypeOptions}
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

function RankingTopCards({ cards, theme = "default" }) {
  const tones = [
    {
      card: "from-amber-50 via-white to-white border-amber-200/70",
      icon: "border-amber-200 bg-amber-100 text-amber-700",
      label: "text-amber-700",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      card: "from-blue-50 via-white to-white border-blue-200/70",
      icon: "border-blue-200 bg-blue-100 text-blue-700",
      label: "text-blue-700",
      badge: "border-blue-200 bg-blue-50 text-blue-700",
    },
    {
      card: "from-purple-50 via-white to-white border-purple-200/70",
      icon: "border-purple-200 bg-purple-100 text-purple-700",
      label: "text-purple-700",
      badge: "border-purple-200 bg-purple-50 text-purple-700",
    },
    {
      card: "from-emerald-50 via-white to-white border-emerald-200/70",
      icon: "border-emerald-200 bg-emerald-100 text-emerald-700",
      label: "text-emerald-700",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
  ];
  const executiveTones = [
    {
      card: "border-primary/25 bg-primary/5 dark:border-secondary/45 dark:bg-secondary/20",
      icon: "text-primary dark:text-secondary-foreground",
      label: "text-primary dark:text-secondary-foreground",
      badge: "border-primary/30 bg-primary/10 text-primary dark:border-secondary/55 dark:bg-secondary/35 dark:text-secondary-foreground",
    },
    {
      card: "border-info/25 bg-info/5 dark:border-secondary/45 dark:bg-secondary/20",
      icon: "text-info dark:text-secondary-foreground",
      label: "text-info dark:text-secondary-foreground",
      badge: "border-info/30 bg-info/10 text-info dark:border-secondary/55 dark:bg-secondary/35 dark:text-secondary-foreground",
    },
    {
      card: "border-primary/20 bg-primary-soft/50 dark:border-secondary/45 dark:bg-secondary/20",
      icon: "text-primary dark:text-secondary-foreground",
      label: "text-primary dark:text-secondary-foreground",
      badge: "border-primary/25 bg-primary/10 text-primary dark:border-secondary/55 dark:bg-secondary/35 dark:text-secondary-foreground",
    },
    {
      card: "border-success/25 bg-success/5 dark:border-secondary/45 dark:bg-secondary/20",
      icon: "text-success dark:text-secondary-foreground",
      label: "text-success dark:text-secondary-foreground",
      badge: "border-success/30 bg-success/10 text-success dark:border-secondary/55 dark:bg-secondary/35 dark:text-secondary-foreground",
    },
  ];
  const activeTones = theme === "executive" ? executiveTones : tones;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, idx) => {
        const tone = activeTones[idx % activeTones.length];
        const Icon = card.icon || Star;
        const isNegative = String(card.delta || "").startsWith("-");
        return (
          <Card
            key={`${card.label}-${idx}`}
            className={`relative min-h-[120px] overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md ${theme === "executive" ? "" : "bg-gradient-to-br"} ${tone.card}`}
          >
            <CardContent className="relative z-10 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${tone.label}`}>
                  <Icon className={`h-3.5 w-3.5 ${tone.icon}`} />
                  {card.label}
                </span>
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${tone.badge}`}>
                  {idx === 0 ? <Trophy className="h-3.5 w-3.5" /> : idx === 3 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
                </span>
              </div>
              <div className="mt-3 min-w-0">
                <p className="mt-1 truncate text-[31px] font-extrabold leading-none text-foreground">{card.value}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{card.hint || "Based on current filters"}</p>
              </div>
              <div className={`mt-3 inline-flex items-center gap-1 text-xs font-bold ${isNegative ? "text-red-600" : "text-emerald-600"}`}>
                {isNegative ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                <span>{card.delta || "vs previous 30 days"}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function RankingInsightStrip({ items = [] }) {
  if (!items.length) return null;
  const tones = [
    { icon: "border-success/30 bg-success/10 text-success dark:border-secondary/50 dark:bg-secondary/30 dark:text-secondary-foreground" },
    { icon: "border-destructive/30 bg-destructive/10 text-destructive dark:border-secondary/50 dark:bg-secondary/30 dark:text-secondary-foreground" },
    { icon: "border-info/30 bg-info/10 text-info dark:border-secondary/50 dark:bg-secondary/30 dark:text-secondary-foreground" },
    { icon: "border-muted-foreground/30 bg-muted/40 text-muted-foreground dark:border-secondary/50 dark:bg-secondary/30 dark:text-secondary-foreground" },
    { icon: "border-primary/30 bg-primary/10 text-primary dark:border-secondary/50 dark:bg-secondary/30 dark:text-secondary-foreground" },
  ];
  return (
    <Card className="rounded-xl border border-ink/10 bg-card shadow-sm">
      <CardContent className="p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item, idx) => {
            const tone = tones[idx % tones.length];
            const Icon = item.icon || Gauge;
            return (
              <div key={`${item.label}-${idx}`} className="flex items-center gap-3 rounded-lg border border-ink/10 bg-card/80 p-3 transition-colors hover:bg-muted/30 dark:bg-surface-2/60 dark:hover:bg-surface-2">
                <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${tone.icon}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground">{item.label}</p>
                  <p className="truncate text-sm font-bold leading-tight text-foreground">{item.value}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.hint || "based on current filters"}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
function InsightStrip({ items = [] })
{
  if (!items.length) return null;
  return (
    <Card className="rounded-2xl border border-ink/10 bg-card shadow-sm">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item, idx) => (
            <div key={`${item.label}-${idx}`} className="flex items-center gap-4 rounded-lg border border-ink/10 bg-card/80 p-4 transition-colors hover:bg-muted/30 dark:bg-surface-2/60 dark:hover:bg-surface-2">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ink/15 bg-card">
                {item.icon ? <item.icon className="h-5 w-5 text-muted-foreground" /> : <Gauge className="h-5 w-5 text-muted-foreground" />}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
                <p className="truncate text-lg font-bold">{item.value}</p>
                {item.hint ? <p className="text-xs text-muted-foreground">{item.hint}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
      <div className="px-4">
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
                <td className="px-3 py-3 text-center align-middle">
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

function ProdEntitiesRankingTable({ entitiesRankings, onViewSolves, canOpenSolvesDrilldown = true }) {
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
        <div className="overflow-hidden rounded-lg border border-ink/10">
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
              {canOpenSolvesDrilldown ? <th className="px-3 py-3 text-right">Actions</th> : null}
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
                  {canOpenSolvesDrilldown ? (
                    <td className="px-3 py-4 text-right align-middle">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3 text-sm font-semibold"
                        onClick={() => onViewSolves(entity)}
                      >
                        Solves ?
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
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

function ProdCompaniesRankingTable({ companiesRankings, onViewSolves, canOpenSolvesDrilldown = true }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [companiesRankings.length]);

  const totalPages = Math.max(1, Math.ceil(companiesRankings.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pageCompanies = companiesRankings.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

  return (
    <>
      <div className="px-5">
        <div className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm">
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
              <th className="px-3 py-3 text-left">Company</th>
              <th className="px-3 py-3 text-center">Credits</th>
              <th className="px-3 py-3 text-center">Closed</th>
              <th className="px-3 py-3 text-center" title="Completed work waiting for requester approval">Pending</th>
              <th className="px-3 py-3 text-center">Entities</th>
              <th className="px-3 py-3 text-center">Teams</th>
              <th className="px-3 py-3 text-center" title="Active solvers">Solvers</th>
              <th className="px-3 py-3 text-center" title="Average resolution time">Avg Time</th>
              {canOpenSolvesDrilldown ? <th className="px-3 py-3 text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pageCompanies.map((company, idx) => (
              <tr key={company.companyId || company.name} className="border-t border-ink/10 transition-colors hover:bg-muted/30">
                <td className="px-3 py-4 text-center align-middle">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(idx)}`}>{idx + 1}</span>
                </td>
                <td className="px-3 py-4 align-middle">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <span className="font-medium truncate">{company.name}</span>
                  </div>
                </td>
                <td className="px-3 py-4 text-center align-middle"><CreditsCell value={company.totalCredits} /></td>
                <td className="px-3 py-4 text-center align-middle"><CountCell value={company.closedCount} /></td>
                <td className="px-3 py-4 text-center align-middle"><PendingApprovalCell value={company.pendingCount} /></td>
                <td className="px-3 py-4 text-center align-middle"><CountCell value={company.entitiesCount} tone="blue" /></td>
                <td className="px-3 py-4 text-center align-middle"><CountCell value={company.teamsCount} tone="blue" /></td>
                <td className="px-3 py-4 text-center align-middle"><CountCell value={company.activeSolvers} tone="blue" /></td>
                <td className="px-3 py-4 text-center align-middle"><DurationCell value={formatDurationHours(company.avgHours)} /></td>
                {canOpenSolvesDrilldown ? (
                  <td className="px-3 py-4 text-right align-middle">
                    <Button size="sm" variant="ghost" className="h-8 px-3 text-sm font-semibold" onClick={() => onViewSolves(company)}>
                      Solves ?
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      {!companiesRankings.length ? <div className="py-6 text-center text-sm text-muted-foreground">No companies with solved requests yet.</div> : null}
      <div className="flex items-center justify-between px-5 py-4 text-sm text-muted-foreground">
        <span>Showing {companiesRankings.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, companiesRankings.length)} of {companiesRankings.length} companies</span>
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

function ProdTeamsRankingTable({ teams, onViewSolves, canOpenSolvesDrilldown = true }) {
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
        <div className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm">
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
              {canOpenSolvesDrilldown ? <th className="px-3 py-3 text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pageTeams.map((team, idx) => (
              <tr key={team.teamKey || team.teamLeaderId || team.name} className="border-t border-ink/10 transition-colors hover:bg-muted/30">
                <td className="px-3 py-4 text-center align-middle">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(idx)}`}>{idx + 1}</span>
                </td>
                <td className="px-3 py-3 align-middle">
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
                {canOpenSolvesDrilldown ? (
                  <td className="px-3 py-4 text-right align-middle">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-sm font-semibold"
                      onClick={() => onViewSolves(team)}
                    >
                      Solves ?
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
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

function ProdPeopleRankingTable({ people, onViewSolves, canOpenSolvesDrilldown = true }) {
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
        <div className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm">
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
              {canOpenSolvesDrilldown ? <th className="px-3 py-3 text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pagePeople.map((person, idx) => (
              <tr key={person.userId} className="border-t border-ink/10 transition-colors hover:bg-muted/30">
                <td className="px-3 py-3 text-center align-middle">
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
                <td className="px-3 py-3 text-center align-middle">
                  <CreditsCell value={person.totalCredits} />
                </td>
                <td className="px-3 py-3 text-center align-middle">
                  <CountCell value={person.closedCount} />
                </td>
                <td className="px-3 py-3 text-center align-middle">
                  <PendingApprovalCell value={person.pendingCount} />
                </td>
                <td className="px-3 py-3 text-center align-middle">
                  <EvidenceCell value={person.evidenceAdded} />
                </td>
                <td className="px-3 py-3 text-center align-middle">
                  <DurationCell value={formatDurationHours(person.avgHours)} />
                </td>
                {canOpenSolvesDrilldown ? (
                  <td className="px-3 py-4 text-right align-middle">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-sm font-semibold"
                      onClick={() => onViewSolves(person)}
                    >
                      Solves ?
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
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

function ProdRequestersRankingTable({ requesters = [] }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [requesters.length]);

  const safeRequesters = Array.isArray(requesters) ? requesters : [];
  const totalPages = Math.max(1, Math.ceil(safeRequesters.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pageRequesters = safeRequesters.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

  return (
    <>
      <div className="px-5">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "6%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-ink/10">
              <th className="px-3 py-3 text-center">Rank</th>
              <th className="px-3 py-3 text-left">Requester</th>
              <th className="px-3 py-3 text-left">Entity</th>
              <th className="px-3 py-3 text-center">Created</th>
              <th className="px-3 py-3 text-center">Closed</th>
              <th className="px-3 py-3 text-center">Pending</th>
              <th className="px-3 py-3 text-center">Sent Back</th>
              <th className="px-3 py-3 text-center">Completion Rate</th>
              <th className="px-3 py-3 text-center">Avg Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pageRequesters.map((requester, idx) => (
              <tr key={getRequesterRowKey(requester, startIndex + idx)} className="border-t border-ink/10 transition-colors hover:bg-muted/30">
                <td className="px-3 py-4 text-center align-middle">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(startIndex + idx)}`}>
                    {startIndex + idx + 1}
                  </span>
                </td>
                <td className="px-3 py-4 align-middle">
                  <div className="flex items-center gap-2 truncate">
                    <Avatar name={requester?.name ?? ""} size={28} />
                    <span className="block truncate font-medium">{requester?.name ?? "Unknown"}</span>
                  </div>
                </td>
                <td className="px-3 py-4 align-middle truncate">
                  <span className="text-sm">{requester?.entityName ?? "Unknown entity"}</span>
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CountCell value={requester?.createdCount ?? 0} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CountCell value={requester?.closedCount ?? 0} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <PendingApprovalCell value={requester?.pendingCount ?? 0} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CountCell value={requester?.sentBackCount ?? 0} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CoverageCell value={requester?.completionRate ?? 0} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <DurationCell value={formatDurationHours(requester?.avgHours ?? 0)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!safeRequesters.length ? <div className="py-6 text-center text-sm text-muted-foreground">No requesters yet.</div> : null}
      <div className="flex items-center justify-between px-5 py-4 text-sm text-muted-foreground">
        <span>Showing {safeRequesters.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, safeRequesters.length)} of {safeRequesters.length} requesters</span>
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
                      Solves ?
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
                      Solves ?
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
                      Solves ?
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
                      Details ?
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

function RequestDemandRankingTable({ rows = [], searchTerm = "" }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  const filteredRows = Array.isArray(rows) ? rows.filter((row) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    const searchableFields = [row.name || "", row.entityName || "", row.teamLabel || ""].join(" ").toLowerCase();
    return searchableFields.includes(q);
  }) : [];

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pageRows = filteredRows.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

  return (
    <>
      <div className="px-4">
        <div className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-sm">
          <colgroup>
            <col style={{ width: "6%" }} />
            <col style={{ width: "29%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-ink/10">
              <th className="px-3 py-3 text-center">Rank</th>
              <th className="px-3 py-3 text-left">Name</th>
              <th className="px-3 py-3 text-center">Created</th>
              <th className="px-3 py-3 text-center">Closed</th>
              <th className="px-3 py-3 text-center">Pending</th>
              <th className="px-3 py-3 text-center">Sent Back</th>
              <th className="px-3 py-3 text-center">Completion Rate</th>
              <th className="px-3 py-3 text-center">Avg Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pageRows.map((row, idx) => (
              <tr key={row.entityId || row.teamKey || row.userId || idx} className="border-t border-ink/10 transition-colors hover:bg-muted/30">
                <td className="px-3 py-4 text-center align-middle">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold shadow-sm ${rankTone(startIndex + idx)}`}>
                    {startIndex + idx + 1}
                  </span>
                </td>
                <td className="px-3 py-4 align-middle">
                  <div className="flex items-center gap-2 truncate">
                    <span className="block truncate font-medium">{row.name || row.teamLabel || "Unknown"}</span>
                  </div>
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CountCell value={row.createdCount ?? 0} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CountCell value={row.closedCount ?? 0} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <PendingApprovalCell value={row.pendingCount ?? 0} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CountCell value={row.sentBackCount ?? 0} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CoverageCell value={row.completionRate ?? 0} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <DurationCell value={formatDurationHours(row.avgHours ?? 0)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      {!filteredRows.length ? <div className="py-4 text-center text-sm text-muted-foreground">No data yet.</div> : null}
      <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
        <span>Showing {filteredRows.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, filteredRows.length)} of {filteredRows.length} items</span>
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

function MetricPill({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
  };
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${tones[tone] || tones.slate}`}>{children}</span>;
}

function EvidenceBar({ value }) {
  const pct = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="flex items-center justify-center gap-2">
      <span className="w-9 text-center text-xs font-bold tabular-nums">{pct}%</span>
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function RankChip({ rank }) {
  const tone = rank === 1
    ? "border-warning bg-warning text-ink dark:!border-yellow-400 dark:!bg-yellow-500 dark:!text-yellow-950"
    : rank === 2
      ? "border-slate-300 bg-slate-200 text-slate-700 dark:!border-slate-400 dark:!bg-slate-500 dark:!text-slate-100"
      : rank === 3
        ? "border-amber-300 bg-amber-200 text-amber-900 dark:!border-amber-400 dark:!bg-amber-500 dark:!text-amber-950"
        : "border-slate-200 bg-slate-100 text-slate-700 dark:!border-slate-500 dark:!bg-slate-700 dark:!text-slate-100";
  return <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs font-bold ${tone}`}>{rank}</span>;
}

function NameCell({ icon: Icon = Building2, name, sub, avatar = false }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {avatar ? (
        <Avatar name={name || "-"} size={28} />
      ) : (
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-700">
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate font-bold text-foreground">{name || "-"}</div>
        {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
      </div>
    </div>
  );
}

function RowMenu() {
  return (
    <Button variant="outline" size="sm" className="h-8 w-8 rounded-md border-ink/10 bg-card p-0 shadow-none">
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  );
}

function RankingsTable({ rows = [], tabKey, isRequesterContext, context, currentUserId, canOpenSolvesDrilldown, onViewSolves }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [rows.length, tabKey, isRequesterContext]);

  const totalPages = Math.max(1, Math.ceil(rows.length / CREDITS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * CREDITS_PAGE_SIZE;
  const pageRows = rows.slice(startIndex, startIndex + CREDITS_PAGE_SIZE);

  function getRowKey(row, idx) {
    if (!row || typeof row !== "object") return `${tabKey}-row-${startIndex + idx}`;
    if (tabKey === "companies" || tabKey === "sourceCompanies") return `${tabKey}-${row.companyId || row.name || startIndex + idx}`;
    if (tabKey === "entities" || tabKey === "sourceEntities") return `${tabKey}-${row.entityId || row.name || startIndex + idx}`;
    if (tabKey === "teams" || tabKey === "sourceTeams") {
      return `${tabKey}-${row.teamKey || row.teamId || row.teamLeaderId || row.sourceTeamLeaderId || row.name || startIndex + idx}`;
    }
    if (tabKey === "people" || tabKey === "requesters") {
      return `${tabKey}-${row.userId || row.requesterId || row.name || startIndex + idx}`;
    }
    return `${tabKey}-${row.id || row.name || startIndex + idx}`;
  }
  const canShowSolves = !isRequesterContext && canOpenSolvesDrilldown;
  const isProdRequester = context?.isProd && isRequesterContext;
  const showActions = canShowSolves || (isProdRequester && (tabKey === "sourceTeams" || context?.variant === "user_prod"));
  const getName = (row) => row.name || row.teamLabel || row.team || row.entityName || "-";

  function renderSolverCells(row, rank) {
    const isCurrentUser = tabKey === "people" && String(row.userId) === String(currentUserId);
    const closed = Number(row.closedCount || row.solvedCount || row.completed || 0);
    const pending = Number(row.pendingCount || 0);
    if (tabKey === "people") {
      return [
        <RankChip rank={rank} />,
        <NameCell avatar name={isCurrentUser ? "You" : getName(row)} sub={row.team || row.entityName} />,
        <span className="font-bold tabular-nums">{closed.toLocaleString()}</span>,
        <MetricPill tone="amber">{pending}</MetricPill>,
        <EvidenceBar value={row.coverage ?? (closed ? Math.round((Number(row.evidenceAdded || 0) / closed) * 100) : 0)} />,
        <MetricPill>{formatDurationHours(row.avgHours || 0)}</MetricPill>,
      ];
    }
    if (tabKey === "teams") {
      return [
        <RankChip rank={rank} />,
        <NameCell icon={Users} name={getName(row)} sub={row.entityName || ""} />,
        <span className="font-bold tabular-nums">{Number(row.totalCredits || 0).toLocaleString()}</span>,
        <span className="tabular-nums">{closed.toLocaleString()}</span>,
        <MetricPill tone="amber">{pending}</MetricPill>,
        <span className="tabular-nums">{Number(row.activeSolvers || row.uniqueSolvers || row.membersCount || 0)}</span>,
        <EvidenceBar value={row.completionRate || row.coverage || 0} />,
        <MetricPill>{formatDurationHours(row.avgHours || 0)}</MetricPill>,
      ];
    }
    if (tabKey === "companies") {
      return [
        <RankChip rank={rank} />,
        <NameCell icon={Building2} name={getName(row)} sub={row.companyName || ""} />,
        <span className="font-bold tabular-nums">{Number(row.totalCredits || 0).toLocaleString()}</span>,
        <span className="tabular-nums">{closed.toLocaleString()}</span>,
        <MetricPill tone="amber">{pending}</MetricPill>,
        <span className="tabular-nums">{Number(row.entitiesCount || 0)}</span>,
        <span className="tabular-nums">{Number(row.teamsCount || 0)}</span>,
        <span className="tabular-nums">{Number(row.activeSolvers || 0)}</span>,
        <EvidenceBar value={row.coverage || 0} />,
        <MetricPill>{formatDurationHours(row.avgHours || 0)}</MetricPill>,
      ];
    }
    if (tabKey === "entities") {
      return [
        <RankChip rank={rank} />,
        <NameCell icon={Building2} name={getName(row)} sub={row.entityName || ""} />,
        <span className="font-bold tabular-nums">{Number(row.totalCredits || 0).toLocaleString()}</span>,
        <span className="tabular-nums">{closed.toLocaleString()}</span>,
        <MetricPill tone="amber">{pending}</MetricPill>,
        <span className="tabular-nums">{Number(row.teamsCount || 0)}</span>,
        <span className="tabular-nums">{Number(row.activeSolvers || row.uniqueSolvers || 0)}</span>,
        <span className="tabular-nums">{Number(row.incomingCredits || row.requestersCount || row.createdCount || 0).toLocaleString()}</span>,
        <EvidenceBar value={row.coverage || 0} />,
        <MetricPill>{formatDurationHours(row.avgHours || 0)}</MetricPill>,
      ];
    }
    const common = [
      <RankChip rank={rank} />,
      <NameCell icon={tabKey === "teams" ? Users : Building2} name={getName(row)} sub={row.entityName || row.companyName || row.team || ""} />,
      <span className="font-bold tabular-nums">{Number(row.totalCredits || 0).toLocaleString()}</span>,
      <span className="tabular-nums">{closed.toLocaleString()}</span>,
      <MetricPill tone="amber">{pending}</MetricPill>,
      tabKey === "companies" ? <span className="tabular-nums">{Number(row.entitiesCount || 0)}</span> : <span className="tabular-nums">{Number(row.teamsCount || row.membersCount || 0)}</span>,
      tabKey === "companies" ? <span className="tabular-nums">{Number(row.teamsCount || 0)}</span> : <span className="tabular-nums">{Number(row.activeSolvers || row.uniqueSolvers || row.membersCount || 0)}</span>,
      <span className="tabular-nums">{Number(row.activeSolvers || row.uniqueSolvers || row.membersCount || 0)}</span>,
      tabKey === "companies" ? <EvidenceBar value={row.coverage || row.completionRate || 0} /> : <span className="tabular-nums">{Number(row.incomingCredits || row.requestersCount || row.createdCount || 0).toLocaleString()}</span>,
      <EvidenceBar value={row.coverage || row.completionRate || 0} />,
      <MetricPill>{formatDurationHours(row.avgHours || 0)}</MetricPill>,
    ];
    return common.slice(0, solverColumns.length);
  }

  function renderRequesterCells(row, rank) {
    const created = Number(row.createdCount || row.requests || row.requestCount || 0);
    const closed = Number(row.closedCount || row.resolvedCount || 0);
    const sentBack = Number(row.sentBackCount || 0);
    if (context?.variant === "user_prod") {
      return [
        { key: "rank", label: "Rank", width: "8%", align: "text-center" },
        { key: "name", label: tabKey === "sourceTeams" ? "Team" : "Requester", width: "28%", align: "text-left" },
        { key: "requests", label: "Requests", width: "14%", align: "text-center" },
        { key: "open", label: "Open", width: "12%", align: "text-center" },
        { key: "coverage", label: "Coverage", width: "18%", align: "text-center" },
        { key: "avg", label: "Avg Fulfillment Time", width: "20%", align: "text-center" },
      ];
    }
    if (isProdRequester && tabKey === "sourceTeams") {
      const credits = Number(row.totalCredits || row.creditsRequested || 0);
      return [
        <RankChip rank={rank} />,
        <NameCell icon={FolderOpen} name={getName(row)} sub={row.entityName} />,
        <span className="font-bold tabular-nums">{created.toLocaleString()}</span>,
        <span className="tabular-nums">{credits.toLocaleString()}</span>,
        <span className="tabular-nums">{Number(row.teamShare || row.percentOfTeamTotal || 0)}%</span>,
        <span className="tabular-nums">{created ? (credits / created).toFixed(1) : "-"}</span>,
        <span className="font-bold text-orange-600 tabular-nums">{Number(row.sentBackRate || sentBack || 0)}%</span>,
        <span className="font-bold text-emerald-600 tabular-nums">{Number(row.completionRate || 0)}%</span>,
        <span className="text-xs font-bold text-emerald-600">Based on filters</span>,
      ];
    }
    if (isProdRequester) {
      return [
        <RankChip rank={rank} />,
        <NameCell icon={FolderOpen} name={getName(row)} sub={row.entityName} />,
        <span className="font-bold tabular-nums">{Number(row.totalCredits || 0).toLocaleString()}</span>,
        <span className="tabular-nums">{created.toLocaleString()}</span>,
        <MetricPill tone="amber">{closed}</MetricPill>,
        <span className="tabular-nums">{Number(row.supportEntitiesCount || row.supportEntities || 0)}</span>,
        <span className="tabular-nums">{Number(row.teamsInvolved || row.teamsCount || 0)}</span>,
        <EvidenceBar value={row.completionRate || 0} />,
        <MetricPill>{formatDurationHours(row.avgHours || 0)}</MetricPill>,
      ];
    }
    return [
      <RankChip rank={rank} />,
      <NameCell avatar={tabKey === "requesters"} icon={FolderOpen} name={getName(row)} sub={row.entityName} />,
      <span className="font-bold tabular-nums">{created.toLocaleString()}</span>,
      <span className="tabular-nums">{closed.toLocaleString()}</span>,
      <MetricPill tone="amber">{Number(row.pendingCount || 0)}</MetricPill>,
      <MetricPill tone={sentBack ? "red" : "slate"}>{sentBack}</MetricPill>,
      <EvidenceBar value={row.completionRate || 0} />,
      <MetricPill>{formatDurationHours(row.avgHours || 0)}</MetricPill>,
    ];
  }

  function buildColumns() {
    if (!isRequesterContext) {
      if (tabKey === "companies") {
        return [
          { key: "rank", label: "Rank", width: "7%", align: "text-center" },
          { key: "name", label: "Company", width: "20%", align: "text-left" },
          { key: "credits", label: "Credits", width: "10%", align: "text-center" },
          { key: "closed", label: "Closed", width: "9%", align: "text-center" },
          { key: "pending", label: "Pending", width: "9%", align: "text-center" },
          { key: "entities", label: "Entities", width: "9%", align: "text-center" },
          { key: "teams", label: "Teams", width: "9%", align: "text-center" },
          { key: "solvers", label: "Solvers", width: "9%", align: "text-center" },
          { key: "evidence", label: "Evidence", width: "12%", align: "text-center" },
          { key: "avg", label: "Avg Time", width: "9%", align: "text-center" },
        ];
      }
      if (tabKey === "entities") {
        return [
          { key: "rank", label: "Rank", width: "7%", align: "text-center" },
          { key: "name", label: "Entity", width: "20%", align: "text-left" },
          { key: "credits", label: "Credits", width: "10%", align: "text-center" },
          { key: "closed", label: "Closed", width: "9%", align: "text-center" },
          { key: "pending", label: "Pending", width: "9%", align: "text-center" },
          { key: "teams", label: "Teams", width: "9%", align: "text-center" },
          { key: "solvers", label: "Solvers", width: "9%", align: "text-center" },
          { key: "requesters", label: context?.variant === "manager_support" ? "Incoming Credits" : "Requesters", width: "12%", align: "text-center" },
          { key: "evidence", label: "Evidence", width: "9%", align: "text-center" },
          { key: "avg", label: "Avg Time", width: "9%", align: "text-center" },
        ];
      }
      if (tabKey === "teams") {
        return [
          { key: "rank", label: "Rank", width: "7%", align: "text-center" },
          { key: "name", label: "Team", width: "25%", align: "text-left" },
          { key: "credits", label: "Credits", width: "12%", align: "text-center" },
          { key: "closed", label: "Closed", width: "11%", align: "text-center" },
          { key: "pending", label: "Pending", width: "11%", align: "text-center" },
          { key: "solvers", label: "Solvers", width: "10%", align: "text-center" },
          { key: "completion", label: "Completion", width: "13%", align: "text-center" },
          { key: "avg", label: "Avg Time", width: "11%", align: "text-center" },
        ];
      }
      return [
        { key: "rank", label: "Rank", width: "9%", align: "text-center" },
        { key: "name", label: "Solver", width: "27%", align: "text-left" },
        { key: "closed", label: "Closed", width: "14%", align: "text-center" },
        { key: "pending", label: "Pending", width: "14%", align: "text-center" },
        { key: "evidence", label: "Evidence", width: "16%", align: "text-center" },
        { key: "avg", label: "Avg Resolution Time", width: "16%", align: "text-center" },
      ];
    }
    if (isProdRequester && tabKey === "sourceTeams") {
      return [
        { key: "rank", label: "Rank", width: "6%", align: "text-center" },
        { key: "name", label: "Source Team", width: "20%", align: "text-left" },
        { key: "requests", label: "Requests", width: "9%", align: "text-center" },
        { key: "credits", label: "Credits Requested", width: "10%", align: "text-center" },
        { key: "share", label: "% of Team Total", width: "11%", align: "text-center" },
        { key: "avgCredits", label: "Avg. Credits / Request", width: "12%", align: "text-center" },
        { key: "sentBack", label: "Sent-back Rate", width: "9%", align: "text-center" },
        { key: "closure", label: "Closure Rate", width: "10%", align: "text-center" },
        { key: "trend", label: "Trend", width: "8%", align: "text-center" },
      ];
    }
    if (isProdRequester) {
      return [
        { key: "rank", label: "Rank", width: "6%", align: "text-center" },
        { key: "name", label: "Source Entity", width: "20%", align: "text-left" },
        { key: "credits", label: "Credits", width: "10%", align: "text-center" },
        { key: "requests", label: "Requests", width: "10%", align: "text-center" },
        { key: "resolved", label: "Resolved", width: "10%", align: "text-center" },
        { key: "support", label: "Support Entities", width: "10%", align: "text-center" },
        { key: "teams", label: "Teams Involved", width: "10%", align: "text-center" },
        { key: "closure", label: "Closure Rate", width: "11%", align: "text-center" },
        { key: "avg", label: "Avg Resolution Time", width: "11%", align: "text-center" },
      ];
    }
    return [
      { key: "rank", label: "Rank", width: "8%", align: "text-center" },
      { key: "name", label: tabKey === "sourceCompanies" ? "Source Company" : tabKey === "sourceTeams" ? "Source Team" : tabKey === "requesters" ? "Requester" : "Source Entity", width: "20%", align: "text-left" },
      { key: "created", label: "Created", width: "11%", align: "text-center" },
      { key: "closed", label: "Closed", width: "11%", align: "text-center" },
      { key: "pending", label: "Pending", width: "10%", align: "text-center" },
      { key: "sentBack", label: "Sent Back", width: "10%", align: "text-center" },
      { key: "completion", label: "Completion", width: "11%", align: "text-center" },
      { key: "avg", label: "Avg Time", width: "11%", align: "text-center" },
    ];
  }

  const baseColumns = buildColumns();
  const columns = showActions ? [...baseColumns, { key: "actions", label: "Actions", width: "7%", align: "text-center" }] : baseColumns;

  function renderCell(row, rank, key) {
    const closed = Number(row.closedCount || row.solvedCount || row.completed || row.resolvedCount || 0);
    const pending = Number(row.pendingCount || 0);
    const created = Number(row.createdCount || row.requests || row.requestCount || 0);
    const sentBack = Number(row.sentBackCount || row.sentBackRate || 0);
    const isCurrentUser = (!isRequesterContext && tabKey === "people" && String(row.userId) === String(currentUserId))
      || (isRequesterContext && context?.variant === "user_prod" && tabKey === "requesters" && String(row.userId) === String(currentUserId));
    if (key === "rank") return <RankChip rank={rank} />;
    if (key === "name") {
      const isAvatar = tabKey === "people" || tabKey === "requesters";
      const icon = isAvatar
        ? null
        : tabKey === "teams" || tabKey === "sourceTeams"
          ? Users
          : Building2;
      return <NameCell avatar={isAvatar} icon={icon} name={isCurrentUser ? "You" : getName(row)} sub={row.team || row.entityName || ""} />;
    }
    if (key === "credits") return <span className="font-bold tabular-nums">{Number(row.totalCredits || row.creditsRequested || 0).toLocaleString()}</span>;
    if (key === "closed" || key === "resolved") return key === "resolved" ? <MetricPill tone="amber">{closed}</MetricPill> : <span className="tabular-nums">{closed.toLocaleString()}</span>;
    if (key === "pending") return <MetricPill tone="amber">{pending}</MetricPill>;
    if (key === "entities") return <span className="tabular-nums">{Number(row.entitiesCount || 0)}</span>;
    if (key === "teams") return <span className="tabular-nums">{Number(row.teamsCount || row.teamsInvolved || 0)}</span>;
    if (key === "solvers") return <span className="tabular-nums">{Number(row.activeSolvers || row.uniqueSolvers || row.membersCount || 0)}</span>;
    if (key === "requesters") return <span className="tabular-nums">{Number(row.incomingCredits || row.requestersCount || row.createdCount || 0).toLocaleString()}</span>;
    if (key === "requests") return <span className="tabular-nums">{created.toLocaleString()}</span>;
    if (key === "open") return <span className="tabular-nums">{pending.toLocaleString()}</span>;
    if (key === "coverage") return <EvidenceBar value={row.completionRate || row.coverage || 0} />;
    if (key === "support") return <span className="tabular-nums">{Number(row.supportEntitiesCount || row.supportEntities || 0)}</span>;
    if (key === "evidence") return <EvidenceBar value={row.coverage ?? (closed ? Math.round((Number(row.evidenceAdded || 0) / closed) * 100) : 0)} />;
    if (key === "completion" || key === "closure") return <EvidenceBar value={row.completionRate || row.coverage || 0} />;
    if (key === "avg") return <MetricPill>{formatDurationHours(row.avgHours || 0)}</MetricPill>;
    if (key === "created") return <span className="font-bold tabular-nums">{created.toLocaleString()}</span>;
    if (key === "sentBack") return <MetricPill tone={sentBack ? "red" : "slate"}>{key === "sentBack" && String(row.sentBackRate || "").includes("%") ? row.sentBackRate : sentBack}</MetricPill>;
    if (key === "share") return <span className="tabular-nums">{Number(row.teamShare || row.percentOfTeamTotal || 0)}%</span>;
    if (key === "avgCredits") {
      const credits = Number(row.totalCredits || row.creditsRequested || 0);
      return <span className="tabular-nums">{created ? (credits / created).toFixed(1) : "-"}</span>;
    }
    if (key === "trend") return <span className="text-xs font-bold text-emerald-600">Based on filters</span>;
    return "-";
  }

  return (
    <>
      <div className="px-4 pb-2">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            {columns.map((col) => <col key={col.key} style={{ width: col.width }} />)}
          </colgroup>
          <thead className="bg-muted/30 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-ink/10">
              {columns.map((col) => (
                <th key={col.key} className={`px-3 py-3 align-middle ${col.align}`}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pageRows.map((row, idx) => {
              const rank = startIndex + idx + 1;
              const isCurrentUser = !isRequesterContext && tabKey === "people" && String(row.userId) === String(currentUserId);
              return (
                <tr key={getRowKey(row, idx)} className={`border-t border-ink/10 transition-colors hover:bg-muted/30 ${isCurrentUser ? "bg-warning/10" : ""}`}>
                  {baseColumns.map((col) => (
                    <td key={col.key} className={`px-3 py-3 align-middle ${col.align}`}>{renderCell(row, rank, col.key)}</td>
                  ))}
                  {showActions ? (
                    <td className="px-3 py-3 text-center align-middle">
                      {canShowSolves ? (
                        <Button size="sm" variant="outline" className="h-8 rounded-md border-ink/10 bg-card px-3 text-xs font-semibold shadow-none" onClick={() => onViewSolves(row)}>Solves</Button>
                      ) : (
                        <RowMenu />
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? <div className="py-6 text-center text-sm text-muted-foreground">No rankings found.</div> : null}
      </div>
      <div className="flex items-center justify-between px-5 py-3 text-xs text-muted-foreground">
        <span>Showing {rows.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + CREDITS_PAGE_SIZE, rows.length)} of {rows.length}</span>
        {totalPages > 1 ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-8 w-8 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)}><ChevronRight className="h-4 w-4 rotate-180" /></Button>
            <Button size="sm" className="h-8 w-8 rounded-md bg-warning p-0 text-ink shadow-none">{currentPage}</Button>
            <Button size="sm" variant="outline" className="h-8 w-8 rounded-md border-ink/10 p-0 shadow-none" disabled={currentPage === totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function RequestDemandRankingCard({
  activeTab,
  setActiveTab,
  requestDemandData = {},
  searchTerm = "",
  filterTerm = "",
  showHeaderSearch = true,
  embedded = false,
  onSearchChange,
}) {
  const showCard = Boolean(requestDemandData && (requestDemandData.sourceCompanies?.length || requestDemandData.sourceEntities?.length || requestDemandData.sourceTeams?.length || requestDemandData.requesters?.length));

  if (!showCard) {
    return (
      <Card className={embedded ? "overflow-hidden border-0 bg-transparent shadow-none" : "overflow-hidden rounded-lg border border-ink/10 bg-card shadow-sm"}>
        <CardHeader className="border-b border-ink/10 px-4 py-3">
          <CardTitle className="text-base font-bold">Request Demand Ranking</CardTitle>
        </CardHeader>
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          No request demand data available yet.
        </CardContent>
      </Card>
    );
  }

  const tabs = [
    { key: "source_companies", label: "Companies" },
    { key: "source_entities", label: "Entities" },
    { key: "source_teams", label: "Teams" },
    { key: "requesters", label: "Requesters" },
  ];

  const currentData = activeTab === "source_companies"
    ? requestDemandData.sourceCompanies || []
    : activeTab === "source_entities" 
    ? requestDemandData.sourceEntities || []
    : activeTab === "source_teams"
    ? requestDemandData.sourceTeams || []
    : requestDemandData.requesters || [];

  return (
    <Card className={embedded ? "overflow-hidden border-0 bg-transparent shadow-none" : "overflow-hidden rounded-lg border border-ink/10 bg-card shadow-sm"}>
      <CardHeader className="border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-base font-bold">Request Demand Ranking</CardTitle>
          {showHeaderSearch ? (
            <div className="relative ml-auto w-full max-w-[56%]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="Search demand ranking..."
                className="h-9 border border-ink/10 pl-10"
              />
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="mx-4 flex gap-6 border-b border-ink/10 pt-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 text-sm font-semibold ${activeTab === tab.key ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <RequestDemandRankingTable rows={currentData} searchTerm={filterTerm || searchTerm} />
      </CardContent>
    </Card>
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
  backendRequesterRankings = [],
  searchTerm = "",
  onSearchChange,
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
      <CardHeader className="border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-base font-bold">Resolution Activity</CardTitle>
          <div className="relative ml-auto w-full max-w-[56%]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search solved request, reference, solver, team..."
              className="h-9 border border-ink/10 pl-10 pr-16"
            />
            <button
              type="button"
              onClick={() => onSearchChange?.("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="mx-4 flex gap-6 border-b border-ink/10 pt-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 text-sm font-semibold ${activeTab === tab.key ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
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
  const [tableLoading, setTableLoading] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const [solves, setSolves] = useState([]);
  const [users, setUsers] = useState([]);
  const [entities, setEntities] = useState([]);
  const [backendEntityRankings, setBackendEntityRankings] = useState([]);
  const [backendTeamRankings, setBackendTeamRankings] = useState([]);
  const [backendPeopleRankings, setBackendPeopleRankings] = useState([]);
  const [requestDemandData, setRequestDemandData] = useState({ sourceCompanies: [], sourceEntities: [], sourceTeams: [], requesters: [] });
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [detailsFocus, setDetailsFocus] = useState(null);
  const [prodPanel, setProdPanel] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  const role = getPrimaryRole(user);
  const entityType = String(user?.entity_type || user?.entity?.entity_type || "").toUpperCase();
  const baseBoardContext = useMemo(
    () => getBoardContext({ role, entityType }),
    [role, entityType],
  );
  const [rankingMode, setRankingMode] = useState(baseBoardContext.defaultMode || "solvers");
  const boardContext = useMemo(
    () => getBoardContext({ role, entityType, activeMode: rankingMode }),
    [role, entityType, rankingMode],
  );
  const isProdEntityUser = entityType === "PROD";
  const isSupportTeamLeader = role === "team_leader" && !isProdEntityUser;
  const isProdRequesterView = false;
  const isBasicUser = role === "user";
  const canExport = true;
  const canFilterCompany = !isBasicUser && ["super_admin", "senior"].includes(role);
  const canFilterEntity = boardContext.activeMode === "requesters" || ["super_admin", "senior", "manager", "team_leader", "user"].includes(role);
  const canFilterTeam = ["super_admin", "senior", "manager", "team_leader", "user"].includes(role);
  const canFilterUser = role === "team_leader";

  const defaultEntityId = role === "team_leader"
    ? String(user?.entity ?? user?.entity_id ?? "all")
    : "all";
  const defaultCompanyId = role === "super_admin"
    ? "all"
    : String(user?.company_id ?? user?.company ?? "all");

  const [appliedFilters, setAppliedFilters] = useState({ date: "30d", companyId: defaultCompanyId, entityId: defaultEntityId, teamId: "all", personId: "all", requestType: "all" });
  const [canOpenSolvesDrilldown, setCanOpenSolvesDrilldown] = useState(boardContext.canDrilldown);
  const canSeeRequesterRankings = boardContext.canRequesterMode;
  const [solverRankingTab, setSolverRankingTab] = useState(boardContext.defaultTabByMode.solvers || "people");
  const [requesterRankingTab, setRequesterRankingTab] = useState(boardContext.defaultTabByMode.requesters || "requesters");
  const [rankingSearch, setRankingSearch] = useState("");
  const [debouncedRankingSearch, setDebouncedRankingSearch] = useState("");
  const [topN, setTopN] = useState(10);
  const [rankingSort, setRankingSort] = useState("rank");
  const [resolutionSearchTerm, setResolutionSearchTerm] = useState("");
  const [debouncedResolutionSearch, setDebouncedResolutionSearch] = useState("");
  const [activeQuickFilter, setActiveQuickFilter] = useState("all");

  // Debounce ranking search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRankingSearch(rankingSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [rankingSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedResolutionSearch(resolutionSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [resolutionSearchTerm]);
  const [activeTab, setActiveTab] = useState("requests");
  const [statusActionBusyId, setStatusActionBusyId] = useState(null);
  const [prodRequestCounts, setProdRequestCounts] = useState({ inProgress: 0 });
  const isRequesterContext = canSeeRequesterRankings && rankingMode === "requesters";
  const activeFilterPreset = boardContext.filterPresetByMode[rankingMode] || "solver";
  const activeTablePreset = boardContext.tablePresetByMode[rankingMode] || "solver";
  const activeCardPreset = boardContext.cardPresetByMode[rankingMode] || boardContext.cardPreset;
  const activeHeaderSubtitle = boardContext.headerSubtitleByMode[rankingMode] || boardContext.headerSubtitle;
  const dynamicAllPeopleLabel = isRequesterContext ? "All requesters" : "All solvers";
  const showRequestTypeFilter = false;

  useEffect(() => {
    const nextEntity = role === "team_leader" ? defaultEntityId : "all";
    setAppliedFilters((prev) => {
      if (
        prev.companyId === defaultCompanyId
        && prev.entityId === nextEntity
        && prev.teamId === "all"
        && prev.personId === "all"
        && prev.requestType === "all"
      ) {
        return prev;
      }
      return { ...prev, companyId: defaultCompanyId, entityId: nextEntity, teamId: "all", personId: "all", requestType: "all" };
    });
  }, [role, defaultEntityId, defaultCompanyId]);

  useEffect(() => {
    setRankingMode((prev) => resolveActiveMode(baseBoardContext, prev));
  }, [baseBoardContext]);

  useEffect(() => {
    setSolverRankingTab((prev) => resolveActiveTab(boardContext, "solvers", prev) || "people");
    setRequesterRankingTab((prev) => resolveActiveTab(boardContext, "requesters", prev) || "requesters");
    setCanOpenSolvesDrilldown(boardContext.canDrilldown);
  }, [boardContext]);

  useEffect(() => {
    if (isProdEntityUser) setActiveTab("requests");
  }, [isProdEntityUser]);

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
    let active = true;

    async function loadData() {
      const isInitialLoad = !hasLoadedOnceRef.current;
      try {
        if (isInitialLoad) setLoading(true);
        else setTableLoading(true);
        const params = {
          include_rankings: true,
          include_requester_rankings: isRequesterContext,
        };

        if (appliedFilters.companyId !== "all") params.company_id = appliedFilters.companyId;
        if (appliedFilters.entityId !== "all") {
          if (isRequesterContext) params.source_entity_id = appliedFilters.entityId;
          else params.target_entity_id = appliedFilters.entityId;
        }
        if (appliedFilters.teamId !== "all") {
          if (isRequesterContext) params.source_team_id = appliedFilters.teamId;
          else params.target_team_id = appliedFilters.teamId;
        }
        if (appliedFilters.personId !== "all") {
          if (isRequesterContext) params.requester_user_id = appliedFilters.personId;
          else params.solver_user_id = appliedFilters.personId;
        }
        if (appliedFilters.requestType && appliedFilters.requestType !== "all") {
          params.request_type = appliedFilters.requestType;
        }
        
        if (appliedFilters.date !== "all") {
          const now = new Date();
          const days = appliedFilters.date === "7d" ? 7 : appliedFilters.date === "30d" ? 30 : appliedFilters.date === "90d" ? 90 : 30;
          const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          params.date_from = fromDate.toISOString().split("T")[0];
          params.date_to = now.toISOString().split("T")[0];
        }

        const response = await fetchCreditsSolves(params);
        if (!active) return;
        const payload = response.data || {};
        const rawSolves = Array.isArray(payload) ? payload : payload.solves || [];
        setSolves(rawSolves.map(normalizeSolve));
        setUsers(payload.users || []);
        setEntities(payload.entities || []);
        setBackendEntityRankings(payload.entityRankings || payload.teamRankings || []);
        setBackendTeamRankings(payload.teamRankings || []);
        setBackendPeopleRankings(payload.peopleRankings || []);
        setRequestDemandData(normalizeRequesterDemandPayload(payload));
        const backendAllowsDrilldown = Boolean(payload.canOpenSolvesDrilldown ?? true);
        setCanOpenSolvesDrilldown(backendAllowsDrilldown && boardContext.canDrilldown);
        setProdRequestCounts({ inProgress: 0 });
      } catch (error) {
        if (!active) return;
        console.error("Failed to load credits board", error);
        setSolves([]);
        setUsers([]);
        setEntities([]);
        setBackendEntityRankings([]);
        setBackendTeamRankings([]);
        setBackendPeopleRankings([]);
        setRequestDemandData({ sourceCompanies: [], sourceEntities: [], sourceTeams: [], requesters: [] });
        setCanOpenSolvesDrilldown(true);
        setProdRequestCounts({ inProgress: 0 });
      } finally {
        if (!active) return;
        if (isInitialLoad) {
          hasLoadedOnceRef.current = true;
          setLoading(false);
        } else {
          setTableLoading(false);
        }
      }
    }

    if (!authLoading && user) loadData();
    return () => {
      active = false;
    };
  }, [authLoading, user, reloadTick, appliedFilters, boardContext.canDrilldown, isRequesterContext]);

  // TODO: Implement server-side pagination when backend supports:
  // GET /credits/solves/?status=COMPLETED&page=2&page_size=5
  // Currently using client-side pagination after fetching all rows.

  const roleScopedSolves = useMemo(() => filterSolvesByUserRole(solves, user), [solves, user]);
  const userNameById = useMemo(
    () => new Map(users.map((u) => [String(u?.id), (u?.full_name || u?.username || "").trim()])),
    [users],
  );
  const companyScopedSolves = useMemo(() => (
    appliedFilters.companyId === "all"
      ? roleScopedSolves
      : roleScopedSolves.filter((solve) => String(solve.companyId || "") === String(appliedFilters.companyId))
  ), [roleScopedSolves, appliedFilters.companyId]);

  const visibleUsers = useMemo(() => {
    const ids = new Set(companyScopedSolves.map((solve) => solve.solverId));
    return users.filter((row) => ids.has(row.id));
  }, [users, companyScopedSolves]);

  const visibleEntities = useMemo(() => {
    const ids = new Set(companyScopedSolves.map((solve) => solve.entityId));
    return entities.filter((row) => ids.has(row.id));
  }, [entities, companyScopedSolves]);

  const visibleCompanies = useMemo(() => {
    if (role === "senior") {
      const seniorCompanyId = user?.company_id ?? user?.company ?? null;
      if (!seniorCompanyId) return [];
      const scopedMatch = roleScopedSolves.find((solve) => String(solve.companyId || "") === String(seniorCompanyId));
      const seniorCompanyName = scopedMatch?.sourceCompanyName || user?.company_name || `Company ${seniorCompanyId}`;
      return [{ id: seniorCompanyId, name: seniorCompanyName }];
    }

    const map = new Map();
    roleScopedSolves.forEach((solve) => {
      if (!solve.companyId) return;
      if (!map.has(String(solve.companyId))) {
        map.set(String(solve.companyId), {
          id: solve.companyId,
          name: solve.sourceCompanyName || `Company ${solve.companyId}`,
        });
      }
    });
    return Array.from(map.values());
  }, [role, roleScopedSolves, user]);

  const visibleTeams = useMemo(() => {
    const map = new Map();
    companyScopedSolves.forEach((solve) => {
      if (!solve.targetTeamId) return;
      map.set(String(solve.targetTeamId), {
        id: solve.targetTeamId,
        name: getTeamLeaderDisplayName(solve, userNameById),
      });
    });
    return Array.from(map.values());
  }, [companyScopedSolves, userNameById]);

  const visiblePeople = useMemo(
    () => visibleUsers.map((row) => ({ id: row.id, name: row.full_name || row.username || `User ${row.id}` })),
    [visibleUsers],
  );
  const requesterEntities = useMemo(() => {
    const rows = Array.isArray(requestDemandData?.sourceEntities) ? requestDemandData.sourceEntities : [];
    const map = new Map();
    rows.forEach((row) => {
      if (!row?.entityId) return;
      map.set(String(row.entityId), { id: row.entityId, name: row.name || `Entity ${row.entityId}` });
    });
    return Array.from(map.values());
  }, [requestDemandData]);
  const requesterCompanies = useMemo(() => {
    const rows = Array.isArray(requestDemandData?.sourceCompanies) ? requestDemandData.sourceCompanies : [];
    const map = new Map();
    rows.forEach((row) => {
      if (!row?.companyId) return;
      map.set(String(row.companyId), { id: row.companyId, name: row.name || `Company ${row.companyId}` });
    });
    return Array.from(map.values());
  }, [requestDemandData]);

  const requesterTeams = useMemo(() => {
    const rows = Array.isArray(requestDemandData?.sourceTeams) ? requestDemandData.sourceTeams : [];
    const map = new Map();
    rows.forEach((row) => {
      const leaderId = row?.teamLeaderId ?? row?.team_leader_id ?? row?.sourceTeamLeaderId ?? row?.source_team_leader;
      if (!leaderId) return;
      map.set(String(leaderId), {
        id: leaderId,
        name: getTeamLeaderDisplayName(row, userNameById),
      });
    });
    return Array.from(map.values());
  }, [requestDemandData, userNameById]);

  const requesterPeople = useMemo(() => {
    const rows = Array.isArray(requestDemandData?.requesters) ? requestDemandData.requesters : [];
    const map = new Map();
    rows.forEach((row) => {
      if (!row?.userId) return;
      map.set(String(row.userId), { id: row.userId, name: row.name || `Requester ${row.userId}` });
    });
    return Array.from(map.values());
  }, [requestDemandData]);

  const toolbarEntities = isRequesterContext && requesterRankingTab === "sourceCompanies"
    ? requesterCompanies
    : isRequesterContext
      ? requesterEntities
      : visibleEntities;
  const toolbarTeams = isRequesterContext ? requesterTeams : visibleTeams;
  const toolbarPeople = isRequesterContext ? requesterPeople : visiblePeople;
  const requestTypeOptions = useMemo(() => {
    const set = new Set();
    roleScopedSolves.forEach((solve) => {
      const value = String(solve?.requestType || solve?.request_type || solve?.requestCategory || "").trim();
      if (value) set.add(value);
    });
    return Array.from(set);
  }, [roleScopedSolves]);
  const rankingExportColumns = isRequesterContext
    ? [
        { label: "Rank", value: (_, i) => i + 1 },
        { label: "Name", value: (r) => r.name || r.teamLabel || "-" },
        { label: "Created", value: (r) => Number(r.createdCount || 0).toLocaleString() },
        { label: "Closed", value: (r) => Number(r.closedCount || 0).toLocaleString() },
        { label: "Pending", value: (r) => Number(r.pendingCount || 0).toLocaleString() },
        { label: "Sent Back", value: (r) => Number(r.sentBackCount || 0).toLocaleString() },
        { label: "Completion Rate", value: (r) => `${Number(r.completionRate || 0)}%` },
        { label: "Avg Time", value: (r) => formatDurationHours(r.avgHours || 0) },
      ]
    : [
        { label: "Rank", value: (_, i) => i + 1 },
        { label: "Name", value: (r) => r.name || r.teamLabel || "-" },
        { label: "Credits", value: (r) => Number(r.totalCredits || 0).toLocaleString() },
        { label: "Closed", value: (r) => Number(r.closedCount || 0).toLocaleString() },
        { label: "Pending", value: (r) => Number(r.pendingCount || 0).toLocaleString() },
        { label: "Avg Time", value: (r) => formatDurationHours(r.avgHours || 0) },
      ];

  useEffect(() => {
    setAppliedFilters((prev) => {
      let changed = false;
      let nextEntityId = prev.entityId;
      let nextTeamId = prev.teamId;

      if (prev.entityId !== "all" && !toolbarEntities.some((e) => String(e.id) === String(prev.entityId))) {
        nextEntityId = "all";
        changed = true;
      }
      if (prev.teamId !== "all" && !toolbarTeams.some((t) => String(t.id) === String(prev.teamId))) {
        nextTeamId = "all";
        changed = true;
      }

      return changed ? { ...prev, entityId: nextEntityId, teamId: nextTeamId } : prev;
    });
  }, [toolbarEntities, toolbarTeams]);

  const filteredSolves = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return roleScopedSolves.filter((solve) => {
      if (appliedFilters.entityId !== "all" && String(solve.entityId) !== String(appliedFilters.entityId)) return false;
      if (appliedFilters.teamId !== "all" && String(solve.targetTeamId || "") !== String(appliedFilters.teamId)) return false;
      if (appliedFilters.personId !== "all" && String(solve.solverId) !== String(appliedFilters.personId)) return false;

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
    return filteredSolves.map((solve) => ({
      ...solve,
      solverName: getUserById(users, solve.solverId)?.full_name || solve.solverName || "Unknown solver",
      targetEntityName: getEntityById(entities, solve.entityId)?.name || solve.targetEntityName,
    }));
  }, [filteredSolves, users, entities]);

  const closedOnlySolves = useMemo(
    () => enrichedSolves.filter(closedOnly),
    [enrichedSolves],
  );
  const completedOnlySolves = useMemo(
    () => enrichedSolves.filter(completedOnly),
    [enrichedSolves],
  );

  const rankingFilteredSolves = useMemo(() => {
    const q = debouncedRankingSearch.trim().toLowerCase();
    if (!q) return enrichedSolves;
    return enrichedSolves.filter((solve) => {
      const haystack = [
        solve.requestTitle,
        solve.requestReference,
        solve.solverName,
        solve.targetEntityName,
        solve.targetTeamLabel,
        solve.sourceEntityName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [enrichedSolves, debouncedRankingSearch]);

  const solverEntityRows = useMemo(
    () => (backendEntityRankings.length > 0 ? backendEntityRankings : buildEntityRankings(rankingFilteredSolves, entities)),
    [backendEntityRankings, rankingFilteredSolves, entities],
  );
  const solverTeamRows = useMemo(() => {
    const baseRows = backendTeamRankings.length > 0 ? backendTeamRankings : buildTeamLeaderRankings(rankingFilteredSolves, entities);
    return baseRows.map((row) => {
      const teamName = getTeamLeaderDisplayName(row, userNameById);
      return { ...row, name: teamName, teamLabel: teamName };
    });
  }, [backendTeamRankings, rankingFilteredSolves, entities, userNameById]);
  const solverPeopleRows = useMemo(
    () => ((backendPeopleRankings.length > 0 && !isSupportTeamLeader) ? backendPeopleRankings : buildPeopleRankings(rankingFilteredSolves, users, entities)),
    [backendPeopleRankings, isSupportTeamLeader, rankingFilteredSolves, users, entities],
  );
  const solverCompanyRows = useMemo(
    () => buildCompanyRankings(rankingFilteredSolves),
    [rankingFilteredSolves],
  );

  function sortRows(rows, mode, sortKey) {
    const arr = [...rows];
    if (sortKey === "rank") return arr;
    if (mode === "solvers") {
      if (sortKey === "credits") return arr.sort((a, b) => Number(b.totalCredits || 0) - Number(a.totalCredits || 0));
      if (sortKey === "solved") return arr.sort((a, b) => Number(b.closedCount || b.solvedCount || 0) - Number(a.closedCount || a.solvedCount || 0));
      if (sortKey === "pending") return arr.sort((a, b) => Number(b.pendingCount || 0) - Number(a.pendingCount || 0));
      if (sortKey === "avg_time") return arr.sort((a, b) => Number(a.avgHours || 0) - Number(b.avgHours || 0));
    } else {
      if (sortKey === "created") return arr.sort((a, b) => Number(b.createdCount || 0) - Number(a.createdCount || 0));
      if (sortKey === "closed") return arr.sort((a, b) => Number(b.closedCount || 0) - Number(a.closedCount || 0));
      if (sortKey === "completion") return arr.sort((a, b) => Number(b.completionRate || 0) - Number(a.completionRate || 0));
      if (sortKey === "avg_time") return arr.sort((a, b) => Number(a.avgHours || 0) - Number(b.avgHours || 0));
    }
    return arr;
  }

  const currentRankingRows = useMemo(() => {
    const requesterData = requesterRankingTab === "sourceCompanies"
      ? (requestDemandData.sourceCompanies || [])
      : requesterRankingTab === "sourceEntities"
      ? (requestDemandData.sourceEntities || [])
      : requesterRankingTab === "sourceTeams"
      ? (requestDemandData.sourceTeams || [])
      : (requestDemandData.requesters || []);
    const solverData = solverRankingTab === "companies"
      ? solverCompanyRows
      : solverRankingTab === "entities"
      ? solverEntityRows
      : solverRankingTab === "teams"
      ? solverTeamRows
      : solverPeopleRows;
    const rawBase = isRequesterContext ? requesterData : solverData;
    const raw = (
      (isRequesterContext && requesterRankingTab === "sourceTeams")
      || (!isRequesterContext && solverRankingTab === "teams")
    )
      ? rawBase.map((row) => {
          const teamName = getTeamLeaderDisplayName(row, userNameById);
          return { ...row, name: teamName, teamLabel: teamName };
        })
      : rawBase;
    const q = debouncedRankingSearch.trim().toLowerCase();
    const searched = !q || !isRequesterContext
      ? raw
      : raw.filter((row) => [row.name, row.teamLabel, row.entityName].filter(Boolean).join(" ").toLowerCase().includes(q));
    return sortRows(searched, isRequesterContext ? "requesters" : "solvers", rankingSort).slice(0, Number(topN) || 10);
  }, [isRequesterContext, requesterRankingTab, requestDemandData, solverRankingTab, solverCompanyRows, solverEntityRows, solverTeamRows, solverPeopleRows, rankingSort, topN, userNameById]);

  const requesterRows = useMemo(() => ({
    companies: Array.isArray(requestDemandData?.sourceCompanies) ? requestDemandData.sourceCompanies : [],
    entities: Array.isArray(requestDemandData?.sourceEntities) ? requestDemandData.sourceEntities : [],
    teams: Array.isArray(requestDemandData?.sourceTeams) ? requestDemandData.sourceTeams : [],
    people: Array.isArray(requestDemandData?.requesters) ? requestDemandData.requesters : [],
  }), [requestDemandData]);

  const rankingCards = useMemo(() => {
    const topCompany = solverCompanyRows[0];
    const topEntity = solverEntityRows[0];
    const topTeam = solverTeamRows[0];
    const topSolver = solverPeopleRows[0];
    const topRequester = requesterRows.people[0];
    const requesterCompletion = requesterRows.people.length
      ? Math.round(requesterRows.people.reduce((s, r) => s + Number(r.completionRate || 0), 0) / requesterRows.people.length)
      : 0;
    const myRow = solverPeopleRows.find((p) => String(p.userId) === String(user?.id));
    const myRank = myRow ? solverPeopleRows.findIndex((p) => String(p.userId) === String(user?.id)) + 1 : null;

    const presets = {
      super_admin: [
        { label: "Top Company", value: topCompany?.name || "-", hint: `${Number(topCompany?.totalCredits || 0).toLocaleString()} credits`, icon: Building2 },
        { label: "Top Solver", value: topSolver?.name || "-", hint: `${Number(topSolver?.closedCount || 0)} closed`, icon: Users },
        { label: "Top Requester", value: topRequester?.name || "-", hint: `${Number(topRequester?.createdCount || 0)} created`, icon: Star },
        { label: "Global Completion", value: `${requesterCompletion}%`, hint: "requester side", icon: Gauge },
      ],
      senior: [
        { label: "Top Support Entity", value: topEntity?.name || "-", hint: `${Number(topEntity?.totalCredits || 0).toLocaleString()} credits`, icon: Building2 },
        { label: "Top Solver", value: topSolver?.name || "-", hint: `${Number(topSolver?.closedCount || 0)} closed`, icon: Users },
        { label: "Top Requester", value: topRequester?.name || "-", hint: `${Number(topRequester?.createdCount || 0)} created`, icon: Star },
        { label: "Company Completion", value: `${requesterCompletion}%`, hint: "requester side", icon: Gauge },
      ],
      manager_support: [
        { label: "Top Team (Target)", value: topTeam?.name || "-", hint: `${Number(topTeam?.totalCredits || 0).toLocaleString()} credits`, icon: Users },
        { label: "Top Solver", value: topSolver?.name || "-", hint: `${Number(topSolver?.closedCount || 0)} closed`, icon: Star },
        { label: "Top Requester (Incoming)", value: topRequester?.name || "-", hint: `${Number(topRequester?.createdCount || 0)} requested`, icon: FolderOpen },
        { label: "Global Completion", value: `${requesterCompletion}%`, hint: "requester side", icon: Gauge },
      ],
      manager_prod: [
        { label: "Top Support Entity", value: topEntity?.name || "-", hint: `${Number(topEntity?.closedCount || 0)} closed`, icon: Building2 },
        { label: "Top Solver", value: topSolver?.name || "-", hint: `${Number(topSolver?.closedCount || 0)} closed`, icon: Users },
        { label: "Top Requester", value: topRequester?.name || "-", hint: `${Number(topRequester?.createdCount || 0)} created`, icon: FolderOpen },
        { label: "Closure Rate", value: `${requesterCompletion}%`, hint: "requester side", icon: Gauge },
      ],
      tl_support: [
        { label: "Team Closed", value: Number(topTeam?.closedCount || 0).toLocaleString(), hint: topTeam?.name || "Team", icon: CheckCircle2 },
        { label: "Top Solver (team)", value: topSolver?.name || "-", hint: `${Number(topSolver?.closedCount || 0)} closed`, icon: Star },
        { label: "Top Requester (to team)", value: topRequester?.name || "-", hint: `${Number(topRequester?.createdCount || 0)} created`, icon: FolderOpen },
        { label: "Team Completion", value: `${requesterCompletion}%`, hint: "requester side", icon: Gauge },
      ],
      tl_prod: [
        { label: "Team Demand", value: Number(topTeam?.createdCount || 0).toLocaleString(), hint: topTeam?.name || "Team", icon: FolderOpen },
        { label: "Top Requester", value: topRequester?.name || "-", hint: `${Number(topRequester?.createdCount || 0)} created`, icon: Star },
        { label: "Team Closure", value: `${requesterCompletion}%`, hint: "requester side", icon: Gauge },
        { label: "Sent-back Risk", value: Number(topTeam?.sentBackCount || 0).toLocaleString(), hint: "requester side", icon: ShieldAlert },
      ],
      user: [
        { label: "My Rank", value: myRank ? `#${myRank}` : "-", hint: "solver ranking", icon: Trophy },
        { label: "My Closed Count", value: Number(myRow?.closedCount || 0).toLocaleString(), hint: "Requests closed", icon: CheckCircle2 },
        { label: "My Avg Resolution Time", value: formatDurationHours(Number(myRow?.avgHours || 0)), hint: "Average time to solve", icon: Timer },
        { label: "My Evidence Coverage", value: `${Number(myRow?.closedCount || 0) ? Math.round((Number(myRow?.evidenceAdded || 0) / Number(myRow?.closedCount || 0)) * 100) : 0}%`, hint: "Evidence added", icon: Shield },
      ],
      user_prod: (() => {
        const myRequesterRow = requesterRows.people.find((p) => String(p.userId) === String(user?.id));
        const myRequesterRank = myRequesterRow ? requesterRows.people.findIndex((p) => String(p.userId) === String(user?.id)) + 1 : null;
        const created = Number(myRequesterRow?.createdCount || 0);
        const pending = Number(myRequesterRow?.pendingCount || 0);
        const completion = Number(myRequesterRow?.completionRate || 0);
        return [
          { label: "My Rank", value: myRequesterRank ? `#${myRequesterRank}` : "-", hint: "requester ranking", icon: Trophy },
          { label: "My Requests Created", value: created.toLocaleString(), hint: "Requests submitted", icon: ReceiptText },
          { label: "My Avg Fulfillment Time", value: formatDurationHours(Number(myRequesterRow?.avgHours || 0)), hint: "Average time to delivery", icon: Timer },
          { label: "My Requirement Coverage", value: `${completion}%`, hint: `${pending} open`, icon: Shield },
        ];
      })(),
      default: [
        { label: "Top Solver", value: topSolver?.name || "-", hint: `${Number(topSolver?.closedCount || 0)} closed`, icon: Users },
        { label: "Top Team", value: topTeam?.name || "-", hint: `${Number(topTeam?.totalCredits || 0).toLocaleString()} credits`, icon: Building2 },
        { label: "Top Requester", value: topRequester?.name || "-", hint: `${Number(topRequester?.createdCount || 0)} created`, icon: Star },
        { label: "Completion", value: `${requesterCompletion}%`, hint: "requester side", icon: Gauge },
      ],
    };
    return presets[activeCardPreset] || presets.default;
  }, [activeCardPreset, requesterRows, solverCompanyRows, solverEntityRows, solverPeopleRows, solverTeamRows, user?.id]);

  const rankingInsights = useMemo(() => {
    const getInsightName = (row) => row?.name || row?.teamLabel || "-";
    if (isRequesterContext) {
      const rows = currentRankingRows;
      const mostSentBack = [...rows].sort((a, b) => Number(b.sentBackCount || 0) - Number(a.sentBackCount || 0))[0];
      const bestCompletion = [...rows].sort((a, b) => Number(b.completionRate || 0) - Number(a.completionRate || 0))[0];
      const mostPending = [...rows].sort((a, b) => Number(b.pendingCount || 0) - Number(a.pendingCount || 0))[0];
      const bestAvgTime = [...rows].filter((r) => Number(r.avgHours || 0) > 0).sort((a, b) => Number(a.avgHours || 0) - Number(b.avgHours || 0))[0];
      return [
        { label: "Best Completion", value: `${getInsightName(bestCompletion)} (${Number(bestCompletion?.completionRate || 0)}%)`, icon: ArrowUp },
        { label: "Most Pending", value: `${getInsightName(mostPending)} (${Number(mostPending?.pendingCount || 0)})`, icon: Clock3 },
        { label: "Most Sent Back", value: `${getInsightName(mostSentBack)} (${Number(mostSentBack?.sentBackCount || 0)})`, icon: ArrowDown },
        { label: "Best Avg Time", value: `${getInsightName(bestAvgTime)} (${formatDurationHours(Number(bestAvgTime?.avgHours || 0))})`, icon: Timer },
      ];
    }
    const rows = currentRankingRows;
    if (["super_admin", "senior"].includes(activeCardPreset)) {
      const biggestClimber = [...rows].sort((a, b) => Number(b.closedCount || b.solvedCount || b.completed || 0) - Number(a.closedCount || a.solvedCount || a.completed || 0))[0];
      const biggestDrop = [...rows].sort((a, b) => Number(b.pendingCount || 0) - Number(a.pendingCount || 0))[0];
      const newInTopTen = rows.find((r) => Number(r.pendingCount || 0) <= 1) || rows[0];
      const bestAvgTime = [...rows].filter((r) => Number(r.avgHours || 0) > 0).sort((a, b) => Number(a.avgHours || 0) - Number(b.avgHours || 0))[0];
      return [
        { label: "Biggest Climber", value: `${getInsightName(biggestClimber)} (+${Number(biggestClimber?.closedCount || biggestClimber?.solvedCount || biggestClimber?.completed || 0)})`, icon: ArrowUp },
        { label: "Biggest Drop", value: `${getInsightName(biggestDrop)} (-${Number(biggestDrop?.pendingCount || 0)})`, icon: ArrowDown },
        { label: "New in Top 10", value: `${getInsightName(newInTopTen)} (New)`, icon: Star },
        { label: "Best Avg Time", value: `${getInsightName(bestAvgTime)} (${formatDurationHours(Number(bestAvgTime?.avgHours || 0))})`, icon: Timer },
      ];
    }
    const strongest = rows[0];
    const mostPending = [...rows].sort((a, b) => Number(b.pendingCount || 0) - Number(a.pendingCount || 0))[0];
    const bestEvidence = [...rows].sort((a, b) => Number(b.coverage || 0) - Number(a.coverage || 0))[0];
    const bestAvgTime = [...rows].filter((r) => Number(r.avgHours || 0) > 0).sort((a, b) => Number(a.avgHours || 0) - Number(b.avgHours || 0))[0];
    return [
      { label: "Top Performer", value: `${getInsightName(strongest)} (${Number(strongest?.totalCredits || 0)} credits)`, icon: Trophy },
      { label: "Pending Load", value: `${getInsightName(mostPending)} (${Number(mostPending?.pendingCount || 0)})`, icon: Clock3 },
      { label: "Best Evidence", value: `${getInsightName(bestEvidence)} (${Number(bestEvidence?.coverage || 0)}%)`, icon: Shield },
      { label: "Best Avg Time", value: `${getInsightName(bestAvgTime)} (${formatDurationHours(Number(bestAvgTime?.avgHours || 0))})`, icon: Timer },
    ];
  }, [activeCardPreset, currentRankingRows, isRequesterContext]);

  const rankingSearchPlaceholder = useMemo(() => {
    if (isRequesterContext) {
      if (requesterRankingTab === "sourceCompanies") return "Search companies...";
      if (requesterRankingTab === "sourceEntities") return "Search entities...";
      if (requesterRankingTab === "sourceTeams") return "Search teams...";
      return "Search requesters...";
    }
    if (solverRankingTab === "companies") return "Search companies...";
    if (solverRankingTab === "entities") return "Search entities...";
    if (solverRankingTab === "teams") return "Search teams...";
    return "Search solvers...";
  }, [isRequesterContext, requesterRankingTab, solverRankingTab]);

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
        <PageHeader title="Ranking" description="Loading..." />
        <Skeleton className="h-40" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!user) return <PageHeader title="Ranking" description="Not authenticated" />;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
      {isProdRequesterView ? (
        <ProdCreditsHeader
          filters={appliedFilters}
          onDateChange={(value) => setAppliedFilters((prev) => ({ ...prev, date: value }))}
          onApply={() => {}}
          entityName={user?.entity_name || user?.entity?.name || user?.entity_code || "My Entity"}
        />
      ) : (
      <CreditsBoardHeader
        filters={appliedFilters}
        onChange={(key, value) => setAppliedFilters((prev) => ({ ...prev, [key]: value }))}
        companies={visibleCompanies}
        entities={toolbarEntities}
        teams={toolbarTeams}
        people={toolbarPeople}
        allPeopleLabel={dynamicAllPeopleLabel}
        canFilterCompany={canFilterCompany}
        canFilterEntity={canFilterEntity}
        canFilterTeam={canFilterTeam}
        canFilterUser={canFilterUser}
        showRequestType={activeFilterPreset === "requester" && showRequestTypeFilter}
        requestTypeOptions={requestTypeOptions}
        subtitle={activeHeaderSubtitle}
        titleSuffix={boardContext.titleSuffix}
        showFilters={false}
      />
      )}

      <div className="mt-5">
        {isProdRequesterView ? <ProdSummaryCards metrics={prodSummaryMetrics} /> : <RankingTopCards cards={rankingCards} theme="executive" />}
      </div>

      <div className="mt-4">
        {isProdRequesterView ? (
          <Card className="overflow-hidden rounded-lg border border-ink/10 bg-card shadow-sm">
            <CardHeader className="border-b border-ink/10 px-4 py-3">
              <CardTitle className="text-base font-bold">Resolution Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="mx-4 flex gap-6 border-b border-ink/10 pt-3">
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
                    className={`pb-2 text-sm font-semibold ${activeTab === tab.key ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="mx-4 mt-3 mb-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={resolutionSearchTerm}
                      onChange={(e) => setResolutionSearchTerm(e.target.value)}
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
                  entitiesRankings={(backendEntityRankings.length > 0 ? backendEntityRankings : buildEntityRankings(enrichedSolves, entities)).filter((entity) => (entity.name || "").toLowerCase().includes(debouncedResolutionSearch.trim().toLowerCase()))}
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
                  teams={(backendTeamRankings.length > 0 ? backendTeamRankings : buildTeamLeaderRankings(enrichedSolves, entities)).filter((team) => (team.name || "").toLowerCase().includes(debouncedResolutionSearch.trim().toLowerCase()))}
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
                  people={(backendPeopleRankings.length > 0 ? backendPeopleRankings : buildPeopleRankings(enrichedSolves, users, entities)).filter((person) => (person.name || "").toLowerCase().includes(debouncedResolutionSearch.trim().toLowerCase()))}
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
                    const q = debouncedResolutionSearch.trim().toLowerCase();
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
                    const q = debouncedResolutionSearch.trim().toLowerCase();
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
        ) : (
          <div className="space-y-4">
            <Card className="overflow-hidden rounded-xl border border-ink/10 bg-card shadow-sm">
              <CardHeader className="border-b border-ink/10 px-5 py-5">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg font-bold">{activeTablePreset === "requester" ? "Requester Rankings" : "Solver Rankings"}</CardTitle>
                  <div className="relative ml-auto w-full max-w-[260px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={rankingSearch}
                      onChange={(e) => setRankingSearch(e.target.value)}
                      placeholder={rankingSearchPlaceholder}
                      className="h-10 rounded-lg border border-ink/10 bg-white pl-10 shadow-none"
                    />
                  </div>
                  {canFilterCompany ? (
                    <Select
                      className="!h-9 !w-[160px] rounded-lg border-ink/10 bg-white text-sm shadow-none"
                      value={appliedFilters.companyId}
                      onChange={(e) => setAppliedFilters((prev) => ({ ...prev, companyId: e.target.value }))}
                    >
                      {role === "super_admin" ? <option value="all">All companies</option> : null}
                      {visibleCompanies.map((company) => (
                        <option key={company.id} value={String(company.id)}>
                          {company.name}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  <Select className="!h-9 !w-[140px] rounded-lg border-ink/10 bg-white text-sm shadow-none" value={appliedFilters.date} onChange={(e) => setAppliedFilters((prev) => ({ ...prev, date: e.target.value }))}>
                    <option value="30d">Last 30 days</option>
                    <option value="7d">Last 7 days</option>
                    <option value="90d">Last 90 days</option>
                    <option value="all">All time</option>
                  </Select>
                  <Select className="!h-9 !w-[110px] rounded-lg border-ink/10 bg-white text-sm shadow-none" value={String(topN)} onChange={(e) => setTopN(Number(e.target.value))}>
                    <option value="5">Top 5</option>
                    <option value="10">Top 10</option>
                    <option value="20">Top 20</option>
                    <option value="50">Top 50</option>
                    <option value="999999">All</option>
                  </Select>
                  {canExport ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-lg border-ink/10 bg-card px-3 text-sm font-semibold text-foreground shadow-none hover:bg-muted/60 dark:!border-slate-600 dark:!bg-slate-700 dark:!text-slate-100 dark:hover:!bg-slate-600 disabled:opacity-70 disabled:text-muted-foreground dark:disabled:!border-slate-600 dark:disabled:!bg-slate-700 dark:disabled:!text-slate-400"
                      onClick={() => exportRankingCsv(currentRankingRows, rankingExportColumns, "credits-rankings")}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export CSV
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="px-4 pt-3">
                  {canSeeRequesterRankings && boardContext.availableModes.length > 1 ? (
                    <div className="inline-flex rounded-xl border border-ink/15 bg-muted/30 p-1 dark:bg-surface-2/60">
                      <Button
                        size="sm"
                        variant={rankingMode === "solvers" ? "default" : "ghost"}
                        className={`h-10 rounded-lg px-4 text-sm font-bold shadow-none ${rankingMode === "solvers" ? "!border !border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90 hover:!text-primary-foreground" : "!border-0 !bg-transparent !text-muted-foreground hover:!bg-muted/60 hover:!text-foreground dark:hover:!bg-surface-2"}`}
                        onClick={() => setRankingMode("solvers")}
                      >
                        <Trophy className="mr-2 h-4 w-4" />
                        Solver Rankings
                      </Button>
                      <Button
                        size="sm"
                        variant={rankingMode === "requesters" ? "default" : "ghost"}
                        className={`h-10 rounded-lg px-4 text-sm font-bold shadow-none ${rankingMode === "requesters" ? "!border !border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90 hover:!text-primary-foreground" : "!border-0 !bg-transparent !text-muted-foreground hover:!bg-muted/60 hover:!text-foreground dark:hover:!bg-surface-2"}`}
                        onClick={() => setRankingMode("requesters")}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Requester Rankings
                      </Button>
                    </div>
                  ) : null}
                  {!isProdRequesterView && boardContext.variant !== "user" && boardContext.variant !== "leader_prod" && boardContext.variant !== "user_prod" ? (
                    <div className="mt-3 px-4">
                      {(() => {
                        if (!rankingInsights.length) return null;
                        const tones = [
                          { icon: "border-success/30 bg-success/10 text-success dark:border-secondary/50 dark:bg-secondary/30 dark:text-secondary-foreground" },
                          { icon: "border-destructive/30 bg-destructive/10 text-destructive dark:border-secondary/50 dark:bg-secondary/30 dark:text-secondary-foreground" },
                          { icon: "border-info/30 bg-info/10 text-info dark:border-secondary/50 dark:bg-secondary/30 dark:text-secondary-foreground" },
                          { icon: "border-muted-foreground/30 bg-muted/40 text-muted-foreground dark:border-secondary/50 dark:bg-secondary/30 dark:text-secondary-foreground" },
                        ];
                        const insights = rankingInsights;
                        return (
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {insights.map((item, idx) => {
                              const Icon = item.icon;
                              const tone = tones[idx % tones.length];
                              return (
                                <div key={item.label} className="flex items-center gap-3 rounded-lg border border-ink/10 bg-card/80 p-3 transition-colors hover:bg-muted/30 dark:bg-surface-2/60 dark:hover:bg-surface-2">
                                  <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${tone.icon}`}>
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold text-muted-foreground">{item.label}</p>
                                    <p className="truncate text-xs font-bold leading-tight text-foreground">{item.value}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>

                {tableLoading ? (
                  <div className="px-4 pb-4">
                    <div className="overflow-hidden rounded-lg border border-ink/10">
                      <div className="grid grid-cols-8 gap-3 border-b border-ink/10 bg-muted/30 px-3 py-3">
                        {Array.from({ length: 8 }).map((_, idx) => (
                          <Skeleton key={`head-${idx}`} className="h-3 w-full" />
                        ))}
                      </div>
                      <div className="divide-y divide-ink/10 bg-card">
                        {Array.from({ length: 6 }).map((_, rowIdx) => (
                          <div key={`row-${rowIdx}`} className="grid grid-cols-8 gap-3 px-3 py-3">
                            {Array.from({ length: 8 }).map((__, colIdx) => (
                              <Skeleton key={`cell-${rowIdx}-${colIdx}`} className="h-5 w-full" />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : rankingMode === "solvers" || !canSeeRequesterRankings ? (
                  <>
                    <div className="mx-4 mt-3 flex gap-7 border-b border-ink/10">
                      {(boardContext.tabsByMode.solvers || []).map((tabKey) => {
                        const labelMap = { companies: "Companies", entities: "Entities", teams: "Teams", people: "Solvers" };
                        return (
                        <button
                          key={tabKey}
                          type="button"
                          onClick={() => setSolverRankingTab(tabKey)}
                          className={`pb-3 text-sm font-semibold ${solverRankingTab === tabKey ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
                        >
                          {labelMap[tabKey] || tabKey}
                        </button>
                        );
                      })}
                    </div>
                    {solverRankingTab === "companies" ? <RankingsTable rows={currentRankingRows} tablePreset={activeTablePreset} tabKey="companies" isRequesterContext={false} context={boardContext} currentUserId={user?.id} canOpenSolvesDrilldown={canOpenSolvesDrilldown} onViewSolves={(company) => {
                      if (!canOpenSolvesDrilldown) return;
                      const rows = rankingFilteredSolves.filter((solve) => String(solve.companyId || "") === String(company.companyId || ""));
                      setProdPanel({
                        contextType: "team",
                        title: `${company.name || "Company"} solved requests`,
                        subtitle: `${rows.length} solved request${rows.length === 1 ? "" : "s"} · ${company.activeSolvers || 0} active solver${(company.activeSolvers || 0) === 1 ? "" : "s"} · ${company.totalCredits} credits`,
                        rows,
                      });
                    }} /> : null}
                    {solverRankingTab === "entities" ? <RankingsTable rows={currentRankingRows} tablePreset={activeTablePreset} tabKey="entities" isRequesterContext={false} context={boardContext} currentUserId={user?.id} canOpenSolvesDrilldown={canOpenSolvesDrilldown} onViewSolves={(entity) => {
                      if (!canOpenSolvesDrilldown) return;
                      const rows = rankingFilteredSolves.filter((solve) => closedOnly(solve) && String(solve.entityId) === String(entity.entityId));
                      setProdPanel({
                        contextType: "team",
                        title: `${entity.name || "Entity"} solved requests`,
                        subtitle: `${rows.length} solved request${rows.length === 1 ? "" : "s"} · ${entity.activeSolvers || 0} active solver${(entity.activeSolvers || 0) === 1 ? "" : "s"} · ${entity.totalCredits} credits`,
                        rows,
                      });
                    }} /> : null}
                    {solverRankingTab === "teams" ? <RankingsTable rows={currentRankingRows} tablePreset={activeTablePreset} tabKey="teams" isRequesterContext={false} context={boardContext} currentUserId={user?.id} canOpenSolvesDrilldown={canOpenSolvesDrilldown} onViewSolves={(team) => {
                      if (!canOpenSolvesDrilldown) return;
                      const rows = rankingFilteredSolves.filter((solve) => {
                        const solveTeamLeaderId = getSolveTeamLeaderId(solve);
                        if (team.teamLeaderId) return closedOnly(solve) && String(solveTeamLeaderId) === String(team.teamLeaderId);
                        return closedOnly(solve) && !solveTeamLeaderId && String(solve.entityId) === String(team.entityId);
                      });
                      setProdPanel({
                        contextType: "team",
                        title: `${team.name || "Team"} solved requests`,
                        subtitle: `${rows.length} solved request${rows.length === 1 ? "" : "s"} · ${team.membersCount || 0} member${(team.membersCount || 0) === 1 ? "" : "s"} · ${team.totalCredits} credits`,
                        rows,
                      });
                    }} /> : null}
                    {solverRankingTab === "people" ? <RankingsTable rows={currentRankingRows} tablePreset={activeTablePreset} tabKey="people" isRequesterContext={false} context={boardContext} currentUserId={user?.id} canOpenSolvesDrilldown={canOpenSolvesDrilldown} onViewSolves={(person) => {
                      if (!canOpenSolvesDrilldown) return;
                      const rows = rankingFilteredSolves.filter((solve) => closedOnly(solve) && String(solve.solverId) === String(person.userId));
                      setProdPanel({
                        contextType: "person",
                        title: `${person.name || "Solver"} solved requests`,
                        subtitle: `${person.team || "Unknown team"} · ${rows.length} solved request${rows.length === 1 ? "" : "s"} · ${person.totalCredits} credits`,
                        rows,
                      });
                    }} /> : null}
                  </>
                ) : (
                  <>
                    <div className="mx-4 mt-3 flex gap-7 border-b border-ink/10">
                      {(boardContext.tabsByMode.requesters || []).map((tabKey) => {
                        const labelMap = activeCardPreset === "tl_prod"
                          ? { sourceCompanies: "Companies", sourceEntities: "Entities", sourceTeams: "Teams", requesters: "Requesters" }
                          : { sourceCompanies: "Companies", sourceEntities: "Entities", sourceTeams: "Teams", requesters: "Requesters" };
                        return (
                          <button
                            key={tabKey}
                            type="button"
                            onClick={() => setRequesterRankingTab(tabKey)}
                            className={`pb-3 text-sm font-semibold ${requesterRankingTab === tabKey ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
                          >
                            {labelMap[tabKey] || tabKey}
                          </button>
                        );
                      })}
                    </div>
                    <RankingsTable rows={currentRankingRows} tablePreset={activeTablePreset} tabKey={requesterRankingTab} isRequesterContext context={boardContext} currentUserId={user?.id} canOpenSolvesDrilldown={false} />
                  </>
                )}
              </CardContent>
            </Card>
            {canOpenSolvesDrilldown ? (
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
            ) : null}
          </div>
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
    </div>
  );
}

