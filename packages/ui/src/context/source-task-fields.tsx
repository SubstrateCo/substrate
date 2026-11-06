import type { ComponentProps } from "react";
import { TaskForm } from "../tasks/task-form";
import { LoadingState } from "../feedback/loading-state";
import { ErrorState } from "../feedback/error-state";
import { isAccessFailure } from "../feedback/request-failure";
import { Button } from "../primitives/button";

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
  if (loading) return <LoadingState label="Loading task fields" variant="compact" />;
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
      {loadError && <ErrorState compact title="Couldn't refresh project" onRetry={onRetry} />}
      <TaskForm {...form} detail={detail} />
    </>
  );
}
