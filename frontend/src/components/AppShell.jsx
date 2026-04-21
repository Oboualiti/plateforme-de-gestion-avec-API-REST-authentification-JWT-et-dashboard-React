import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Bell, LogOut, Menu, Search, Settings, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS, ROLE_RANK } from "../lib/constants";
import { getNavForRole } from "../config/nav";
import { cn } from "../lib/utils";
import { api } from "../lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-md border-2 border-ink bg-primary shadow-brutal">
        <img src="/logo.png" alt="W-service logo" className="h-7 w-7 object-contain" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-extrabold uppercase tracking-tight text-foreground">W-Service</div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Request Management</div>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }) {
  const { user } = useAuth();
  const role = user?.role_keys?.[0] || user?.role || "super_admin";
  const groups = getNavForRole(role);
  const location = useLocation();
  const roleKeys = user?.role_keys || [];
  const primaryRoleKey = roleKeys.length
    ? roleKeys.reduce((best, current) =>
      (ROLE_RANK[current] || 0) > (ROLE_RANK[best] || 0) ? current : best,
    roleKeys[0])
    : (user?.role || "user");
  const roleLabel = ROLE_LABELS[primaryRoleKey] || "User";

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Brand />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="eyebrow px-2 pb-1.5">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const path = item.to.split("?")[0];
                const isActive = location.pathname === path && (item.to.includes("?") ? location.search.includes(item.to.split("?")[1]) : true);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "group brutal-press flex items-center gap-2.5 rounded-md border-2 border-transparent px-2.5 py-2 text-sm font-bold uppercase tracking-tight transition-colors",
                      isActive
                        ? "border-ink bg-primary text-primary-foreground shadow-elev-sm"
                        : "text-sidebar-foreground hover:border-ink hover:bg-primary-soft hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t-2 border-sidebar-border p-3">
        <div className="rounded-md border-2 border-ink bg-surface-2 p-3 shadow-elev-sm">
          <div className="eyebrow">Signed in as</div>
          {user ? (
            <div className="mt-1.5 flex items-center gap-2">
              <Avatar name={user.fullName || user.username || "User"} color={user.avatarColor} size={28} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{user.fullName || user.username}</div>
                <div className="truncate text-xs text-muted-foreground">{roleLabel}</div>
              </div>
            </div>
          ) : (
             <div className="mt-1.5 flex items-center gap-2">
              <Avatar name="Guest User" size={28} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">Guest User</div>
                <div className="truncate text-xs text-muted-foreground">Demo Mode</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border-2 border-ink bg-card p-1 shadow-elev-sm transition-colors hover:bg-primary-soft">
          <Avatar name={user.fullName || user.username} color={user.avatarColor} size={32} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{user.fullName || user.username}</div>
          <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <NavLink to="/profile" className="flex items-center gap-2">
            <Settings className="h-4 w-4" /> Profile & settings
          </NavLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationsBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  async function loadNotifications() {
    try {
      const unreadResp = await api.get("/notifications/", { params: { unread_only: "true" } });
      const unreadItems = Array.isArray(unreadResp.data) ? unreadResp.data : [];
      setItems(unreadItems.slice(0, 6));
      setUnread(unreadItems.length);
    } catch {
      setItems([]);
      setUnread(0);
    }
  }

  useEffect(() => {
    loadNotifications();

    function handleChanged() {
      loadNotifications();
    }

    window.addEventListener("notifications:changed", handleChanged);
    return () => window.removeEventListener("notifications:changed", handleChanged);
  }, []);

  async function openNotification(item) {
    try {
      if (!item.is_read) {
        await api.post(`/notifications/${item.id}/read/`);
        window.dispatchEvent(new Event("notifications:changed"));
      }
    } catch {
    } finally {
      await loadNotifications();
      navigate(item.link || "/notifications");
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && loadNotifications()}>
      <DropdownMenuTrigger asChild>
        <button className="brutal-press relative flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink bg-card text-muted-foreground shadow-elev-sm transition-colors hover:bg-primary-soft hover:text-foreground">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 inline-flex h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unread > 0 && <span className="text-xs font-normal text-muted-foreground">{unread} unread</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</div>
        ) : (
          items.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onSelect={(event) => {
                event.preventDefault();
                void openNotification(n);
              }}
              className="flex flex-col items-start gap-0.5"
            >
                <div className="flex w-full items-center gap-2">
                  {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  <span className="text-sm font-medium">{n.title}</span>
                </div>
                <span className="text-xs text-muted-foreground">{n.message}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <NavLink to="/notifications" className="text-sm font-medium">
            Open notifications page
          </NavLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r-2 border-sidebar-border lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r-2 border-sidebar-border bg-sidebar shadow-elev-lg">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b-2 border-border bg-card px-4 sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="relative hidden flex-1 max-w-md md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search requests, users, entities…" className="h-9 pl-9" />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
