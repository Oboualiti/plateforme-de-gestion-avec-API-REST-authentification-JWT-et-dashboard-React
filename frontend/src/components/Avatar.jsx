import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

export function Avatar({
  name,
  color,
  size = 32,
  className,
  photoUrl,
  identifiers = [],
}) {
  void identifiers;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const initials = (name || "")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "NA";

  if (photoUrl && !imageFailed) {
    return (
      <img
        src={photoUrl}
        alt={name ? `${name} avatar` : "User avatar"}
        className={cn("inline-block shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
        onError={() => setImageFailed(true)}
      />
    );
  }

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
