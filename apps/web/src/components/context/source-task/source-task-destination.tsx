import { useState, type ReactNode } from "react";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { TaskSelect } from "../../tasks/task-select";
import { Button } from "../../ui/button";
import { Empty, EmptyDescription } from "../../ui/empty";
import { FolderKanban } from "lucide-react";

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
    <div className="min-w-0">
      <div className="space-y-3 px-4 pb-3">
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
            compact
            placeholder="Choose a project"
            icon={<FolderKanban aria-hidden className="size-3.5 text-primary" />}
            value={projectId}
            onChange={setProjectId}
            options={available.map((project) => ({ value: project.id, label: project.title }))}
          />
        )}
      </div>
      {projectId && !isAccessFailure(error) ? (
        renderFields(projectId)
      ) : (
        <Button variant="ghost" className="mx-4 mb-3" onClick={onClose}>
          Cancel
        </Button>
      )}
    </div>
  );
}
