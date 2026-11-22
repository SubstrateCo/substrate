import { AccessDeniedError } from "../../errors";
import { activeActorCondition } from "../actors/access";
import { actorDisplayName } from "../actors/display-name";
import { ensureHumanActor } from "../actors/provisioning";
import { actors } from "../actors/schema";
import { userAgents } from "../actors/user-agents.schema";
import { user } from "../authentication/schema";
import { entities } from "../entities/schema";
import type { DatabaseExecutor } from "../executor";
import { adminRoleCondition } from "../organizations/roles";
import { member } from "../organizations/schema";
import { RepositoryContext } from "../repository-context";
import type { SessionIdentity, WorkspaceScope } from "./identity";
import { and, eq, isNull, sql } from "drizzle-orm";

const actorSelection = { entityId: actors.entityId, name: actorDisplayName(), type: actors.type };
const adminSelection = sql<boolean>`${adminRoleCondition(member.role)}`;

export type ResolvedWorkspace = Awaited<ReturnType<typeof workspaceContext>>;

function prepareHumanWorkspace(db: DatabaseExecutor) {
  return db
    .select({
      userName: user.name,
      actor: { entityId: actors.entityId, type: actors.type },
      admin: adminSelection,
      disabledAt: actors.disabledAt,
      deletedAt: entities.deletedAt,
    })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .leftJoin(
      actors,
      and(eq(actors.organizationId, member.organizationId), eq(actors.userId, user.id)),
    )
    .leftJoin(
      entities,
      and(
        eq(entities.entityId, actors.entityId),
        eq(entities.organizationId, actors.organizationId),
      ),
    )
    .where(
      and(
        eq(user.id, sql.placeholder("userId")),
        eq(user.emailVerified, true),
        eq(member.organizationId, sql.placeholder("organizationId")),
      ),
    )
    .prepare("human_workspace");
}

// Reuse compiled SQL, never identity or authorization results. Transactions keep their own executor.
const humanWorkspaceQueries = new WeakMap<
  DatabaseExecutor,
  ReturnType<typeof prepareHumanWorkspace>
>();

// Verifies the session identity, membership and active actor in one statement, and reads
// whether the user is an owner or admin of the organization now. Only a human's first workspace
// use takes the provisioning lock.
export async function workspaceContext(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  options: { lockActor?: boolean } = {},
) {
  let actor: { entityId: string; name: string; type: "human" | "agent" } | undefined;
  let userName: string;
  let admin: boolean;
  if (scope.actorEntityId) {
    const identity = and(
      eq(user.id, scope.userId),
      eq(user.emailVerified, true),
      eq(member.organizationId, scope.organizationId),
    );
    const query = db
      .select({ userName: user.name, actor: actorSelection, admin: adminSelection })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .innerJoin(
        actors,
        and(
          eq(actors.entityId, scope.actorEntityId),
          eq(actors.organizationId, member.organizationId),
          eq(actors.type, "agent"),
        ),
      )
      .innerJoin(
        userAgents,
        and(eq(userAgents.id, actors.userAgentId), eq(userAgents.userId, user.id)),
      )
      .innerJoin(
        entities,
        and(
          eq(entities.entityId, actors.entityId),
          eq(entities.organizationId, actors.organizationId),
        ),
      )
      .where(and(identity, activeActorCondition(), isNull(entities.deletedAt)));
    const [row] = await (options.lockActor ? query.for("no key update", { of: actors }) : query);
    if (!row) throw new AccessDeniedError();
    ({ actor, userName, admin } = row);
  } else {
    let query = humanWorkspaceQueries.get(db);
    if (!query) {
      query = prepareHumanWorkspace(db);
      humanWorkspaceQueries.set(db, query);
    }
    const [row] = await query.execute({
      userId: scope.userId,
      organizationId: scope.organizationId,
    });
    if (!row || row.disabledAt || row.deletedAt) throw new AccessDeniedError();
    ({ userName, admin } = row);
    actor = row.actor ? { ...row.actor, name: userName } : undefined;
    if (!actor) {
      const created = await ensureHumanActor(db, scope);
      actor = { entityId: created.entityId, name: userName, type: created.type };
      await new RepositoryContext(db, {
        organizationId: scope.organizationId,
        actorEntityId: actor.entityId,
      }).requireActiveActor();
    }
  }
  const resolved: WorkspaceScope = {
    userId: scope.userId,
    organizationId: scope.organizationId,
    actorEntityId: actor.entityId,
    admin,
  };
  const context = new RepositoryContext(db, resolved);
  return { context, actor, userName, admin };
}
