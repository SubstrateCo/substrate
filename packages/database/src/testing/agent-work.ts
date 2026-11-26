import type { WorkspaceApiRequest } from "@substrate/contracts/agent-tools/mcp";
import { mcpTools, type ServerToolName } from "@substrate/contracts/agent-tools/tools";

import type { DatabaseExecutor } from "../core/executor";
import type { RepositoryContext } from "../core/repository-context";
import type { DeviceIdentity } from "../core/session/device";
import type { SessionIdentity } from "../core/session/identity";
import { workspaceContext } from "../core/session/workspace";
import { proposalInput } from "../features/agent-work/requests/proposals";
import { proposeToolCall } from "../features/mcp/proposals";
import { publishingTools } from "../features/mcp/publishing";
import { requireLiveTurn, type ServerTurn } from "../features/mcp/turn";
import { createMessagingService } from "../features/messaging/service";
import { createRepositories } from "../repositories";
import { ownedAgent } from "./agents";
import type { setupDatabase } from "./database";
import { callerOf, turnContexts, type TurnSpec } from "./turns";

type Fixture = ReturnType<typeof setupDatabase>;

/** The owner's agent-work repository, scoped as the server scopes it. */
export async function ownerAgentWork(db: DatabaseExecutor, owner: SessionIdentity) {
  return (await createRepositories(db).forSession(owner)).agentWork;
}

/** The home desktop's agent-work repository, scoped as the server scopes it. */
export async function deviceAgentWork(db: DatabaseExecutor, identity: DeviceIdentity) {
  return (await createRepositories(db).forDeviceSession(identity)).agentWork;
}

/** The home desktop's host API, scoped as the server scopes it. */
export async function hostWork(db: DatabaseExecutor, identity: DeviceIdentity) {
  return (await createRepositories(db).forDeviceSession(identity)).host;
}

/**
 * Alice's agent with a DM, and helpers to call its tools as the desktop host would. Each turn
 * spec becomes a live server turn leased by the agent's home desktop.
 */
export async function agentWorkFixture(f: Fixture) {
  const agent = await ownedAgent(f);
  const alice = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const bob = createMessagingService(f.db, { organizationId: f.orgA, userId: "bob" });
  const dm = await alice.createConversation({ kind: "dm", agentIds: [agent.agentId] });
  const owner = { userId: "alice", organizationId: f.orgA };
  const agentIdentity = { ...owner, actorEntityId: agent.actorId };
  const turn = turnContexts(f.db, agent);
  // Fixture writes exercise domain persistence, not server tool dispatch or receipts.
  const inTurn = async <T>(
    spec: TurnSpec,
    work: (
      context: RepositoryContext,
      actor: { entityId: string; name: string; type: "human" | "agent" },
      live: ServerTurn,
    ) => Promise<T>,
  ) => {
    const context = await turn(spec);
    return f.db.transaction(async (tx) => {
      const resolved = await workspaceContext(tx, agentIdentity);
      const live = await requireLiveTurn(
        tx,
        agentIdentity,
        context,
        callerOf(spec, agent.identity.installationId),
      );
      return work(resolved.context, resolved.actor, live);
    });
  };
  const call = async (tool: "reply", input: WorkspaceApiRequest["input"], spec: TurnSpec) => {
    const output = await inTurn(spec, (context, actor, live) =>
      publishingTools(context, agentIdentity, { ...actor, userAgentId: agent.agentId }, live).reply(
        mcpTools[tool].input.parse(input),
      ),
    );
    return mcpTools[tool].output.parse(output);
  };
  /** Stores the call as a proposal, as the server does for a call that needs approval. */
  const propose = (tool: ServerToolName, input: WorkspaceApiRequest["input"], spec: TurnSpec) =>
    inTurn(spec, (context, actor, live) =>
      proposeToolCall(context, agentIdentity, { ...actor, userAgentId: agent.agentId }, live, {
        tool,
        input: proposalInput(mcpTools[tool].input.parse(input)),
      }),
    );
  return { agent, alice, bob, dm, owner, agentIdentity, turn, call, propose };
}
