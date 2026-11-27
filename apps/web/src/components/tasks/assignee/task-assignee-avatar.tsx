import type { ProjectDetail } from "../types";
import { TaskAssigneeHoverCard } from "./task-assignee-hover-card";
import { AgentAvatarView } from "@/components/agents/agent-avatar";
import { PersonAvatar } from "@/components/people/person-avatar";

/** A task's assignee, or a blank avatar named "Former member" or "Unassigned". */
export function TaskAssigneeAvatar({
  assignee,
  assigned,
}: {
  assignee?: ProjectDetail["actors"][number];
  /** The task names an assignee, even one no longer in the project. */
  assigned: boolean;
}) {
  if (assignee)
    return (
      <TaskAssigneeHoverCard assignee={assignee}>
        {assignee.type === "agent" ? (
          <AgentAvatarView avatar={assignee.avatar} size="xs" />
        ) : (
          <PersonAvatar size="xs" name={assignee.name} image={assignee.image} />
        )}
      </TaskAssigneeHoverCard>
    );
  const missingName = assigned ? "Former member" : undefined;
  return (
    <span aria-label={missingName ?? "Unassigned"}>
      <PersonAvatar size="xs" name={missingName} />
    </span>
  );
}
