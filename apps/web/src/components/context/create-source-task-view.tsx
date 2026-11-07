import type { ReactNode } from "react";

import { Button } from "../ui/button";
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
  const sourceText = body.replace(/@\[[^\]]+\]/g, "[Reference]");
  return (
    <section aria-label="Create task from message" className="min-w-0 space-y-4">
      <h3 className="text-sm font-semibold">Create task from message</h3>
      <p className="text-xs text-muted-foreground">
        The source stays private to people who can access this discussion. Creating a task does not
        share it.
      </p>
      <blockquote className="line-clamp-4 border-l-2 pl-3 text-sm wrap-anywhere whitespace-pre-wrap">
        {sourceText}
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
          renderFields={(id) => renderFields(id, sourceText)}
        />
      )}
    </section>
  );
}
