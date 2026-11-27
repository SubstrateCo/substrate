import type { ProjectDetail } from "../types";
import { TaskAssigneeHoverCard } from "./task-assignee-hover-card";
import { ActorAvatar } from "@/components/people/actor-avatar";
import { PersonAvatar } from "@/components/people/person-avatar";
import { actorIdentity } from "@/lib/actors/identity";

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
        <ActorAvatar actor={actorIdentity(assignee)} size="xs" />
      </TaskAssigneeHoverCard>
    );
  const missingName = assigned ? "Former member" : undefined;
  return (
    <span aria-label={missingName ?? "Unassigned"}>
      <PersonAvatar size="xs" name={missingName} />
    </span>
  );
}
