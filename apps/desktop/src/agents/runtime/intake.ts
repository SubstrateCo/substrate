import type { NewInboxItem } from "@substrate/client-storage/agent-work";
import { parseSessionKey, type AgentWakeView } from "@substrate/contracts/agent-work";

import type { RuntimeContext } from "./context.ts";

const pullLimit = 50;

type WakeResult = { item: NewInboxItem } | { skip: string };

/** The inbox item for a wake, in a session that exists, or why this desktop cannot run it. */
async function wakeItem(context: RuntimeContext, wake: AgentWakeView): Promise<WakeResult> {
  const key = parseSessionKey(wake.sessionKey);
  if (!key || key.kind === "helper") return { skip: "the wake names no owner session" };
  const agent = await context.agents.get(wake.userAgentId);
  if (!agent) return { skip: "the wake names an agent that the owner does not have" };
  if (!agent.home) return { skip: "the wake's agent is homed on another desktop" };
  const ref = wake.sourceRef;
  const message = "messageId" in ref ? ref : null;
  if (!message && !("requestId" in ref)) return { skip: "the wake has no source" };
  const place = message ?? wake.request;
  const existing = await context.store.sessions.byKey(wake.userAgentId, wake.sessionKey);
  const session =
    existing ??
    (await context.store.sessions.ensure(
      {
        organizationId: context.organizationId,
        userAgentId: wake.userAgentId,
        agentId: wake.userAgentId,
        key: wake.sessionKey,
        kind: key.kind,
        harness: agent.harness,
        origin: place?.conversationId
          ? {
              conversationId: place.conversationId,
              threadId: key.kind === "thread" ? key.id : null,
            }
          : null,
      },
      context.now(),
    ));
  const common = {
    sessionId: session.id,
    userAgentId: wake.userAgentId,
    lane: "owner" as const,
    dedupeKey: wake.dedupeKey,
    wakeId: wake.id,
  };
  if (message)
    return {
      item: {
        ...common,
        source: "owner_message",
        sourceRef: {
          source: "owner_message",
          messageId: message.messageId,
          conversationId: message.conversationId,
          threadId: message.threadId,
        },
      },
    };
  if (!("requestId" in ref)) return { skip: "the wake has no source" };
  const source = wake.source === "approval_result" ? "approval_result" : "answer";
  return {
    item: {
      ...common,
      source,
      sourceRef: {
        source,
        requestId: ref.requestId,
        anchorMessageId: wake.request?.anchorMessageId ?? null,
        request: wake.request,
      },
    },
  };
}

/**
 * Pulls this device's wakes, writes their inbox items in one transaction, then acknowledges
 * them. A crash before the acknowledgement pulls them again; their dedupe keys keep one item.
 * Wakes that this desktop cannot run are acknowledged too, with a logged reason, so that they
 * never block newer wakes. The server adopts unhomed agents at pull, so an agent that looks
 * unknown or homed elsewhere is checked against a fresh catalog first.
 */
export async function pullWakes(context: RuntimeContext) {
  let created = 0;
  let refreshed = false;
  for (let page = 0; page < 20; page++) {
    const wakes = await context.server.pullWakes(context.organizationId, pullLimit);
    if (!wakes.length) break;
    const items: NewInboxItem[] = [];
    const handled: string[] = [];
    for (const wake of wakes) {
      let result = await wakeItem(context, wake);
      if ("skip" in result && !refreshed) {
        refreshed = true;
        context.agents.invalidate();
        result = await wakeItem(context, wake);
      }
      if ("skip" in result) context.log(`Skipped an agent wake: ${result.skip}.`);
      else items.push(result.item);
      handled.push(wake.id);
    }
    const rows = await context.store.inbox.intake(items, context.now());
    created += rows.length;
    await context.server.ackWakes(context.organizationId, handled);
    if (wakes.length < pullLimit) break;
  }
  return created;
}
