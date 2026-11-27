import type { LinkProps } from "@tanstack/react-router";

import { useRef, useState, type ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import type { Project } from "../types";
import { ProjectSidebar } from "./project-sidebar";
import { FormDialog, type FormDialogEditor } from "@/components/feedback/form-dialog";
import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { listPhase, type ListPhase, type ResourceStatus } from "@/lib/resource-state";
import { FolderKanban, Plus, Unlink } from "lucide-react";

export function TasksWorkspace({
  projects,
  archivedProjects,
  onRestoreProject,
  restoringProjectId,
  state,
  loading = false,
  error,
  onRetry,
  renderCreate,
  project,
  selectedProjectId,
  onSelectProject,
  projectLink,
}: {
  projects: Project[];
  archivedProjects?: Project[];
  onRestoreProject?: (id: string) => void;
  restoringProjectId?: string;
  state: ResourceStatus;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  renderCreate: (props: {
    onSaved: (id: string) => void;
    renderCreate: (editor: FormDialogEditor) => ReactNode;
  }) => ReactNode;
  /** The selected project's content pane and task inspector. */
  project: ReactNode;
  selectedProjectId?: string;
  onSelectProject: (id: string) => void;
  projectLink: (id: string) => LinkProps;
}) {
  const [creating, setCreating] = useState(false);
  const createProjectButton = useRef<HTMLButtonElement>(null);
  const focusReturn = useFocusReturn(createProjectButton);
  const openCreate = () => {
    focusReturn.remember();
    setCreating(true);
  };
  const selectProject = (id: string) => {
    onSelectProject(id);
    setCreating(false);
  };
  return (
    <PageLayout id="tasks" aria-label="Tasks application">
      <ProjectSidebar
        projects={projects}
        archivedProjects={archivedProjects}
        onRestore={onRestoreProject}
        restoringId={restoringProjectId}
        selectedId={selectedProjectId}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onCreate={openCreate}
        createButtonRef={createProjectButton}
        projectLink={projectLink}
        onSelect={() => setCreating(false)}
      />
      {selectedProjectId && project}
      {!selectedProjectId && (
        <PageContent>
          <NoProjectSelected
            phase={listPhase({ items: projects, loading, error })}
            unavailable={state === "unavailable"}
            onRetry={onRetry}
            onCreate={openCreate}
          />
        </PageContent>
      )}
      {creating &&
        renderCreate({
          onSaved: selectProject,
          renderCreate: ({ fields, ...editor }) => (
            <FormDialog
              {...editor}
              title="New project"
              description="Organization owners and admins can access every project. Share this project to give others access to its tasks."
              saveLabel="Create project"
              onClose={() => setCreating(false)}
              onRestoreFocus={focusReturn.restore}
            >
              {fields}
            </FormDialog>
          ),
        })}
    </PageLayout>
  );
}

/** The main pane without a selected project. The sidebar shows the projects. */
function NoProjectSelected({
  phase,
  unavailable,
  onRetry,
  onCreate,
}: {
  phase: ListPhase<Project>;
  unavailable: boolean;
  onRetry: () => void;
  onCreate: () => void;
}) {
  if (phase.status === "loading") return null;
  if (phase.status === "error")
    return (
      <ErrorState
        title={unavailable ? "Projects unavailable" : "Couldn’t load projects"}
        description={
          unavailable ? "Check that you still have access to this workspace." : undefined
        }
        onRetry={unavailable ? undefined : onRetry}
      />
    );
  if (phase.status === "empty")
    return (
      <ContentNotice
        icon={FolderKanban}
        title="No projects yet"
        description="Create a project to plan work with tasks, subtasks, and comments."
        action={
          <Button onClick={onCreate}>
            <Plus aria-hidden />
            New project
          </Button>
        }
      />
    );
  // Projects loaded, so the selected one was removed or is out of reach.
  return (
    <ContentNotice
      icon={Unlink}
      title="Project unavailable"
      description="This project was removed or you no longer have access. Choose another project."
    />
  );
}
