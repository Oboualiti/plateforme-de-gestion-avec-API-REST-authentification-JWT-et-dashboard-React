import { cn } from "../lib/utils";

export function Avatar({
  name,
  color,
  size = 32,
  className,
}) {
  const initials = (name || "")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "NA";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium text-white shrink-0",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: color ?? "hsl(var(--primary))",
        fontSize: Math.max(10, Math.floor(size * 0.4)),
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
