import type { TaskLinkRelation } from "@substrate/contracts/tasks/links";

import { useQueries } from "@tanstack/react-query";

import { useState } from "react";

import type { Task } from "../types";
import { TaskLinkPicker, TaskLinks as TaskLinksView } from "./task-links-view";
import { blockedTaskIds, taskRelations } from "./task-relations";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { workLink } from "@/lib/navigation/record-links";
import { searchOptions } from "@/queries/context/search";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { useLoadedProject } from "@/queries/tasks/use-project";
import { toast } from "sonner";

/** The task inspector's links section, with the add and remove actions for editors. */
export function TaskLinks({
  task,
  onSelectTask,
}: {
  task: Task;
  onSelectTask: (id: string) => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const { resource, capabilities } = useLoadedProject(organizationId, task.projectEntityId);
  const { canEdit } = capabilities;
  const write = useTasksMutation(organizationId);
  const [open, setOpen] = useState(false);
  const [relation, setRelation] = useState<TaskLinkRelation>("blocked_by");
  const [query, setQuery] = useState("");
  const debounced = useSearchDebounce(query, `${organizationId}:${task.entityId}`);
  // Detach while closed: disabling an observer alone does not abort its active request.
  const queries =
    open && canEdit && !debounced.pending
      ? [searchOptions({ organizationId, query: debounced.query, kind: "task", limit: 20 })]
      : [];
  const search = useQueries({ queries }).at(0);
  const detail = resource.data;
  // The task inspector renders this only for a task in its loaded project.
  if (!detail) return null;
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
            results={(search?.data ?? []).filter((result) => result.id !== task.entityId)}
            loading={debounced.pending || !!search?.isPending}
            searchError={search?.error}
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
