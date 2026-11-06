import { Button } from "../primitives/button";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import type { Project } from "./types";

export function ProjectSidebar({
  projects,
  selectedId,
  loading,
  error,
  onRetry,
  onCreate,
  onSelect,
}: {
  projects: Project[];
  selectedId?: string;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
}) {
  const visible = isAccessFailure(error) ? [] : projects;
  return (
    <aside
      aria-label="Projects"
      className="shrink-0 space-y-4 border-b bg-muted/20 p-4 md:w-56 md:overflow-y-auto md:border-r md:border-b-0"
    >
      <div className="flex items-center justify-between">
        <h1 className="font-semibold">Projects</h1>
        <Button size="sm" variant="outline" onClick={onCreate}>
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
            aria-current={selectedId === project.entityId ? "page" : undefined}
            onClick={() => onSelect(project.entityId)}
          >
            <span className="truncate">{project.name}</span>
          </Button>
        ))}
      </div>
    </aside>
  );
}
