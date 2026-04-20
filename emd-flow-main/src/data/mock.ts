import type {
  AuditLog,
  Company,
  DelegationRule,
  Entity,
  Notification,
  RequestItem,
  User,
} from "@/types";

export const companies: Company[] = [
  { id: "c-wmn", code: "WMN", name: "WMN Industries", description: "Manufacturing & operations", active: true, createdAt: "2022-01-12" },
  { id: "c-cmh", code: "CMH", name: "CMH Group", description: "Logistics and supply chain", active: true, createdAt: "2022-03-08" },
  { id: "c-vms", code: "VMS", name: "VMS Solutions", description: "Specialty products division", active: true, createdAt: "2022-05-21" },
];

export const entities: Entity[] = [
  // WMN
  { id: "e-wmn1", code: "WMN1", name: "WMN Production Line 1", companyId: "c-wmn", type: "production", active: true, membersCount: 24 },
  { id: "e-wmn2", code: "WMN2", name: "WMN Production Line 2", companyId: "c-wmn", type: "production", active: true, membersCount: 19 },
  { id: "e-wmn4", code: "WMN4", name: "WMN Support Desk", companyId: "c-wmn", type: "support", active: true, membersCount: 12 },
  { id: "e-wmnw", code: "WMNW", name: "WMN Development Lab", companyId: "c-wmn", type: "development", active: true, membersCount: 8 },
  // CMH
  { id: "e-cmh1", code: "CMH1", name: "CMH Production Hub", companyId: "c-cmh", type: "production", active: true, membersCount: 21 },
  { id: "e-cmh4", code: "CMH4", name: "CMH Support Center", companyId: "c-cmh", type: "support", active: true, membersCount: 10 },
  { id: "e-cmhw", code: "CMHW", name: "CMH Dev Workshop", companyId: "c-cmh", type: "development", active: true, membersCount: 6 },
  // VMS
  { id: "e-vms1", code: "VMS1", name: "VMS Production Floor", companyId: "c-vms", type: "production", active: true, membersCount: 18 },
  { id: "e-vms4", code: "VMS4", name: "VMS Support Team", companyId: "c-vms", type: "support", active: true, membersCount: 9 },
  { id: "e-vmsw", code: "VMSW", name: "VMS R&D", companyId: "c-vms", type: "development", active: false, membersCount: 5 },
];

const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6"];
const c = (i: number) => colors[i % colors.length];

export const users: User[] = [
  // Super admin
  { id: "u-sa", fullName: "Alex Morgan", email: "alex.morgan@emd.com", avatarColor: c(0), role: "super_admin", companyId: null, entityId: null, managerId: null, active: true, lastActive: "2025-04-19T10:21:00Z" },
  // WMN
  { id: "u-sn-wmn", fullName: "Diane Kessler", email: "diane.kessler@emd.com", avatarColor: c(1), role: "senior", companyId: "c-wmn", entityId: null, managerId: "u-sa", active: true, lastActive: "2025-04-19T09:05:00Z" },
  { id: "u-mg-wmn1", fullName: "Marcus Hale", email: "marcus.hale@emd.com", avatarColor: c(2), role: "manager", companyId: "c-wmn", entityId: "e-wmn1", managerId: "u-sn-wmn", active: true, lastActive: "2025-04-19T08:14:00Z" },
  { id: "u-mg-wmn4", fullName: "Sara Ibarra", email: "sara.ibarra@emd.com", avatarColor: c(3), role: "manager", companyId: "c-wmn", entityId: "e-wmn4", managerId: "u-sn-wmn", active: true, lastActive: "2025-04-19T07:48:00Z" },
  { id: "u-tl-wmn1", fullName: "Jonas Reiter", email: "jonas.reiter@emd.com", avatarColor: c(4), role: "team_leader", companyId: "c-wmn", entityId: "e-wmn1", managerId: "u-mg-wmn1", active: true, lastActive: "2025-04-18T17:30:00Z" },
  { id: "u-tl-wmn4", fullName: "Priya Natarajan", email: "priya.natarajan@emd.com", avatarColor: c(5), role: "team_leader", companyId: "c-wmn", entityId: "e-wmn4", managerId: "u-mg-wmn4", active: true, lastActive: "2025-04-19T06:11:00Z" },
  { id: "u-us-wmn1-a", fullName: "Liam Becker", email: "liam.becker@emd.com", avatarColor: c(6), role: "user", companyId: "c-wmn", entityId: "e-wmn1", managerId: "u-tl-wmn1", active: true, lastActive: "2025-04-19T05:22:00Z" },
  { id: "u-us-wmn1-b", fullName: "Noor Hassan", email: "noor.hassan@emd.com", avatarColor: c(7), role: "user", companyId: "c-wmn", entityId: "e-wmn1", managerId: "u-tl-wmn1", active: true, lastActive: "2025-04-18T16:00:00Z" },
  { id: "u-us-wmn4-a", fullName: "Tom Larsson", email: "tom.larsson@emd.com", avatarColor: c(0), role: "user", companyId: "c-wmn", entityId: "e-wmn4", managerId: "u-tl-wmn4", active: true, lastActive: "2025-04-19T09:30:00Z" },
  { id: "u-us-wmnw-a", fullName: "Eva Chen", email: "eva.chen@emd.com", avatarColor: c(1), role: "user", companyId: "c-wmn", entityId: "e-wmnw", managerId: "u-mg-wmn1", active: true, lastActive: "2025-04-19T08:00:00Z" },
  // CMH
  { id: "u-sn-cmh", fullName: "Roberto Silva", email: "roberto.silva@emd.com", avatarColor: c(2), role: "senior", companyId: "c-cmh", entityId: null, managerId: "u-sa", active: true, lastActive: "2025-04-19T07:00:00Z" },
  { id: "u-mg-cmh1", fullName: "Hannah Wexler", email: "hannah.wexler@emd.com", avatarColor: c(3), role: "manager", companyId: "c-cmh", entityId: "e-cmh1", managerId: "u-sn-cmh", active: true, lastActive: "2025-04-19T06:45:00Z" },
  { id: "u-tl-cmh4", fullName: "Idris Okafor", email: "idris.okafor@emd.com", avatarColor: c(4), role: "team_leader", companyId: "c-cmh", entityId: "e-cmh4", managerId: "u-mg-cmh1", active: true, lastActive: "2025-04-19T05:00:00Z" },
  { id: "u-us-cmh1", fullName: "Mei Tanaka", email: "mei.tanaka@emd.com", avatarColor: c(5), role: "user", companyId: "c-cmh", entityId: "e-cmh1", managerId: "u-tl-cmh4", active: true, lastActive: "2025-04-19T04:30:00Z" },
  // VMS
  { id: "u-sn-vms", fullName: "Pavel Novak", email: "pavel.novak@emd.com", avatarColor: c(6), role: "senior", companyId: "c-vms", entityId: null, managerId: "u-sa", active: true, lastActive: "2025-04-18T18:40:00Z" },
  { id: "u-mg-vms1", fullName: "Aisha Rahman", email: "aisha.rahman@emd.com", avatarColor: c(7), role: "manager", companyId: "c-vms", entityId: "e-vms1", managerId: "u-sn-vms", active: true, lastActive: "2025-04-19T03:12:00Z" },
  { id: "u-us-vms1", fullName: "Greg Whitman", email: "greg.whitman@emd.com", avatarColor: c(0), role: "user", companyId: "c-vms", entityId: "e-vms1", managerId: "u-mg-vms1", active: false, lastActive: "2025-04-10T14:00:00Z" },
];

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

export const requests: RequestItem[] = [
  {
    id: "r-1",
    reference: "WMN-2025-0184",
    title: "Inventory dashboard daily export script",
    description: "We need a scheduled script that exports the daily inventory snapshot from line 1 into the shared CSV folder. Currently we run it manually every morning.",
    type: "script",
    status: "in_progress",
    priority: "high",
    companyId: "c-wmn",
    sourceEntityId: "e-wmn1",
    targetEntityId: "e-wmnw",
    creatorId: "u-us-wmn1-a",
    assigneeId: "u-us-wmnw-a",
    createdAt: daysAgo(4),
    updatedAt: daysAgo(1),
    dueDate: daysAgo(-3),
    comments: [
      { id: "cm1", authorId: "u-us-wmnw-a", body: "Picked this up — drafting against the staging dataset.", createdAt: daysAgo(3) },
      { id: "cm2", authorId: "u-us-wmn1-a", body: "Thanks, let me know if you need access to the file share.", createdAt: daysAgo(2) },
    ],
    history: [
      { id: "h1", actorId: "u-us-wmn1-a", type: "created", createdAt: daysAgo(4) },
      { id: "h2", actorId: "u-us-wmnw-a", type: "status_changed", from: "new", to: "accepted", createdAt: daysAgo(3) },
      { id: "h3", actorId: "u-us-wmnw-a", type: "assigned", to: "u-us-wmnw-a", createdAt: daysAgo(3) },
      { id: "h4", actorId: "u-us-wmnw-a", type: "status_changed", from: "accepted", to: "in_progress", createdAt: daysAgo(1) },
    ],
  },
  {
    id: "r-2",
    reference: "WMN-2025-0185",
    title: "Calibration tool malfunction on station B",
    description: "Calibration tool keeps reporting offset > 0.4mm on station B. Need support team to investigate.",
    type: "tool",
    status: "accepted",
    priority: "urgent",
    companyId: "c-wmn",
    sourceEntityId: "e-wmn2",
    targetEntityId: "e-wmn4",
    creatorId: "u-us-wmn1-b",
    assigneeId: "u-us-wmn4-a",
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
    comments: [
      { id: "cm3", authorId: "u-us-wmn4-a", body: "On-site visit scheduled for tomorrow 09:00.", createdAt: daysAgo(1) },
    ],
    history: [
      { id: "h5", actorId: "u-us-wmn1-b", type: "created", createdAt: daysAgo(2) },
      { id: "h6", actorId: "u-us-wmn4-a", type: "status_changed", from: "new", to: "accepted", createdAt: daysAgo(1) },
    ],
  },
  {
    id: "r-3",
    reference: "WMN-2025-0186",
    title: "How do I request a new shift schedule?",
    description: "Looking for documentation on the shift change request workflow.",
    type: "information",
    status: "completed",
    priority: "low",
    companyId: "c-wmn",
    sourceEntityId: "e-wmn1",
    targetEntityId: "e-wmn4",
    creatorId: "u-us-wmn1-a",
    assigneeId: "u-tl-wmn4",
    createdAt: daysAgo(7),
    updatedAt: daysAgo(5),
    comments: [
      { id: "cm4", authorId: "u-tl-wmn4", body: "See the HR portal under Operations → Schedules.", createdAt: daysAgo(6) },
    ],
    history: [
      { id: "h7", actorId: "u-us-wmn1-a", type: "created", createdAt: daysAgo(7) },
      { id: "h8", actorId: "u-tl-wmn4", type: "status_changed", from: "new", to: "completed", createdAt: daysAgo(5) },
    ],
  },
  {
    id: "r-4",
    reference: "WMN-2025-0187",
    title: "Internal QA tracking app",
    description: "Build a small internal app for QA leads to track defect tickets per shift, with weekly summary export.",
    type: "app",
    status: "new",
    priority: "medium",
    companyId: "c-wmn",
    sourceEntityId: "e-wmn1",
    targetEntityId: "e-wmnw",
    creatorId: "u-tl-wmn1",
    assigneeId: null,
    createdAt: daysAgo(0.5),
    updatedAt: daysAgo(0.5),
    comments: [],
    history: [{ id: "h9", actorId: "u-tl-wmn1", type: "created", createdAt: daysAgo(0.5) }],
  },
  {
    id: "r-5",
    reference: "CMH-2025-0042",
    title: "Logistics route optimizer prototype",
    description: "Prototype a route optimizer for the warehouse delivery fleet.",
    type: "app",
    status: "in_progress",
    priority: "high",
    companyId: "c-cmh",
    sourceEntityId: "e-cmh1",
    targetEntityId: "e-cmhw",
    creatorId: "u-us-cmh1",
    assigneeId: "u-tl-cmh4",
    createdAt: daysAgo(10),
    updatedAt: daysAgo(2),
    comments: [],
    history: [
      { id: "h10", actorId: "u-us-cmh1", type: "created", createdAt: daysAgo(10) },
      { id: "h11", actorId: "u-tl-cmh4", type: "status_changed", from: "new", to: "in_progress", createdAt: daysAgo(8) },
    ],
  },
  {
    id: "r-6",
    reference: "CMH-2025-0043",
    title: "Barcode scanner firmware update",
    description: "Update firmware across the fleet of 40 scanners to fix battery drain bug.",
    type: "tool",
    status: "closed",
    priority: "medium",
    companyId: "c-cmh",
    sourceEntityId: "e-cmh1",
    targetEntityId: "e-cmh4",
    creatorId: "u-mg-cmh1",
    assigneeId: "u-tl-cmh4",
    createdAt: daysAgo(20),
    updatedAt: daysAgo(14),
    comments: [],
    history: [{ id: "h12", actorId: "u-mg-cmh1", type: "created", createdAt: daysAgo(20) }],
  },
  {
    id: "r-7",
    reference: "VMS-2025-0019",
    title: "Specialty product line spec clarification",
    description: "Need clarification on tolerance ranges for the new V-series.",
    type: "information",
    status: "rejected",
    priority: "low",
    companyId: "c-vms",
    sourceEntityId: "e-vms1",
    targetEntityId: "e-vms4",
    creatorId: "u-us-vms1",
    assigneeId: null,
    createdAt: daysAgo(15),
    updatedAt: daysAgo(13),
    comments: [{ id: "cm5", authorId: "u-mg-vms1", body: "Please reroute via Engineering instead.", createdAt: daysAgo(13) }],
    history: [
      { id: "h13", actorId: "u-us-vms1", type: "created", createdAt: daysAgo(15) },
      { id: "h14", actorId: "u-mg-vms1", type: "status_changed", from: "new", to: "rejected", createdAt: daysAgo(13) },
    ],
  },
  {
    id: "r-8",
    reference: "VMS-2025-0020",
    title: "Quality script for batch validation",
    description: "Automated script that validates daily batch output against tolerance specs.",
    type: "script",
    status: "new",
    priority: "high",
    companyId: "c-vms",
    sourceEntityId: "e-vms1",
    targetEntityId: "e-vms4",
    creatorId: "u-us-vms1",
    assigneeId: null,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    comments: [],
    history: [{ id: "h15", actorId: "u-us-vms1", type: "created", createdAt: daysAgo(1) }],
  },
];

export const auditLogs: AuditLog[] = [
  { id: "a1", actorId: "u-sa", action: "user.created", resource: "user", resourceId: "u-us-cmh1", createdAt: daysAgo(2), ip: "10.0.4.21" },
  { id: "a2", actorId: "u-sn-wmn", action: "entity.activated", resource: "entity", resourceId: "e-wmn4", createdAt: daysAgo(5), ip: "10.0.1.5" },
  { id: "a3", actorId: "u-us-wmn1-a", action: "request.created", resource: "request", resourceId: "r-1", createdAt: daysAgo(4), ip: "10.2.3.4" },
  { id: "a4", actorId: "u-us-wmnw-a", action: "request.status_changed", resource: "request", resourceId: "r-1", createdAt: daysAgo(1), ip: "10.2.3.9" },
  { id: "a5", actorId: "u-sa", action: "role.permission_updated", resource: "role", resourceId: "manager", createdAt: daysAgo(7), ip: "10.0.0.1" },
];

export const notifications: Notification[] = [
  { id: "n1", userId: "u-us-wmn1-a", title: "Request accepted", body: "WMN-2025-0184 was accepted by Eva Chen", read: false, createdAt: daysAgo(3), link: "/requests/r-1" },
  { id: "n2", userId: "u-us-wmn1-a", title: "New comment", body: "Eva Chen commented on WMN-2025-0184", read: false, createdAt: daysAgo(2), link: "/requests/r-1" },
  { id: "n3", userId: "u-us-wmn1-a", title: "Status update", body: "WMN-2025-0184 moved to In Progress", read: true, createdAt: daysAgo(1), link: "/requests/r-1" },
];

export const delegationRules: DelegationRule[] = [
  { id: "d1", fromUserId: "u-mg-wmn1", toUserId: "u-tl-wmn1", scope: "Approve requests for WMN1", startsAt: daysAgo(10), endsAt: daysAgo(-20), active: true },
  { id: "d2", fromUserId: "u-sn-cmh", toUserId: "u-mg-cmh1", scope: "Oversee CMH operations", startsAt: daysAgo(30), endsAt: daysAgo(-60), active: true },
];
