import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TaskSelect } from "@startup-os/ui/tasks/task-select";
import { TaskForm } from "@startup-os/ui/tasks/task-form";
import type { TaskDraft } from "@startup-os/ui/tasks/types";
import { Button } from "@startup-os/ui/primitives/button";
import { ErrorState } from "@startup-os/ui/feedback/error-state";
import { LoadingState } from "@startup-os/ui/feedback/loading-state";
import { searchOptions } from "@/queries/context/options";
import { projectQueryOptions } from "@/queries/tasks/options";
import { queryKeys } from "@/queries/keys";
import { createTaskFromMessage } from "@/server/context";
import { workHref } from "@/lib/context-links";

export function CreateSourceTask({
  organizationId,
  messageId,
  body,
  onClose,
}: {
  organizationId: string;
  messageId: string;
  body: string;
  onClose: () => void;
}) {
  const projects = useQuery(
    searchOptions({ organizationId, query: "", kind: "project", editable: true }),
  );
  const [projectId, setProjectId] = useState("");
  const [created, setCreated] = useState<{ entityId: string; projectEntityId: string } | null>(
    null,
  );
  return (
    <section
      aria-label="Create task from message"
      className="space-y-4 rounded-lg border bg-card p-4"
    >
      <h3 className="font-semibold">Create task from message</h3>
      <p className="text-xs text-muted-foreground">
        The source stays private to people who can access this discussion. Creating a task does not
        share it.
      </p>
      <blockquote className="line-clamp-4 border-l-2 pl-3 text-sm whitespace-pre-wrap wrap-anywhere">
        {body.replace(/@\[[^\]]+\]/g, "[Reference]")}
      </blockquote>
      {created ? (
        <div className="space-y-2">
          <p role="status">Task created and linked.</p>
          <a
            className="underline"
            href={workHref(organizationId, created.projectEntityId, created.entityId)}
          >
            Open created task
          </a>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <>
          {projects.isPending && (
            <LoadingState label="Loading editable projects" variant="compact" />
          )}
          {projects.error && (
            <ErrorState
              compact
              title="Couldn’t load projects"
              onRetry={() => void projects.refetch()}
            />
          )}
          {projects.data?.length === 0 && (
            <p>No editable projects. Create a project or ask its owner for edit access.</p>
          )}
          {!!projects.data?.length && (
            <TaskSelect
              label="Destination project"
              value={projectId}
              onChange={setProjectId}
              options={projects.data.map((project) => ({
                value: project.id,
                label: project.title,
              }))}
            />
          )}
          {projectId && (
            <SourceTaskFields
              key={projectId}
              organizationId={organizationId}
              projectId={projectId}
              messageId={messageId}
              sourceText={body.replace(/@\[[^\]]+\]/g, "[Reference]")}
              onSaved={setCreated}
              onClose={onClose}
            />
          )}
          {!projectId && (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function SourceTaskFields({
  organizationId,
  projectId,
  messageId,
  sourceText,
  onSaved,
  onClose,
}: {
  organizationId: string;
  projectId: string;
  messageId: string;
  sourceText: string;
  onSaved: (task: { entityId: string; projectEntityId: string }) => void;
  onClose: () => void;
}) {
  const project = useQuery(projectQueryOptions(organizationId, projectId));
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [lastDraft, setLastDraft] = useState("");
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: ({ draft, id }: { draft: TaskDraft; id: string }) =>
      createTaskFromMessage({
        data: { organizationId, projectEntityId: projectId, messageId, requestId: id, ...draft },
      }),
    onSuccess: async (task) => {
      await client.invalidateQueries({ queryKey: queryKeys.organization(organizationId) });
      onSaved(task);
    },
  });
  if (project.isPending) return <LoadingState label="Loading task fields" variant="compact" />;
  if (project.error)
    return (
      <ErrorState compact title="Project unavailable" onRetry={() => void project.refetch()} />
    );
  return (
    <TaskForm
      detail={project.data}
      sourceText={sourceText}
      pending={save.isPending}
      error={save.error}
      onCancel={onClose}
      onSubmit={(draft) => {
        const fingerprint = JSON.stringify(draft);
        const id = lastDraft && lastDraft !== fingerprint ? crypto.randomUUID() : requestId;
        setLastDraft(fingerprint);
        setRequestId(id);
        save.mutate({ draft, id });
      }}
    />
  );
}
