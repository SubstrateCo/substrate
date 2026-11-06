import type { ProjectDetail } from "@startup-os/ui/tasks/types";

export const taskProject: ProjectDetail = {
  project: {
    entityId: "launch",
    name: "Product launch",
    description: "Bring the new workspace to our customers.",
  },
  level: "owner",
  actors: [
    { entityId: "alex", name: "Alex Morgan", type: "human" },
    { entityId: "agent", name: "Release assistant", type: "agent" },
  ],
  members: [{ actorEntityId: "alex", name: "Alex Morgan", type: "human", level: "owner" }],
  tasks: [
    {
      entityId: "ship",
      projectEntityId: "launch",
      parentTaskEntityId: null,
      title: "Ship the launch",
      description: "Final checks and release.",
      status: "in_progress",
      priority: "high",
      assigneeActorEntityId: "alex",
      dueDate: "2026-12-01",
    },
  ],
};
