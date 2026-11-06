import { useState, type ReactNode } from "react";
import { Button } from "../primitives/button";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import type { ProjectDetail, Task } from "./types";
import { TaskList } from "./task-list";

export function ProjectPane({
  data,
  loading = false,
  error,
  onRetry,
  renderProjectEditor,
  renderTaskForm,
  renderTaskDetail,
  renderSettings,
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
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ parentTaskEntityId?: string } | null>(null);
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState(false);
  const detail = isAccessFailure(error) ? undefined : data;
  if (!detail)
    return (
      <div className="p-6">
        {loading ? (
          <LoadingState label="Loading project" variant="table" rows={5} />
        ) : (
          <ErrorState
            title={isAccessFailure(error) ? "Project unavailable" : "Couldn’t load project"}
            description={
              isAccessFailure(error)
                ? "This project was removed or you no longer have access."
                : undefined
            }
            onRetry={onRetry}
          />
        )}
      </div>
    );
  const canEdit = detail.level === "edit" || detail.level === "owner";
  const selected = detail.tasks.find((task) => task.entityId === selectedId);
  if (editing && canEdit) return renderProjectEditor(detail, () => setEditing(false));
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold wrap-break-word">{detail.project.name}</h1>
          <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground wrap-break-word">
            {detail.project.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" aria-pressed={settings} onClick={() => setSettings(!settings)}>
            {settings ? "Back to tasks" : "Project settings"}
          </Button>
          {canEdit && (
            <Button
              onClick={() => {
                setCreating({});
                setSettings(false);
              }}
            >
              New task
            </Button>
          )}
        </div>
      </header>
      {error && <ErrorState compact title="Couldn’t refresh project" onRetry={onRetry} />}
      {settings ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {renderSettings(detail)}
          {canEdit && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-2">
          <TaskList
            detail={detail}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setCreating(null);
            }}
          />
          {creating && canEdit ? (
            <div
              key={creating.parentTaskEntityId ?? "root"}
              className="min-w-0 rounded-xl border bg-card p-4 sm:p-6"
            >
              {renderTaskForm(
                detail,
                creating.parentTaskEntityId,
                (id) => {
                  setSelectedId(id);
                  setCreating(null);
                },
                () => setCreating(null),
              )}
            </div>
          ) : selected ? (
            renderTaskDetail(
              detail,
              selected,
              () => setSelectedId(null),
              () => setCreating({ parentTaskEntityId: selected.entityId }),
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
