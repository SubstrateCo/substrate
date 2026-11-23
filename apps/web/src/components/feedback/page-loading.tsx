import { Skeleton } from "../ui/skeleton";
import { LoadingState } from "./loading-state";

export function PageLoading() {
  return (
    <main className="flex min-h-(--app-height) items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6 rounded-xl border bg-card p-6">
        <Skeleton aria-hidden="true" className="h-6 w-1/2" />
        <LoadingState label="Loading your workspace" />
      </div>
    </main>
  );
}
