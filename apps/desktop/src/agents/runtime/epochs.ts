import type { EpochRotationReason, SessionRow } from "@substrate/client-storage/agent-work";
import {
  appAvailability,
  POLICY_VERSION,
  type AdapterCapabilities,
  type Usage,
} from "@substrate/contracts/harness";

import type { RuntimeContext } from "./context.ts";

/** Rotate or compact when the reported context use reaches this share of the window. */
const contextRotationShare = 0.7;
/** Without usage reports, rotate after this many finished turns in an epoch. */
const epochTurnLimit = 200;

const handoffInstruction =
  "This session is about to restart with a fresh context. Call save_handoff once with the objectives, the open work, and the references the next session needs to continue. Do not reply or post anything. Then end your turn.";

/** What to do about a session's context after a turn. */
function contextAction(
  session: Pick<SessionRow, "epochTurns" | "rotation">,
  usage: Usage | null,
  capabilities: AdapterCapabilities,
): "compact" | EpochRotationReason | null {
  if (session.rotation) return null;
  if (usage?.contextUsed !== undefined && usage.contextWindow) {
    if (usage.contextUsed / usage.contextWindow < contextRotationShare) return null;
    return capabilities.compact ? "compact" : "usage";
  }
  return session.epochTurns >= epochTurnLimit ? "turns" : null;
}

export function createEpochs(context: RuntimeContext) {
  async function rotate(
    session: Pick<SessionRow, "id" | "userAgentId">,
    reason: EpochRotationReason,
  ) {
    await context.store.epochs.requestRotation(
      session.id,
      reason,
      handoffInstruction,
      context.now(),
    );
    context.changed({ userAgentId: session.userAgentId });
  }

  return {
    /** App changes use the existing policy rotation, without editing an epoch's frozen prefix. */
    async refreshApps() {
      if (!context.enabledApps) return;
      const availability = appAvailability(await context.enabledApps());
      for (const agent of await context.agents.all()) {
        for (const summary of await context.store.sessions.forAgent(
          context.organizationId,
          agent.id,
        )) {
          const session = await context.store.sessions.get(summary.id);
          if (session?.prefix && !session.prefix.split("\n").includes(availability))
            await rotate(session, "policy");
        }
      }
    },
    /** After a finished turn: compact natively where the harness can, else rotate. */
    async afterTurn(sessionId: string, usage: Usage | null, capabilities: AdapterCapabilities) {
      const session = await context.store.sessions.get(sessionId);
      if (!session) return;
      const action = contextAction(session, usage, capabilities);
      if (action === "compact")
        await context.harness
          .execute({ type: "compact", organizationId: context.organizationId, sessionId })
          .catch(() => rotate(session, "usage"));
      else if (action) await rotate(session, action);
    },
    /** Starts a new epoch for the DM sessions of a conversation. */
    async newTopic(conversationId: string) {
      const sessions = await context.store.sessions.forConversation(
        context.organizationId,
        conversationId,
      );
      const direct = sessions.filter((session) => session.kind === "dm");
      if (!direct.length) throw new Error("No agent works in this conversation on this desktop.");
      for (const session of direct) await rotate(session, "new_topic");
    },
    /** Sessions opened with an older runtime policy rotate before their next turn. */
    async rotateOutdatedPolicy() {
      for (const session of await context.store.sessions.outdatedPolicy(
        POLICY_VERSION,
        context.organizationId,
      ))
        await rotate(session, "policy");
    },
  };
}
export type Epochs = ReturnType<typeof createEpochs>;
