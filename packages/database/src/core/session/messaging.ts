import type { DatabaseExecutor } from "../../client";
import type { SessionIdentity } from "./identity";
import { workspaceContext } from "./workspace";

export async function messagingSession(db: DatabaseExecutor, identity: SessionIdentity) {
  const { context, actor, admin } = await workspaceContext(db, identity);
  return {
    context,
    actor,
    authorName: actor.name,
    viewer: {
      userId: identity.userId,
      organizationId: identity.organizationId,
      agent: actor.type === "agent",
      admin,
    },
  };
}
