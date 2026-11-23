import type { TaskStatus } from "@substrate/contracts/tasks";

import { useRef, useState, type ComponentProps, type ReactNode, type RefObject } from "react";

import { TaskInspectorActive } from "../detail/task-inspector-context";
import { TaskList } from "../list/task-list";
import type { ProjectDetail, Task } from "../types";
import { useTaskPanel } from "./pane/use-task-panel";
import { ProjectIcon } from "./project-icon";
import { ProjectHeaderLayout, ProjectTabLayout, projectTabs } from "./project-layout";
import { ContentNotice } from "@/components/feedback/content-notice";
import { DiscardChangesDialog } from "@/components/feedback/discard-changes-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { FormDialog, type FormDialogEditor } from "@/components/feedback/form-dialog";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { UnsavedDraftsProvider, useDraftKeys } from "@/components/feedback/unsaved-drafts";
import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import { PageAside, PageContent } from "@/components/layout/page-layout";
import { SettingsContent } from "@/components/layout/settings-page";
import { ProjectLoading } from "@/components/tasks/projects/project-loading";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ResourceStatus } from "@/lib/resource-state";
import type { ProjectCapabilities } from "@/lib/tasks/project-capabilities";
import { Columns3, ListTodo, Plus, Unlink, X } from "lucide-react";

const viewOptions = [
  { value: "list", label: "List", icon: ListTodo },
  { value: "board", label: "Board", icon: Columns3 },
] as const;

/**
 * A project page and, when a task is open, the task inspector beside it. It renders the page's
 * content pane and aside, so it sits directly inside a PageLayout.
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
    onClose: () => void;
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
  const [tab, setTab] = useState("tasks");
  const [view, setView] = useState<"list" | "board">("list");
  const taskDirty = useDraftKeys().length > 0;
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const lastInspectorFocus = useRef<HTMLElement | null>(null);
  const detail = data;
  const { panel, inspector, newTaskButton, restoreFocus } = useTaskPanel({
    selectedTaskId,
    onSelectTask,
    ready: !!detail,
  });
  const tabFocus = useFocusReturn(inspector);
  if (!detail) return <ProjectPaneState state={state} onRetry={onRetry} />;
  const { canEdit } = capabilities;
  const { selectedTaskId: openTaskId } = panel;
  const selected = detail.tasks.find((task) => task.entityId === openTaskId);
  const tasksById = new Map(detail.tasks.map((task) => [task.entityId, task] as const));
  const creatingParent = panel.creating?.parentTaskEntityId;
  const creationPlace = creatingParent
    ? `In ${detail.project.name}, under ${tasksById.get(creatingParent)?.title ?? "a task you can’t open"}`
    : `In ${detail.project.name}`;
  return (
    <>
      <PageContent>
        <Tabs
          value={tab}
          onValueChange={(next) => {
            if (tab === "tasks" && next !== "tasks" && taskDirty) {
              // Keep editing returns to where the person was working in the inspector.
              tabFocus.remember(lastInspectorFocus.current);
              setPendingTab(next);
            } else setTab(next);
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
      <TaskAside
        open={Boolean(openTaskId && tab === "tasks")}
        inspector={inspector}
        onFocusCapture={(event) => {
          if (event.target instanceof HTMLElement) lastInspectorFocus.current = event.target;
        }}
      >
        {selected ? (
          renderTaskDetail({
            detail,
            task: selected,
            onClose: panel.close,
            onSubtask: () => panel.createSubtask(selected.entityId),
            onSelectTask: panel.select,
          })
        ) : (
          <UnavailableTask onClose={panel.close} />
        )}
      </TaskAside>
      {panel.creating &&
        canEdit &&
        renderTaskForm({
          detail,
          parentTaskEntityId: creatingParent,
          onSaved: (id) => {
            setTab("tasks");
            panel.saved(id);
          },
          onCancel: panel.cancel,
          status: panel.creating.status,
          renderCreate: ({ fields, ...editor }) => (
            <FormDialog
              {...editor}
              title={creatingParent ? "New subtask" : "New task"}
              description={<span title={creationPlace}>{creationPlace}</span>}
              saveLabel={creatingParent ? "Create subtask" : "Create task"}
              pendingLabel="Saving task…"
              onClose={panel.cancel}
              onRestoreFocus={restoreFocus}
            >
              {fields}
            </FormDialog>
          ),
        })}
      {pendingTab && (
        <DiscardChangesDialog
          description="Your task edits or comment haven’t been saved."
          onClose={() => setPendingTab(null)}
          onRestoreFocus={tabFocus.restore}
          onConfirm={() => {
            // Focus goes to the tab the person chose instead of back into the inspector.
            tabFocus.remember(
              tabsRef.current?.querySelector(
                `[role="tab"][aria-controls$="-content-${CSS.escape(pendingTab)}"]`,
              ) ?? null,
            );
            setTab(pendingTab);
            setPendingTab(null);
          }}
        />
      )}
    </>
  );
}

function ProjectPaneState({ state, onRetry }: { state: ResourceStatus; onRetry: () => void }) {
  const unavailable = state === "unavailable";
  return (
    <PageContent>
      {state === "loading" ? (
        <ProjectLoading />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
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

function UnavailableTask({ onClose }: { onClose: () => void }) {
  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-end border-b px-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close task" onClick={onClose}>
              <X aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close task</TooltipContent>
        </Tooltip>
      </header>
      <ContentNotice
        icon={Unlink}
        title="Task unavailable"
        description="This task was removed or you no longer have access. Choose another task."
      />
    </>
  );
}

function TaskAside({
  open,
  inspector,
  onFocusCapture,
  children,
}: {
  open: boolean;
  inspector: RefObject<HTMLElement | null>;
  onFocusCapture: React.FocusEventHandler<HTMLElement>;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <PageAside
      overlay
      ref={inspector}
      tabIndex={-1}
      aria-label="Task"
      onFocusCapture={onFocusCapture}
      className="outline-none"
    >
      <TaskInspectorActive.Provider value={open}>{children}</TaskInspectorActive.Provider>
    </PageAside>
  );
}
