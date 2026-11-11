import type { TaskLinkRelation } from "@substrate/contracts/tasks/links";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import type { ProjectDetail, Task } from "../types";
import { TaskLinkPicker, TaskLinks as TaskLinksView } from "./task-links-view";
import { blockedTaskIds, taskRelations } from "./task-relations";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { workLink } from "@/lib/navigation/record-links";
import { projectCapabilities } from "@/lib/tasks/project-capabilities";
import { searchOptions } from "@/queries/context/search";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { toast } from "sonner";

/** The task inspector's links section, with the add and remove actions for editors. */
export function TaskLinks({
  organizationId,
  detail,
  task,
  onSelectTask,
}: {
  organizationId: string;
  detail: ProjectDetail;
  task: Task;
  onSelectTask: (id: string) => void;
}) {
  const { canEdit } = projectCapabilities(detail.level);
  const write = useTasksMutation(organizationId);
  const [open, setOpen] = useState(false);
  const [relation, setRelation] = useState<TaskLinkRelation>("blocked_by");
  const [query, setQuery] = useState("");
  const debounced = useSearchDebounce(query, `${organizationId}:${task.entityId}`);
  const search = useQuery({
    ...searchOptions({ organizationId, query: debounced.query, kind: "task", limit: 20 }),
    enabled: open && canEdit && !debounced.pending,
  });
  const target = {
    organizationId,
    projectEntityId: detail.project.entityId,
    taskEntityId: task.entityId,
  };
  const linkFailed = (error: Error) =>
    toast.error(actionErrorMessage(error, "Couldn’t change the links. Try again."));
  return (
    <TaskLinksView
      relations={taskRelations(detail.links, task.entityId)}
      projectEntityId={detail.project.entityId}
      blocked={blockedTaskIds(detail.links, detail.tasks).has(task.entityId)}
      onSelect={onSelectTask}
      linkFor={(other) => workLink(organizationId, other.projectEntityId, other.entityId)}
      pending={write.isPending}
      onRemove={
        canEdit
          ? (linkId) =>
              write.mutate({ ...target, action: "removeTaskLink", linkId }, { onError: linkFailed })
          : undefined
      }
      add={
        canEdit && (
          <TaskLinkPicker
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setQuery("");
            }}
            relation={relation}
            onRelationChange={setRelation}
            query={query}
            onQueryChange={setQuery}
            results={(search.data ?? []).filter((result) => result.id !== task.entityId)}
            loading={debounced.pending || search.isPending}
            searchError={search.error}
            pending={write.isPending}
            onPick={(otherTaskEntityId) => {
              setOpen(false);
              setQuery("");
              write.mutate(
                { ...target, action: "addTaskLink", relation, otherTaskEntityId },
                { onError: linkFailed },
              );
            }}
          />
        )
      }
    />
  );
}
