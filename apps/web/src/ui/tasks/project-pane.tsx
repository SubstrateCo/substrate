import { useState, type ReactNode } from "react";

import { ProjectSettings } from "./project-pane/project-settings";
import { ProjectTaskPanel, type TaskPanelRenderers } from "./project-pane/project-task-panel";
import { useProjectEditor } from "./project-pane/use-project-editor";
import { useTaskPanel } from "./project-pane/use-task-panel";
import type { ProjectDetail } from "./types";
import { ErrorState } from "@/ui/feedback/error-state";
import { isAccessFailure } from "@/ui/feedback/request-failure";
import { Button } from "@/ui/primitives/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/primitives/tabs";
import { ProjectLoading } from "@/ui/tasks/project-loading";
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
  renderProjectEditor: (detail: ProjectDetail, onDone: () => void) => ReactNode;
  renderTaskForm: TaskPanelRenderers["form"];
  renderTaskDetail: TaskPanelRenderers["detail"];
  renderSettings: (detail: ProjectDetail) => ReactNode;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  headerActions?: ReactNode;
  context?: ReactNode;
}) {
  const [settings, setSettings] = useState(false);
  const { panel, inspector, viewport, newTaskButton } = useTaskPanel({
    selectedTaskId,
    onSelectTask,
  });
  const { editor, editButton } = useProjectEditor(settings);
  const detail = isAccessFailure(error) ? undefined : data;
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
      <Tabs
        value={settings ? "settings" : "tasks"}
        onValueChange={(value) => setSettings(value === "settings")}
        className="min-h-0 min-w-0 flex-1"
      >
        <header className="mb-3 flex shrink-0 flex-wrap items-start gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <h1
              className="line-clamp-2 text-xl font-semibold wrap-break-word"
              title={detail.project.name}
            >
              {detail.project.name}
            </h1>
          </div>
          <div className="flex max-w-full shrink-0 flex-wrap gap-2">
            {headerActions}
            {canEdit && (
              <Button
                ref={newTaskButton}
                onClick={() => {
                  panel.create();
                  setSettings(false);
                }}
              >
                <Plus aria-hidden="true" /> New task
              </Button>
            )}
          </div>
          <p
            className="line-clamp-2 w-full text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground"
            title={detail.project.description}
          >
            {detail.project.description}
          </p>
        </header>
        <div className="shrink-0 border-b pb-2">
          <TabsList variant="line" className="w-full justify-start">
            <TabsTrigger value="tasks" className="flex-none">
              Tasks
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex-none">
              Project settings
            </TabsTrigger>
          </TabsList>
        </div>
        {context}
        {error && <ErrorState compact title="Couldn’t refresh project" onRetry={onRetry} />}
        <TabsContent
          value="settings"
          forceMount
          hidden={!settings}
          className="mt-3 min-h-0 overflow-y-auto"
        >
          <ProjectSettings
            detail={detail}
            canEdit={canEdit}
            editor={editor}
            editButtonRef={editButton}
            renderEditor={renderProjectEditor}
            renderSettings={renderSettings}
          />
        </TabsContent>
        <TabsContent
          ref={viewport}
          value="tasks"
          forceMount
          hidden={settings}
          className="mt-3 min-h-0 overflow-y-auto md:overflow-hidden"
        >
          <ProjectTaskPanel
            detail={detail}
            canEdit={canEdit}
            panel={panel}
            inspectorRef={inspector}
            renderers={{ form: renderTaskForm, detail: renderTaskDetail }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
