import { createFileRoute } from "@tanstack/react-router";

import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_workspace/tasks/")({
  component: TasksRoute,
  validateSearch: z.object({ projectId: z.uuid().optional(), taskId: z.uuid().optional() }),
});

function TasksRoute() {
  const { organizationId } = Route.useRouteContext();
  return <TasksWorkspace key={organizationId} organizationId={organizationId} />;
}
