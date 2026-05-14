const SOLVER_MODE = "solvers";
const REQUESTER_MODE = "requesters";

function normalizeEntityType(entityType) {
  return String(entityType || "").toUpperCase();
}

function getPrimaryMode(entityType) {
  return normalizeEntityType(entityType) === "PROD" ? REQUESTER_MODE : SOLVER_MODE;
}

function getModeTabs(role, mode, entityType) {
  const isRequester = mode === REQUESTER_MODE;
  const normalizedEntityType = normalizeEntityType(entityType);
  const isSupportDev = normalizedEntityType === "SUPPORT" || normalizedEntityType === "TDEV";

  if (role === "super_admin") {
    return isRequester
      ? ["sourceCompanies", "sourceEntities", "sourceTeams", "requesters"]
      : ["companies", "entities", "teams", "people"];
  }
  if (role === "senior") {
    return isRequester
      ? ["sourceEntities", "sourceTeams", "requesters"]
      : ["entities", "teams", "people"];
  }
  if (role === "manager") {
    return isRequester
      ? (isSupportDev ? ["sourceEntities", "sourceTeams", "requesters"] : ["sourceTeams", "requesters"])
      : ["teams", "people"];
  }
  if (role === "team_leader") {
    return isRequester
      ? (isSupportDev ? ["sourceEntities", "sourceTeams", "requesters"] : ["requesters"])
      : (isSupportDev ? ["teams", "people"] : ["people"]);
  }
  if (role === "user") {
    if (isRequester) {
      return isSupportDev ? ["sourceEntities", "sourceTeams", "requesters"] : ["requesters"];
    }
    return ["people"];
  }
  return isRequester ? ["sourceEntities", "sourceTeams", "requesters"] : ["entities", "teams", "people"];
}

function getScope(role) {
  if (role === "super_admin") return "global";
  if (role === "senior") return "company";
  if (role === "manager") return "entity";
  if (role === "team_leader") return "team";
  return "team_leaderboard";
}

function getVariant(role, entityType) {
  const normalized = normalizeEntityType(entityType);
  const isProd = normalized === "PROD";
  const isSupportDev = normalized === "SUPPORT" || normalized === "TDEV";

  if (role === "super_admin") return "super_admin";
  if (role === "senior") return "senior";
  if (role === "manager" && isProd) return "manager_prod";
  if (role === "manager" && isSupportDev) return "manager_support";
  if (role === "team_leader" && isProd) return "leader_prod";
  if (role === "team_leader" && isSupportDev) return "leader_support";
  if (role === "user" && isProd) return "user_prod";
  if (role === "user") return "user";
  return "default";
}

function getCardPreset(role, entityType, mode) {
  const normalizedEntityType = normalizeEntityType(entityType);
  if (role === "super_admin") return "super_admin";
  if (role === "senior") return "senior";
  if (role === "manager") return normalizedEntityType === "PROD" ? "manager_prod" : "manager_support";
  if (role === "team_leader") return normalizedEntityType === "PROD" ? "tl_prod" : "tl_support";
  if (role === "user") {
    if (mode === REQUESTER_MODE) return normalizedEntityType === "PROD" ? "user_prod" : "tl_support";
    return "user";
  }
  return "default";
}

function getHeaderCopy(role, mode, entityType) {
  const isSupportDev = ["SUPPORT", "TDEV"].includes(normalizeEntityType(entityType));
  if (mode === REQUESTER_MODE) {
    if (role === "super_admin") return "Track request demand and requester performance across all companies.";
    if (role === "senior") return "Track request demand and requester performance across your company.";
    if (role === "manager") return "Track request demand, requester quality, and fulfillment experience for your scope.";
    if (role === "team_leader") return "Track your team requesters, request quality, and fulfillment speed.";
    if (role === "user" && isSupportDev) return "Track incoming requester demand to your support/dev team.";
    return "Track your request activity, requirement quality, and fulfillment performance.";
  }
  if (role === "super_admin") return "Track solver performance and fulfillment quality across all companies.";
  if (role === "senior") return "Track solver performance and fulfillment quality across your company.";
  if (role === "manager") return "Track team solver performance, pending load, and resolution speed.";
  if (role === "team_leader") return "Track your team solver performance and member ranking.";
  return "Track your solved work, response quality, and solver ranking.";
}

export function resolveActiveMode(context, requestedMode) {
  if (context.availableModes.includes(requestedMode)) return requestedMode;
  return context.defaultMode;
}

export function resolveActiveTab(context, mode, requestedTab) {
  const tabs = context.tabsByMode[mode] || [];
  if (tabs.includes(requestedTab)) return requestedTab;
  return context.defaultTabByMode[mode] || tabs[0] || null;
}

export function getBoardContext({ role, entityType, activeMode } = {}) {
  const normalizedRole = role || "user";
  const normalizedEntityType = normalizeEntityType(entityType);
  const isProd = normalizedEntityType === "PROD";
  const isSupportDev = normalizedEntityType === "SUPPORT" || normalizedEntityType === "TDEV";
  const primaryMode = getPrimaryMode(normalizedEntityType);
  const defaultMode = normalizedRole === "super_admin" ? SOLVER_MODE : primaryMode;
  const availableModes = normalizedRole === "user"
    ? (isSupportDev ? [SOLVER_MODE, REQUESTER_MODE] : [primaryMode])
    : [SOLVER_MODE, REQUESTER_MODE];

  const tabsByMode = {
    [SOLVER_MODE]: getModeTabs(normalizedRole, SOLVER_MODE, normalizedEntityType),
    [REQUESTER_MODE]: getModeTabs(normalizedRole, REQUESTER_MODE, normalizedEntityType),
  };
  const defaultTabByMode = {
    [SOLVER_MODE]: tabsByMode[SOLVER_MODE][0] || null,
    [REQUESTER_MODE]: tabsByMode[REQUESTER_MODE][0] || null,
  };

  const normalizedActiveMode = availableModes.includes(activeMode) ? activeMode : defaultMode;

  const cardPresetByMode = {
    [SOLVER_MODE]: getCardPreset(normalizedRole, normalizedEntityType, SOLVER_MODE),
    [REQUESTER_MODE]: getCardPreset(normalizedRole, normalizedEntityType, REQUESTER_MODE),
  };
  const tablePresetByMode = {
    [SOLVER_MODE]: "solver",
    [REQUESTER_MODE]: "requester",
  };
  const filterPresetByMode = {
    [SOLVER_MODE]: "solver",
    [REQUESTER_MODE]: "requester",
  };

  const headerSubtitleByMode = {
    [SOLVER_MODE]: getHeaderCopy(normalizedRole, SOLVER_MODE, normalizedEntityType),
    [REQUESTER_MODE]: getHeaderCopy(normalizedRole, REQUESTER_MODE, normalizedEntityType),
  };

  const variant = getVariant(normalizedRole, normalizedEntityType);
  const scope = getScope(normalizedRole);
  const canDrilldown = normalizedRole !== "user";

  return {
    defaultMode,
    availableModes,
    activeMode: normalizedActiveMode,
    tabsByMode,
    defaultTabByMode,
    cardPresetByMode,
    tablePresetByMode,
    filterPresetByMode,
    scope,
    canDrilldown,
    headerSubtitleByMode,

    // Compatibility fields used by existing CreditsBoard rendering.
    role: normalizedRole,
    entityType: normalizedEntityType,
    isProd,
    isSupportDev,
    canRequesterMode: availableModes.includes(REQUESTER_MODE),
    visibleModes: availableModes,
    visibleSolverTabs: tabsByMode[SOLVER_MODE],
    visibleRequesterTabs: tabsByMode[REQUESTER_MODE],
    cardPreset: cardPresetByMode[normalizedActiveMode],
    variant,
    scopeLabel: scope === "global" ? "Global" : scope === "company" ? "Company" : scope === "entity" ? "Entity" : scope === "team" ? "Team" : "Me",
    titleSuffix: "",
    headerSubtitle: headerSubtitleByMode[normalizedActiveMode],
  };
}
