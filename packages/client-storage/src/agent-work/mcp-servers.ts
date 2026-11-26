import {
  harnessMcpServerSchema,
  maxHarnessMcpServers,
  type HarnessMcpServer,
} from "@substrate/contracts/harness-runtime";

import type { RunTransaction } from "../database.ts";
import { agentMcpServers } from "../schema/index.ts";
import { and, asc, count, eq } from "drizzle-orm";

type McpServerRow = typeof agentMcpServers.$inferSelect;

function serverOf(row: McpServerRow): HarnessMcpServer {
  // Parse again on read: a row is handed to native harnesses, so it must still pass the secret screen.
  return harnessMcpServerSchema.parse(
    row.transport === "http"
      ? { id: row.id, name: row.name, transport: "http", url: row.url }
      : {
          id: row.id,
          name: row.name,
          transport: "stdio",
          command: row.command,
          args: row.args,
          environment: row.environment,
        },
  );
}

const scoped = (organizationId: string, agentId: string) =>
  and(eq(agentMcpServers.organizationId, organizationId), eq(agentMcpServers.agentId, agentId));

/** An agent's user-added MCP servers. Each agent of each organization has its own list. */
export function mcpServerRepository(run: RunTransaction) {
  return {
    /** In the order the owner added them. */
    list: (organizationId: string, agentId: string) =>
      run(async (tx) =>
        (
          await tx
            .select()
            .from(agentMcpServers)
            .where(scoped(organizationId, agentId))
            .orderBy(asc(agentMcpServers.createdAt), asc(agentMcpServers.id))
            .all()
        ).map(serverOf),
      ),
    /**
     * Adds a server, or replaces the server with the same ID. Rejects credentials and settings
     * that do not apply to the transport.
     */
    save: (organizationId: string, agentId: string, input: HarnessMcpServer, now: number) =>
      run(async (tx) => {
        const server = harnessMcpServerSchema.parse(input);
        const where = and(scoped(organizationId, agentId), eq(agentMcpServers.id, server.id));
        const existing = await tx
          .select({ id: agentMcpServers.id })
          .from(agentMcpServers)
          .where(where)
          .get();
        if (!existing) {
          const row = await tx
            .select({ total: count() })
            .from(agentMcpServers)
            .where(scoped(organizationId, agentId))
            .get();
          if ((row?.total ?? 0) >= maxHarnessMcpServers)
            throw new Error(`An agent can have at most ${maxHarnessMcpServers} MCP servers.`);
        }
        const fields = {
          name: server.name,
          transport: server.transport,
          command: server.transport === "stdio" ? server.command : null,
          args: server.transport === "stdio" ? (server.args ?? []) : [],
          environment: server.transport === "stdio" ? (server.environment ?? {}) : {},
          url: server.transport === "http" ? server.url : null,
          updatedAt: now,
        };
        if (existing) await tx.update(agentMcpServers).set(fields).where(where);
        else
          await tx
            .insert(agentMcpServers)
            .values({ ...fields, organizationId, agentId, id: server.id, createdAt: now });
      }),
    delete: (organizationId: string, agentId: string, id: string) =>
      run(async (tx) => {
        await tx
          .delete(agentMcpServers)
          .where(and(scoped(organizationId, agentId), eq(agentMcpServers.id, id)));
      }),
  };
}
