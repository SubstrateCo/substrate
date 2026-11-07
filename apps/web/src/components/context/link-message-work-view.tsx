import { FormMessage } from "../auth/form-message";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import { Button } from "../ui/button";
import { Empty, EmptyDescription } from "../ui/empty";
import { Input } from "../ui/input";
import { LinkWorkItem } from "./link-work-item";

export function LinkMessageWork({
  query,
  kind,
  results,
  loading,
  error,
  pendingId,
  actionError,
  onQueryChange,
  onKindChange,
  onRetry,
  onLink,
  onClose,
}: {
  query: string;
  kind: "task" | "project";
  results: { id: string; title: string }[];
  loading: boolean;
  error?: Error | null;
  pendingId?: string;
  actionError?: Error | null;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: "task" | "project") => void;
  onRetry: () => void;
  onLink: (id: string) => void;
  onClose: () => void;
}) {
  const visible = isAccessFailure(error) ? [] : results;
  return (
    <section aria-label="Link existing work" className="min-w-0 space-y-3">
      <h3 className="text-sm font-semibold">Link existing work</h3>
      <p className="text-xs text-muted-foreground">
        Only people with access can open this item. Linking does not share it.
      </p>
      <div role="group" aria-label="Work type" className="flex gap-2">
        <Button
          size="xs"
          variant={kind === "task" ? "secondary" : "outline"}
          aria-pressed={kind === "task"}
          onClick={() => onKindChange("task")}
        >
          Tasks
        </Button>
        <Button
          size="xs"
          variant={kind === "project" ? "secondary" : "outline"}
          aria-pressed={kind === "project"}
          onClick={() => onKindChange("project")}
        >
          Projects
        </Button>
      </div>
      <Input
        aria-label="Search work to link"
        placeholder={kind === "task" ? "Search tasks to link…" : "Search projects to link…"}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {loading && !visible.length && <LoadingState label="Searching work" variant="compact" />}
      {error && <ErrorState compact title="Couldn't search work" onRetry={onRetry} />}
      {!loading && !error && !visible.length && (
        <Empty>
          <EmptyDescription>No editable work found.</EmptyDescription>
        </Empty>
      )}
      <ul className="space-y-1">
        {visible.map((item) => (
          <LinkWorkItem
            key={item.id}
            title={item.title}
            pending={pendingId === item.id}
            disabled={!!pendingId}
            onLink={() => onLink(item.id)}
          />
        ))}
      </ul>
      <FormMessage
        error={actionError}
        errorDescription="Couldn't link this item. Check that you still have access."
      />
      <Button size="xs" variant="outline" onClick={onClose}>
        Cancel
      </Button>
    </section>
  );
}
