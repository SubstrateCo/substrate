import { createFileRoute } from "@tanstack/react-router";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";

export const Route = createFileRoute("/_authenticated/_workspace/tasks/")({
  component: TasksRoute,
});

function TasksRoute() {
  const { organizationId } = Route.useRouteContext();
  return <TasksWorkspace key={organizationId} organizationId={organizationId} />;
}
