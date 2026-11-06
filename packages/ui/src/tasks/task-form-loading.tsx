import { Skeleton } from "../primitives/skeleton";

export function TaskFormLoading({
  hasSourceText = false,
}: {
  hasSourceText?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label="Loading task fields"
      className="w-full min-w-0"
    >
      <div
        aria-hidden="true"
        className="space-y-4 [&_[data-slot=skeleton]]:motion-reduce:animate-none"
      >
        <Skeleton className="h-6 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
        {hasSourceText && (
          <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {["status", "priority", "assignee", "due"].map((field) => (
            <div
              key={field}
              className={field === "due" ? "space-y-2" : "space-y-2 pb-2"}
            >
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
