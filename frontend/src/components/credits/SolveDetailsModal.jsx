import { X, Download, ExternalLink, FileText, FolderOpen, File, Link2, Trash2 } from "lucide-react";
import { Avatar } from "../Avatar";
import { Button } from "../ui/button";
import { useState, useEffect, useRef } from "react";

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
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Solved for</div>
              <div className="text-sm">{solve.sourceCompanyName || "Unknown"}</div>
              <div className="text-xs text-muted-foreground">{solve.sourceEntityName || "-"}</div>
              <div className="text-xs text-muted-foreground mt-1">Requester: {solve.requesterName || "-"}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Solved: </span>
                  <span>{formatDateTime(solve.completedAt)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Credits: </span>
                  <span className="font-medium">{solve.credits || 0}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Priority: </span>
                  <span>{solve.priority || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Type: </span>
                  <span>{solve.requestType || "-"}</span>
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
                        <a href={ev.url} target="_blank" rel="noreferrer">
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <Download className="h-3 w-3" />
                          </Button>
                        </a>
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

          <div className="border-t border-ink/20 pt-4">
            <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Credits</div>
            <div className="text-xl font-bold mb-3">{solve.credits || 0} total</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base · {solve.requestType || "OTHER"}</span>
                <span className="text-muted-foreground">+{solve.baseCredits || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Within SLA</span>
                <span className="text-muted-foreground">+{solve.slaBonus || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Evidence</span>
                <span className="text-muted-foreground">+{solve.evidenceBonus || 0}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-ink/20 p-4">
          <div className="flex gap-2">
            {openUrl && (
              <a href={openUrl}>
                <Button variant="outline">
                  <FolderOpen className="h-4 w-4 mr-1" />
                  Open Request
                </Button>
              </a>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
