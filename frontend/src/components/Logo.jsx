import { cn } from "../lib/utils";

/**
 * A professional, minimalist logo for W-SERVICE.
 * Uses sharp geometric paths and a high-contrast palette.
 */
export function Logo({ className, iconOnly = false }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative flex h-full items-center">
        <svg
          viewBox="0 0 120 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-auto"
        >
          {/* Headset Base - Minimalist Arc */}
          <path
            d="M10 20C10 14.4772 14.4772 10 20 10C25.5228 10 30 14.4772 30 20"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="10" cy="22" r="3.5" fill="currentColor" />
          <circle cx="30" cy="22" r="3.5" fill="currentColor" />
          
          {/* Mic - Sharp Line */}
          <path
            d="M30 22L36 28"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="36" cy="28" r="1.5" fill="currentColor" />

          {/* The Arrow - Precision Vector */}
          <path
            d="M45 22H85M85 22L78 15M85 22L78 29"
            stroke="hsl(var(--primary))"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {!iconOnly && (
        <div className="flex flex-col justify-center leading-none">
          <span className="text-xl font-black uppercase tracking-[-0.02em] text-foreground">
            W-Service
          </span>
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-muted-foreground/80">
            Operations & Support
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Compact icon version specifically for the sidebar brand area.
 */
export function LogoIcon({ className }) {
  return (
    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary shadow-brutal border-2 border-ink", className)}>
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6 text-ink"
      >
        {/* Minimalist Headset Icon */}
        <path
          d="M8 20C8 13.3726 13.3726 8 20 8C26.6274 8 32 13.3726 32 20"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="8" cy="22" r="4" fill="currentColor" />
        <circle cx="32" cy="22" r="4" fill="currentColor" />
        <path
          d="M32 22L38 28"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Small minimalist arrow integrated */}
        <path
          d="M18 20H26M26 20L23 17M26 20L23 23"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
