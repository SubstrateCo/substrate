import { projectCapabilities } from "@substrate/contracts/access/capabilities";
import { assignableActors } from "@substrate/contracts/tasks/project-access";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRef, useState } from "react";

import { ProjectPickerSheet } from "./project-picker-sheet";
import { TaskForm, type TaskDraft } from "./task-form";
import { newRequestId } from "@/features/records/format";
import { refreshRecords } from "@/features/records/invalidation";
import { recordQueries, useRecordScope } from "@/features/records/queries";
import { taskApi } from "@/features/records/tasks/task-api";
import type { OnOpenRecord } from "@/features/records/types";
import { ConfirmSheet, PickerSheet } from "@/features/records/ui/sheet";
import { ErrorState, LoadingRows } from "@/features/records/ui/states";

export function SourceTaskForm({
  organizationId,
  messageId,
  onOpenRecord,
  onClose,
}: {
  organizationId: string;
  messageId: string;
  onOpenRecord: OnOpenRecord;
  onClose: () => void;
}) {
  const scope = useRecordScope(organizationId);
  const client = useQueryClient();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const selecting = useRef(false);
  const project = useQuery(recordQueries.project(scope, projectId ?? undefined));
  const projectEditable =
    !!project.data &&
    projectCapabilities({
      level: project.data.level,
      archived: !!project.data.project.archivedAt,
    }).canEdit;
  const write = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!projectId || !draft || !projectEditable)
        throw new Error("Choose a project you can edit.");
      const fingerprint = JSON.stringify({ projectId, ...draft });
      if (request.current?.fingerprint !== fingerprint)
        request.current = { fingerprint, id: newRequestId() };
      return taskApi.fromMessage({
        organizationId,
        messageId,
        requestId: request.current.id,
        projectEntityId: projectId,
        ...draft,
      });
    },
    onSuccess: async (task) => {
      await refreshRecords(client, scope);
      onOpenRecord({ kind: "task", id: task.entityId, projectId: projectId! });
      onClose();
    },
  });
  if (!projectId)
    return (
      <ProjectPickerSheet
        scope={scope}
        title="Create task in project"
        onSelect={(id) => {
          selecting.current = true;
          setProjectId(id);
        }}
        onClose={() => {
          if (selecting.current) selecting.current = false;
          else onClose();
        }}
      />
    );
  if (!project.data || project.error)
    return (
      <PickerSheet
        title="Project"
        value={null}
        choices={[]}
        onSelect={() => {}}
        onClose={onClose}
        footer={
          project.error ? (
            <ErrorState
              compact
              error={project.error}
              noun="this project"
              onRetry={() => void project.refetch()}
            />
          ) : (
            <LoadingRows label="Loading project" />
          )
        }
      />
    );
  if (!projectEditable)
    return (
      <PickerSheet
        title="Project is read-only"
        value={null}
        choices={[{ value: "choose", label: "Choose another project" }]}
        onSelect={() => {
          selecting.current = true;
          setProjectId(null);
        }}
        onClose={() => {
          if (selecting.current) selecting.current = false;
          else onClose();
        }}
      />
    );
  return (
    <>
      <TaskForm
        actors={assignableActors(project.data)}
        pending={write.isPending}
        error={write.error}
        onSubmit={setDraft}
        onClose={onClose}
      />
      {draft ? (
        <ConfirmSheet
          title={`Create task in ${project.data.project.name}?`}
          description="Project readers will see the task title and description. The task keeps a link to the source message; message access does not change."
          confirmLabel="Create task"
          pending={write.isPending}
          error={write.error}
          onCancel={() => setDraft(null)}
          onConfirm={() => write.mutate()}
        />
      ) : null}
    </>
  );
}
