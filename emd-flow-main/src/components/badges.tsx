import { cn } from "@/lib/utils";
import type { RequestStatus, RequestType, EntityType, Priority } from "@/types";

const statusStyles: Record<RequestStatus, string> = {
  new: "bg-status-new/10 text-status-new ring-status-new/20",
  accepted: "bg-status-accepted/10 text-status-accepted ring-status-accepted/20",
  in_progress: "bg-status-progress/10 text-status-progress ring-status-progress/30",
  rejected: "bg-status-rejected/10 text-status-rejected ring-status-rejected/20",
  completed: "bg-status-completed/10 text-status-completed ring-status-completed/20",
  closed: "bg-status-closed/10 text-status-closed ring-status-closed/20",
};

const statusLabels: Record<RequestStatus, string> = {
  new: "New",
  accepted: "Accepted",
  in_progress: "In Progress",
  rejected: "Rejected",
  completed: "Completed",
  closed: "Closed",
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        statusStyles[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabels[status]}
    </span>
  );
}

const typeLabels: Record<RequestType, string> = {
  information: "Information",
  script: "Script",
  tool: "Tool",
  app: "App / Project",
};

export function TypeBadge({ type }: { type: RequestType }) {
  return (
    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      {typeLabels[type]}
    </span>
  );
}

const priorityStyles: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/10 text-info",
  high: "bg-warning/10 text-warning",
  urgent: "bg-destructive/10 text-destructive",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize", priorityStyles[priority])}>
      {priority}
    </span>
  );
}

const entityTypeStyles: Record<EntityType, string> = {
  production: "bg-primary-soft text-accent-foreground",
  support: "bg-info/10 text-info",
  development: "bg-success/10 text-success",
};

const entityTypeLabels: Record<EntityType, string> = {
  production: "Production",
  support: "Support",
  development: "Development",
};

export function EntityTypeBadge({ type }: { type: EntityType }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", entityTypeStyles[type])}>
      {entityTypeLabels[type]}
    </span>
  );
}

export { statusLabels, typeLabels, entityTypeLabels };
