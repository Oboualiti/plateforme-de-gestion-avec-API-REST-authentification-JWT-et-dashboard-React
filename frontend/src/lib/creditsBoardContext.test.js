import { describe, expect, it } from "vitest";
import { getBoardContext, resolveActiveMode, resolveActiveTab } from "./creditsBoardContext";

describe("creditsBoardContext", () => {
  it("defaults SUPPORT/TDEV roles to solver world", () => {
    const managerSupport = getBoardContext({ role: "manager", entityType: "SUPPORT" });
    const tlTdev = getBoardContext({ role: "team_leader", entityType: "TDEV" });
    expect(managerSupport.defaultMode).toBe("solvers");
    expect(tlTdev.defaultMode).toBe("solvers");
  });

  it("defaults PROD roles to requester world except super_admin", () => {
    const seniorProd = getBoardContext({ role: "senior", entityType: "PROD" });
    const managerProd = getBoardContext({ role: "manager", entityType: "PROD" });
    const userProd = getBoardContext({ role: "user", entityType: "PROD" });
    const superAdminProd = getBoardContext({ role: "super_admin", entityType: "PROD" });
    expect(seniorProd.defaultMode).toBe("requesters");
    expect(managerProd.defaultMode).toBe("requesters");
    expect(userProd.defaultMode).toBe("requesters");
    expect(superAdminProd.defaultMode).toBe("solvers");
  });

  it("enforces available modes by role", () => {
    const userSupport = getBoardContext({ role: "user", entityType: "SUPPORT" });
    const userProd = getBoardContext({ role: "user", entityType: "PROD" });
    const managerSupport = getBoardContext({ role: "manager", entityType: "SUPPORT" });
    expect(userSupport.availableModes).toEqual(["solvers", "requesters"]);
    expect(userProd.availableModes).toEqual(["requesters"]);
    expect(managerSupport.availableModes).toEqual(["solvers", "requesters"]);
  });

  it("provides tabs matrix for each role", () => {
    const superAdmin = getBoardContext({ role: "super_admin", entityType: "SUPPORT" });
    const senior = getBoardContext({ role: "senior", entityType: "SUPPORT" });
    const managerProd = getBoardContext({ role: "manager", entityType: "PROD" });
    const managerSupport = getBoardContext({ role: "manager", entityType: "SUPPORT" });
    const managerTdev = getBoardContext({ role: "manager", entityType: "TDEV" });
    const teamLeaderProd = getBoardContext({ role: "team_leader", entityType: "PROD" });
    const teamLeaderSupport = getBoardContext({ role: "team_leader", entityType: "SUPPORT" });
    const teamLeaderTdev = getBoardContext({ role: "team_leader", entityType: "TDEV" });
    const userSupport = getBoardContext({ role: "user", entityType: "SUPPORT" });
    const userProd = getBoardContext({ role: "user", entityType: "PROD" });

    expect(superAdmin.tabsByMode.solvers).toEqual(["companies", "entities", "teams", "people"]);
    expect(superAdmin.tabsByMode.requesters).toEqual(["sourceCompanies", "sourceEntities", "sourceTeams", "requesters"]);
    expect(senior.tabsByMode.solvers).toEqual(["companies", "entities", "teams", "people"]);
    expect(senior.tabsByMode.requesters).toEqual(["sourceCompanies", "sourceEntities", "sourceTeams", "requesters"]);
    expect(managerProd.tabsByMode.solvers).toEqual(["teams", "people"]);
    expect(managerProd.tabsByMode.requesters).toEqual(["sourceTeams", "requesters"]);
    expect(managerSupport.tabsByMode.requesters).toEqual(["sourceEntities", "sourceTeams", "requesters"]);
    expect(managerTdev.tabsByMode.requesters).toEqual(["sourceEntities", "sourceTeams", "requesters"]);
    expect(teamLeaderSupport.tabsByMode.solvers).toEqual(["teams", "people"]);
    expect(teamLeaderTdev.tabsByMode.solvers).toEqual(["teams", "people"]);
    expect(teamLeaderProd.tabsByMode.solvers).toEqual(["people"]);
    expect(teamLeaderProd.tabsByMode.requesters).toEqual(["requesters"]);
    expect(teamLeaderSupport.tabsByMode.requesters).toEqual(["sourceEntities", "sourceTeams", "requesters"]);
    expect(teamLeaderTdev.tabsByMode.requesters).toEqual(["sourceEntities", "sourceTeams", "requesters"]);
    expect(userSupport.tabsByMode.solvers).toEqual(["people"]);
    expect(userSupport.tabsByMode.requesters).toEqual(["sourceEntities", "sourceTeams", "requesters"]);
    expect(userProd.tabsByMode.requesters).toEqual(["requesters"]);
  });

  it("exposes scope and drilldown guardrails", () => {
    expect(getBoardContext({ role: "super_admin", entityType: "SUPPORT" }).scope).toBe("global");
    expect(getBoardContext({ role: "senior", entityType: "SUPPORT" }).scope).toBe("company");
    expect(getBoardContext({ role: "manager", entityType: "SUPPORT" }).scope).toBe("entity");
    expect(getBoardContext({ role: "team_leader", entityType: "SUPPORT" }).scope).toBe("team");
    const userCtx = getBoardContext({ role: "user", entityType: "SUPPORT" });
    expect(userCtx.scope).toBe("team_leaderboard");
    expect(userCtx.canDrilldown).toBe(false);
  });

  it("normalizes invalid active mode and active tab", () => {
    const managerProd = getBoardContext({ role: "manager", entityType: "PROD" });
    const managerSupport = getBoardContext({ role: "manager", entityType: "SUPPORT" });
    const tlSupport = getBoardContext({ role: "team_leader", entityType: "SUPPORT" });
    expect(resolveActiveMode(managerProd, "invalid-mode")).toBe("requesters");
    expect(resolveActiveMode(managerProd, "solvers")).toBe("solvers");

    expect(resolveActiveTab(managerProd, "requesters", "invalid-tab")).toBe("sourceTeams");
    expect(resolveActiveTab(managerProd, "solvers", "invalid-tab")).toBe("teams");
    expect(resolveActiveTab(managerProd, "requesters", "requesters")).toBe("requesters");
    expect(resolveActiveTab(managerSupport, "requesters", "invalid-tab")).toBe("sourceEntities");
    expect(resolveActiveTab(tlSupport, "requesters", "invalid-tab")).toBe("sourceEntities");
  });

  it("keeps user role mode constraints by entity type", () => {
    const userProd = getBoardContext({ role: "user", entityType: "PROD" });
    const userSupport = getBoardContext({ role: "user", entityType: "SUPPORT" });
    expect(resolveActiveMode(userProd, "solvers")).toBe("requesters");
    expect(resolveActiveMode(userSupport, "requesters")).toBe("requesters");

    const managerSupport = getBoardContext({ role: "manager", entityType: "SUPPORT" });
    const managerTdev = getBoardContext({ role: "manager", entityType: "TDEV" });
    const tlSupport = getBoardContext({ role: "team_leader", entityType: "SUPPORT" });
    const tlTdev = getBoardContext({ role: "team_leader", entityType: "TDEV" });
    const tlProd = getBoardContext({ role: "team_leader", entityType: "PROD" });
    expect(managerSupport.tabsByMode.requesters).toEqual(["sourceEntities", "sourceTeams", "requesters"]);
    expect(managerTdev.tabsByMode.requesters).toEqual(["sourceEntities", "sourceTeams", "requesters"]);
    expect(tlSupport.tabsByMode.requesters).toEqual(["sourceEntities", "sourceTeams", "requesters"]);
    expect(tlTdev.tabsByMode.requesters).toEqual(["sourceEntities", "sourceTeams", "requesters"]);
    expect(tlProd.tabsByMode.requesters).toEqual(["requesters"]);
  });
});
