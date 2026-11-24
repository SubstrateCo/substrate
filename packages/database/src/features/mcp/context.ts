import type { McpInput, McpOutput } from "@substrate/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import { organization } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { projectRepository } from "../projects/repository";
import { and, eq, sql } from "drizzle-orm";

type Actor = { id: string; name: string; type: "human" | "agent" };

export function mcpContextQueries(ctx: RepositoryContext, identity: SessionIdentity) {
  const { db, scope } = ctx;
  return {
    async getMe(actor: Actor, ownerName: string): Promise<McpOutput<"get_me">> {
      const owner = db
        .select({ id: actors.entityId })
        .from(actors)
        .where(
          and(
            eq(actors.organizationId, scope.organizationId),
            eq(actors.userId, identity.userId),
            eq(actors.type, "human"),
          ),
        );
      const [row] = await db
        .select({
          workspace: { id: organization.id, name: organization.name },
          ownerId: sql<string | null>`(${owner})`,
        })
        .from(organization)
        .where(eq(organization.id, scope.organizationId));
      const workspace = row?.workspace;
      return {
        actor,
        owner: { id: row?.ownerId ?? null, name: ownerName },
        organization: workspace!,
      };
    },
    async listAssignees(input: McpInput<"list_assignees">) {
      const query = input.query?.toLowerCase();
      const rows = await projectRepository(ctx).assignableActors(input.projectId);
      return {
        items: rows
          .filter((row) => !query || row.name.toLowerCase().includes(query))
          .map((row) => ({ id: row.entityId, name: row.name, type: row.type })),
      };
    },
  };
}
