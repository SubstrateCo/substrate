import type { ReactNode } from "react";
import { Button } from "../primitives/button";
import { SourceTaskDestination } from "./source-task-destination";

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
  return (
    <section
      aria-label="Create task from message"
      className="space-y-4 rounded-lg border bg-card p-4"
    >
      <h3 className="font-semibold">Create task from message</h3>
      <p className="text-xs text-muted-foreground">
        The source stays private to people who can access this discussion. Creating a task does not
        share it.
      </p>
      <blockquote className="line-clamp-4 border-l-2 pl-3 text-sm whitespace-pre-wrap wrap-anywhere">
        {body.replace(/@\[[^\]]+\]/g, "[Reference]")}
      </blockquote>
      {createdHref ? (
        <div className="space-y-2">
          <p role="status">Task created and linked.</p>
          <a className="underline" href={createdHref}>
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
          renderFields={(id) => renderFields(id, body.replace(/@\[[^\]]+\]/g, "[Reference]"))}
        />
      )}
    </section>
  );
}
