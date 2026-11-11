import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { TaskMoveDialog as TaskMoveDialogView } from "./task-move-dialog-view";
import type { ProjectDetail, Task } from "@/components/tasks/types";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { projectQueryOptions, projectsQueryOptions } from "@/queries/tasks/options";

export function TaskMoveDialog({
  organizationId,
  detail,
  task,
  onClose,
  onRestoreFocus,
}: {
  organizationId: string;
  detail: ProjectDetail;
  task: Task;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const [projectId, setProjectId] = useState(detail.project.entityId);
  const [parentId, setParentId] = useState(task.parentTaskEntityId ?? "none");
  const projects = useQuery(projectsQueryOptions(organizationId));
  const destination = useQuery(projectQueryOptions(organizationId, projectId));
  const move = useTasksMutation(organizationId);
  const navigate = useNavigate();
  const excluded = new Set([task.entityId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const candidate of detail.tasks) {
      if (
        candidate.parentTaskEntityId &&
        excluded.has(candidate.parentTaskEntityId) &&
        !excluded.has(candidate.entityId)
      ) {
        excluded.add(candidate.entityId);
        changed = true;
      }
    }
  }
  const canEdit = destination.data?.level === "owner" || destination.data?.level === "edit";
  return (
    <TaskMoveDialogView
      title={task.title}
      projectId={projectId}
      parentId={parentId}
      projects={projects.data ?? [detail.project]}
      parents={
        destination.data?.tasks.filter((candidate) => !excluded.has(candidate.entityId)) ?? []
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
      onSubmit={() => {
        void move
          .mutateAsync({
            action: "moveTask",
            organizationId,
            projectEntityId: detail.project.entityId,
            taskEntityId: task.entityId,
            destinationProjectEntityId: projectId,
            parentTaskEntityId: parentId === "none" ? null : parentId,
          })
          .then(() =>
            navigate({
              to: "/tasks",
              search: { workspaceId: organizationId, projectId, taskId: task.entityId },
            }),
          )
          .then(onClose)
          .catch(() => {});
      }}
    />
  );
}
