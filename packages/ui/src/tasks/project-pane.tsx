import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "../primitives/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../primitives/tabs";
import { ContentNotice } from "../feedback/content-notice";
import { ErrorState } from "../feedback/error-state";
import { isAccessFailure } from "../feedback/request-failure";
import type { ProjectDetail, Task } from "./types";
import { TaskList } from "./task-list";
import { ProjectLoading } from "@startup-os/ui/tasks/project-loading";

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
  renderTaskForm: (
    detail: ProjectDetail,
    parentTaskEntityId: string | undefined,
    onSaved: (id: string) => void,
    onCancel: () => void,
  ) => ReactNode;
  renderTaskDetail: (
    detail: ProjectDetail,
    task: Task,
    onClose: () => void,
    onSubtask: () => void,
  ) => ReactNode;
  renderSettings: (detail: ProjectDetail) => ReactNode;
  selectedTaskId?: string | null;
  onSelectTask?: (id: string | null) => void;
  headerActions?: ReactNode;
  context?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{
    parentTaskEntityId?: string;
  } | null>(null);
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState(false);
  const [restore, setRestore] = useState(0);
  const inspector = useRef<HTMLDivElement>(null);
  const taskViewport = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const newTaskButton = useRef<HTMLButtonElement>(null);
  const effectiveId = selectedTaskId === undefined ? selectedId : selectedTaskId;
  const previousId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if ((creating || effectiveId) && (creating || effectiveId !== previousId.current)) {
      const target = creating
        ? inspector.current?.querySelector<HTMLInputElement>("input")
        : inspector.current;
      if (inspector.current) inspector.current.scrollTop = 0;
      if (taskViewport.current) taskViewport.current.scrollTop = 0;
      target?.focus({ preventScroll: true });
    }
    previousId.current = effectiveId;
  }, [creating, effectiveId]);
  useEffect(() => {
    if (restore) (trigger.current?.isConnected ? trigger.current : newTaskButton.current)?.focus();
  }, [restore]);
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
  const selected = detail.tasks.find((task) => task.entityId === effectiveId);
  if (editing && canEdit)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {renderProjectEditor(detail, () => setEditing(false))}
      </div>
    );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 sm:p-6">
      <Tabs
        value={settings ? "settings" : "tasks"}
        onValueChange={(value) => setSettings(value === "settings")}
        className="min-h-0 min-w-0 flex-1"
      >
        <header className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="line-clamp-2 text-xl font-semibold wrap-break-word"
              title={detail.project.name}
            >
              {detail.project.name}
            </h1>
            <p
              className="mt-1 line-clamp-2 max-w-3xl text-sm whitespace-pre-wrap text-muted-foreground wrap-break-word"
              title={detail.project.description}
            >
              {detail.project.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {headerActions}
            {canEdit && (
              <Button
                ref={newTaskButton}
                onClick={() => {
                  trigger.current = newTaskButton.current;
                  setCreating({});
                  setSettings(false);
                }}
              >
                <Plus aria-hidden="true" /> New task
              </Button>
            )}
          </div>
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
          <div className="flex max-w-2xl min-w-0 flex-col items-start gap-4">
            {renderSettings(detail)}
            {canEdit && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit project
              </Button>
            )}
          </div>
        </TabsContent>
        <TabsContent
          ref={taskViewport}
          value="tasks"
          forceMount
          hidden={settings}
          className="mt-3 min-h-0 overflow-y-auto md:overflow-hidden"
        >
          <div
            className={`grid min-h-0 min-w-0 grid-cols-1 items-start gap-5 md:h-full ${creating || selected || selectedTaskId ? "md:grid-cols-2" : ""}`}
          >
            <TaskList
              detail={detail}
              selectedId={effectiveId}
              onSelect={(id) => {
                trigger.current =
                  document.activeElement instanceof HTMLElement ? document.activeElement : null;
                setSelectedId(id);
                onSelectTask?.(id);
                setCreating(null);
              }}
            />
            {(creating || selected || selectedTaskId) && (
              <div
                ref={inspector}
                tabIndex={-1}
                aria-label={creating ? "Task form panel" : "Selected task panel"}
                className="order-first min-h-0 min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring md:order-0 md:h-full md:overflow-y-auto"
              >
                {creating && canEdit && (
                  <div
                    key={creating.parentTaskEntityId ?? "root"}
                    className="min-w-0 rounded-xl border bg-card p-4 sm:p-6"
                  >
                    {renderTaskForm(
                      detail,
                      creating.parentTaskEntityId,
                      (id) => {
                        setSelectedId(id);
                        onSelectTask?.(id);
                        setCreating(null);
                        setRestore((count) => count + 1);
                      },
                      () => {
                        setCreating(null);
                        setRestore((count) => count + 1);
                      },
                    )}
                  </div>
                )}
                {!(creating && canEdit) &&
                  selected &&
                  renderTaskDetail(
                    detail,
                    selected,
                    () => {
                      setSelectedId(null);
                      onSelectTask?.(null);
                      setRestore((count) => count + 1);
                    },
                    () => setCreating({ parentTaskEntityId: selected.entityId }),
                  )}
                {selectedTaskId && !selected && (
                  <ContentNotice
                    title="Task unavailable"
                    description="This task was removed or you no longer have access. Choose another task to continue."
                  />
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
