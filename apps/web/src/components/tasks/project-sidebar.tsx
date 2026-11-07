import type { Ref } from "react";

import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import { Button } from "../ui/button";
import type { Project } from "./types";
import { FolderKanban, Plus } from "lucide-react";

export function ProjectSidebar({
  projects,
  selectedId,
  loading,
  error,
  onRetry,
  onCreate,
  onSelect,
  createButtonRef,
}: {
  projects: Project[];
  selectedId?: string;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  createButtonRef?: Ref<HTMLButtonElement>;
}) {
  const visible = isAccessFailure(error) ? [] : projects;
  return (
    <aside
      aria-label="Projects"
      className="min-w-0 shrink-0 space-y-4 border-b bg-muted/20 p-3 md:w-52 md:overflow-y-auto md:border-r md:border-b-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-semibold">Projects</h1>
        <Button ref={createButtonRef} size="sm" variant="outline" onClick={onCreate}>
          <Plus aria-hidden="true" className="size-3.5" /> New project
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
            className="max-w-full min-w-0 shrink-0 justify-start md:w-full"
            title={project.name}
            aria-current={selectedId === project.entityId ? "page" : undefined}
            onClick={() => onSelect(project.entityId)}
          >
            <FolderKanban aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{project.name}</span>
          </Button>
        ))}
      </div>
    </aside>
  );
}
