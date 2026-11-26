import type { EpochRotationReason, NativeSessionRow } from "@substrate/client-storage/agent-work";
import { appAvailability, POLICY_VERSION } from "@substrate/contracts/agent-tools";
import { type AdapterCapabilities, type Usage } from "@substrate/contracts/harness-runtime";

import type { RuntimeContext } from "./context.ts";

/** Rotate or compact when the reported context use reaches this share of the window. */
const contextRotationShare = 0.7;
/** Without usage reports, rotate after this many finished turns in an epoch. */
const epochTurnLimit = 200;

const handoffInstruction =
  "This session is about to restart with a fresh context. Call save_handoff once with the objectives, the open work, and the references the next session needs to continue. Do not reply or post anything. Then end your turn.";

/** What to do about a session's context after a turn. */
function contextAction(
  session: Pick<NativeSessionRow, "epochTurns" | "rotation">,
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

/**
 * Epochs of native sessions. The host decides when a session's context is full and submits an
 * epoch handoff item to the server; the server runs the handoff turn alone, and the host starts
 * the next epoch after it. The owner's resets arrive as the session's reset generation.
 */
export function createEpochs(context: RuntimeContext) {
  async function rotate(sessionId: string, reason: EpochRotationReason) {
    const request = await context.store.nativeSessions.requestRotation(
      context.organizationId,
      sessionId,
      reason,
      context.now(),
    );
    if (request.action !== "submit") return;
    await context.host
      .submitEpoch(context.organizationId, {
        sessionId,
        fromEpoch: request.fromEpoch,
        body: handoffInstruction,
      })
      .catch(() => context.log("Could not ask for a fresh agent session."));
    context.changed({});
  }

  return {
    /** App changes use the existing policy rotation, without editing an epoch's frozen prefix. */
    async refreshApps() {
      if (!context.enabledApps) return;
      const availability = appAvailability(await context.enabledApps());
      for (const session of await context.store.nativeSessions.withPrefix(context.organizationId))
        if (!session.rotation && !session.prefix!.split("\n").includes(availability))
          await rotate(session.sessionId, "policy");
    },
    /** After a finished turn: compact natively where the harness can, else rotate. */
    async afterTurn(sessionId: string, usage: Usage | null, capabilities: AdapterCapabilities) {
      const session = await context.store.nativeSessions.get(context.organizationId, sessionId);
      if (!session) return;
      const action = contextAction(session, usage, capabilities);
      if (action === "compact")
        await context.harness
          .execute({ type: "compact", organizationId: context.organizationId, sessionId })
          .catch(() => rotate(sessionId, "usage"));
      else if (action) await rotate(sessionId, action);
    },
    /** Sessions opened with an older runtime policy rotate before their next turn. */
    async rotateOutdatedPolicy() {
      for (const session of await context.store.nativeSessions.outdatedPolicy(
        context.organizationId,
        POLICY_VERSION,
      ))
        await rotate(session.sessionId, "policy");
    },
  };
}
export type Epochs = ReturnType<typeof createEpochs>;
