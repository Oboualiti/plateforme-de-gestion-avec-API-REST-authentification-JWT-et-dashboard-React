import { cn } from "../../lib/utils";

/**
 * CreditsCell - Displays credits value with label
 * Example: 70
 *          credits
 */
export function CreditsCell({ value }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="text-base font-extrabold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">credits</div>
    </div>
  );
}

/**
 * CountCell - Displays a centered count with optional styling
 * Example: 5 (plain) or 3 (with amber tone if > 0)
 */
export function CountCell({ value, tone = "neutral" }) {
  const toneClasses = {
    neutral: "text-foreground",
    amber: value > 0 ? "text-amber-700 font-semibold" : "text-muted-foreground",
    blue: value > 0 ? "text-blue-700 font-semibold" : "text-muted-foreground",
    green: value > 0 ? "text-green-700 font-semibold" : "text-muted-foreground",
  };

  return (
    <div className={cn("text-center font-medium tabular-nums", toneClasses[tone])}>
      {value}
    </div>
  );
}

/**
 * PendingApprovalCell - Displays pending approval count with amber styling if > 0
 */
export function PendingApprovalCell({ value }) {
  if (value === 0) {
    return (
      <div className="text-center">
        <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 py-1 text-sm font-semibold text-muted-foreground">
          -
        </span>
      </div>
    );
  }
  return (
    <div className="text-center">
      <span className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-700">
        {value}
      </span>
    </div>
  );
}

/**
 * EvidenceCell - Displays evidence count with optional styling
 */
export function EvidenceCell({ value }) {
  if (value === 0) {
    return (
      <div className="text-center">
        <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 py-1 text-sm font-semibold text-muted-foreground">
          -
        </span>
      </div>
    );
  }
  return (
    <div className="text-center">
      <span className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-sm font-semibold text-blue-700">
        {value}
      </span>
    </div>
  );
}

/**
 * DurationCell - Displays duration in a compact pill/chip style
 * Example: "1h 36m" or "44h 54m"
 */
export function DurationCell({ value }) {
  if (value === "-") {
    return (
      <div className="text-center">
        <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 py-1 text-sm font-semibold text-muted-foreground">
          -
        </span>
      </div>
    );
  }
  return (
    <div className="text-center">
      <span className="inline-flex items-center justify-center rounded-full border border-ink/10 bg-card px-2.5 py-1 font-mono text-sm font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

/**
 * CoverageCell - Displays coverage percentage
 * Example: "95%" with neutral styling
 */
export function CoverageCell({ value }) {
  return (
    <div className="text-center">
      <span className="font-semibold tabular-nums">{value}%</span>
    </div>
  );
}
