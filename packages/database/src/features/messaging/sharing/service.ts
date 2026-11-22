import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import type { ResolvedWorkspace } from "../../../core/session/workspace";
import { workspaceContext } from "../../../core/session/workspace";
import { connectionOperations } from "./connections";
import { invitationOperations } from "./invitations";
import { sharingQueries } from "./queries";

// Trusted server facade for cross-organization sharing.
export function createSharingRepository(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  resolved: ResolvedWorkspace,
) {
  return {
    ...sharingQueries(db, scope, resolved),
    ...invitationOperations(db, scope),
    ...connectionOperations(db, scope),
  };
}

// Trusted non-HTTP entry point. Reads resolve at entry; writes authorize in their own transaction.
export function createSharingService(db: DatabaseExecutor, scope: SessionIdentity) {
  type Queries = ReturnType<typeof sharingQueries>;
  const run = async <T>(work: (queries: Queries) => Promise<T>) =>
    work(sharingQueries(db, scope, await workspaceContext(db, scope)));
  return {
    list: (...args: Parameters<Queries["list"]>) => run((queries) => queries.list(...args)),
    listConversations: () => run((queries) => queries.listConversations()),
    inbox: () => run((queries) => queries.inbox()),
    ...invitationOperations(db, scope),
    ...connectionOperations(db, scope),
  };
}
