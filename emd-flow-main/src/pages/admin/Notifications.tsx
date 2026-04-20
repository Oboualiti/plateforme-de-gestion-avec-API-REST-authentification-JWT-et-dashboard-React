import { PageHeader } from "@/components/PageHeader";
import { notifications, users } from "@/data/mock";
import { Bell } from "lucide-react";
import { format } from "date-fns";

export default function AdminNotifications() {
  return (
    <div>
      <PageHeader title="Notifications" description="System-wide notifications across all users." />

      <div className="surface-card divide-y divide-border">
        {notifications.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          notifications.map((n) => {
            const target = users.find((u) => u.id === n.userId);
            return (
              <div key={n.id} className="flex items-start gap-3 px-5 py-4">
                <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${n.read ? "bg-muted text-muted-foreground" : "bg-primary-soft text-accent-foreground"}`}>
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    {!n.read && <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">New</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">{n.body}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    To {target?.fullName} · {format(new Date(n.createdAt), "MMM d, HH:mm")}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
