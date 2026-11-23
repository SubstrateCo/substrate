import type { TaskStatus } from "@substrate/contracts/tasks";

import { useState, type ComponentProps, type ReactNode, type RefObject } from "react";

import { TaskInspectorActive } from "../detail/task-inspector-context";
import { TaskList } from "../list/task-list";
import type { ProjectDetail, Task } from "../types";
import { useGuardedTab } from "./pane/use-guarded-tab";
import { useTaskPanel } from "./pane/use-task-panel";
import { ProjectIcon } from "./project-icon";
import { ProjectHeaderLayout, ProjectTabLayout } from "./project-layout";
import { projectTabs } from "./project-tabs";
import { ContentNotice } from "@/components/feedback/content-notice";
import { DiscardChangesDialog } from "@/components/feedback/discard-changes-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { FormDialog, type FormDialogEditor } from "@/components/feedback/form-dialog";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { UnsavedDraftsProvider, useDraftKeys } from "@/components/feedback/unsaved-drafts";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import { PageContent } from "@/components/layout/page-layout";
import { PageSheet, PageSheetHeader, PageSheetBody } from "@/components/layout/page-sheet";
import { SettingsContent } from "@/components/layout/settings-page";
import { ProjectLoading } from "@/components/tasks/projects/project-loading";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ResourceStatus } from "@/lib/resource-state";
import type { ProjectCapabilities } from "@/lib/tasks/project-capabilities";
import { Columns3, ListTodo, Plus, Unlink } from "lucide-react";

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
  data,
  state,
  capabilities,
  onRetry,
  editor,
  sharing,
  dangerZone,
  notice,
  renderTaskForm,
  renderTaskDetail,
  selectedTaskId,
  onSelectTask,
  onTaskStatusChange,
  headerActions,
  context,
  statusPending = false,
}: {
  data?: ProjectDetail;
  state: ResourceStatus;
  capabilities: ProjectCapabilities;
  error?: Error | null;
  onRetry: () => void;
  /** Project name and description editor, shown to editors in Settings. */
  editor: ReactNode;
  /** Project access, shown in Settings. */
  sharing: ReactNode;
  /** Archive or delete, shown last in Settings to owners. */
  dangerZone?: ReactNode;
  /** Above the tabs' content, such as the read-only notice of an archived project. */
  notice?: ReactNode;
  renderTaskForm: (props: {
    detail: ProjectDetail;
    parentTaskEntityId: string | undefined;
    onSaved: (id: string) => void;
    onCancel: () => void;
    status?: TaskStatus;
    renderCreate: (editor: FormDialogEditor) => ReactNode;
  }) => ReactNode;
  renderTaskDetail: (props: {
    detail: ProjectDetail;
    task: Task;
    onSubtask: () => void;
    onSelectTask: (id: string) => void;
  }) => ReactNode;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  onTaskStatusChange: (task: Task, status: TaskStatus) => void;
  headerActions?: ReactNode;
  context?: ReactNode;
  statusPending?: boolean;
}) {
  const [view, setView] = useState<"list" | "board">("list");
  const taskDirty = useDraftKeys().length > 0;
  const detail = data;
  const { panel, inspector, newTaskButton, restoreFocus } = useTaskPanel({
    selectedTaskId,
    onSelectTask,
  });
  const { tab, setTab, tabsRef, ...tabGuard } = useGuardedTab(inspector, taskDirty);
  if (!detail) return <ProjectPaneState state={state} onRetry={onRetry} />;
  const { canEdit } = capabilities;
  const { selectedTaskId: openTaskId } = panel;
  const selected = detail.tasks.find((task) => task.entityId === openTaskId);
  const tasksById = new Map(detail.tasks.map((task) => [task.entityId, task] as const));
  return (
    <>
      <PageContent>
        <Tabs value={tab} onValueChange={tabGuard.change} className="min-h-0 min-w-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col">
            <ProjectHeaderLayout>
              <ProjectPaneHeader
                project={detail.project}
                actions={headerActions}
                newTaskButton={newTaskButton}
                onCreateTask={canEdit ? panel.create : undefined}
              />
              <ProjectTabLayout>
                <TabsList ref={tabsRef} variant="line" className="-ml-1.5">
                  {projectTabs.map(({ value, label }) => (
                    <TabsTrigger key={value} value={value} className="flex-none">
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tab === "tasks" && (
                  <SegmentedControl
                    aria-label="Task view"
                    value={view}
                    options={viewOptions}
                    onValueChange={setView}
                  />
                )}
              </ProjectTabLayout>
            </ProjectHeaderLayout>
            {state === "stale" && (
              <StaleNotice className="border-b px-6">This project may be out of date.</StaleNotice>
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
              <div className="p-6">{context}</div>
            </TabsContent>
            {/* Stays mounted so an unsaved project name or description survives a tab change. */}
            <TabsContent
              value="settings"
              forceMount
              hidden={tab !== "settings"}
              className="min-h-0 overflow-y-auto"
            >
              <SettingsContent inset>
                {canEdit && editor}
                {sharing}
                {dangerZone}
              </SettingsContent>
            </TabsContent>
          </div>
        </Tabs>
      </PageContent>
      <TaskSheet
        open={Boolean(openTaskId && tab === "tasks")}
        inspector={inspector}
        onFocusCapture={tabGuard.trackInspectorFocus}
        onClose={panel.close}
      >
        {selected ? (
          renderTaskDetail({
            detail,
            task: selected,
            onSubtask: () => panel.createSubtask(selected.entityId),
            onSelectTask: panel.select,
          })
        ) : (
          <UnavailableTask />
        )}
      </TaskSheet>
      {panel.creating && canEdit && (
        <CreateTaskForm
          detail={detail}
          creating={panel.creating}
          renderTaskForm={renderTaskForm}
          onSaved={(id) => {
            setTab("tasks");
            panel.saved(id);
          }}
          onCancel={panel.cancel}
          onRestoreFocus={restoreFocus}
        />
      )}
      {tabGuard.pendingTab && (
        <DiscardChangesDialog
          description="Your task edits or comment haven’t been saved."
          onClose={tabGuard.cancel}
          onRestoreFocus={tabGuard.restoreFocus}
          onConfirm={tabGuard.confirm}
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
    ? `In ${detail.project.name}, under ${parentTitle ?? "a task you can’t open"}`
    : `In ${detail.project.name}`;
  return renderTaskForm({
    detail,
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
        pendingLabel="Saving task…"
        onClose={onCancel}
        onRestoreFocus={onRestoreFocus}
      >
        {fields}
      </FormDialog>
    ),
  });
}

function ProjectPaneState({ state, onRetry }: { state: ResourceStatus; onRetry: () => void }) {
  const unavailable = state === "unavailable";
  return (
    <PageContent>
      {state === "loading" ? (
        <ProjectLoading />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ErrorState
            title={unavailable ? "Project unavailable" : "Couldn’t load project"}
            description={
              unavailable ? "This project was removed or you no longer have access." : undefined
            }
            onRetry={unavailable ? undefined : onRetry}
          />
        </div>
      )}
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
      title={
        <span className="inline-flex items-center gap-2">
          <ProjectIcon image={project.image} className="size-6" />
          <span>{project.name}</span>
        </span>
      }
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
        <div role="group" aria-label="Project actions" className="flex gap-0.5">
          {actions}
          {onCreateTask && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={newTaskButton}
                  size="icon-sm"
                  variant="ghost"
                  aria-label="New task"
                  onClick={() => onCreateTask()}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New task</TooltipContent>
            </Tooltip>
          )}
        </div>
      }
    />
  );
}

function UnavailableTask() {
  return (
    <>
      <PageSheetHeader title="Task" />
      <PageSheetBody>
        <ContentNotice
          icon={Unlink}
          title="Task unavailable"
          description="This task was removed or you no longer have access. Choose another task."
        />
      </PageSheetBody>
    </>
  );
}

function TaskSheet({
  open,
  inspector,
  onFocusCapture,
  children,
  onClose,
}: {
  open: boolean;
  inspector: RefObject<HTMLDivElement | null>;
  onFocusCapture: React.FocusEventHandler<HTMLElement>;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <PageSheet
      open={open}
      label="Task"
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      ref={inspector}
      onFocusCapture={onFocusCapture}
    >
      <TaskInspectorActive.Provider value={open}>{children}</TaskInspectorActive.Provider>
    </PageSheet>
  );
}
