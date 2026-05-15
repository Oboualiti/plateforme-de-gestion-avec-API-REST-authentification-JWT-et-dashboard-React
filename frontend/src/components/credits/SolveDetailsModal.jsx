import { useMemo, useState } from "react";
import {
  X,
  Tag,
  Clock3,
  Calendar,
  Trophy,
  FileText,
  Shield,
  ExternalLink,
  Download,
  Link2,
  File as FileIcon,
  ThumbsUp,
  XCircle,
  FolderOpen,
} from "lucide-react";
import { Avatar } from "../Avatar";
import { Button } from "../ui/button";
import { api } from "../../lib/api";

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString() + " " + parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatRelativeTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const diffMs = date.getTime() - Date.now();
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 60) return `${Math.abs(mins)} minute${Math.abs(mins) === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${Math.abs(hours)} hour${Math.abs(hours) === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
}

function formatStatus(value) {
  const v = String(value || "").toUpperCase();
  if (!v) return "EARNED";
  if (v === "CLOSED") return "CLOSED";
  if (v === "COMPLETED") return "EARNED";
  return v;
}

async function downloadEvidenceFile(solve, ev) {
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
    if (ev.url) window.open(ev.url, "_blank", "noopener,noreferrer");
  }
}

export default function SolveDetailsModal(props) {
  const {
    solve,
    user,
    entity,
    onClose,
    onApproveResult,
    onRejectResult,
    statusActionBusyId = null,
    // Compatibility with requested API style:
    open,
    onOpenChange,
    canManage,
    onApprove,
    onReject,
  } = props;

  if (!solve) return null;
  if (open === false) return null;

  const closeModal = () => {
    if (onClose) onClose();
    else onOpenChange?.(false);
  };

  const [statusError, setStatusError] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(null);

  const status = formatStatus(solve.requestStatus || solve.status);
  const openUrl = solve.requestUrl || (solve.requestId ? `/requests/${solve.requestId}` : null);
  const evidenceList = Array.isArray(solve.evidenceList) ? solve.evidenceList : [];

  const basePoints = Number(solve.baseCredits ?? 0);
  const proofPoints = Number(solve.evidenceBonus ?? 0);
  const approvalPoints = Number(solve.slaBonus ?? 0);
  const pointsTotal = Number(solve.credits ?? (basePoints + proofPoints + approvalPoints));
  const baseValue = `+${basePoints}`;
  const proofValue = `+${proofPoints}`;
  const approvalValue = `+${approvalPoints}`;

  const solverSecondary = `${solve.solverRole || "Support/Dev"}${entity?.name || solve.solverEntityName ? ` · ${entity?.name || solve.solverEntityName}` : ""}`;
  const solvedForName = solve.requesterName || solve.sourceCompanyName || "Unknown";
  const solvedForSub = `${solve.sourceEntityName || "-"}${solve.sourceCompanyName ? ` · ${solve.sourceCompanyName}` : ""}`;

  const canApproveResult = useMemo(() => {
    if (typeof solve?.canResultApprove === "boolean") return solve.canResultApprove;
    if (typeof canManage === "boolean") return canManage;
    return false;
  }, [solve?.canResultApprove, canManage]);

  const canRejectResult = useMemo(() => {
    if (typeof solve?.canResultReject === "boolean") return solve.canResultReject;
    if (typeof canManage === "boolean") return canManage;
    return false;
  }, [solve?.canResultReject, canManage]);

  async function handleApprove() {
    setStatusError("");
    setStatusSubmitting("approve");
    try {
      if (onApprove) await onApprove(solve.id);
      else await onApproveResult?.(solve);
      closeModal();
    } catch (error) {
      setStatusError(error?.message || "Could not approve request result.");
    } finally {
      setStatusSubmitting(null);
    }
  }

  async function handleReject() {
    setStatusError("");
    setStatusSubmitting("reject");
    try {
      if (onReject) await onReject(solve.id);
      else await onRejectResult?.(solve);
      closeModal();
    } catch (error) {
      setStatusError(error?.message || "Could not reject request result.");
    } finally {
      setStatusSubmitting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-[min(650px,calc(100vw-32px))] max-w-none overflow-hidden rounded-md border border-slate-200 bg-white p-0 shadow-xl">
        <div className="max-h-[calc(100vh-120px)] overflow-y-auto">
          <div className="border-b border-slate-100 px-5 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-2xl font-bold leading-tight text-slate-800">{solve.requestTitle || "Untitled request"}</h2>
                <div className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
                  <Tag className="h-3.5 w-3.5" />
                  <span>{solve.requestReference || `Request #${solve.requestId || "-"}`}</span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-sm border border-slate-300 bg-white px-2 py-0.5 font-semibold uppercase text-slate-700">{solve.priority || "-"}</span>
                  <span className="inline-flex items-center gap-1 rounded-sm bg-slate-100 px-2 py-0.5 text-slate-600">
                    <Calendar className="h-3 w-3" /> {formatDateTime(solve.completedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-sm bg-slate-100 px-2 py-0.5 text-slate-600">
                    <Clock3 className="h-3 w-3" /> {formatRelativeTime(solve.completedAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase text-slate-700">{status}</span>
                <button onClick={closeModal} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Solved by</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Avatar user={user} />
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-slate-800">{user?.full_name || "Unknown"}</div>
                    <div className="truncate text-sm text-slate-500">{solverSecondary}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Solved for</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Avatar name={solvedForName} />
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-slate-800">{solvedForName}</div>
                    <div className="truncate text-sm text-slate-500">{solvedForSub}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border border-amber-200 bg-amber-50/40">
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  <Trophy className="h-3.5 w-3.5" /> Points earned
                </div>
                <div className="text-xl font-bold leading-none text-slate-800">+{pointsTotal}</div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-amber-200 border-t border-amber-200 bg-white/55">
                <div className="px-3 py-1.5 text-center">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Base</div>
                  <div className="mt-0.5 text-lg font-semibold text-slate-800">{baseValue}</div>
                </div>
                <div className="px-3 py-1.5 text-center">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Proof</div>
                  <div className="mt-0.5 text-lg font-semibold text-slate-800">{proofValue}</div>
                </div>
                <div className="px-3 py-1.5 text-center">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fast solve</div>
                  <div className="mt-0.5 text-lg font-semibold text-slate-800">{approvalValue}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <FileText className="h-3.5 w-3.5" /> Completion note
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
                {solve.completionNote || solve.note || "No completion note."}
              </div>
            </div>

            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Shield className="h-3.5 w-3.5" /> Evidence
              </div>
              {!evidenceList.length ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
                  No evidence attached.
                </div>
              ) : (
                <div className="space-y-2">
                  {evidenceList.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0 flex items-center gap-2">
                        {ev.type === "file" ? <FileIcon className="h-4 w-4 text-slate-500" /> : <Link2 className="h-4 w-4 text-slate-500" />}
                        <span className="truncate text-sm text-slate-700">{ev.name}</span>
                      </div>
                      {ev.type === "link" ? (
                        <a href={ev.url} target="_blank" rel="noreferrer">
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-600">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-600" onClick={() => downloadEvidenceFile(solve, ev)}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
          <Button variant="ghost" className="h-9 px-2 text-sm text-slate-600 hover:text-slate-800" onClick={closeModal}>
            Close
          </Button>
          <div className="flex items-center gap-2">
            {statusError ? <span className="mr-2 text-xs text-red-600">{statusError}</span> : null}
            {canRejectResult ? (
              <Button
                variant="outline"
                className="h-9 border-red-300 bg-white px-3 text-red-600 hover:bg-red-50"
                disabled={statusSubmitting || statusActionBusyId === solve.requestId}
                onClick={handleReject}
              >
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                Reject
              </Button>
            ) : null}
            {canApproveResult ? (
              <Button
                className="h-9 bg-emerald-600 px-3 text-white hover:bg-emerald-700"
                disabled={statusSubmitting || statusActionBusyId === solve.requestId}
                onClick={handleApprove}
              >
                <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
                Approve
              </Button>
            ) : null}
            {openUrl ? (
              <a href={openUrl}>
                <Button className="h-9 bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary/90">
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  Open Request
                </Button>
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
