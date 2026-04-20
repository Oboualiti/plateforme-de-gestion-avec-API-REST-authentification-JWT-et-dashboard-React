export const companies = [
  { id: "c-wmn", code: "WMN", name: "WMN Industries", description: "Manufacturing & operations", active: true, createdAt: "2022-01-12" },
  { id: "c-cmh", code: "CMH", name: "CMH Group", description: "Logistics and supply chain", active: true, createdAt: "2022-03-08" },
  { id: "c-vms", code: "VMS", name: "VMS Solutions", description: "Specialty products division", active: true, createdAt: "2022-05-21" },
];

export const entities = [
  { id: "e-wmn1", code: "WMN1", name: "WMN Production Line 1", companyId: "c-wmn", type: "production", active: true, membersCount: 24 },
  { id: "e-wmn4", code: "WMN4", name: "WMN Support Desk", companyId: "c-wmn", type: "support", active: true, membersCount: 12 },
  { id: "e-cmh1", code: "CMH1", name: "CMH Production Hub", companyId: "c-cmh", type: "production", active: true, membersCount: 21 },
];

const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6"];
const c = (i) => colors[i % colors.length];

export const users = [
  { id: "u-sa", fullName: "Alex Morgan", email: "alex.morgan@emd.com", avatarColor: c(0), role: "super_admin", companyId: null, entityId: null, managerId: null, active: true },
  { id: "u-sn-wmn", fullName: "Diane Kessler", email: "diane.kessler@emd.com", avatarColor: c(1), role: "senior", companyId: "c-wmn", entityId: null, managerId: "u-sa", active: true },
];

export const notifications = [
  { id: "n1", userId: "u-us-wmn1-a", title: "Request accepted", body: "WMN-2025-0184 was accepted by Eva Chen", read: false, createdAt: new Date().toISOString(), link: "/requests/r-1" },
];
