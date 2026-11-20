import type { CSSProperties } from "react";

import { cn } from "cn";

export function SkeletonText({
  width = "100%",
  className,
}: {
  width?: CSSProperties["width"];
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="skeleton"
      className={cn(
        // oxlint-disable-next-line shadcn/no-arbitrary-values -- The placeholder must follow the surrounding font size.
        "inline-block h-[1em] max-w-full rounded-md bg-muted align-middle motion-safe:animate-pulse",
        className,
      )}
      // oxlint-disable-next-line shadcn/no-inline-styles -- Width is supplied by the caller at runtime.
      style={{ width }}
    />
  );
}
