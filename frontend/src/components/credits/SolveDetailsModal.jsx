import { X, Download, ExternalLink, FileText, FolderOpen, File, Link2, Trash2, CheckCircle2, Calendar, Flag, Circle } from "lucide-react";
import { Avatar } from "../Avatar";
import { Button } from "../ui/button";
import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString() + " " + parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString();
}

function getEvidenceCount(solve) {
  if (!solve.evidenceList || solve.evidenceList.length === 0) return 0;
  return solve.evidenceList.length;
}

export default function SolveDetailsModal({
  solve,
  user,
  entity,
  currentRole,
  currentUser,
  onClose,
  onUpdateNote,
  onAddEvidence,
  onRemoveEvidence,
  onApproveResult,
  onRejectResult,
  statusActionBusyId = null,
  onEvidenceUpdated,
  initialFocus,
}) {
  if (!solve) return null;

  const canEdit = (() => {
    if (!currentUser) return false;
    if (!["user", "team_leader", "manager"].includes(currentRole)) return false;
    if (String(currentUser.entity) !== String(solve.entityId)) return false;
    if (currentRole === "manager") return true;
    if (String(currentUser.id) !== String(solve.solverId)) return false;
    return true;
  })();
  const openUrl = solve.requestUrl || (solve.requestId ? `/requests/${solve.requestId}` : null);
  const status = String(solve.requestStatus || solve.status || "").toUpperCase();
  const isClosed = status === "CLOSED" || solve.isEarned === true;
  const canApproveResult = Boolean(solve?.canResultApprove);
  const canRejectResult = Boolean(solve?.canResultReject);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(null);
  
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(solve.completionNote || solve.note || "");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  
  const [evidenceMode, setEvidenceMode] = useState(null); // null | "file" | "link"
  const [newLink, setNewLink] = useState("");
  const [newFile, setNewFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  
  const [removingId, setRemovingId] = useState(null);
  const evidenceSectionRef = useRef(null);

  async function downloadEvidenceFile(ev) {
    if (!ev?.id || !solve?.requestId) return;
    try {
      const response = await api.get(
        `/requests/${solve.requestId}/comments/${ev.id}/download/`,
        { responseType: "blob" },
      );
      const blob = response.data;
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      const disposition = response.headers?.["content-disposition"] || "";
      const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
      const filename = decodeURIComponent((match?.[1] || match?.[2] || "").trim() || (ev.name || "evidence-file"));
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (_err) {
      // Fallback to direct URL if API download fails.
      if (ev.url) window.open(ev.url, "_blank", "noopener,noreferrer");
    }
  }

  useEffect(() => {
    if (initialFocus === "evidence" && canEdit && evidenceSectionRef.current) {
      evidenceSectionRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [initialFocus, canEdit]);

  async function handleSaveNote() {
    if (!onUpdateNote || !solve.requestId) return;
    setIsSavingNote(true);
    setNoteError("");
    try {
      await onUpdateNote(solve.requestId, noteValue);
      setIsEditingNote(false);
      onEvidenceUpdated?.();
    } catch (err) {
      setNoteError(err?.response?.data?.detail || "Failed to save note");
    } finally {
      setIsSavingNote(false);
    }
  }

  function handleCancelEdit() {
    setNoteValue(solve.completionNote || solve.note || "");
    setIsEditingNote(false);
    setNoteError("");
  }

  function handleStartAddFile() {
    setEvidenceMode("file");
  }

  function handleStartAddLink() {
    setEvidenceMode("link");
  }

  function handleCancelAdd() {
    setEvidenceMode(null);
    setNewFile(null);
    setNewLink("");
    setSubmitError("");
  }

  async function handleAddFile() {
    if (!newFile || !onAddEvidence || !solve.requestId) return;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      await onAddEvidence(solve.requestId, { file: newFile });
      setNewFile(null);
      setEvidenceMode(null);
      onEvidenceUpdated?.();
    } catch (err) {
      setSubmitError(err?.response?.data?.detail || "Failed to add file");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddLink() {
    if (!newLink.trim() || !onAddEvidence || !solve.requestId) return;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      await onAddEvidence(solve.requestId, { link: newLink.trim() });
      setNewLink("");
      setEvidenceMode(null);
      onEvidenceUpdated?.();
    } catch (err) {
      setSubmitError(err?.response?.data?.detail || "Failed to add link");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveEvidence(messageId) {
    if (!onRemoveEvidence || !solve.requestId) return;
    setRemovingId(messageId);
    try {
      await onRemoveEvidence(solve.requestId, messageId);
      onEvidenceUpdated?.();
    } catch (err) {
      setSubmitError(err?.response?.data?.detail || "Failed to remove evidence");
    } finally {
      setRemovingId(null);
    }
  }

  async function submitReject() {
    if (!rejectReason) {
      setRejectError("Reason is required.");
      return;
    }
    if (rejectReason === "Other" && !rejectNote.trim()) {
      setRejectError("Add a short note when using Other.");
      return;
    }
    setRejectError("");
    setStatusSubmitting("reject");
    try {
      await onRejectResult?.(solve, {
        rejectionReason: rejectReason,
        rejectionNote: rejectNote.trim(),
      });
      setShowRejectDialog(false);
      setRejectReason("");
      setRejectNote("");
      setStatusError("");
      onClose?.();
    } catch (error) {
      setRejectError(`Could not send request back: ${error?.message || "Please try again."}`);
    } finally {
      setStatusSubmitting(null);
    }
  }

  async function handleApprove() {
    setStatusError("");
    setStatusSubmitting("approve");
    try {
      await onApproveResult?.(solve);
      onClose?.();
    } catch (error) {
      setStatusError(error?.message || "Could not approve request result. Please try again.");
    } finally {
      setStatusSubmitting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-ink bg-background shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between border-b border-ink/20 p-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">{solve.requestTitle || "Untitled request"}</h2>
            <p className="text-sm text-muted-foreground">{solve.requestReference || `Request #${solve.requestId || "-"}`}</p>
          </div>
          <button onClick={onClose} className="ml-4 rounded-md p-1 hover:bg-surface-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Solved by</div>
              <div className="rounded-lg border border-ink/15 bg-surface-1 p-3">
                <div className="flex items-center gap-2">
                  <Avatar user={user} />
                  <div>
                    <div className="text-sm font-medium">{user?.full_name || "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">{solve.solverRole || "Support/Dev"}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium">{entity?.name || solve.solverEntityName || "Unknown"}</span>
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Solved for</div>
              <div className="rounded-lg border border-ink/15 bg-surface-1 p-3">
                <div className="text-sm font-semibold leading-tight">{solve.sourceCompanyName || "Unknown"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{solve.sourceEntityName || "-"}</div>
                <div className="mt-2 text-xs text-muted-foreground">Requester: {solve.requesterName || "-"}</div>

                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-foreground">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Solved: {formatDateTime(solve.completedAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <Flag className="h-3.5 w-3.5 text-amber-400" />
                    <span>Priority: {solve.priority || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <Circle className="h-3.5 w-3.5 text-violet-400" />
                    <span>Type: {solve.requestType || "-"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-muted-foreground uppercase">Completion note</div>
              {canEdit && !isEditingNote && (
                <Button variant="ghost" size="sm" onClick={() => setIsEditingNote(true)} className="text-xs h-6 px-2">
                  Edit note
                </Button>
              )}
            </div>
            {isEditingNote ? (
              <div className="space-y-2">
                <textarea
                  value={noteValue}
                  onChange={(e) => setNoteValue(e.target.value)}
                  placeholder="Add a completion note..."
                  className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                {noteError && <div className="text-xs text-red-500">{noteError}</div>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveNote} disabled={isSavingNote}>
                    {isSavingNote ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-ink/20 bg-surface-1 p-3">
                <p className="text-sm whitespace-pre-wrap">{solve.completionNote || solve.note || "No completion note."}</p>
              </div>
            )}
          </div>

          {solve.wasRejected ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <div className="font-semibold">Sent back by {solve.rejectedByName || "Requester reviewer"}</div>
              <div className="mt-1 text-muted-foreground">Reason: {solve.rejectionReason || "No reason provided"}</div>
              {solve.rejectionNote ? <div className="mt-1 text-muted-foreground">Note: {solve.rejectionNote}</div> : null}
              {solve.rejectedAt ? <div className="mt-1 text-xs text-muted-foreground">Date: {formatDateTime(solve.rejectedAt)}</div> : null}
            </div>
          ) : null}

          <div ref={evidenceSectionRef} id="evidence-section" className="border-t border-ink/20 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-muted-foreground uppercase">
                Evidence {getEvidenceCount(solve) > 0 && `(${getEvidenceCount(solve)})`}
              </div>
            </div>
            
            {solve.evidenceList && solve.evidenceList.length > 0 ? (
              <div className="space-y-2 mb-3">
                {solve.evidenceList.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between rounded-md border border-ink/20 bg-background px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {ev.type === "file" ? <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : <Link2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                      <span className="text-sm truncate" title={ev.name}>{ev.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{ev.createdAt ? formatDate(ev.createdAt) : ""}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {ev.type === "link" ? (
                        <a href={ev.url} target="_blank" rel="noreferrer">
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </a>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => downloadEvidenceFile(ev)}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-red-500 hover:text-red-600"
                          onClick={() => handleRemoveEvidence(ev.id)}
                          disabled={removingId === ev.id}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground mb-3">No evidence attached yet.</div>
            )}

            {canEdit && evidenceMode === null && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleStartAddFile}>
                  <File className="h-3 w-3 mr-1" />
                  Add file
                </Button>
                <Button variant="outline" size="sm" onClick={handleStartAddLink}>
                  <Link2 className="h-3 w-3 mr-1" />
                  Add link
                </Button>
              </div>
            )}

            {canEdit && evidenceMode === "file" && (
              <div className="rounded-md border border-ink/20 bg-muted/10 p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Attach file</div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="file"
                      onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="evidence-file-input"
                    />
                    <Button variant="outline" size="sm" type="button" onClick={() => document.getElementById('evidence-file-input')?.click()} className="cursor-pointer">
                      Choose file
                    </Button>
                  </label>
                  <span className="text-sm text-muted-foreground truncate">
                    {newFile ? newFile.name : "No file chosen"}
                  </span>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={handleCancelAdd}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddFile} disabled={!newFile || isSubmitting}>
                    {isSubmitting ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>
            )}

            {canEdit && evidenceMode === "link" && (
              <div className="rounded-md border border-ink/20 bg-muted/10 p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Add evidence link</div>
                <input
                  type="text"
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  placeholder="https://..."
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={handleCancelAdd}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddLink} disabled={!newLink.trim() || isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save link"}
                  </Button>
                </div>
              </div>
            )}

            {submitError && <div className="text-xs text-red-500 mt-2">{submitError}</div>}
          </div>

        </div>

        <div className="border-t border-ink/20 p-4">
          {statusError ? <div className="mb-3 text-sm text-destructive">{statusError}</div> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {openUrl ? (
                <a href={openUrl}>
                  <Button variant="outline" className="h-9 rounded-md border-ink/20 px-3 shadow-none">
                    <FolderOpen className="mr-1.5 h-4 w-4" />
                    Open Request
                  </Button>
                </a>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canApproveResult && (
                <Button
                  className="h-9 rounded-md bg-success px-3 text-white shadow-none hover:bg-success/90"
                  disabled={statusSubmitting === "approve" || statusSubmitting === "reject" || statusActionBusyId === solve.requestId}
                  onClick={handleApprove}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {statusSubmitting === "approve" ? "Accepting..." : "Accept"}
                </Button>
              )}
              {canRejectResult && (
                <Button
                  variant="outline"
                  className="h-9 rounded-md border-destructive/40 px-3 text-destructive shadow-none hover:bg-destructive/10"
                  disabled={statusSubmitting === "approve" || statusSubmitting === "reject" || statusActionBusyId === solve.requestId}
                  onClick={() => {
                    setStatusError("");
                    setShowRejectDialog(true);
                  }}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Send Back
                </Button>
              )}
              <Button variant="outline" className="h-9 rounded-md border-ink/20 px-3 shadow-none" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
      {showRejectDialog ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-ink bg-background shadow-lg">
            <div className="border-b border-ink/20 p-4">
              <h3 className="text-lg font-semibold">Send request back</h3>
              <p className="mt-1 text-sm text-muted-foreground">Why are you sending this back?</p>
            </div>
            <div className="space-y-3 p-4">
              <label className="text-xs font-medium text-muted-foreground">Reason</label>
              <select
                value={rejectReason}
                onChange={(event) => { setRejectReason(event.target.value); setRejectError(""); }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select reason...</option>
                <option value="Missing evidence">Missing evidence</option>
                <option value="Not resolved">Not resolved</option>
                <option value="Wrong target">Wrong target</option>
                <option value="Incomplete work">Incomplete work</option>
                <option value="Other">Other</option>
              </select>
              <label className="text-xs font-medium text-muted-foreground">Note</label>
              <textarea
                value={rejectNote}
                onChange={(event) => { setRejectNote(event.target.value); setRejectError(""); }}
                placeholder="Add a short note for the support/dev team..."
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              {rejectError ? <div className="text-xs text-destructive">{rejectError}</div> : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-ink/20 p-4">
              <Button
                variant="ghost"
                className="h-9 px-3 shadow-none"
                disabled={statusSubmitting === "reject"}
                onClick={() => setShowRejectDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                className="h-9 border-destructive/40 px-3 text-destructive shadow-none"
                disabled={statusSubmitting === "reject"}
                onClick={submitReject}
              >
                {statusSubmitting === "reject" ? "Sending..." : "Send back"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
