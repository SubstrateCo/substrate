import type { ProjectDetail, Task } from "@startup-os/ui/tasks/types";
import { taskProject } from "./tasks-fixtures";

const projectNames = [
  "Product launch",
  "Customer onboarding",
  "Mobile workspace",
  "Design system",
  "Developer platform",
  "Customer research",
  "Billing and subscriptions",
  "Team collaboration",
  "Search and discovery",
  "Agent workflows",
  "Security review",
  "Partner integrations",
  "Marketing website",
  "Support operations",
  "Analytics and reporting",
  "Data migration",
  "Performance improvements",
  "Accessibility audit",
];
const taskNames = [
  "Map the current workflow",
  "Review customer feedback",
  "Draft the implementation plan",
  "Design the first-run experience",
  "Build the workspace navigation",
  "Check keyboard interactions",
  "Connect the project activity feed",
  "Review access and permissions",
  "Prepare release notes",
  "Test the mobile layout with long names and multiple assignees",
  "Resolve review feedback",
  "Verify the rollout checklist",
];
const actors: ProjectDetail["actors"] = [
  ...taskProject.actors,
  { entityId: "sam", name: "Sam Rivera", type: "human" },
  { entityId: "taylor", name: "Taylor Kim", type: "human" },
  { entityId: "jordan", name: "Jordan Lee", type: "human" },
  { entityId: "research-agent", name: "Research assistant", type: "agent" },
];
const priorities: Task["priority"][] = ["urgent", "high", "medium", "low", "none"];
const statuses: Task["status"][] = [
  "not_started",
  "not_started",
  "in_progress",
  "in_progress",
  "in_review",
  "completed",
  "completed",
  "canceled",
];

function createProjects(taskCount: number): ProjectDetail[] {
  return projectNames.map((name, projectIndex) => {
    const projectId = `project-${projectIndex + 1}`;
    return {
      ...taskProject,
      project: {
        entityId: projectId,
        name,
        description: `Plan and deliver ${name.toLowerCase()} across design, engineering, and operations.`,
      },
      actors,
      members: actors.map((actor, index) => ({
        actorEntityId: actor.entityId,
        name: actor.name,
        type: actor.type,
        level: index === 0 ? "owner" : "edit",
      })),
      tasks: Array.from({ length: taskCount }, (_, index) => ({
        entityId: `${projectId}-task-${index + 1}`,
        projectEntityId: projectId,
        parentTaskEntityId: index % 6 === 5 ? `${projectId}-task-${index}` : null,
        title: `${taskNames[index % taskNames.length]} · ${name}${index >= taskNames.length ? ` · Sprint ${Math.floor(index / taskNames.length) + 1}` : ""}`,
        description: `Coordinate the ${name.toLowerCase()} work with the team.\n\nConfirm acceptance criteria, capture review notes, and check the result before release.`,
        status: statuses[index % statuses.length]!,
        priority: priorities[index % priorities.length]!,
        assigneeActorEntityId: index % 7 === 6 ? null : actors[index % actors.length]!.entityId,
        dueDate: index % 4 === 3 ? null : `2026-11-${String(6 + (index % 24)).padStart(2, "0")}`,
      })),
    };
  });
}

export const populatedProjects = createProjects(48);
export const largeProjects = createProjects(160);
