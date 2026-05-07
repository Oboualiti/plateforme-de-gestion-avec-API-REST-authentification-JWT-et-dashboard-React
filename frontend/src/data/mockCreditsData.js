/**
 * Mock Data for Credits Board Testing
 * 
 * This file generates mock solved request data for testing the Credits Board
 * In production, this data would come from your backend API
 */

let mockUsers, mockEntities, mockCompanies, mockRequests;

try {
  const imported = require("@/data/mock");
  mockUsers = imported.users || [];
  mockEntities = imported.entities || [];
  mockCompanies = imported.companies || [];
  mockRequests = imported.requests || [];
} catch (e) {
  // Fallback mock data if @/data/mock doesn't exist
  mockUsers = [];
  mockEntities = [];
  mockCompanies = [];
  mockRequests = [];
}

/**
 * Mock Solve object structure:
 * {
 *   id: string - unique identifier
 *   requestId: string - reference to request
 *   requestTitle: string - request title
 *   requestReference: string - request number (e.g., WMN-2025-0186)
 *   solverId: string - user who solved it
 *   entityId: string - team/entity who solved it
 *   companyId: string - company
 *   priority: string - LOW, MEDIUM, HIGH, CRITICAL
 *   credits: number - total credits earned
 *   hasEvidence: boolean - has evidence
 *   evidenceList: array - [{ id, type, name, url, createdAt }]
 *   note: string - completion note
 *   status: string - "solved"
 *   completedAt: string - ISO date
 * }
 */

const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 3600_000).toISOString();
const daysAgo = (d) => new Date(now - d * 86400_000).toISOString();

export const mockSolves = [
  {
    id: "solve-1",
    requestId: "r-1",
    requestTitle: "Inventory dashboard daily export script",
    requestReference: "WMN-2025-0184",
    solverId: "u-us-wmnw-a",
    entityId: "e-wmnw",
    companyId: "c-wmn",
    priority: "HIGH",
    credits: 50,
    hasEvidence: true,
    evidenceList: [
      { id: 1, type: "link", name: "PR #482 — daily-export.py", url: "https://github.com/example/pr/482", createdAt: hoursAgo(20) }
    ],
    note: "Wrote the cron-scheduled export, verified output against yesterday's manual run.",
    status: "solved",
    completedAt: hoursAgo(20),
  },
  {
    id: "solve-2",
    requestId: "r-2",
    requestTitle: "Calibration tool malfunction on station B",
    requestReference: "WMN-2025-0185",
    solverId: "u-us-wmn4-a",
    entityId: "e-wmn4",
    companyId: "c-wmn",
    priority: "CRITICAL",
    credits: 65,
    hasEvidence: true,
    evidenceList: [
      { id: 2, type: "file", name: "calibration-report.pdf", url: null, createdAt: hoursAgo(120) }
    ],
    note: "Replaced offset sensor, recalibrated and verified against reference block.",
    status: "solved",
    completedAt: hoursAgo(120),
  },
  {
    id: "solve-3",
    requestId: "r-3",
    requestTitle: "How do I request a new shift schedule?",
    requestReference: "WMN-2025-0186",
    solverId: "u-tl-wmn4",
    entityId: "e-wmn4",
    companyId: "c-wmn",
    priority: "LOW",
    credits: 10,
    hasEvidence: false,
    evidenceList: [],
    note: "Sent the HR portal link and walked through the request form on a quick call.",
    status: "earned",
    completedAt: hoursAgo(6),
  },
  {
    id: "solve-4",
    requestId: "r-4",
    requestTitle: "Barcode scanner firmware update",
    requestReference: "CMH-2025-0043",
    solverId: "u-tl-cmh4",
    entityId: "e-cmh4",
    companyId: "c-cmh",
    priority: "MEDIUM",
    credits: 25,
    hasEvidence: true,
    evidenceList: [
      { id: 3, type: "file", name: "scanner-fleet-update.log", url: null, createdAt: hoursAgo(34) }
    ],
    note: "Rolled out firmware to all 40 scanners in two batches, no regressions.",
    status: "solved",
    completedAt: hoursAgo(34),
  },
  {
    id: "solve-5",
    requestId: "r-5",
    requestTitle: "Quality script for batch validation",
    requestReference: "VMS-2025-0020",
    solverId: "u-us-vms1",
    entityId: "e-vms1",
    companyId: "c-vms",
    priority: "HIGH",
    credits: 40,
    hasEvidence: true,
    evidenceList: [
      { id: 4, type: "link", name: "validation-runs.sheet", url: "https://sheets.example.com/abc123", createdAt: hoursAgo(90) }
    ],
    note: "Validated batches across 3 lines, attached run report.",
    status: "solved",
    completedAt: hoursAgo(90),
  },
  {
    id: "solve-6",
    requestId: "r-6",
    requestTitle: "Logistics route optimizer prototype",
    requestReference: "CMH-2025-0042",
    solverId: "u-tl-cmh4",
    entityId: "e-cmh4",
    companyId: "c-cmh",
    priority: "HIGH",
    credits: 35,
    hasEvidence: false,
    evidenceList: [],
    note: "Shipped v0 with 3 demo routes, ready for review next sprint.",
    status: "solved",
    completedAt: hoursAgo(60),
  },
  {
    id: "solve-7",
    requestId: "r-7",
    requestTitle: "Email notification service integration",
    requestReference: "CMH-2025-0041",
    solverId: "u-us-vms1",
    entityId: "e-vms1",
    companyId: "c-vms",
    priority: "MEDIUM",
    credits: 20,
    hasEvidence: true,
    evidenceList: [
      { id: 5, type: "link", name: "Integration PR #156", url: "https://github.com/example/pr/156", createdAt: daysAgo(1) }
    ],
    note: "Integrated Sendgrid, tested with staging environment.",
    status: "solved",
    completedAt: daysAgo(1),
  },
  {
    id: "solve-8",
    requestId: "r-8",
    requestTitle: "Database migration to PostgreSQL",
    requestReference: "WMN-2025-0183",
    solverId: "u-us-wmnw-a",
    entityId: "e-wmnw",
    companyId: "c-wmn",
    priority: "CRITICAL",
    credits: 50,
    hasEvidence: true,
    evidenceList: [
      { id: 6, type: "link", name: "Migration Report", url: "https://example.com/migration-report", createdAt: daysAgo(2) }
    ],
    note: "Completed migration with zero downtime, all data verified.",
    status: "solved",
    completedAt: daysAgo(2),
  },
];

/**
 * Get mock solves for testing
 * Filters by user role if provided
 */
export function getMockSolves(userRole = null, userId = null) {
  if (!userRole || userRole === "super_admin") {
    return mockSolves;
  }

  if (userRole === "user" && userId) {
    return mockSolves.filter((s) => s.solverId === userId);
  }

  // For other roles, return all for now
  // In a real app, this would check company/entity permissions
  return mockSolves;
}

/**
 * Get statistics for dashboard
 */
export function getMockStats() {
  return {
    totalSolved: mockSolves.length,
    totalCredits: mockSolves.reduce((sum, s) => sum + s.credits, 0),
    uniqueSolvers: new Set(mockSolves.map((s) => s.solverId)).size,
    uniqueTeams: new Set(mockSolves.map((s) => s.entityId)).size,
    withEvidence: mockSolves.filter((s) => s.hasEvidence).length,
  };
}
