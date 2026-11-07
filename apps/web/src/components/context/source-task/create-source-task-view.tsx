import type { ReactNode } from "react";

import { Button } from "../../ui/button";
import { SourceTaskDestination } from "./source-task-destination";
import { CheckCheck, SquareCheck } from "lucide-react";

export function CreateSourceTask({
  body,
  projects,
  loading,
  error,
  createdHref,
  onRetry,
  onClose,
  renderFields,
}: {
  body: string;
  projects: { id: string; title: string }[];
  loading: boolean;
  error?: Error | null;
  createdHref?: string;
  onRetry: () => void;
  onClose: () => void;
  renderFields: (projectId: string, sourceText: string) => ReactNode;
}) {
  const sourceText = body.replace(/@\[[^\]]+\]/g, "[Reference]");
  return (
    <section
      aria-label="Create task from message"
      className="my-3 -ml-12 max-w-xl min-w-0 overflow-hidden rounded-xl border border-primary/20 bg-card shadow-surface"
    >
      <header className="flex items-center gap-2 px-4 pt-4 pb-3">
        <SquareCheck aria-hidden className="size-4 text-primary" />
        <h3 className="text-xs font-semibold">Create task</h3>
        {!createdHref && (
          <span className="rounded border px-1.5 text-xs text-muted-foreground">Draft</span>
        )}
      </header>
      {createdHref ? (
        <div className="space-y-3 px-4 pb-4">
          <p role="status" className="flex items-center gap-2 text-sm text-success">
            <CheckCheck aria-hidden className="size-4" />
            Task created and linked.
          </p>
          <a className="text-sm text-primary underline" href={createdHref}>
            Open created task
          </a>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <SourceTaskDestination
          projects={projects}
          loading={loading}
          error={error}
          onRetry={onRetry}
          onClose={onClose}
          renderFields={(id) => renderFields(id, sourceText)}
        />
      )}
    </section>
  );
}
