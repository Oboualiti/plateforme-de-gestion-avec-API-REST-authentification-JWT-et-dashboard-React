import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Bell, Building2, FileText, LogOut, Menu, Search, Settings, UserRound, X } from "lucide-react";
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
import wServiceLogo from "../assets/logo.png";

function Brand() {
  return (
    <div className="flex flex-col items-start justify-center gap-0">
      <img
        src={wServiceLogo}
        alt="W-Service logo"
        className="h-9 w-auto max-w-[155px] object-contain"
        loading="lazy"
        width={1080}
        height={458}
      />
      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Requests Mgmt</div>
    </div>
  );
}



function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth();
  const role = user?.role_keys?.[0] || user?.role || "super_admin";
  const groups = getNavForRole(role, user);
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
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
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
        <button
          type="button"
          onClick={() => {
            logout();
            onNavigate?.();
          }}
          className="mb-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border-2 border-ink bg-card px-3 text-sm font-bold uppercase tracking-tight text-foreground shadow-elev-sm transition-colors hover:bg-primary-soft"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
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
  const rawTitle = String(item?.title || '').trim();
  const rawMessage = String(item?.message || '').trim();
  const haystack = `${rawTitle} ${rawMessage}`.toLowerCase();

  if (haystack.includes('accepted')) return 'Request accepted';
  if (haystack.includes('comment')) return 'New comment';
  if (haystack.includes('progress updated') || haystack.includes('status')) return 'Status update';
  if (haystack.includes('assigned')) return 'Request assigned';

  const compact = rawTitle.replace(/\s+on\s+REQ-.*/i, '').trim();
  return compact || 'Notification';
}

function getNotificationSubtitle(item) {
  let text = String(item?.message || '').trim();
  text = text.replace(/^\w+:\s*/i, '');
  text = text.replace(/\bNote:\s*.*$/i, '').trim();
  text = text.replace(/^Progress updated:\s*/i, '').trim();
  if (!text) return 'Tap to view details.';
  if (text.length > 80) return `${text.slice(0, 77)}...`;
  return text;
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
          items.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onSelect={(event) => {
                event.preventDefault();
                void openNotification(n);
              }}
              className="flex flex-col items-start justify-center gap-0"
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
          <NavLink to="/notifications" className="text-sm font-medium">
            Open notifications page
          </NavLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState({
    requests: [],
    users: [],
    entities: [],
  });
  const blurTimeoutRef = useRef(null);

  useEffect(() => {
    if (location.pathname !== "/requests") return;
    const params = new URLSearchParams(location.search);
    setGlobalSearch(params.get("search") || "");
  }, [location.pathname, location.search]);

  function handleGlobalSearchSubmit(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    const query = globalSearch.trim();

    if (location.pathname === "/requests") {
      const currentParams = new URLSearchParams(location.search);
      const currentScope = currentParams.get("scope");
      if (currentScope) params.set("scope", currentScope);
    }
    if (query) params.set("search", query);

    navigate(`/requests${params.toString() ? `?${params.toString()}` : ""}`);
    setIsSearchOpen(false);
  }

  useEffect(() => {
    const query = globalSearch.trim();
    if (query.length < 2) {
      setSearchLoading(false);
      setSearchSuggestions({ requests: [], users: [], entities: [] });
      return;
    }

    let active = true;
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await api.get("/admin/global-search/", {
          params: { q: query, limit: 5 },
        });
        if (!active) return;
        setSearchSuggestions({
          requests: Array.isArray(response.data?.requests) ? response.data.requests : [],
          users: Array.isArray(response.data?.users) ? response.data.users : [],
          entities: Array.isArray(response.data?.entities) ? response.data.entities : [],
        });
      } catch {
        if (!active) return;
        setSearchSuggestions({ requests: [], users: [], entities: [] });
      } finally {
        if (active) setSearchLoading(false);
      }
    }, 220);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [globalSearch]);

  function handleSearchFocus() {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setIsSearchOpen(true);
  }

  function handleSearchBlur() {
    blurTimeoutRef.current = setTimeout(() => {
      setIsSearchOpen(false);
    }, 140);
  }

  function handleSuggestionClick(item) {
    setIsSearchOpen(false);
    setGlobalSearch(item.label || "");
    navigate(item.link);
  }

  const totalSuggestions =
    searchSuggestions.requests.length +
    searchSuggestions.users.length +
    searchSuggestions.entities.length;

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
          <form className="relative hidden flex-1 max-w-md md:block" onSubmit={handleGlobalSearchSubmit}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              placeholder="Search requests, users, entities..."
              className="h-9 pl-9"
            />
            {isSearchOpen && globalSearch.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-md border-2 border-ink bg-card p-2 shadow-elev-lg">
                {searchLoading ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">Searching...</div>
                ) : totalSuggestions === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">No matching requests, users, or entities.</div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {searchSuggestions.requests.length > 0 && (
                      <div className="mb-1">
                        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Requests</p>
                        {searchSuggestions.requests.map((item) => (
                          <button
                            key={`request-${item.id}`}
                            type="button"
                            onMouseDown={() => handleSuggestionClick(item)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary-soft"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium">{item.label}</span>
                            <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchSuggestions.users.length > 0 && (
                      <div className="mb-1">
                        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Users</p>
                        {searchSuggestions.users.map((item) => (
                          <button
                            key={`user-${item.id}`}
                            type="button"
                            onMouseDown={() => handleSuggestionClick(item)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary-soft"
                          >
                            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium">{item.label}</span>
                            <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchSuggestions.entities.length > 0 && (
                      <div>
                        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Entities</p>
                        {searchSuggestions.entities.map((item) => (
                          <button
                            key={`entity-${item.id}`}
                            type="button"
                            onMouseDown={() => handleSuggestionClick(item)}
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













