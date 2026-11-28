import type { RunTransaction } from "../database.ts";
import { agentWorkspaces } from "../schema/index.ts";
import { and, eq } from "drizzle-orm";

const scoped = (organizationId: string, agentId: string) =>
  and(eq(agentWorkspaces.organizationId, organizationId), eq(agentWorkspaces.agentId, agentId));

export function workspaceRepository(run: RunTransaction) {
  return {
    /** The agent's working folder, or null for its own folder. */
    get: (organizationId: string, agentId: string) =>
      run(
        async (tx) =>
          (
            await tx
              .select({ path: agentWorkspaces.path })
              .from(agentWorkspaces)
              .where(scoped(organizationId, agentId))
              .get()
          )?.path ?? null,
      ),
    /** Sets the agent's working folder. Null returns it to its own folder. */
    set: (organizationId: string, agentId: string, path: string | null, now: number) =>
      run(async (tx) => {
        if (path === null) {
          await tx.delete(agentWorkspaces).where(scoped(organizationId, agentId));
          return;
        }
        await tx
          .insert(agentWorkspaces)
          .values({ organizationId, agentId, path, updatedAt: now })
          .onConflictDoUpdate({
            target: [agentWorkspaces.organizationId, agentWorkspaces.agentId],
            set: { path, updatedAt: now },
          });
      }),
  };
}
