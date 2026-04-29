import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Bell, Building2, FileText, LogOut, Menu, Moon, Search, Settings, Sun, UserRound, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useGlobalSearch } from "../hooks/useGlobalSearch";
import { useNotifications } from "../hooks/useNotifications";
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
import wServiceLogo from "../assets/logo.png";
import wServiceLogoDark from "../assets/logo_dark_mode.png";

function Brand({ isDarkMode }) {
  return (
    <div className="flex flex-col items-start justify-center gap-0">
      <div className="h-9 w-[165px] overflow-visible">
        <img
          src={isDarkMode ? wServiceLogoDark : wServiceLogo}
          alt="W-Service logo"
          className={`h-9 w-auto object-contain ${isDarkMode ? 'origin-left scale-[2.35]' : 'origin-left scale-[2.35]'}`}
          loading="lazy"
          width={1080}
          height={458}
        />
      </div>
      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Requests Mgmt</div>
    </div>
  );
}



function SidebarContent({ onNavigate, isDarkMode }) {
  const { user, logout } = useAuth();
  const role = user?.role_keys?.[0] || user?.role || "super_admin";
  const groups = getNavForRole(role, user).filter((group) => Array.isArray(group.items) && group.items.length > 0);
  const location = useLocation();
  const roleKeys = user?.role_keys || [];
  const primaryRoleKey = roleKeys.length
    ? roleKeys.reduce((best, current) =>
      (ROLE_RANK[current] || 0) > (ROLE_RANK[best] || 0) ? current : best,
    roleKeys[0])
    : (user?.role || "user");
  const roleLabel = ROLE_LABELS[primaryRoleKey] || "User";
  const menuNotifications = useNotifications();

  useEffect(() => {
    void menuNotifications.loadNotifications(false);

    function handleChanged() {
      void menuNotifications.loadNotifications(false);
    }

    window.addEventListener("notifications:changed", handleChanged);
    return () => {
      window.removeEventListener("notifications:changed", handleChanged);
    };
  }, [menuNotifications.loadNotifications]);


  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        <Brand isDarkMode={isDarkMode} />
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
                const isActive = location.pathname === path && (
                  item.to.includes("?") 
                    ? location.search.includes(item.to.split("?")[1]) 
                    : !location.search.includes("scope=")
                );
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
      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={() => {
            logout();
            onNavigate?.();
          }}
          className="mb-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-ink/10 bg-card px-3 text-sm font-bold uppercase tracking-tight text-foreground shadow-none transition-colors hover:bg-primary-soft"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
        <div className="rounded-md border border-ink/10 bg-surface-2 p-3 shadow-none">
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
        <button className="flex items-center gap-2 rounded-md bg-transparent p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Avatar name={user.fullName || user.username} color={user.avatarColor} size={32} className="rounded-sm border-2 border-ink" />
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

function getNotificationTitle(item) {
  const title = String(item?.title || "").trim();
  return title || "Notification";
}

function getNotificationSubtitle(item) {
  const text = String(item?.message || "").trim();
  if (!text) return "Tap to view details.";
  if (text.length > 80) return `${text.slice(0, 77)}...`;
  return text;
}

function withNotificationContext(link) {
  if (!link) return "/notifications";
  if (!link.startsWith("/requests/")) return link;
  const [path, rawQuery = ""] = link.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set("from", "notification");
  return `${path}?${params.toString()}`;
}

function NotificationsBell() {
  const navigate = useNavigate();
  const notifications = useNotifications({ limit: 6 });
  const unread = notifications.unreadCount || 0;

  useEffect(() => {
    void notifications.loadNotifications(true);

    function handleChanged() {
      void notifications.loadNotifications(true);
    }

    function handleFocusRefresh() {
      void notifications.loadNotifications(true);
    }

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void notifications.loadNotifications(true);
      }
    }, 15000);

    window.addEventListener("notifications:changed", handleChanged);
    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleFocusRefresh);

    return () => {
      window.removeEventListener("notifications:changed", handleChanged);
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleFocusRefresh);
      window.clearInterval(pollId);
    };
  }, [notifications.canViewRequestDiscussion, notifications.loadNotifications]);

  async function openNotification(item) {
    try {
      if (!item.is_read) {
        await notifications.markAsRead(item.id);
      }
    } catch {
    } finally {
      await notifications.loadNotifications(true);
      navigate(withNotificationContext(item.link));
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && notifications.loadNotifications(true)}>
      <DropdownMenuTrigger asChild>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-sm border border-primary/35 bg-primary/15 px-1 text-[10px] font-bold leading-4 text-primary shadow-none">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unread > 0 && <span className="text-xs font-normal text-muted-foreground">{unread} unread</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</div>
        ) : (
          notifications.notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onSelect={(event) => {
                event.preventDefault();
                void openNotification(n);
              }}
              className="flex flex-col items-start justify-center gap-0 focus:bg-muted focus:text-foreground"
            >
                <div className="flex w-full items-center gap-2">
                  {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  <span className="text-sm font-medium">{getNotificationTitle(n)}</span>
                </div>
                <span className="text-xs text-muted-foreground">{getNotificationSubtitle(n)}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <NavLink to="/notifications" className="text-sm font-medium focus:bg-muted focus:text-foreground">
            Open notifications page
          </NavLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [open, setOpen] = useState(false);
  const search = useGlobalSearch();
  const { isDarkMode, setThemePreference } = useTheme();

  async function handleThemeToggle() {
    const nextTheme = isDarkMode ? "light" : "dark";
    setThemePreference(nextTheme);
    if (!isAuthenticated || !user) return;
    try {
      await api.patch("/auth/me/", { theme_preference: nextTheme });
    } catch {
      setThemePreference(isDarkMode ? "dark" : "light");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-sidebar-border lg:block">
        <SidebarContent isDarkMode={isDarkMode} />
      </aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-sidebar-border bg-sidebar shadow-lg">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} isDarkMode={isDarkMode} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <form className="relative hidden flex-1 max-w-md md:block" onSubmit={search.handleSubmit}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search.query}
              onChange={(event) => search.setQuery(event.target.value)}
              onFocus={search.handleFocus}
              onBlur={search.handleBlur}
              placeholder="Search requests, users, entities..."
              className="h-9 pl-9"
            />
            {search.isOpen && search.query.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-md border border-ink/10 bg-card p-2 shadow-lg">
                {search.loading ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">Searching...</div>
                ) : search.totalSuggestions === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">No matching requests, users, or entities.</div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {search.suggestions.requests.length > 0 && (
                      <div className="mb-1">
                        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Requests</p>
                        {search.suggestions.requests.map((item) => (
                          <button
                            key={`request-${item.id}`}
                            type="button"
                            onMouseDown={() => search.handleSuggestionClick(item)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary-soft"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium">{item.label}</span>
                            <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {search.suggestions.users.length > 0 && (
                      <div className="mb-1">
                        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Users</p>
                        {search.suggestions.users.map((item) => (
                          <button
                            key={`user-${item.id}`}
                            type="button"
                            onMouseDown={() => search.handleSuggestionClick(item)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary-soft"
                          >
                            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium">{item.label}</span>
                            <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {search.suggestions.entities.length > 0 && (
                      <div>
                        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Entities</p>
                        {search.suggestions.entities.map((item) => (
                          <button
                            key={`entity-${item.id}`}
                            type="button"
                            onMouseDown={() => search.handleSuggestionClick(item)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary-soft"
                          >
                            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium">{item.label}</span>
                            <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </form>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleThemeToggle}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-muted"
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {isDarkMode ? "Light" : "Dark"}
            </button>
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
