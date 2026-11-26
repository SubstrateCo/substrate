import { projectCapabilities } from "@substrate/contracts/access/capabilities";

import { useQuery } from "@tanstack/react-query";

import { useRef, useState } from "react";

import { moveParentChoices } from "./task-access";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { recordQueries } from "@/features/records/queries";
import { ConfirmSheet, PickerSheet } from "@/features/records/ui/sheet";
import { ErrorState } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";

export function TaskMove({
  scope,
  currentProjectId,
  taskId,
  pending,
  error,
  onSave,
  onClose,
}: {
  scope: QueryScope;
  currentProjectId: string;
  taskId: string;
  pending: boolean;
  error: Error | null;
  onSave: (projectId: string, parentTaskId: string | null) => void;
  onClose: () => void;
}) {
  const projects = useQuery(recordQueries.projects(scope));
  const [destination, setDestination] = useState<string | null>(null);
  const [parent, setParent] = useState<string | null | undefined>(undefined);
  const changing = useRef(false);
  const detail = useQuery(recordQueries.project(scope, destination ?? undefined));
  const closePicker = () => {
    if (changing.current) changing.current = false;
    else onClose();
  };
  if (!destination)
    return (
      <PickerSheet
        title="Move to project"
        searchable
        value={null}
        loading={projects.isPending}
        choices={(projects.error ? [] : (projects.data ?? [])).map((project) => ({
          value: project.entityId,
          label: project.name,
          description:
            project.entityId === currentProjectId ? "Change parent in this project" : undefined,
        }))}
        onSelect={(id) => {
          changing.current = true;
          setDestination(id);
        }}
        onClose={closePicker}
        footer={
          projects.error ? (
            <ErrorState
              compact
              error={projects.error}
              noun="projects"
              onRetry={() => void projects.refetch()}
            />
          ) : undefined
        }
      />
    );
  const project = detail.error ? undefined : detail.data;
  const writable =
    !!project &&
    projectCapabilities({ level: project.level, archived: !!project.project.archivedAt }).canEdit;
  if (parent === undefined || !writable)
    return (
      <PickerSheet
        title={project && !writable ? "Project is read-only" : "Choose parent task"}
        searchable
        value={null}
        loading={detail.isPending}
        choices={
          writable
            ? [
                { value: "root", label: "No parent task" },
                ...moveParentChoices(project.tasks, taskId).map((task) => ({
                  value: task.entityId,
                  label: task.title,
                })),
              ]
            : []
        }
        onSelect={(id) => {
          changing.current = true;
          setParent(id === "root" ? null : id);
        }}
        onClose={closePicker}
        footer={
          <>
            {detail.error ? (
              <ErrorState
                compact
                error={detail.error}
                noun="this project"
                onRetry={() => void detail.refetch()}
              />
            ) : null}
            <Button
              variant="ghost"
              onPress={() => {
                setDestination(null);
                setParent(undefined);
              }}
            >
              <Text>Choose another project</Text>
            </Button>
          </>
        }
      />
    );
  return (
    <ConfirmSheet
      title={`Move task to ${project.project.name}?`}
      description={
        destination === currentProjectId
          ? "The task and its subtasks keep the same readers. Only the parent changes."
          : "The task and all its subtasks move together. Readers of the destination project gain access; readers of the old project may lose access. Existing assignees must be able to read the destination."
      }
      confirmLabel="Move task"
      pending={pending}
      error={error}
      onCancel={onClose}
      onConfirm={() => onSave(destination, parent)}
    />
  );
}
