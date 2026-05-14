import { ROLE_RANK } from "../lib/constants";

export const BASE_CREDITS_BY_TYPE = {
  INFO: 10,
  SCRIPT: 25,
  TOOL: 40,
  APP_PROJECT: 60,
  OTHER: 15,
};

export const SLA_HOURS_BY_TYPE = {
  INFO: 24,
  SCRIPT: 72,
  TOOL: 120,
  APP_PROJECT: 168,
  OTHER: 48,
};

export const SLA_BONUS = 5;
export const EVIDENCE_BONUS = 5;

export function calcCredits(requestType, opts = {}) {
  const base = BASE_CREDITS_BY_TYPE[requestType] || BASE_CREDITS_BY_TYPE.OTHER;
  const slaHours = SLA_HOURS_BY_TYPE[requestType] || SLA_HOURS_BY_TYPE.OTHER;
  const slaBonus = opts.withinSla ? SLA_BONUS : 0;
  const evidenceBonus = opts.hasEvidence ? EVIDENCE_BONUS : 0;
  return base + slaBonus + evidenceBonus;
}

export function isEvidenceRequired(opts = {}) {
  return (
    opts.needsEvidence === true ||
    opts.wasRejected === true ||
    opts.priority === "CRITICAL" ||
    opts.priority === "HIGH"
  );
}

export function rankPeople(solves) {
  const map = new Map();

  for (const solve of solves) {
    const key = solve.solverId;
    const existing = map.get(key) ?? {
      userId: key,
      totalCredits: 0,
      solvedCount: 0,
      entityId: solve.entityId,
      companyId: solve.companyId,
      badges: [],
    };

    existing.totalCredits += Number(solve.credits || 0);
    existing.solvedCount += 1;
    map.set(key, existing);
  }

  const arr = Array.from(map.values()).sort(
    (a, b) => b.totalCredits - a.totalCredits || b.solvedCount - a.solvedCount,
  );

  if (arr[0]) arr[0].badges.push("top_solver");

  const evidenceMap = new Map();
  for (const solve of solves) {
    if (solve.hasEvidence) {
      evidenceMap.set(solve.solverId, (evidenceMap.get(solve.solverId) ?? 0) + 1);
    }
  }
  const evidenceChampion = [...evidenceMap.entries()].sort((a, b) => b[1] - a[1])[0];
  if (evidenceChampion) {
    const target = arr.find((p) => p.userId === evidenceChampion[0]);
    if (target && !target.badges.includes("evidence_master")) {
      target.badges.push("evidence_master");
    }
  }

  return arr;
}

export function rankTeams(solves) {
  const map = new Map();

  for (const solve of solves) {
    const key = solve.entityId;
    const existing = map.get(key) ?? {
      entityId: key,
      totalCredits: 0,
      solvedCount: 0,
      uniqueSolvers: new Set(),
      companyName: solve.sourceCompanyName || "",
    };

    existing.totalCredits += Number(solve.credits || 0);
    existing.solvedCount += 1;
    existing.uniqueSolvers.add(solve.solverId);
    map.set(key, existing);
  }

  return Array.from(map.values())
    .map((team) => ({ ...team, uniqueSolvers: team.uniqueSolvers.size }))
    .sort((a, b) => b.totalCredits - a.totalCredits || b.solvedCount - a.solvedCount);
}

export const BADGE_LABELS = {
  top_solver: "Top Solver",
  evidence_master: "Evidence Helper",
};

export const BADGE_ICONS = {
  top_solver: "top",
  evidence_master: "evidence",
};

export function getPrimaryRole(user) {
  const roleKeys = user?.role_keys || [];
  return roleKeys.length
    ? roleKeys.reduce(
        (best, current) =>
          (ROLE_RANK[current] || 0) > (ROLE_RANK[best] || 0) ? current : best,
        roleKeys[0],
      )
    : user?.role || "user";
}

export function filterSolvesByUserRole(solves, user) {
  const userCompanyId = user?.company_id ?? user?.company ?? null;
  const userEntityId = user?.entity_id ?? user?.entity ?? null;
  const primaryRole = getPrimaryRole(user);
  const entityType = String(user?.entity_type || user?.entity?.entity_type || "").toUpperCase();
  const isProdEntityUser = entityType === "PROD";

  if (primaryRole === "super_admin") return solves;
  if (isProdEntityUser) {
    return solves;
  }
  if (primaryRole === "senior" || primaryRole === "manager") {
    return solves.filter((solve) => solve.companyId === userCompanyId);
  }
  if (primaryRole === "team_leader") {
    if (isProdEntityUser) {
      return solves.filter((solve) => solve.entityId === userEntityId);
    }
    return solves.filter((solve) => String(solve.targetTeamLeaderId ?? solve.target_team_leader ?? "") === String(user?.id));
  }
  return solves.filter((solve) => solve.solverId === user?.id);
}

export function buildRoleAwareStats(solves, user, context = {}) {
  const primaryRole = getPrimaryRole(user);
  const totalSolves = solves.length;
  const totalCredits = solves.reduce((sum, solve) => sum + Number(solve.credits || 0), 0);
  const uniqueSolvers = new Set(solves.map((solve) => solve.solverId)).size;
  const uniqueTeams = new Set(solves.map((solve) => solve.entityId)).size;

  const teamRankings = rankTeams(solves);
  const topTeam = teamRankings[0];
  const topTeamName = topTeam && context?.entities
    ? context.entities.find((entity) => entity.id === topTeam.entityId)?.name
    : null;

  const peopleRankings = rankPeople(solves);
  const topPerson = peopleRankings[0];
  const topPersonName = topPerson && context?.users
    ? context.users.find((person) => person.id === topPerson.userId)?.full_name
    : null;

  if (["super_admin", "senior", "manager"].includes(primaryRole)) {
    return {
      label: "Team Performance",
      items: [
        { label: "Solved Requests", value: totalSolves, hint: "in selected period", icon: "solved" },
        { label: "Active Solvers", value: uniqueSolvers, hint: "people who solved", icon: "users" },
        { label: "Active Teams", value: uniqueTeams, hint: "teams with solves", icon: "teams" },
        {
          label: "Top Team",
          value: topTeamName || "-",
          hint: topTeam ? `${topTeam.solvedCount} solved` : "No solved work yet",
          icon: "top",
        },
      ],
      secondary: `${totalCredits} credits`,
    };
  }

  if (primaryRole === "team_leader") {
    const myPersonalSolves = solves.filter((solve) => solve.solverId === user?.id);
    return {
      label: "Team Metrics",
      items: [
        { label: "Team Solved", value: totalSolves, hint: "in selected period", icon: "solved" },
        { label: "My Solved", value: myPersonalSolves.length, hint: "your completed work", icon: "solved" },
        { label: "Active Members", value: uniqueSolvers, hint: "members who solved", icon: "users" },
        { label: "Top Member", value: topPersonName || "-", hint: topPerson ? `${topPerson.solvedCount} solved` : "No solved work yet", icon: "top" },
      ],
      secondary: `${totalCredits} credits`,
    };
  }

const mySolves = solves.filter((solve) => solve.solverId === user?.id);
  const myCredits = mySolves.reduce((sum, solve) => sum + Number(solve.credits || 0), 0);
  const evidenceCount = mySolves.filter((solve) => solve.hasEvidence).length;

  return {
    label: "My Performance",
    items: [
      { label: "My Solved", value: mySolves.length, hint: "in selected period", icon: "solved" },
      { label: "My Credits", value: myCredits, hint: "secondary metric", icon: "credits" },
      { label: "Evidence Added", value: evidenceCount, hint: "optional attachments", icon: "evidence" },
      {
        label: "Latest Solve",
        value: mySolves[0]?.completedAt ? new Date(mySolves[0].completedAt).toLocaleDateString() : "-",
        hint: "most recent completion",
        icon: "date",
      },
    ],
    secondary: `${myCredits} credits`,
  };
}

export function getCreditBreakdownText(solve) {
  if (solve.creditBreakdown) {
    const { base, sla, evidence } = solve.creditBreakdown;
    return `Base +${base} · SLA +${sla} · Evidence +${evidence}`;
  }
  const base = solve.baseCredits || 0;
  const sla = solve.slaBonus || 0;
  const evidence = solve.evidenceBonus || 0;
  return `Base +${base} · SLA +${sla} · Evidence +${evidence}`;
}

export function getCreditBreakdown(solve) {
  if (solve.creditBreakdown) return solve.creditBreakdown;
  return {
    base: solve.baseCredits || 0,
    sla: solve.slaBonus || 0,
    evidence: solve.evidenceBonus || 0,
    total: solve.credits || 0,
    requestType: solve.requestType || "OTHER",
    withinSla: solve.withinSla || false,
  };
}
