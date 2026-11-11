import type { TaskLinkRelation } from "@substrate/contracts/tasks/links";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import type { ProjectDetail, Task } from "../types";
import { TaskLinkPicker, TaskLinks as TaskLinksView } from "./task-links-view";
import { blockedTaskIds, taskRelations } from "./task-relations";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { workHref } from "@/lib/navigation/record-links";
import { searchOptions } from "@/queries/context/search";
import { useTasksMutation } from "@/queries/tasks/mutations";

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
  const canEdit = detail.level === "edit" || detail.level === "owner";
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
  return (
    <TaskLinksView
      relations={taskRelations(detail.links, task.entityId)}
      projectEntityId={detail.project.entityId}
      blocked={blockedTaskIds(detail.links, detail.tasks).has(task.entityId)}
      onSelect={onSelectTask}
      hrefFor={(other) => workHref(organizationId, other.projectEntityId, other.entityId)}
      pending={write.isPending}
      error={write.error}
      onRemove={
        canEdit
          ? (linkId) => write.mutate({ ...target, action: "removeTaskLink", linkId })
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
              write.mutate({ ...target, action: "addTaskLink", relation, otherTaskEntityId });
            }}
          />
        )
      }
    />
  );
}
