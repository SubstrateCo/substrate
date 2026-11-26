import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { descendantIds } from "../links/task-relations";
import { TaskMoveDialog as TaskMoveDialogView } from "./task-move-dialog-view";
import type { Task } from "@/components/tasks/types";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { resourceState } from "@/lib/resource-state";
import { projectCapabilities } from "@/lib/tasks/project-capabilities";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { projectQueryOptions, projectsQueryOptions } from "@/queries/tasks/options";
import { useLoadedProject } from "@/queries/tasks/use-project";

export function TaskMoveDialog({
  task,
  onClose,
  onRestoreFocus,
}: {
  task: Task;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const source = useLoadedProject(organizationId, task.projectEntityId).resource.data;
  const [projectId, setProjectId] = useState(task.projectEntityId);
  const [parentId, setParentId] = useState(task.parentTaskEntityId ?? "none");
  const projects = useQuery(projectsQueryOptions(organizationId));
  const destination = useQuery(projectQueryOptions(organizationId, projectId));
  const move = useTasksMutation(organizationId);
  const navigate = useNavigate();
  const destinationResource = resourceState(destination);
  const { canEdit } = projectCapabilities(
    destinationResource.data?.level,
    !!destinationResource.data?.project.archivedAt,
  );
  // The task inspector opens this only for a task in its loaded project.
  if (!source) return null;
  // A task can't move under itself or its own subtasks.
  const excluded = descendantIds(source.tasks, task.entityId).add(task.entityId);
  return (
    <TaskMoveDialogView
      title={task.title}
      projectId={projectId}
      parentId={parentId}
      projects={resourceState(projects).data ?? [source.project]}
      parents={
        destinationResource.data?.tasks.filter((candidate) => !excluded.has(candidate.entityId)) ??
        []
      }
      loading={destination.isPending}
      loadError={projects.error ?? destination.error}
      canEdit={canEdit}
      pending={move.isPending}
      error={move.error}
      unchanged={
        projectId === task.projectEntityId &&
        (parentId === "none" ? null : parentId) === task.parentTaskEntityId
      }
      changesAccess={projectId !== task.projectEntityId}
      onProjectChange={(id) => {
        move.reset();
        setProjectId(id);
        setParentId("none");
      }}
      onParentChange={(id) => {
        move.reset();
        setParentId(id);
      }}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onRetry={() => {
        void projects.refetch();
        void destination.refetch();
      }}
      onSubmit={() =>
        move.mutate(
          {
            action: "moveTask",
            organizationId,
            projectEntityId: task.projectEntityId,
            taskEntityId: task.entityId,
            destinationProjectEntityId: projectId,
            parentTaskEntityId: parentId === "none" ? null : parentId,
          },
          {
            onSuccess: () =>
              void navigate({
                to: "/tasks",
                search: { workspaceId: organizationId, projectId, taskId: task.entityId },
              }).then(onClose),
          },
        )
      }
    />
  );
}
