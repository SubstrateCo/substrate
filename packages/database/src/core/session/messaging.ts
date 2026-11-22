import type { DatabaseExecutor } from "../executor";
import { RepositoryContext } from "../repository-context";
import type { SessionIdentity } from "./identity";
import { workspaceContext, type ResolvedWorkspace } from "./workspace";

export type MessagingSessionResolver = (
  db: DatabaseExecutor,
) => Promise<ReturnType<typeof resolvedMessagingSession>>;

export async function messagingSession(db: DatabaseExecutor, identity: SessionIdentity) {
  return resolvedMessagingSession(db, identity, await workspaceContext(db, identity));
}

export function resolvedMessagingSession(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  workspace: ResolvedWorkspace,
) {
  const { actor, admin } = workspace;
  const context = new RepositoryContext(db, workspace.context.scope);
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
