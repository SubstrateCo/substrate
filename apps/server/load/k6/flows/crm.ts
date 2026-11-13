import { config } from "../lib/config.ts";
import { fixture, mutate, reportPeriod, type DealDetail, type Stage } from "../lib/crm.ts";
import { call } from "../lib/http.ts";
import { think, readTime } from "../lib/pacing.ts";
import { rng } from "../lib/persona.ts";
import type { Message } from "../lib/world.ts";
import { FlowSkipped, type FlowContext } from "./flow.ts";

/** Throughput mix, not the deterministic crm-smoke correctness/management matrix. */
export async function crm({ world }: FlowContext) {
  if (config.mode === "coverage") {
    for (const roll of [0.2, 0.63, 0.72, 0.84, 0.95]) await crmStep({ world }, roll);
    return;
  }
  await crmStep({ world }, rng.next());
}

async function crmStep({ world }: FlowContext, roll: number) {
  const customer = fixture(world.user);
  if (config.mode !== "backfill" && roll < 0.6) {
    await Promise.all([
      call("crm.accounts", { limit: 25 }),
      call("crm.contacts", { limit: 25 }),
      call("crm.deals", { limit: 25 }),
      call("crm.pipeline"),
      call("crm.settings"),
    ]);
    await readTime(12, 600);
    await Promise.all([
      call("crm.deal", { entityId: customer.dealEntityId }),
      call("crm.account", { entityId: customer.accountEntityId }),
      call("crm.contact", { entityId: customer.contactEntityId }),
      call("crm.timeline", { entityId: customer.dealEntityId, limit: 25 }),
      call("crm.activity", { entityId: customer.dealEntityId, limit: 25 }),
      call("crm.followUps", { entityId: customer.dealEntityId }),
    ]);
    if (config.mode === "coverage" || rng.chance(0.15))
      await Promise.all([
        call("crm.report", reportPeriod()),
        call("crm.reportDeals", { cohort: "open", limit: 25 }),
      ]);
    return;
  }
  await think("decide");
  if (roll < 0.67 && config.mode !== "backfill") {
    await mutate({
      action: "updateAccount",
      entityId: customer.accountEntityId,
      name: `Load CRM ${world.user.email}`,
      summary: "Customer is evaluating a phased rollout.",
    });
    await mutate({
      action: "updateContact",
      entityId: customer.contactEntityId,
      notes: "Confirm procurement timeline at the next customer call.",
    });
  } else if (roll < 0.78) {
    // A fresh deal avoids two sessions silently overwriting a shared seed deal.
    const stages = await call<Stage[]>("crm.pipeline");
    if (!stages?.length) throw new FlowSkipped("No CRM pipeline stages");
    const deal = await mutate({
      action: "createDeal",
      requestId: crypto.randomUUID(),
      title: `Customer expansion ${crypto.randomUUID()}`,
      accountEntityId: customer.accountEntityId,
      contactEntityIds: [customer.contactEntityId],
      primaryContactEntityId: customer.contactEntityId,
      stageId: stages[0]!.id,
      amount: String(rng.int(5, 100) * 1000),
      currency: "USD",
    });
    if (!deal) return;
    const detail = await call<DealDetail>("crm.deal", { entityId: deal.entityId });
    if (!detail) return;
    const edited = await mutate({
      action: "updateDeal",
      entityId: deal.entityId,
      expectedVersion: detail.deal.version,
      title: detail.deal.title,
      accountEntityId: customer.accountEntityId,
      contactEntityIds: [customer.contactEntityId],
      primaryContactEntityId: customer.contactEntityId,
      stageId: detail.deal.stageId,
      amount: "36000",
      currency: "USD",
      summary: "Commercial scope confirmed.",
    });
    if (!edited) return;
    const latest = await call<DealDetail>("crm.deal", { entityId: deal.entityId });
    if (!latest) return;
    const outcome = rng.pick(["open", "open", "open", "won", "lost"] as const)!;
    await mutate({
      action: "transitionDeal",
      entityId: deal.entityId,
      expectedVersion: latest.deal.version,
      requestId: crypto.randomUUID(),
      stageId: (stages[1] ?? stages[0])!.id,
      outcome,
      lostReason: outcome === "lost" ? "Customer deferred the rollout." : null,
    });
    await mutate({ action: "archive", entityId: deal.entityId, archived: true });
  } else if (roll < 0.9) {
    await mutate({
      action: "createInteraction",
      contactEntityId: customer.contactEntityId,
      kind: rng.chance(0.5) ? "call" : "meeting",
      occurredAt: new Date().toISOString(),
      summary: "Reviewed rollout scope, pricing and next steps with the customer.",
    });
    await call("crm.interactions", { contactEntityId: customer.contactEntityId });
    if (config.mode === "coverage" || rng.chance(0.3))
      await mutate({
        action: "createFollowUp",
        entityId: customer.dealEntityId,
        projectEntityId: customer.projectEntityId,
        requestId: crypto.randomUUID(),
        title: "Confirm customer rollout plan",
        consentToTaskAudience: true,
      });
  } else {
    const conversation = rng.pick(world.conversations.filter((row) => row.joined && row.canPost));
    if (!conversation) throw new FlowSkipped("No writable conversation for CRM context");
    const message = await call<Message>("messaging.messages.send", {
      conversationId: conversation.id,
      body: "Customer rollout needs a commercial review.",
      requestId: crypto.randomUUID(),
    });
    if (!message) return;
    if (
      await call("context.links.attach", { messageId: message.id, entityId: customer.dealEntityId })
    ) {
      await call("context.related", { entityId: customer.dealEntityId });
      await call("context.messagePage", { messageIds: [message.id] });
      if (config.mode === "coverage" || rng.chance(0.2))
        await call("context.links.detach", {
          messageId: message.id,
          entityId: customer.dealEntityId,
        });
    }
  }
}
