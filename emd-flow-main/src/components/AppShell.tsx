import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ROLE_LABELS, useAuth, useCurrentUser } from "@/store/auth";
import { getNavForRole } from "@/config/nav";
import { companies, entities, users as allUsers, notifications } from "@/data/mock";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-elev-sm">
        <span className="text-sm font-bold">E</span>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-foreground">EMD Platform</div>
        <div className="text-[11px] text-muted-foreground">Request Management</div>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  const groups = user ? getNavForRole(user.role) : [];
  const location = useLocation();

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Brand />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                      "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
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
      <div className="border-t border-sidebar-border p-3">
        <div className="rounded-lg bg-surface-2 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Signed in as</div>
          {user && (
            <div className="mt-1.5 flex items-center gap-2">
              <Avatar name={user.fullName} color={user.avatarColor} size={28} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{user.fullName}</div>
                <div className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleSwitcher() {
  const switchRole = useAuth((s) => s.switchRole);
  const current = useCurrentUser();
  const grouped = ["super_admin", "senior", "manager", "team_leader", "user"] as const;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">Demo:</span>
          <span className="text-sm font-medium">{current ? ROLE_LABELS[current.role] : "Switch"}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>View as another role</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {grouped.map((role) => {
          const u = allUsers.find((x) => x.role === role);
          if (!u) return null;
          const company = companies.find((c) => c.id === u.companyId);
          const entity = entities.find((e) => e.id === u.entityId);
          return (
            <DropdownMenuItem key={role} onClick={() => switchRole(u.id)} className="flex items-start gap-2">
              <Avatar name={u.fullName} color={u.avatarColor} size={28} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{u.fullName}</div>
                <div className="text-xs text-muted-foreground">
                  {ROLE_LABELS[role]}
                  {company && ` · ${company.code}`}
                  {entity && ` · ${entity.code}`}
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const user = useCurrentUser();
  const logout = useAuth((s) => s.logout);
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-muted">
          <Avatar name={user.fullName} color={user.avatarColor} size={32} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{user.fullName}</div>
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
  const user = useCurrentUser();
  const items = notifications.filter((n) => n.userId === user?.id);
  const unread = items.filter((n) => !n.read).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
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
          items.slice(0, 6).map((n) => (
            <DropdownMenuItem key={n.id} asChild>
              <NavLink to={n.link ?? "#"} className="flex flex-col items-start gap-0.5">
                <div className="flex w-full items-center gap-2">
                  {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  <span className="text-sm font-medium">{n.title}</span>
                </div>
                <span className="text-xs text-muted-foreground">{n.body}</span>
              </NavLink>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-sidebar-border lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-sidebar-border bg-sidebar shadow-elev-lg">
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
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur sm:px-6">
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
          <div className="flex flex-1 items-center justify-end gap-1.5 md:flex-none">
            <RoleSwitcher />
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
