import type { EpochRotationReason, NativeSessionRow } from "@substrate/client-storage/agent-work";
import { agentApps, appAvailability, POLICY_VERSION } from "@substrate/contracts/agent-tools";
import { type AdapterCapabilities, type Usage } from "@substrate/contracts/harness-runtime";

import type { RuntimeContext } from "./context.ts";

const contextRotationShare = 0.7;
const epochTurnLimit = 200;

const handoffInstruction =
  "This session is about to restart with a fresh context. Call save_handoff once with the objectives, the open work, and the references the next session needs to continue. Do not reply or post anything. Then end your turn.";

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
    async refreshSettings() {
      const org = context.organizationId;
      const enabledApps = await context.enabledApps?.();
      const agents = new Map((await context.agents.all()).map((agent) => [agent.id, agent]));
      for (const session of await context.store.nativeSessions.withPrefix(org)) {
        const agent = agents.get(session.userAgentId);
        if (!agent || session.rotation) continue;
        const availability = enabledApps && appAvailability(agentApps(enabledApps, agent));
        if (availability && !session.prefix!.split("\n").includes(availability))
          await rotate(session.sessionId, "policy");
        else if (session.workspace !== (await context.store.workspaces.get(org, agent.id)))
          await rotate(session.sessionId, "workspace");
      }
    },
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
