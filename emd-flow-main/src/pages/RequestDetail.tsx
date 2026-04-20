import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar } from "@/components/Avatar";
import { StatusBadge, TypeBadge, PriorityBadge, EntityTypeBadge } from "@/components/badges";
import { companies, entities, requests, users } from "@/data/mock";
import { ArrowLeft, ArrowRight, Building2, Calendar, MessageSquarePlus, User2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useCurrentUser } from "@/store/auth";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RequestStatus } from "@/types";

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = useCurrentUser();
  const request = requests.find((r) => r.id === id);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<RequestStatus>(request?.status ?? "new");

  if (!request) {
    return (
      <div className="surface-card p-12 text-center">
        <h2 className="text-lg font-semibold">Request not found</h2>
        <Button asChild variant="outline" className="mt-4"><Link to="/requests">Back to list</Link></Button>
      </div>
    );
  }

  const company = companies.find((c) => c.id === request.companyId);
  const source = entities.find((e) => e.id === request.sourceEntityId);
  const target = entities.find((e) => e.id === request.targetEntityId);
  const creator = users.find((u) => u.id === request.creatorId);
  const assignee = users.find((u) => u.id === request.assigneeId);

  const postComment = () => {
    if (!comment.trim()) return;
    toast.success("Comment added");
    setComment("");
  };

  const updateStatus = (s: RequestStatus) => {
    setStatus(s);
    toast.success(`Status changed to ${s.replace("_", " ")}`);
  };

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <PageHeader
        title={request.title}
        description={request.reference}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            <Select value={status} onValueChange={(v) => updateStatus(v as RequestStatus)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["new","accepted","in_progress","rejected","completed","closed"] as RequestStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="surface-card p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TypeBadge type={request.type} />
              <PriorityBadge priority={request.priority} />
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">Opened {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}</span>
            </div>
            <h2 className="text-base font-semibold">Description</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{request.description}</p>
          </div>

          <div className="surface-card">
            <Tabs defaultValue="comments">
              <div className="border-b border-border px-2">
                <TabsList className="bg-transparent">
                  <TabsTrigger value="comments">Comments ({request.comments.length})</TabsTrigger>
                  <TabsTrigger value="history">History ({request.history.length})</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="comments" className="m-0 p-6">
                <div className="space-y-5">
                  {request.comments.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">No comments yet — start the discussion below.</p>
                  ) : (
                    request.comments.map((c) => {
                      const author = users.find((u) => u.id === c.authorId);
                      return (
                        <div key={c.id} className="flex gap-3">
                          {author && <Avatar name={author.fullName} color={author.avatarColor} size={36} />}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-medium">{author?.fullName}</span>
                              <span className="text-xs text-muted-foreground">{format(new Date(c.createdAt), "MMM d, HH:mm")}</span>
                            </div>
                            <div className="mt-1 rounded-lg bg-muted/50 px-3 py-2 text-sm leading-relaxed">{c.body}</div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div className="flex gap-3 border-t border-border pt-5">
                    {me && <Avatar name={me.fullName} color={me.avatarColor} size={36} />}
                    <div className="flex-1 space-y-2">
                      <Textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Write a comment…"
                        rows={3}
                      />
                      <div className="flex justify-end">
                        <Button size="sm" onClick={postComment} disabled={!comment.trim()}>
                          <MessageSquarePlus className="mr-1 h-4 w-4" /> Post comment
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="history" className="m-0 p-6">
                <ol className="relative space-y-5 border-l border-border pl-6">
                  {request.history.map((h) => {
                    const actor = users.find((u) => u.id === h.actorId);
                    return (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[27px] mt-1 flex h-3 w-3 items-center justify-center rounded-full bg-background ring-2 ring-primary" />
                        <div className="text-sm">
                          <span className="font-medium">{actor?.fullName}</span>{" "}
                          <span className="text-muted-foreground">
                            {h.type === "created" && "created the request"}
                            {h.type === "status_changed" && (<>changed status from <em className="not-italic font-medium text-foreground">{h.from}</em> to <em className="not-italic font-medium text-foreground">{h.to}</em></>)}
                            {h.type === "assigned" && "took ownership"}
                            {h.type === "comment" && "added a comment"}
                            {h.type === "edited" && "edited the request"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">{format(new Date(h.createdAt), "MMM d, yyyy · HH:mm")}</div>
                      </li>
                    );
                  })}
                </ol>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="surface-card divide-y divide-border">
            <div className="px-5 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Routing</h3>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{company?.code}</span>
                  <span className="text-muted-foreground">— {company?.name}</span>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-surface-2 p-2.5">
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">Source</div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {source?.code} {source && <EntityTypeBadge type={source.type} />}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">Target</div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {target?.code} {target && <EntityTypeBadge type={target.type} />}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-5 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">People</h3>
              <div className="mt-3 space-y-3">
                {creator && (
                  <div className="flex items-center gap-2.5">
                    <Avatar name={creator.fullName} color={creator.avatarColor} size={32} />
                    <div>
                      <div className="text-sm font-medium">{creator.fullName}</div>
                      <div className="text-xs text-muted-foreground">Creator</div>
                    </div>
                  </div>
                )}
                {assignee ? (
                  <div className="flex items-center gap-2.5">
                    <Avatar name={assignee.fullName} color={assignee.avatarColor} size={32} />
                    <div>
                      <div className="text-sm font-medium">{assignee.fullName}</div>
                      <div className="text-xs text-muted-foreground">Assignee</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-md border border-dashed border-border px-2.5 py-2">
                    <User2 className="h-4 w-4 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground">Unassigned</div>
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dates</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Created</span><span className="ml-auto font-medium">{format(new Date(request.createdAt), "MMM d, yyyy")}</span></div>
                <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Updated</span><span className="ml-auto font-medium">{format(new Date(request.updatedAt), "MMM d, yyyy")}</span></div>
                {request.dueDate && (
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Due</span><span className="ml-auto font-medium">{format(new Date(request.dueDate), "MMM d, yyyy")}</span></div>
                )}
              </div>
            </div>
          </div>

          <div className="surface-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick actions</h3>
            <div className="mt-3 space-y-2">
              <Button variant="outline" className="w-full justify-start" size="sm" onClick={() => updateStatus("accepted")}>Accept request</Button>
              <Button variant="outline" className="w-full justify-start" size="sm" onClick={() => updateStatus("in_progress")}>Mark in progress</Button>
              <Button variant="outline" className="w-full justify-start" size="sm" onClick={() => updateStatus("completed")}>Mark completed</Button>
              <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive" size="sm" onClick={() => updateStatus("rejected")}>Reject</Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
