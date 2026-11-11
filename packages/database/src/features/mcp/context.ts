import type { McpInput, McpOutput } from "@substrate/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import { organization } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { contextSearch } from "../context/search";
import { projectRepository } from "../projects/repository";
import { keysetPagination } from "./pagination";
import { and, eq } from "drizzle-orm";

type Actor = { id: string; name: string; type: "human" | "agent" };

export function mcpContextQueries(ctx: RepositoryContext, identity: SessionIdentity) {
  const { db, scope } = ctx;
  return {
    async getMe(actor: Actor, ownerName: string): Promise<McpOutput<"get_me">> {
      const [owner] = await db
        .select({ id: actors.entityId })
        .from(actors)
        .where(
          and(
            eq(actors.organizationId, scope.organizationId),
            eq(actors.userId, identity.userId),
            eq(actors.type, "human"),
          ),
        );
      const [workspace] = await db
        .select({ id: organization.id, name: organization.name })
        .from(organization)
        .where(eq(organization.id, scope.organizationId));
      return {
        actor,
        owner: { id: owner?.id ?? null, name: ownerName },
        organization: workspace!,
      };
    },
    async search(input: McpInput<"search">) {
      const p = keysetPagination(scope, "search", input);
      // Search applies each record type's access rules and sorts all results by ID.
      const rows = await contextSearch(db, identity, {
        query: input.query,
        kind: input.type ?? "all",
        after: p.after,
        limit: p.take,
      });
      const hits: McpOutput<"search">["items"] = rows.map((row) => {
        if (row.kind === "task")
          return { type: "task", id: row.id, title: row.title, projectId: row.projectEntityId! };
        if (row.kind === "project") return { type: "project", id: row.id, title: row.title };
        if (row.kind === "message")
          return {
            type: "message",
            id: row.id,
            conversationId: row.conversationId!,
            threadId: row.threadId ?? null,
            text: row.title,
          };
        return { type: "conversation", id: row.id, title: row.title };
      });
      return p.page(hits);
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
