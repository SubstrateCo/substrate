import { sessionKeys } from "@substrate/contracts/agent-work";
import type { AgentCallerPolicy } from "@substrate/contracts/agents";
import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";
import { mcpTools, type McpOutput, type ServerToolName } from "@substrate/contracts/harness/tools";

import { actors } from "../core/actors/schema";
import type { DatabaseExecutor } from "../core/executor";
import type { DeviceIdentity } from "../core/session/device";
import type { SessionIdentity } from "../core/session/identity";
import { executeAgentTool } from "../features/mcp/service";
import { createMessagingService } from "../features/messaging/service";
import { createRepositories } from "../repositories";
import { member, user } from "../schema";
import { ownedAgent } from "./agents";
import type { setupDatabase } from "./database";
import { and, eq } from "drizzle-orm";

type Fixture = ReturnType<typeof setupDatabase>;

/** The owner's agent-work repository, scoped as the server scopes it. */
export async function ownerAgentWork(db: DatabaseExecutor, owner: SessionIdentity) {
  return (await createRepositories(db).forSession(owner)).agentWork;
}

/** The home desktop's agent-work repository, scoped as the server scopes it. */
export async function deviceAgentWork(db: DatabaseExecutor, identity: DeviceIdentity) {
  return (await createRepositories(db).forDeviceSession(identity)).agentWork;
}

export const dmTurn = (
  conversationId: string,
  kind: TurnContext["kind"] = "interactive",
): TurnContext => ({
  turnId: crypto.randomUUID(),
  attempt: 1,
  sessionKey: sessionKeys.dm(conversationId),
  origin: { conversationId, threadId: null },
  kind,
});

export const threadTurn = (conversationId: string, rootId: string): TurnContext => ({
  turnId: crypto.randomUUID(),
  attempt: 1,
  sessionKey: sessionKeys.thread(rootId),
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

/**
 * agentWorkFixture plus Carol, a third member of orgA, and a public channel that has Alice's
 * agent. `policy` sets who may call the agent; `mention` is the agent's mention markup.
 */
export async function callerFixture(f: Fixture) {
  await f.db
    .insert(user)
    .values({ id: "carol", name: "Carol", email: "carol@example.com", emailVerified: true });
  await f.db.insert(member).values({ id: "carol-a", userId: "carol", organizationId: f.orgA });
  const base = await agentWorkFixture(f);
  const carol = createMessagingService(f.db, { organizationId: f.orgA, userId: "carol" });
  const channel = await base.alice.createConversation({ kind: "channel", name: "general" });
  await base.alice.addAgent(channel.id, base.agent.agentId);
  const policy = async (value: AgentCallerPolicy) =>
    (await ownerAgentWork(f.db, base.owner)).saveCallerPolicy(base.agent.agentId, value);
  // Carol's first workspace read provisions her person actor.
  await carol.listConversations();
  const [carolActor] = await f.db
    .select({ id: actors.entityId })
    .from(actors)
    .where(and(eq(actors.userId, "carol"), eq(actors.organizationId, f.orgA)));
  return {
    ...base,
    carol,
    carolActorId: carolActor!.id,
    channel,
    policy,
    mention: `@[agent:${base.agent.actorId}]`,
  };
}
