import { useState, type ReactNode } from "react";
import { Button } from "../primitives/button";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import type { Project } from "./types";

export function TasksWorkspace({
  projects,
  loading = false,
  error,
  onRetry,
  renderCreate,
  renderProject,
}: {
  projects: Project[];
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  renderCreate: (onSaved: (id: string) => void, onCancel: () => void) => ReactNode;
  renderProject: (project: Project) => ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const visible = isAccessFailure(error) ? [] : projects;
  const selected =
    visible.find((project) => project.entityId === selectedId) ??
    (selectedId === null ? visible[0] : undefined);
  return (
    <section
      aria-label="Tasks application"
      className="flex min-h-0 flex-1 flex-col overflow-auto md:flex-row"
    >
      <aside
        aria-label="Projects"
        className="shrink-0 space-y-4 border-b bg-muted/20 p-4 md:w-56 md:overflow-y-auto md:border-r md:border-b-0"
      >
        <div className="flex items-center justify-between">
          <h1 className="font-semibold">Projects</h1>
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            New project
          </Button>
        </div>
        {loading && <LoadingState label="Loading projects" variant="compact" />}
        {error && (
          <ErrorState
            compact
            title={isAccessFailure(error) ? "Projects unavailable" : "Couldn’t load projects"}
            onRetry={onRetry}
          />
        )}
        {!loading && !error && !visible.length && (
          <p className="text-sm text-muted-foreground">
            No projects yet. Create a project to start planning.
          </p>
        )}
        <div className="flex gap-2 overflow-x-auto md:flex-col">
          {visible.map((project) => (
            <Button
              key={project.entityId}
              variant="sidebar"
              className="justify-start"
              aria-current={
                !creating && selected?.entityId === project.entityId ? "page" : undefined
              }
              onClick={() => {
                setSelectedId(project.entityId);
                setCreating(false);
              }}
            >
              <span className="truncate">{project.name}</span>
            </Button>
          ))}
        </div>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 md:overflow-y-auto">
        {creating ? (
          renderCreate(
            (id) => {
              setSelectedId(id);
              setCreating(false);
            },
            () => setCreating(false),
          )
        ) : selected ? (
          renderProject(selected)
        ) : !loading && !error ? (
          <div className="p-8">
            <h2 className="text-lg font-semibold">Your team's work, in one place</h2>
            <p className="mt-2 text-muted-foreground">
              Choose a project or create one to add tasks, subtasks, and comments.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
