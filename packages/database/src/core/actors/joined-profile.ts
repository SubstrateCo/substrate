import { managedPicture } from "@substrate/contracts/files/pictures";

import { user } from "../authentication/schema";
import { member } from "../organizations/schema";
import type { ActorColumns } from "./display-name";
import { actors } from "./schema";
import { userAgents } from "./user-agents.schema";
import { and, eq, sql } from "drizzle-orm";
import type { PgSelectQueryBuilder } from "drizzle-orm/pg-core";

export function joinActorAccount<T extends PgSelectQueryBuilder>(
  query: T,
  actor: ActorColumns = actors,
) {
  return query
    .leftJoin(userAgents, eq(userAgents.id, actor.userAgentId))
    .leftJoin(user, eq(user.id, actor.userId));
}

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

export function joinedActorName(actor: ActorColumns = actors) {
  return sql<string>`case when ${actor.type} = 'agent'
    then coalesce(${userAgents.name}, 'Agent') else ${user.name} end`;
}

export function joinedActorPicture(actor: ActorColumns = actors) {
  return sql<string | null>`case when ${actor.type} = 'agent' then null
    else case when ${member.id} is not null then ${user.image} end end`.mapWith(
    (value: string | null) => {
      const parsed = managedPicture.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
  );
}
