export type Role =
  | "super_admin"
  | "senior"
  | "manager"
  | "team_leader"
  | "user";

export type CompanyCode = "WMN" | "CMH" | "VMS";

export type EntityType = "production" | "support" | "development";

export type RequestType = "information" | "script" | "tool" | "app";

export type RequestStatus =
  | "new"
  | "accepted"
  | "in_progress"
  | "rejected"
  | "completed"
  | "closed";

export type Priority = "low" | "medium" | "high" | "urgent";

export interface Company {
  id: string;
  code: CompanyCode;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
}

export interface Entity {
  id: string;
  code: string;
  name: string;
  companyId: string;
  type: EntityType;
  active: boolean;
  membersCount: number;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  avatarColor: string;
  role: Role;
  companyId: string | null;
  entityId: string | null;
  managerId: string | null;
  active: boolean;
  lastActive: string;
}

export interface Comment {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface HistoryEvent {
  id: string;
  actorId: string;
  type: "created" | "status_changed" | "assigned" | "comment" | "edited";
  from?: string;
  to?: string;
  note?: string;
  createdAt: string;
}

export interface RequestItem {
  id: string;
  reference: string;
  title: string;
  description: string;
  type: RequestType;
  status: RequestStatus;
  priority: Priority;
  companyId: string;
  sourceEntityId: string;
  targetEntityId: string;
  creatorId: string;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  comments: Comment[];
  history: HistoryEvent[];
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  resource: string;
  resourceId: string;
  createdAt: string;
  ip?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface DelegationRule {
  id: string;
  fromUserId: string;
  toUserId: string;
  scope: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
}
