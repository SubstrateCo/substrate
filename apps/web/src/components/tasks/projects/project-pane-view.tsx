import type { TaskStatus } from "@startup-os/contracts/tasks";

import { useState, type ReactNode } from "react";

import { TaskList } from "../list/task-list";
import type { ProjectDetail, Task } from "../types";
import { TaskCreationDialog } from "./pane/task-creation-dialog";
import { useTaskPanel } from "./pane/use-task-panel";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { PageHeader } from "@/components/layout/page-header";
import { PageAside, PageContent } from "@/components/layout/page-layout";
import { ProjectLoading } from "@/components/tasks/projects/project-loading";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Unlink, X } from "lucide-react";

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
  ) => ReactNode;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  onTaskStatusChange: (task: Task, status: TaskStatus) => void;
  headerActions?: ReactNode;
  context?: ReactNode;
}) {
  const [tab, setTab] = useState("tasks");
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
              title={isAccessFailure(error) ? "Project unavailable" : "Couldn't load project"}
              description={
                isAccessFailure(error)
                  ? "This project was removed or you no longer have access."
                  : undefined
              }
              onRetry={onRetry}
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
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 min-w-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b px-6 pt-5">
              <PageHeader
                title={detail.project.name}
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
              <TabsList variant="line" className="mt-3 -ml-1.5">
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
              <div className="max-w-3xl p-6">{context}</div>
            </TabsContent>
            <TabsContent value="settings" className="min-h-0 overflow-y-auto">
              <div className="grid max-w-3xl min-w-0 gap-6 p-6">
                {canEdit && editor}
                {sharing}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </PageContent>
      {openTaskId && tab === "tasks" && (
        <PageAside ref={inspector} tabIndex={-1} aria-label="Task" className="outline-none">
          {selected ? (
            renderTaskDetail(
              detail,
              selected,
              panel.close,
              () => panel.createSubtask(selected.entityId),
              panel.select,
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
        </PageAside>
      )}
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
    </>
  );
}
