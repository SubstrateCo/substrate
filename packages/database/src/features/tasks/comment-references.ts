import { activeActorCondition, visibleActorCondition } from "../../core/actors/access";
import { actorDisplayName } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { messageReferences, type Reference } from "../context/references";
import { notifications } from "../notifications/schema";
import { readableWorkTargets } from "../notifications/targets";
import { taskCommentReferences } from "./comment-references.schema";
import type { taskComments } from "./comments.schema";
import type { tasks } from "./tasks.schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

export interface CommentReference {
  id: string;
  kind: "task" | "project" | "person" | "agent";
  label: string;
  /** The project to open for a task or project reference. */
  projectEntityId?: string;
}

function byKind(references: Reference[]) {
  const ids = (kind: Reference["kind"]) =>
    references.flatMap((reference) => (reference.kind === kind ? [reference.id] : []));
  return {
    work: references.filter(
      (reference): reference is Reference & { kind: "task" | "project" } =>
        reference.kind === "task" || reference.kind === "project",
    ),
    people: ids("person"),
    agents: ids("agent"),
    messaging: [...ids("channel"), ...ids("thread")],
  };
}

// Saves the comment's task and project references and alerts the people it mentions. The caller
// holds comment access to `task` under its access lock. Returns the actors who got an alert.
export async function applyCommentReferences(
  ctx: RepositoryContext,
  task: typeof tasks.$inferSelect,
  comment: typeof taskComments.$inferSelect,
) {
  const { db, scope } = ctx;
  const { work, people, agents, messaging } = byKind(messageReferences(comment.body));
  // Conversation access belongs to a user, not an actor, so a comment cannot check it.
  if (messaging.length)
    throw new ValidationError("Comments can reference people, agents, tasks, and projects.");
  if (work.length) {
    const targets = await readableWorkTargets(
      ctx,
      work.map((reference) => reference.id),
    );
    for (const reference of work)
      if (targets.get(reference.id)?.entityType !== reference.kind) throw new AccessDeniedError();
    await db.insert(taskCommentReferences).values(
      work.map((reference) => ({
        commentId: comment.id,
        organizationId: scope.organizationId,
        entityId: reference.id,
        entityType: reference.kind,
      })),
    );
  }
  if (agents.length) {
    // An agent mention only renders. It never wakes the agent or alerts its owner.
    const known = await db
      .select({ entityId: actors.entityId })
      .from(actors)
      .where(
        and(
          eq(actors.organizationId, scope.organizationId),
          inArray(actors.entityId, agents),
          eq(actors.type, "agent"),
          visibleActorCondition(scope),
        ),
      );
    if (known.length !== agents.length) throw new AccessDeniedError();
  }
  if (!people.length) return [];
  const mentioned = await db
    .select({ entityId: actors.entityId })
    .from(actors)
    .innerJoin(
      entities,
      and(
        eq(entities.entityId, actors.entityId),
        eq(entities.organizationId, actors.organizationId),
      ),
    )
    .where(
      and(
        eq(actors.organizationId, scope.organizationId),
        inArray(actors.entityId, people),
        eq(actors.type, "human"),
        activeActorCondition(),
        isNull(entities.deletedAt),
      ),
    );
  const unreachable = new ValidationError("Mention only people who can open this task.");
  if (mentioned.length !== people.length) throw unreachable;
  for (const person of mentioned) {
    try {
      await new RepositoryContext(db, {
        organizationId: scope.organizationId,
        actorEntityId: person.entityId,
      }).requireAccess(task.projectEntityId, "view");
    } catch (error) {
      throw error instanceof AccessDeniedError ? unreachable : error;
    }
  }
  const recipients = people.filter((id) => id !== scope.actorEntityId);
  if (!recipients.length) return [];
  const notified = await db
    .insert(notifications)
    .values(
      recipients.map((recipientActorEntityId) => ({
        organizationId: scope.organizationId,
        recipientActorEntityId,
        kind: "mention" as const,
        entityId: task.entityId,
        eventKey: comment.id,
      })),
    )
    .onConflictDoNothing()
    .returning({ actorEntityId: notifications.recipientActorEntityId });
  return notified.map((row) => row.actorEntityId);
}

function parsed(body: string) {
  try {
    return messageReferences(body);
  } catch {
    // Comments written before references may hold text that looks like a broken token.
    return [];
  }
}

// What the reader may see of each comment's references, in comment order. A reference the
// reader cannot open is left out, so the client shows it as unavailable.
export async function commentReferences(
  ctx: RepositoryContext,
  bodies: string[],
): Promise<CommentReference[][]> {
  const perComment = bodies.map(parsed);
  const { work, people, agents } = byKind(perComment.flat());
  if (!work.length && !people.length && !agents.length) return bodies.map(() => []);
  const targets = await readableWorkTargets(ctx, [...new Set(work.map((item) => item.id))]);
  const actorIds = [...new Set([...people, ...agents])];
  const named = actorIds.length
    ? await ctx.db
        .select({ entityId: actors.entityId, name: actorDisplayName(), type: actors.type })
        .from(actors)
        .where(
          and(
            eq(actors.organizationId, ctx.scope.organizationId),
            inArray(actors.entityId, actorIds),
            visibleActorCondition(ctx.scope),
          ),
        )
    : [];
  const actorsById = new Map(named.map((actor) => [actor.entityId, actor]));
  return perComment.map((references) =>
    references.flatMap((reference): CommentReference[] => {
      if (reference.kind === "task" || reference.kind === "project") {
        const target = targets.get(reference.id);
        return target?.entityType === reference.kind
          ? [
              {
                id: reference.id,
                kind: reference.kind,
                label: target.title,
                projectEntityId: target.projectEntityId,
              },
            ]
          : [];
      }
      if (reference.kind !== "person" && reference.kind !== "agent") return [];
      const actor = actorsById.get(reference.id);
      const type = reference.kind === "person" ? "human" : "agent";
      return actor?.type === type
        ? [{ id: reference.id, kind: reference.kind, label: actor.name }]
        : [];
    }),
  );
}
