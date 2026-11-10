import { useRef, useState, type ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import type { Project } from "../types";
import { ProjectSidebar } from "./project-sidebar";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderKanban, Unlink } from "lucide-react";

export function TasksWorkspace({
  projects,
  loading = false,
  error,
  onRetry,
  renderCreate,
  project,
  selectedProjectId,
  onSelectProject,
}: {
  projects: Project[];
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  renderCreate: (onSaved: (id: string) => void, onCancel: () => void) => ReactNode;
  /** The selected project's content pane and task inspector. */
  project: ReactNode;
  selectedProjectId?: string;
  onSelectProject: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const createTrigger = useRef<HTMLElement | null>(null);
  const createProjectButton = useRef<HTMLButtonElement>(null);
  const openCreate = () => {
    createTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCreating(true);
  };
  const visible = isAccessFailure(error) ? [] : projects;
  const selectProject = (id: string) => {
    onSelectProject(id);
    setCreating(false);
  };
  return (
    <PageLayout id="tasks" aria-label="Tasks application">
      <ProjectSidebar
        projects={visible}
        selectedId={selectedProjectId}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onCreate={openCreate}
        createButtonRef={createProjectButton}
        onSelect={selectProject}
      />
      {selectedProjectId && project}
      {!selectedProjectId && (
        <PageContent>
          {!loading && !error && (
            <ContentNotice
              icon={visible.length ? Unlink : FolderKanban}
              title={visible.length ? "Project unavailable" : "No projects yet"}
              description={
                visible.length
                  ? "This project was removed or you no longer have access. Choose another project."
                  : "Create a project to plan work with tasks, subtasks, and comments."
              }
              action={!visible.length && <Button onClick={openCreate}>New project</Button>}
            />
          )}
        </PageContent>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (createTrigger.current?.isConnected
              ? createTrigger.current
              : createProjectButton.current
            )?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Organization owners and admins can access every project. Share this project to give
              others access to its tasks.
            </DialogDescription>
          </DialogHeader>
          {creating && renderCreate(selectProject, () => setCreating(false))}
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
