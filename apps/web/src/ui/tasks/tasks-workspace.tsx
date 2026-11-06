import { useEffect, useRef, useState, type ReactNode } from "react";
import { ProjectSidebar } from "./project-sidebar";
import { isAccessFailure } from "../feedback/request-failure";
import type { Project } from "./types";
import { FolderKanban } from "lucide-react";
import { Button } from "../primitives/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../primitives/empty";

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
  const createTrigger = useRef<HTMLElement | null>(null);
  const createProjectButton = useRef<HTMLButtonElement>(null);
  const emptyCreateButton = useRef<HTMLButtonElement>(null);
  const wasCreating = useRef(false);
  useEffect(() => {
    if (wasCreating.current && !creating) {
      (createTrigger.current?.isConnected
        ? createTrigger.current
        : (emptyCreateButton.current ?? createProjectButton.current)
      )?.focus();
    }
    wasCreating.current = creating;
  }, [creating]);
  const openCreate = () => {
    createTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCreating(true);
  };
  const visible = isAccessFailure(error) ? [] : projects;
  const selected =
    visible.find((project) => project.entityId === (selectedProjectId ?? selectedId)) ??
    (selectedProjectId === undefined && selectedId === null ? visible[0] : undefined);
  return (
    <section
      aria-label="Tasks application"
      className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row"
    >
      <ProjectSidebar
        projects={visible}
        selectedId={creating ? undefined : selected?.entityId}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onCreate={openCreate}
        createButtonRef={createProjectButton}
        onSelect={(id) => {
          setSelectedId(id);
          onSelectProject?.(id);
          setCreating(false);
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {creating && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {renderCreate(
              (id) => {
                setSelectedId(id);
                onSelectProject?.(id);
                setCreating(false);
              },
              () => setCreating(false),
            )}
          </div>
        )}
        {!creating && selected && renderProject(selected)}
        {!creating && !selected && !loading && !error && (
          <Empty className="min-h-0 flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderKanban aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                <h2>{!visible.length ? "No projects yet" : "Project unavailable"}</h2>
              </EmptyTitle>
              <EmptyDescription>
                {!visible.length
                  ? "Create a project to organize tasks, subtasks, and comments."
                  : "This project was removed or you no longer have access. Choose another project or create one."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button ref={emptyCreateButton} onClick={openCreate}>
                Create project
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
    </section>
  );
}
