import type { ProjectCapabilities } from "@substrate/contracts/access/capabilities";
import type { TaskStatus } from "@substrate/contracts/tasks";

import { useState, type ComponentProps, type ReactNode, type RefObject } from "react";

import { TaskSheet, UnavailableTask } from "../detail/task-sheet";
import { TaskList } from "../list/task-list";
import type { ProjectDetail, Task } from "../types";
import { useTaskPanel } from "./pane/use-task-panel";
import { ProjectIcon } from "./project-icon";
import { ProjectHeaderLayout, ProjectTabLayout } from "./project-layout";
import { isProjectTab, projectTabs, type ProjectTab } from "./project-tabs";
import { ErrorState } from "@/components/feedback/error-state";
import { FormDialog, type FormDialogEditor } from "@/components/feedback/form-dialog";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { UnsavedDraftsProvider } from "@/components/feedback/unsaved-drafts";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import { PageContent } from "@/components/layout/page-layout";
import { SettingsContent } from "@/components/layout/settings-page";
import { ProjectLoading } from "@/components/tasks/projects/project-loading";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResourceStatus } from "@/lib/resource-state";
import { hiddenTaskInline } from "@/lib/tasks/task-status";
import { Columns3, ListTodo, Plus } from "lucide-react";

const viewOptions = [
  { value: "list", label: "List", icon: ListTodo },
  { value: "board", label: "Board", icon: Columns3 },
] as const;

/**
 * A project page and its task detail sheet, directly inside a PageLayout.
 */
export function ProjectPane(props: ComponentProps<typeof ProjectPaneContent>) {
  return (
    <UnsavedDraftsProvider>
      <ProjectPaneContent {...props} />
    </UnsavedDraftsProvider>
  );
}

function ProjectPaneContent({
  data: detail,
  state,
  capabilities,
  onRetry,
  renderSettings,
  notice,
  renderTaskForm,
  renderTaskDetail,
  selectedTaskId,
  tab,
  onSelectTab,
  onSelectTask,
  onTaskStatusChange,
  headerActions,
  renderContext,
  statusPending = false,
}: {
  data?: ProjectDetail;
  state: ResourceStatus;
  capabilities: ProjectCapabilities;
  onRetry: () => void;
  /** The Settings tab of a loaded project: its editor, access, and danger zone. */
  renderSettings: (detail: ProjectDetail) => ReactNode;
  /** Above the tabs' content, such as the read-only notice of an archived project. */
  notice?: ReactNode;
  renderTaskForm: (props: {
    parentTaskEntityId: string | undefined;
    onSaved: (id: string) => void;
    onCancel: () => void;
    status?: TaskStatus;
    renderCreate: (editor: FormDialogEditor) => ReactNode;
  }) => ReactNode;
  renderTaskDetail: (props: {
    taskId: string;
    onSubtask: () => void;
    onSelectTask: (id: string) => void;
  }) => ReactNode;
  selectedTaskId: string | null;
  tab: ProjectTab;
  onSelectTab: (tab: ProjectTab) => void;
  onSelectTask: (id: string | null) => void;
  onTaskStatusChange: (task: Task, status: TaskStatus) => void;
  headerActions?: ReactNode;
  /** The Discussions tab of a loaded project. */
  renderContext: (detail: ProjectDetail) => ReactNode;
  statusPending?: boolean;
}) {
  const [view, setView] = useState<"list" | "board">("list");
  const { panel, inspector, newTaskButton, restoreFocus } = useTaskPanel({
    selectedTaskId,
    onSelectTask,
  });
  if (!detail) return <ProjectPaneState state={state} onRetry={onRetry} />;
  const { canEdit } = capabilities;
  const { selectedTaskId: openTaskId } = panel;
  const selected = detail.tasks.find((task) => task.entityId === openTaskId);
  const tasksById = new Map(detail.tasks.map((task) => [task.entityId, task] as const));
  return (
    <>
      <PageContent>
        <Tabs
          value={tab}
          onValueChange={(next) => {
            if (isProjectTab(next)) onSelectTab(next);
          }}
          className="min-h-0 min-w-0 flex-1"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <ProjectHeaderLayout>
              <ProjectPaneHeader
                project={detail.project}
                actions={headerActions}
                newTaskButton={newTaskButton}
                onCreateTask={canEdit ? panel.create : undefined}
              />
              <ProjectTabLayout>
                <TabsList variant="line">
                  {projectTabs.map(({ value, label }) => (
                    <TabsTrigger key={value} value={value} className="flex-none">
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </ProjectTabLayout>
            </ProjectHeaderLayout>
            {state === "stale" && (
              <StaleNotice
                className="border-b px-6 py-2"
                title="This project may be out of date."
              />
            )}
            {notice && <div className="px-6 pt-4">{notice}</div>}
            <TabsContent
              value="tasks"
              forceMount
              hidden={tab !== "tasks"}
              className="flex min-h-0 flex-col"
            >
              <TaskList
                detail={detail}
                view={view}
                viewControl={
                  <SegmentedControl
                    aria-label="Task view"
                    value={view}
                    options={viewOptions}
                    onValueChange={setView}
                  />
                }
                statusPending={statusPending}
                selectedId={openTaskId}
                onSelect={panel.select}
                onCreate={canEdit ? panel.create : undefined}
                onStatusChange={
                  canEdit
                    ? (taskId, status) => {
                        const task = tasksById.get(taskId);
                        if (task) onTaskStatusChange(task, status);
                      }
                    : undefined
                }
              />
            </TabsContent>
            <TabsContent value="discussions" className="min-h-0 overflow-y-auto">
              <div className="flex min-h-full flex-col p-6">{renderContext(detail)}</div>
            </TabsContent>
            {/* Stays mounted so an unsaved project name or description survives a tab change. */}
            <TabsContent
              value="settings"
              forceMount
              hidden={tab !== "settings"}
              className="min-h-0 overflow-y-auto"
            >
              <SettingsContent inset>{renderSettings(detail)}</SettingsContent>
            </TabsContent>
          </div>
        </Tabs>
      </PageContent>
      <TaskSheet
        open={Boolean(openTaskId && tab === "tasks")}
        inspector={inspector}
        onClose={panel.close}
      >
        {selected ? (
          renderTaskDetail({
            taskId: selected.entityId,
            onSubtask: () => panel.createSubtask(selected.entityId),
            onSelectTask: panel.select,
          })
        ) : (
          <UnavailableTask description="This task was removed or you no longer have access. Choose another task." />
        )}
      </TaskSheet>
      {panel.creating && canEdit && (
        <CreateTaskForm
          detail={detail}
          creating={panel.creating}
          renderTaskForm={renderTaskForm}
          onSaved={(id) => {
            panel.saved(id);
          }}
          onCancel={panel.cancel}
          onRestoreFocus={restoreFocus}
        />
      )}
    </>
  );
}

function CreateTaskForm({
  detail,
  creating,
  renderTaskForm,
  onSaved,
  onCancel,
  onRestoreFocus,
}: {
  detail: ProjectDetail;
  creating: { parentTaskEntityId?: string; status?: TaskStatus };
  renderTaskForm: ComponentProps<typeof ProjectPaneContent>["renderTaskForm"];
  onSaved: (id: string) => void;
  onCancel: () => void;
  onRestoreFocus: () => void;
}) {
  const creatingParent = creating.parentTaskEntityId;
  const parentTitle = detail.tasks.find((task) => task.entityId === creatingParent)?.title;
  const creationPlace = creatingParent
    ? `In ${detail.project.name}, under ${parentTitle ?? hiddenTaskInline}`
    : `In ${detail.project.name}`;
  return renderTaskForm({
    parentTaskEntityId: creatingParent,
    onSaved,
    onCancel,
    status: creating.status,
    renderCreate: ({ fields, ...editor }) => (
      <FormDialog
        {...editor}
        title={creatingParent ? "New subtask" : "New task"}
        description={<span title={creationPlace}>{creationPlace}</span>}
        saveLabel={creatingParent ? "Create subtask" : "Create task"}
        size="lg"
        onClose={onCancel}
        onRestoreFocus={onRestoreFocus}
      >
        {fields}
      </FormDialog>
    ),
  });
}

/** A project that has not loaded: loading, no longer accessible, or failed. */
function ProjectPaneState({ state, onRetry }: { state: ResourceStatus; onRetry: () => void }) {
  if (state === "loading")
    return (
      <PageContent>
        <ProjectLoading />
      </PageContent>
    );
  if (state === "unavailable") return <ProjectUnavailable />;
  return <ProjectLoadError onRetry={onRetry} />;
}

function ProjectUnavailable() {
  return (
    <PageContent>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <ErrorState
          title="Project unavailable"
          description="This project was removed or you no longer have access."
        />
      </div>
    </PageContent>
  );
}

function ProjectLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <PageContent>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <ErrorState title="Couldn’t load project" onRetry={onRetry} />
      </div>
    </PageContent>
  );
}

function ProjectPaneHeader({
  project,
  actions,
  newTaskButton,
  onCreateTask,
}: {
  project: ProjectDetail["project"];
  actions: ReactNode;
  newTaskButton: RefObject<HTMLButtonElement | null>;
  onCreateTask?: () => void;
}) {
  return (
    <PageHeader
      icon={<ProjectIcon image={project.image} className="size-6" />}
      title={project.name}
      description={
        project.description && (
          <span
            className="line-clamp-2 wrap-break-word whitespace-pre-wrap"
            title={project.description}
          >
            {project.description}
          </span>
        )
      }
      actions={
        <div role="group" aria-label="Project actions" className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">{actions}</div>
          {onCreateTask && (
            <Button ref={newTaskButton} size="sm" onClick={() => onCreateTask()}>
              <Plus aria-hidden="true" />
              New task
            </Button>
          )}
        </div>
      }
    />
  );
}
