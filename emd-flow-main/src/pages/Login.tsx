import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/store/auth";
import { users } from "@/data/mock";
import { ROLE_LABELS } from "@/store/auth";
import { Avatar } from "@/components/Avatar";
import { ArrowRight, Building2, Network, ShieldCheck } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const switchRole = useAuth((s) => s.switchRole);
  const [email, setEmail] = useState("alex.morgan@emd.com");
  const [password, setPassword] = useState("demo");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(email);
    navigate("/");
  };

  const demoUsers = ["super_admin", "senior", "manager", "team_leader", "user"]
    .map((r) => users.find((u) => u.role === (r as never)))
    .filter(Boolean) as typeof users;

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 lg:grid-cols-2">
        {/* Left — brand panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-primary p-12 text-primary-foreground lg:flex">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <span className="text-lg font-bold">E</span>
            </div>
            <div>
              <div className="text-base font-semibold">EMD Platform</div>
              <div className="text-xs opacity-80">Request Management</div>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-3xl font-semibold leading-tight">
              Route, track, and resolve internal requests across WMN, CMH, and VMS.
            </h2>
            <div className="space-y-3 text-sm opacity-90">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Strict separation between business units</span>
              </div>
              <div className="flex items-start gap-3">
                <Network className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Role hierarchy from User to Super Admin</span>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Granular permissions and audit trails</span>
              </div>
            </div>
          </div>

          <div className="text-xs opacity-70">© {new Date().getFullYear()} EMD. All rights reserved.</div>
        </div>

        {/* Right — login */}
        <div className="flex items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                  <span className="text-lg font-bold">E</span>
                </div>
                <div>
                  <div className="text-base font-semibold">EMD Platform</div>
                  <div className="text-xs text-muted-foreground">Request Management</div>
                </div>
              </div>
            </div>

            <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to your workspace.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@emd.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <a href="#" className="text-xs font-medium text-primary hover:underline">
                    Forgot password?
                  </a>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Sign in <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </form>

            <div className="mt-8">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Demo accounts</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2">
                {demoUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      switchRole(u.id);
                      navigate("/");
                    }}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-all hover:border-primary/40 hover:shadow-elev-sm"
                  >
                    <Avatar name={u.fullName} color={u.avatarColor} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{u.fullName}</div>
                      <div className="truncate text-xs text-muted-foreground">{ROLE_LABELS[u.role]}</div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
