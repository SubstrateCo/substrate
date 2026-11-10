import { Skeleton } from "../../ui/skeleton";

const rows = [64, 48, 72, 40, 56];

/** The project page's shape while it loads: header, tabs, filter bar, and compact rows. */
export function ProjectLoading() {
  return (
    <div
      role="status"
      aria-label="Loading project"
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 space-y-2 border-b px-6 pt-5">
          <Skeleton className="h-7 w-48 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <div className="flex h-11 items-center gap-4">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-14" />
          </div>
        </div>
        <div className="flex h-11 shrink-0 items-center gap-2 border-b px-6">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-7 w-32" />
        </div>
        <div className="flex h-8 items-center gap-2 border-b bg-muted px-6">
          <Skeleton className="size-3.5" />
          <Skeleton className="h-3 w-24" />
        </div>
        {rows.map((width) => (
          <div key={width} className="flex h-9 items-center gap-3 pr-6 pl-6">
            <Skeleton className="size-4 shrink-0" />
            <Skeleton
              className="h-3.5 w-(--skeleton-width)"
              style={{ "--skeleton-width": `${width}%` }}
            />
            <span className="flex-1" />
            <Skeleton className="size-4 shrink-0" />
            <Skeleton className="size-5 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
