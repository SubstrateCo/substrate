import { createFileRoute } from "@tanstack/react-router";

import { TasksWorkspace } from "@/components/tasks/workspace/tasks-workspace";
import { AppAvailability } from "@/components/workspace/app-availability";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/tasks/")({
  component: TasksRoute,
  validateSearch: z.object({ projectId: z.uuid().optional(), taskId: z.uuid().optional() }),
});

function TasksRoute() {
  const { projectId, taskId } = Route.useSearch();
  return (
    <AppAvailability app="tasks">
      <TasksWorkspace projectId={projectId} taskId={taskId} />
    </AppAvailability>
  );
}
