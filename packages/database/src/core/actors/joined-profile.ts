import { managedPicture } from "@substrate/contracts/files/pictures";

import { user } from "../authentication/schema";
import { member } from "../organizations/schema";
import type { ActorColumns } from "./display-name";
import { actors } from "./schema";
import { userAgents } from "./user-agents.schema";
import { and, eq, sql } from "drizzle-orm";
import type { PgSelectQueryBuilder } from "drizzle-orm/pg-core";

// Name and picture columns for a query that joined the actor's profile with joinActorProfile.
// Use actorDisplayName when the query does not join these tables.

/** Joins the actor's agent and the person's account. Enough for joinedActorName. */
export function joinActorAccount<T extends PgSelectQueryBuilder>(
  query: T,
  actor: ActorColumns = actors,
) {
  return query
    .leftJoin(userAgents, eq(userAgents.id, actor.userAgentId))
    .leftJoin(user, eq(user.id, actor.userId));
}

/** Joins the actor's agent, account and membership in the organization. */
export function joinActorProfile<T extends PgSelectQueryBuilder>(
  query: T,
  organizationId: string,
  actor: ActorColumns = actors,
) {
  return joinActorAccount(query, actor).leftJoin(
    member,
    and(eq(member.userId, actor.userId), eq(member.organizationId, organizationId)),
  );
}

/** The person's account name or the agent's name. Needs the joins from joinActorAccount. */
export function joinedActorName(actor: ActorColumns = actors) {
  return sql<string>`case when ${actor.type} = 'agent'
    then coalesce(${userAgents.name}, 'Agent') else ${user.name} end`;
}

/**
 * The person's picture for members of the organization. Agents have no picture; see
 * joinedActorAvatar. Needs the joins from joinActorProfile.
 */
export function joinedActorPicture(actor: ActorColumns = actors) {
  return sql<string | null>`case when ${actor.type} = 'agent' then null
    else case when ${member.id} is not null then ${user.image} end end`.mapWith(
    (value: string | null) => {
      const parsed = managedPicture.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
  );
}
