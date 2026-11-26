import type { PermissionLevel } from "./status";

type ProjectActor = { entityId: string; type: "human" | "agent"; assignable: boolean };
/** One actor's direct project access. */
export type ProjectGrant = { actorEntityId: string; level: PermissionLevel };
type ProjectPeople<T> = { actors: readonly T[]; members: readonly ProjectGrant[] };

/**
 * Who a task can be assigned to. The server marks the actors who can read the project, including
 * admins through their role and agents through their owner. The current assignee stays in the
 * list so the task keeps showing their name.
 */
export function assignableActors<T extends ProjectActor>(
  detail: Pick<ProjectPeople<T>, "actors">,
  currentAssignee?: string | null,
) {
  return detail.actors.filter((actor) => actor.entityId === currentAssignee || actor.assignable);
}

/** People who can be given project access. Only people get grants: agents use their owner's. */
export function grantCandidates<T extends ProjectActor>(detail: ProjectPeople<T>) {
  return detail.actors.filter(
    (actor) =>
      actor.type === "human" &&
      !detail.members.some((member) => member.actorEntityId === actor.entityId),
  );
}

/** A project keeps an owner: its last owner cannot be downgraded or removed. */
export function isLastOwner(members: readonly ProjectGrant[], actorEntityId: string) {
  const owners = members.filter((member) => member.level === "owner");
  return owners.length === 1 && owners[0]!.actorEntityId === actorEntityId;
}
