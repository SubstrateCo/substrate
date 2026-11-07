import { useState, type ReactNode } from "react";

import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import { TaskSelect } from "../tasks/task-select";
import { Button } from "../ui/button";
import { Empty, EmptyDescription } from "../ui/empty";

export function SourceTaskDestination({
  projects,
  loading,
  error,
  onRetry,
  onClose,
  renderFields,
}: {
  projects: { id: string; title: string }[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onClose: () => void;
  renderFields: (projectId: string) => ReactNode;
}) {
  const [projectId, setProjectId] = useState("");
  const available = isAccessFailure(error) ? [] : projects;
  return (
    <>
      {loading && !available.length && (
        <LoadingState label="Loading editable projects" variant="compact" />
      )}
      {error && <ErrorState compact title="Couldn't load projects" onRetry={onRetry} />}
      {!loading && !error && !available.length && (
        <Empty>
          <EmptyDescription>
            No editable projects. Create a project or ask its owner for edit access.
          </EmptyDescription>
        </Empty>
      )}
      {!!available.length && (
        <TaskSelect
          label="Destination project"
          value={projectId}
          onChange={setProjectId}
          options={available.map((project) => ({ value: project.id, label: project.title }))}
        />
      )}
      {projectId && !isAccessFailure(error) ? (
        renderFields(projectId)
      ) : (
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      )}
    </>
  );
}
