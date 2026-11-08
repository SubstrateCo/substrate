import { useState, type ReactNode } from "react";

import type { ProjectDetail } from "../types";
import { ProjectTaskPanel, type TaskPanelRenderers } from "./pane/project-task-panel";
import { TaskCreationDialog } from "./pane/task-creation-dialog";
import { useTaskPanel } from "./pane/use-task-panel";
import { ErrorState } from "@/components/feedback/error-state";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { ProjectLoading } from "@/components/tasks/projects/project-loading";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus } from "lucide-react";

export function ProjectPane({
  data,
  loading = false,
  error,
  onRetry,
  renderProjectEditor,
  renderTaskForm,
  renderTaskDetail,
  renderSettings,
  selectedTaskId,
  onSelectTask,
  headerActions,
  context,
}: {
  data?: ProjectDetail;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  renderProjectEditor: (detail: ProjectDetail) => ReactNode;
  renderTaskForm: TaskPanelRenderers["form"];
  renderTaskDetail: TaskPanelRenderers["detail"];
  renderSettings: (detail: ProjectDetail) => ReactNode;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  headerActions?: ReactNode;
  context?: ReactNode;
}) {
  const [tab, setTab] = useState("tasks");
  const detail = isAccessFailure(error) ? undefined : data;
  const { panel, inspector, viewport, newTaskButton, restoreFocus } = useTaskPanel({
    selectedTaskId,
    onSelectTask,
    ready: !!detail,
  });
  if (!detail) {
    if (loading) return <ProjectLoading />;
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <ErrorState
          title={isAccessFailure(error) ? "Project unavailable" : "Couldn’t load project"}
          description={
            isAccessFailure(error)
              ? "This project was removed or you no longer have access."
              : undefined
          }
          onRetry={onRetry}
        />
      </div>
    );
  }
  const canEdit = detail.level === "edit" || detail.level === "owner";
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 sm:p-6">
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 min-w-0 flex-1">
        <header className="mb-3 flex shrink-0 flex-wrap items-start gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <h1
              className="line-clamp-2 text-xl font-semibold wrap-break-word"
              title={detail.project.name}
            >
              {detail.project.name}
            </h1>
          </div>
          <ButtonGroup aria-label="Project actions" className="relative shrink-0">
            {headerActions}
            {canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    ref={newTaskButton}
                    size="icon"
                    variant="outline"
                    aria-label="New task"
                    onClick={() => {
                      panel.create();
                    }}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New task</TooltipContent>
              </Tooltip>
            )}
          </ButtonGroup>
          <p
            className="line-clamp-2 w-full text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground"
            title={detail.project.description}
          >
            {detail.project.description}
          </p>
        </header>
        <div className="shrink-0 border-b pb-2">
          <TabsList variant="line">
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
          <p role="status" className="py-2 text-xs text-muted-foreground">
            Project may be out of date.
          </p>
        )}
        <TabsContent
          value="settings"
          forceMount
          hidden={tab !== "settings"}
          className="mt-3 min-h-0 overflow-y-auto"
        >
          <div className="w-full min-w-0 space-y-6">
            {canEdit && renderProjectEditor(detail)}
            {renderSettings(detail)}
          </div>
        </TabsContent>
        <TabsContent value="discussions" className="mt-3 min-h-0 overflow-y-auto">
          {context}
        </TabsContent>
        <TabsContent
          ref={viewport}
          value="tasks"
          forceMount
          hidden={tab !== "tasks"}
          className="mt-3 min-h-0 overflow-y-auto md:overflow-hidden"
        >
          <ProjectTaskPanel
            visible={tab === "tasks"}
            detail={detail}
            canEdit={canEdit}
            panel={panel}
            inspectorRef={inspector}
            renderers={{ form: renderTaskForm, detail: renderTaskDetail }}
          />
        </TabsContent>
      </Tabs>
      {panel.creating && canEdit && (
        <TaskCreationDialog
          subtask={!!panel.creating.parentTaskEntityId}
          projectName={detail.project.name}
          onCancel={panel.cancel}
          onRestoreFocus={restoreFocus}
        >
          {renderTaskForm(
            detail,
            panel.creating.parentTaskEntityId,
            (id) => {
              setTab("tasks");
              panel.saved(id);
            },
            panel.cancel,
            panel.creating.status,
          )}
        </TaskCreationDialog>
      )}
    </div>
  );
}
