import type { TasksWrite } from "@substrate/contracts/tasks/input";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { invalidateWorkLabels, staleSearches } from "../context/mutations";
import { queryKeys } from "../keys";
import { mutateTasks, type getProject } from "@/api/tasks/requests";

export function useTasksMutation(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: TasksWrite) => mutateTasks({ data: { ...data, organizationId } }),
    onSuccess: (result, input) =>
      invalidateTasksWrite(client, { ...input, organizationId }, result.id),
  });
}

type ProjectData = Awaited<ReturnType<typeof getProject>>;
type TaskUpdate = Extract<TasksWrite, { action: "updateTask" }>;

/** Replace one task's editable fields in a cached project. */
function patchProjectTask(detail: ProjectData, input: TaskUpdate): ProjectData {
  const { title, description, status, priority, assigneeActorEntityId, dueDate } = input;
  const fields = Object.fromEntries(
    Object.entries({ title, description, status, priority, assigneeActorEntityId, dueDate }).filter(
      ([, value]) => value !== undefined,
    ),
  );
  return {
    ...detail,
    tasks: detail.tasks.map((task) =>
      task.entityId === input.taskEntityId ? { ...task, ...fields } : task,
    ),
  };
}

/**
 * Inline task edits. The cached project changes at once, so a second edit made before the first
 * one finishes starts from the new values instead of overwriting them.
 */
export function useTaskUpdate(organizationId: string, projectEntityId: string) {
  const client = useQueryClient();
  const key = queryKeys.project(organizationId, projectEntityId);
  return useMutation({
    mutationFn: (input: Omit<TaskUpdate, "action" | "organizationId" | "projectEntityId">) =>
      mutateTasks({
        data: { ...input, action: "updateTask", organizationId, projectEntityId },
      }),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ProjectData>(key);
      if (previous)
        client.setQueryData<ProjectData>(
          key,
          patchProjectTask(previous, {
            ...input,
            action: "updateTask",
            organizationId,
            projectEntityId,
          }),
        );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: (_result, _error, input) =>
      invalidateTasksWrite(
        client,
        { ...input, action: "updateTask", organizationId, projectEntityId },
        input.taskEntityId,
      ),
  });
}

export function invalidateTasksWrite(client: QueryClient, input: TasksWrite, id: string) {
  const organizationId = input.organizationId;
  if (
    input.action === "deleteProject" ||
    input.action === "deleteTask" ||
    input.action === "moveTask"
  )
    return Promise.all([
      client.resetQueries({ queryKey: queryKeys.tasks(organizationId) }),
      client.resetQueries({ queryKey: queryKeys.related(organizationId) }),
      client.resetQueries({ queryKey: queryKeys.activity(organizationId) }),
      client.resetQueries({ queryKey: queryKeys.messagePages(organizationId) }),
      client.resetQueries({ queryKey: queryKeys.messageTargets(organizationId) }),
      client.resetQueries({ queryKey: queryKeys.notifications(organizationId) }),
      ...queryKeys.searches(organizationId).map((queryKey) => client.resetQueries({ queryKey })),
    ]);
  if (input.action === "comment")
    return Promise.all([
      client.invalidateQueries({
        queryKey: queryKeys.taskComments(organizationId, input.projectEntityId, id),
      }),
      // The comment may reference any task or project.
      client.invalidateQueries({ queryKey: queryKeys.commentMentions(organizationId) }),
    ]);
  if (input.action === "addTaskLink" || input.action === "removeTaskLink")
    // The other task may be in another cached project, and both tasks get a history row.
    return Promise.all([
      client.invalidateQueries({ queryKey: [...queryKeys.tasks(organizationId), "project"] }),
      client.invalidateQueries({ queryKey: queryKeys.activity(organizationId) }),
      client.invalidateQueries({ queryKey: queryKeys.related(organizationId) }),
    ]);
  const projectId = "projectEntityId" in input ? input.projectEntityId : id;
  const access = input.action === "share" || input.action === "revoke";
  const detail = client.getQueryData<Awaited<ReturnType<typeof getProject>>>(
    queryKeys.project(organizationId, projectId),
  );
  const entityIds = access
    ? [projectId, ...(detail?.tasks.map((task) => task.entityId) ?? [])]
    : [id];
  const refreshes = [
    client.invalidateQueries({ queryKey: queryKeys.project(organizationId, projectId) }),
    staleSearches(client, organizationId),
  ];
  if (input.action === "createProject" || input.action === "updateProject" || access)
    refreshes.push(client.invalidateQueries({ queryKey: queryKeys.projects(organizationId) }));
  if (input.action === "createTask" || input.action === "updateTask")
    refreshes.push(client.invalidateQueries({ queryKey: queryKeys.activity(organizationId, id) }));
  if (input.action === "updateTask" || input.action === "updateProject" || access)
    refreshes.push(invalidateWorkLabels(client, organizationId, entityIds));
  if (input.action !== "createProject")
    refreshes.push(client.invalidateQueries({ queryKey: queryKeys.notifications(organizationId) }));
  if (access)
    refreshes.push(
      client.invalidateQueries({
        queryKey: [...queryKeys.tasks(organizationId), "comments", projectId],
      }),
      ...entityIds.flatMap((entityId) => [
        client.invalidateQueries({ queryKey: queryKeys.related(organizationId, entityId) }),
        client.invalidateQueries({ queryKey: queryKeys.activity(organizationId, entityId) }),
      ]),
    );
  return Promise.all(refreshes);
}
