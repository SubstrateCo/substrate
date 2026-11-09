import type { TurnContext, WorkspaceApiRequest } from "@startup-os/contracts/harness/mcp";
import { mcpTools, type McpOutput, type ServerToolName } from "@startup-os/contracts/harness/tools";

import { executeAgentTool } from "../features/mcp/service";
import { createMessagingService } from "../features/messaging/service";
import { ownedAgent } from "./agents";
import type { setupDatabase } from "./database";

type Fixture = ReturnType<typeof setupDatabase>;

export const dmTurn = (
  conversationId: string,
  kind: TurnContext["kind"] = "interactive",
): TurnContext => ({
  turnId: crypto.randomUUID(),
  attempt: 1,
  sessionKey: `dm:${conversationId}`,
  origin: { conversationId, threadId: null },
  kind,
});

export const threadTurn = (conversationId: string, rootId: string): TurnContext => ({
  turnId: crypto.randomUUID(),
  attempt: 1,
  sessionKey: `thread:${rootId}`,
  origin: { conversationId, threadId: rootId },
  kind: "interactive",
});

/**
 * Alice's agent with a DM, and helpers to call its tools as the desktop host would. A turn without
 * an installationId key runs on the agent's home desktop.
 */
export async function agentWorkFixture(f: Fixture) {
  const agent = await ownedAgent(f);
  const alice = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const bob = createMessagingService(f.db, { organizationId: f.orgA, userId: "bob" });
  const dm = await alice.createConversation({ kind: "dm", agentIds: [agent.agentId] });
  const owner = { userId: "alice", organizationId: f.orgA };
  const agentIdentity = { ...owner, actorEntityId: agent.actorId };
  const call = async <K extends ServerToolName>(
    tool: K,
    input: WorkspaceApiRequest["input"],
    turn: TurnContext,
  ) =>
    // SAFETY: the result was parsed with the output schema registered for tool K.
    mcpTools[tool].output.parse(
      (
        await executeAgentTool(
          f.db,
          agentIdentity,
          tool,
          input,
          "installationId" in turn
            ? turn
            : { ...turn, installationId: agent.identity.installationId },
        )
      ).output,
    ) as McpOutput<K>;
  return { agent, alice, bob, dm, owner, agentIdentity, call };
}
