import type { ComponentProps } from "react";

import { ErrorState } from "../../feedback/error-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { TaskFormLoading } from "../../tasks/editor/task-form-loading";
import { TaskForm } from "../../tasks/editor/task-form-view";
import { Button } from "../../ui/button";

export function SourceTaskFields({
  detail,
  loading,
  loadError,
  onRetry,
  ...form
}: Omit<ComponentProps<typeof TaskForm>, "detail"> & {
  detail?: ComponentProps<typeof TaskForm>["detail"];
  loading: boolean;
  loadError?: Error | null;
  onRetry: () => void;
}) {
  if (loading && !detail && !isAccessFailure(loadError))
    return <TaskFormLoading hasSourceText={!!form.sourceText} />;
  if (!detail || isAccessFailure(loadError))
    return (
      <>
        <ErrorState compact title="Project unavailable" onRetry={onRetry} />
        <Button variant="ghost" onClick={form.onCancel}>
          Cancel
        </Button>
      </>
    );
  return (
    <>
      {loadError && (
        <p role="status" className="text-xs text-muted-foreground">
          Project may be out of date.
        </p>
      )}
      <TaskForm {...form} detail={detail} />
    </>
  );
}
