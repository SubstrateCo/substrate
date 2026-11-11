import type { TaskStatus } from "@substrate/contracts/tasks";

import { useRef, useState, type ReactNode, type RefObject } from "react";

import { TaskInspectorActive } from "../detail/task-detail";
import { TaskList } from "../list/task-list";
import type { ProjectDetail, Task } from "../types";
import { TaskCreationDialog } from "./pane/task-creation-dialog";
import { useTaskPanel } from "./pane/use-task-panel";
import { ProjectIcon } from "./project-icon";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import { PageAside, PageContent } from "@/components/layout/page-layout";
import { SettingsContent } from "@/components/layout/settings-page";
import { ProjectLoading } from "@/components/tasks/projects/project-loading";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Columns3, ListTodo, Plus, Unlink, X } from "lucide-react";

const viewOptions = [
  { value: "list", label: "List", icon: ListTodo },
  { value: "board", label: "Board", icon: Columns3 },
] as const;

/**
 * A project page and, when a task is open, the task inspector beside it. It renders the page's
 * content pane and aside, so it sits directly inside a PageLayout.
 */
export function ProjectPane({
  data,
  loading = false,
  error,
  onRetry,
  editor,
  sharing,
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
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  /** Project name and description editor, shown to editors in Settings. */
  editor: ReactNode;
  /** Project access, shown in Settings. */
  sharing: ReactNode;
  renderTaskForm: (
    detail: ProjectDetail,
    parentTaskEntityId: string | undefined,
    onSaved: (id: string) => void,
    onCancel: () => void,
    status?: TaskStatus,
  ) => ReactNode;
  renderTaskDetail: (
    detail: ProjectDetail,
    task: Task,
    onClose: () => void,
    onSubtask: () => void,
    onSelectTask: (id: string) => void,
    onDirtyChange: (dirty: boolean) => void,
  ) => ReactNode;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  onTaskStatusChange: (task: Task, status: TaskStatus) => void;
  headerActions?: ReactNode;
  context?: ReactNode;
  statusPending?: boolean;
}) {
  const [tab, setTab] = useState("tasks");
  const [view, setView] = useState<"list" | "board">("list");
  const [taskDirty, setTaskDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const lastInspectorFocus = useRef<HTMLElement | null>(null);
  const restoreDestination = useRef(false);
  const detail = isAccessFailure(error) ? undefined : data;
  const { panel, inspector, newTaskButton, restoreFocus } = useTaskPanel({
    selectedTaskId,
    onSelectTask,
    ready: !!detail,
  });
  if (!detail)
    return (
      <PageContent>
        {loading ? (
          <ProjectLoading />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
            <ErrorState
              title={isAccessFailure(error) ? "Project unavailable" : "Couldn’t load project"}
              description={
                isAccessFailure(error)
                  ? "This project was removed or you no longer have access."
                  : undefined
              }
              onRetry={isAccessFailure(error) ? undefined : onRetry}
            />
          </div>
        )}
      </PageContent>
    );
  const canEdit = detail.level === "edit" || detail.level === "owner";
  const { selectedTaskId: openTaskId } = panel;
  const selected = detail.tasks.find((task) => task.entityId === openTaskId);
  const tasksById = new Map(detail.tasks.map((task) => [task.entityId, task] as const));
  const creatingParent = panel.creating?.parentTaskEntityId;
  return (
    <>
      <PageContent>
        <Tabs
          value={tab}
          onValueChange={(next) => {
            if (tab === "tasks" && next !== "tasks" && taskDirty) setPendingTab(next);
            else setTab(next);
          }}
          className="min-h-0 min-w-0 flex-1"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b px-6 pt-5">
              <PageHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <ProjectIcon image={detail.project.image} className="size-6" />
                    <span>{detail.project.name}</span>
                  </span>
                }
                description={
                  detail.project.description && (
                    <span
                      className="line-clamp-2 wrap-break-word whitespace-pre-wrap"
                      title={detail.project.description}
                    >
                      {detail.project.description}
                    </span>
                  )
                }
                actions={
                  <div role="group" aria-label="Project actions" className="flex gap-0.5">
                    {headerActions}
                    {canEdit && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            ref={newTaskButton}
                            size="icon-sm"
                            variant="ghost"
                            aria-label="New task"
                            onClick={() => panel.create()}
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pb-1">
                <TabsList ref={tabsRef} variant="line" className="-ml-1.5">
                  <TabsTrigger value="tasks" className="flex-none">
                    Tasks
                  </TabsTrigger>
                  <TabsTrigger value="discussions" className="flex-none">
                    Discussions
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="flex-none">
                    Settings
                  </TabsTrigger>
                </TabsList>
                {tab === "tasks" && (
                  <SegmentedControl
                    aria-label="Task view"
                    value={view}
                    options={viewOptions}
                    onValueChange={setView}
                  />
                )}
              </div>
            </div>
            {error && (
              <p role="status" className="border-b px-6 py-2 text-xs text-muted-foreground">
                This project may be out of date.
              </p>
            )}
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
          renderTaskDetail(
            detail,
            selected,
            panel.close,
            () => panel.createSubtask(selected.entityId),
            panel.select,
            setTaskDirty,
          )
        ) : (
          <>
            <header className="flex h-12 shrink-0 items-center justify-end border-b px-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close task"
                    onClick={panel.close}
                  >
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
        )}
      </TaskAside>
      {panel.creating && canEdit && (
        <TaskCreationDialog
          subtask={!!creatingParent}
          projectName={detail.project.name}
          parentTitle={creatingParent ? tasksById.get(creatingParent)?.title : undefined}
          onCancel={panel.cancel}
          onRestoreFocus={restoreFocus}
        >
          {renderTaskForm(
            detail,
            creatingParent,
            (id) => {
              setTab("tasks");
              panel.saved(id);
            },
            panel.cancel,
            panel.creating.status,
          )}
        </TaskCreationDialog>
      )}
      {pendingTab && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          description="Your task edits or comment haven’t been saved."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          pendingLabel="Discarding…"
          destructive
          onClose={() => setPendingTab(null)}
          onRestoreFocus={() => {
            if (restoreDestination.current) {
              restoreDestination.current = false;
              tabsRef.current?.querySelector<HTMLElement>('[data-state="active"]')?.focus();
            } else if (lastInspectorFocus.current?.isConnected) {
              lastInspectorFocus.current.focus();
            } else {
              inspector.current?.focus();
            }
          }}
          onConfirm={() => {
            restoreDestination.current = true;
            setTaskDirty(false);
            setTab(pendingTab);
            setPendingTab(null);
          }}
        />
      )}
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
