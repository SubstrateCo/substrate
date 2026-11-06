import { Skeleton } from "../primitives/skeleton";

export function ProjectLoading() {
  return (
    <div
      role="status"
      aria-label="Loading project"
      className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto p-4 sm:p-6"
    >
      <div
        aria-hidden="true"
        className="space-y-3 [&_[data-slot=skeleton]]:motion-reduce:animate-none"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-48 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <div className="flex h-11 items-center gap-4 border-b pb-2">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 border-b px-3 pb-2">
            <Skeleton className="h-3 w-12" />
            <div className="flex-1" />
            <Skeleton className="hidden h-3 w-20 sm:block" />
            <Skeleton className="hidden h-3 w-28 sm:block" />
            <Skeleton className="hidden h-3 w-20 sm:block" />
          </div>
          <Skeleton className="ml-3 h-5 w-28" />
          <div className="divide-y divide-border/50">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="size-4 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-1/3" />
                <div className="flex-1" />
                <Skeleton className="hidden h-4 w-20 sm:block" />
                <Skeleton className="hidden h-4 w-28 sm:block" />
                <Skeleton className="hidden h-4 w-20 sm:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
