import { cn } from "cn";

/** The Substrate app mark and wordmark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-sm font-semibold tracking-tight", className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6 shrink-0 rounded-md bg-primary text-primary-foreground shadow-surface"
      >
        <rect x="6" y="6" width="5" height="5" rx="1.25" fill="currentColor" />
        <rect x="13" y="6" width="5" height="5" rx="1.25" fill="currentColor" opacity="0.6" />
        <rect x="6" y="13" width="5" height="5" rx="1.25" fill="currentColor" opacity="0.6" />
        <rect x="13" y="13" width="5" height="5" rx="2.5" fill="currentColor" />
      </svg>
      <span className="truncate">Substrate</span>
    </span>
  );
}
