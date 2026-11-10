import { managedPicture } from "@startup-os/contracts/files/pictures";

import { user } from "../authentication/schema";
import { member } from "../organizations/schema";
import type { ActorScope } from "../repository-context";
import type { ActorColumns } from "./display-name";
import { actors } from "./schema";
import { userAgents } from "./user-agents.schema";
import { sql, type SQLWrapper } from "drizzle-orm";

type PictureViewer = ActorScope | { organizationId: string; userId: string };

/** Picture metadata only. Callers must first restrict rows to records the viewer may read. */
export function actorPicture(scope: PictureViewer, actor: ActorColumns = actors) {
  const viewer: SQLWrapper =
    "userId" in scope
      ? sql`${scope.userId}`
      : sql`(select coalesce(picture_viewer.user_id, picture_owner.user_id)
          from ${actors} picture_viewer
          left join ${userAgents} picture_owner on picture_owner.id = picture_viewer.user_agent_id
          where picture_viewer.entity_id = ${scope.actorEntityId}
            and picture_viewer.organization_id = ${scope.organizationId})`;
  return sql<string | null>`case when ${actor.type} = 'agent' then (
      select '/api/v1/files/' || picture_agent.image_file_id::text || '/content'
      from ${userAgents} picture_agent
      where picture_agent.id = ${actor.userAgentId} and picture_agent.user_id = ${viewer}
    ) else (
      select picture_user.image from ${user} picture_user
      where picture_user.id = ${actor.userId} and exists (
        select 1 from ${member} picture_member
        where picture_member.user_id = picture_user.id
          and picture_member.organization_id = ${scope.organizationId}
      )
    ) end`.mapWith((value: string | null) => {
    const parsed = managedPicture.safeParse(value);
    return parsed.success ? parsed.data : null;
  });
}
