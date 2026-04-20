import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentUser } from "@/store/auth";
import { companies, entities } from "@/data/mock";
import { toast } from "sonner";
import { ArrowLeft, SendHorizonal } from "lucide-react";
import type { Priority, RequestType } from "@/types";
import { EntityTypeBadge } from "@/components/badges";

export default function RequestCreate() {
  const navigate = useNavigate();
  const user = useCurrentUser();

  const sourceEntity = entities.find((e) => e.id === user?.entityId);
  const company = companies.find((c) => c.id === user?.companyId);

  const targets = useMemo(
    () => entities.filter((e) => e.companyId === user?.companyId && e.type !== "production" && e.active),
    [user],
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<RequestType>("information");
  const [priority, setPriority] = useState<Priority>("medium");
  const [targetId, setTargetId] = useState<string>(targets[0]?.id ?? "");

  const canCreate = sourceEntity?.type === "production";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !targetId) {
      toast.error("Please fill in all required fields.");
      return;
    }
    toast.success("Request submitted", {
      description: `Routed to ${entities.find((e) => e.id === targetId)?.code}.`,
    });
    navigate("/requests");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <PageHeader
        title="Create a new request"
        description="Requests are routed to a support or development entity within your company."
      />

      {!canCreate && (
        <div className="surface-card mb-4 border-l-4 border-l-warning bg-warning/5 p-4">
          <div className="text-sm font-medium text-foreground">Only production users can create requests</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Your entity is {sourceEntity?.type ?? "not set"}. The form below is shown read-only for demonstration.
          </div>
        </div>
      )}

      <form onSubmit={submit} className="surface-card space-y-5 p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Company</Label>
            <div className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              {company ? `${company.code} — ${company.name}` : "—"}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Source entity</Label>
            <div className="mt-2 flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <span>{sourceEntity ? `${sourceEntity.code} — ${sourceEntity.name}` : "—"}</span>
              {sourceEntity && <EntityTypeBadge type={sourceEntity.type} />}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="target">Target entity *</Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger id="target"><SelectValue placeholder="Choose a target entity" /></SelectTrigger>
            <SelectContent>
              {targets.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">No support/dev entities available in your company.</div>
              ) : (
                targets.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.code} — {e.name} ({e.type})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Only support and development entities within {company?.code} are listed.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="type">Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as RequestType)}>
              <SelectTrigger id="type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="information">Information</SelectItem>
                <SelectItem value="script">Script</SelectItem>
                <SelectItem value="tool">Tool</SelectItem>
                <SelectItem value="app">App / Project</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="priority">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">Title *</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary of what you need" maxLength={120} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder="Describe what you need, why, and any relevant context…"
            maxLength={2000}
          />
          <div className="text-right text-xs text-muted-foreground">{description.length}/2000</div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit">
            Submit request <SendHorizonal className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
