import { Skeleton } from "../ui/skeleton";

export function ProjectLoading() {
  return (
    <div
      role="status"
      aria-label="Loading project"
      className="@container flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden p-4 sm:p-6"
    >
      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="mb-3 flex shrink-0 flex-wrap items-start gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-7 w-48 max-w-full" />
          </div>
          <Skeleton className="h-8 w-24" />
          <div className="flex h-10 w-full flex-col justify-between @md:h-5">
            <Skeleton className="h-4 w-80 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full @md:hidden" />
          </div>
        </div>
        <div className="shrink-0 border-b pb-2">
          <div className="flex h-8 items-center gap-4">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-28" />
          </div>
        </div>
        <div className="@container mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div
            data-slot="project-loading-columns"
            className="hidden gap-3 border-b px-3 pb-2 @xl:flex"
          >
            <div className="h-4 min-w-0 flex-1">
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="h-4 w-24 shrink-0">
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="h-4 w-32 shrink-0">
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="h-4 w-24 shrink-0">
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div>
            <div
              data-slot="project-loading-group"
              className="mb-1 flex items-center gap-2 px-3 py-1.5"
            >
              <Skeleton className="size-4 shrink-0" />
              <Skeleton className="h-5 w-28" />
            </div>
            <div className="divide-y divide-border/50">
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="flex min-h-12 items-center gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Skeleton className="size-4 shrink-0" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                  <div data-loading-field="priority" className="w-20 shrink-0 @xl:w-24">
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div data-loading-field="assignee" className="hidden w-32 shrink-0 @xl:block">
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <div data-loading-field="due-date" className="hidden w-24 shrink-0 @xl:block">
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
