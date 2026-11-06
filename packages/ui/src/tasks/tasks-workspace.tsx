import { useState, type ReactNode } from "react";
import { ProjectSidebar } from "./project-sidebar";
import { isAccessFailure } from "../feedback/request-failure";
import type { Project } from "./types";

export function TasksWorkspace({
  projects,
  loading = false,
  error,
  onRetry,
  renderCreate,
  renderProject,
  selectedProjectId,
  onSelectProject,
}: {
  projects: Project[];
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  renderCreate: (onSaved: (id: string) => void, onCancel: () => void) => ReactNode;
  renderProject: (project: Project) => ReactNode;
  selectedProjectId?: string;
  onSelectProject?: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const visible = isAccessFailure(error) ? [] : projects;
  const selected =
    visible.find((project) => project.entityId === (selectedProjectId ?? selectedId)) ??
    (selectedProjectId === undefined && selectedId === null ? visible[0] : undefined);
  return (
    <section
      aria-label="Tasks application"
      className="flex min-h-0 flex-1 flex-col overflow-auto md:flex-row"
    >
      <ProjectSidebar
        projects={visible}
        selectedId={creating ? undefined : selected?.entityId}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onCreate={() => setCreating(true)}
        onSelect={(id) => {
          setSelectedId(id);
          onSelectProject?.(id);
          setCreating(false);
        }}
      />
      <div className="min-h-0 min-w-0 flex-1 md:overflow-y-auto">
        {creating &&
          renderCreate(
            (id) => {
              setSelectedId(id);
              onSelectProject?.(id);
              setCreating(false);
            },
            () => setCreating(false),
          )}
        {!creating && selected && renderProject(selected)}
        {!creating && !selected && !loading && !error && (
          <div className="p-8">
            <h2 className="text-lg font-semibold">
              {selectedProjectId ? "Project unavailable" : "Your team's work, in one place"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              Choose a project or create one to add tasks, subtasks, and comments.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
