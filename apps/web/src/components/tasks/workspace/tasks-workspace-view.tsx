import type { LinkProps } from "@tanstack/react-router";

import { useRef, useState, type ReactNode } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { Button } from "../../ui/button";
import type { Project } from "../types";
import { ProjectSidebar } from "./project-sidebar";
import { FormDialog, type FormDialogEditor } from "@/components/feedback/form-dialog";
import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import type { ResourceStatus } from "@/lib/resource-state";
import { FolderKanban, Unlink } from "lucide-react";

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
  const visible = projects;
  const selectProject = (id: string) => {
    onSelectProject(id);
    setCreating(false);
  };
  return (
    <PageLayout id="tasks" aria-label="Tasks application">
      <ProjectSidebar
        state={state}
        projects={visible}
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
      {creating &&
        renderCreate({
          onSaved: selectProject,
          renderCreate: ({ fields, ...editor }) => (
            <FormDialog
              {...editor}
              title="New project"
              description="Organization owners and admins can access every project. Share this project to give others access to its tasks."
              size="default"
              saveLabel="Create project"
              pendingLabel="Creating project…"
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
