import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { useCurrentUser, ROLE_LABELS } from "@/store/auth";
import { companies, entities } from "@/data/mock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, ShieldCheck, Mail } from "lucide-react";
import { EntityTypeBadge } from "@/components/badges";

export default function Profile() {
  const me = useCurrentUser();
  if (!me) return null;
  const company = companies.find((c) => c.id === me.companyId);
  const entity = entities.find((e) => e.id === me.entityId);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Profile & account" description="Manage your personal information and preferences." />

      <div className="surface-card mb-4 p-6">
        <div className="flex items-center gap-4">
          <Avatar name={me.fullName} color={me.avatarColor} size={64} />
          <div>
            <div className="text-lg font-semibold">{me.fullName}</div>
            <div className="text-sm text-muted-foreground">{me.email}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 font-medium text-accent-foreground">
                <ShieldCheck className="h-3 w-3" /> {ROLE_LABELS[me.role]}
              </span>
              {company && (
                <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-medium">
                  <Building2 className="h-3 w-3" /> {company.code}
                </span>
              )}
              {entity && <EntityTypeBadge type={entity.type} />}
            </div>
          </div>
        </div>
      </div>

      <div className="surface-card p-6">
        <h2 className="text-base font-semibold">Personal information</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Full name</Label><Input defaultValue={me.fullName} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input defaultValue={me.email} type="email" /></div>
          <div className="space-y-1.5"><Label>Company</Label><Input value={company?.name ?? "—"} disabled /></div>
          <div className="space-y-1.5"><Label>Entity</Label><Input value={entity ? `${entity.code} — ${entity.name}` : "—"} disabled /></div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline">Cancel</Button>
          <Button>Save changes</Button>
        </div>
      </div>

      <div className="surface-card mt-4 p-6">
        <h2 className="text-base font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose what you'd like to be notified about.</p>
        <div className="mt-4 space-y-3 text-sm">
          {[
            "When a request is assigned to me",
            "When a request I created changes status",
            "When someone comments on my requests",
            "Weekly summary of my team's activity",
          ].map((label) => (
            <label key={label} className="flex items-center gap-3 rounded-md border border-border p-3">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-border accent-primary" />
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
