import type { CrmActivityPage } from "@substrate/contracts/crm/activity";

import { login, rejected, rejectedMutation } from "./lib/crm-smoke-policy.ts";
import {
  fixture,
  createFromMessage,
  mutate,
  reportPeriod,
  type DealDetail,
  type ContactDetail,
  type CrmData,
  type RelatedContext,
  type MessageLinks,
  type TaskProject,
  type RecordId,
  type Stage,
} from "./lib/crm.ts";
import { apiUrl, organizations, users } from "./lib/data.ts";
import { call } from "./lib/http.ts";
import type { ContextRow, Message } from "./lib/world.ts";
import { check, fail } from "k6";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: { checks: ["rate==1"], api_failures: ["count==0"] },
};

function required<T>(value: T, label: string): NonNullable<T> {
  if (value === null || value === undefined) fail(`CRM smoke failed: ${label}`);
  return value;
}

export default async function () {
  if (__ENV.CRM_SMOKE_CONFIRM !== "substrate_load" || apiUrl !== "http://localhost:3201")
    fail("Use the isolated repository load server and CRM_SMOKE_CONFIRM=substrate_load.");
  const org = organizations[0]!;
  const owner = users.find((row) => row.email === org.ownerEmail)!;
  const member = users.find((row) => row.organizationId === org.id && row.email !== owner.email);
  const outsider = users.find((row) => row.organizationId !== org.id);
  if (!member || !outsider)
    fail(
      "Provision enough fixed users for an owner, member and foreign-tenant persona (LOAD_USERS=24 or more).",
    );
  await login(owner);
  const settings = required(await call<CrmData<"settings">>("crm.settings"), "settings");
  const stages = required(await call<Stage[]>("crm.pipeline"), "pipeline");
  if (stages.length < 2) fail("CRM smoke requires two active pipeline stages.");
  const membership = required(
    await call<{ members: { id: string; userId: string; role: string }[] }>(
      "auth.fullOrganization",
      { organizationId: org.id },
    ),
    "membership",
  ).members.find((row) => row.userId === member.userId);
  if (!membership || membership.role !== "member")
    fail("CRM smoke requires a normal member, not an existing admin.");
  const ids: string[] = [];
  let projectId: string | undefined;
  let conversationId: string | undefined;
  let interactionId: string | undefined;
  let contactId: string | undefined;
  let publicationId: string | undefined;
  let sourceAccountId: string | undefined;
  let roleChanged = false;
  const marker = `CRM smoke ${crypto.randomUUID()}`;
  try {
    const accountInput = {
      action: "createAccount" as const,
      name: marker,
      requestId: crypto.randomUUID(),
    };
    const account = required(await mutate(accountInput), "account creation");
    ids.push(account.entityId);
    const accountReplay = required(await mutate(accountInput), "account replay");
    check(accountReplay, {
      "account request replay returns the same record": (row) => row.entityId === account.entityId,
    });
    await rejectedMutation(
      { organizationId: org.id, ...accountInput, name: `${marker} changed` },
      409,
    );
    const contact = required(
      await mutate({ action: "createContact", displayName: marker }),
      "contact creation",
    );
    ids.push(contact.entityId);
    contactId = contact.entityId;
    await mutate({
      action: "updateAccount",
      entityId: account.entityId,
      name: `${marker} edited`,
      summary: "Rollout customer",
    });
    await mutate({
      action: "updateContact",
      entityId: contact.entityId,
      displayName: `${marker} contact`,
      notes: "Commercial lead",
    });
    await mutate({
      action: "setAffiliation",
      contactEntityId: contact.entityId,
      accountEntityId: account.entityId,
      title: "Buyer",
      isPrimary: true,
    });
    const [accountRead, contactRead] = await Promise.all([
      call<CrmData<"getAccount">>("crm.account", {
        entityId: account.entityId,
      }),
      call<ContactDetail>("crm.contact", {
        entityId: contact.entityId,
      }),
    ]);
    check(accountRead, {
      "account edit persists": (row) =>
        row?.account.name === `${marker} edited` && row.account.summary === "Rollout customer",
    });
    check(contactRead, {
      "contact edit persists": (row) =>
        row?.profile.displayName === `${marker} contact` && row.profile.notes === "Commercial lead",
    });
    const dealInput = {
      action: "createDeal" as const,
      requestId: crypto.randomUUID(),
      title: marker,
      accountEntityId: account.entityId,
      contactEntityIds: [contact.entityId],
      primaryContactEntityId: contact.entityId,
      stageId: stages[0]!.id,
      amount: "24000",
      currency: "USD",
    };
    const deal = required(await mutate(dealInput), "deal creation");
    ids.push(deal.entityId);
    const replay = required(await mutate(dealInput), "deal replay");
    check(replay, {
      "deal request replay returns the same record": (row) => row.entityId === deal.entityId,
    });
    await mutate({
      ...dealInput,
      action: "updateDeal",
      entityId: deal.entityId,
      expectedVersion: 1,
      title: `${marker} revised`,
    });
    let detail = required(
      await call<DealDetail>("crm.deal", { entityId: deal.entityId }),
      "deal detail",
    );
    check(detail, {
      "deal edit keeps account and primary contact refs": (row) =>
        row.deal.title === `${marker} revised` &&
        row.deal.version === 2 &&
        row.deal.accountEntityId === account.entityId &&
        row.contacts.some((item) => item.contact.entityId === contact.entityId && item.isPrimary),
    });
    const transition = {
      action: "transitionDeal" as const,
      entityId: deal.entityId,
      expectedVersion: detail.deal.version,
      requestId: crypto.randomUUID(),
      stageId: stages[1]!.id,
      outcome: "open" as const,
    };
    await mutate(transition);
    await mutate(transition);
    await rejectedMutation(
      { organizationId: org.id, ...transition, requestId: crypto.randomUUID() },
      409,
    );
    detail = required(
      await call<DealDetail>("crm.deal", { entityId: deal.entityId }),
      "transition read",
    );
    check(detail, {
      "transition replay increments version only once": (row) =>
        row.deal.version === 3 && row.deal.stageId === stages[1]!.id,
    });

    const interaction = required(
      await mutate({
        action: "createInteraction",
        contactEntityId: contact.entityId,
        kind: "call",
        occurredAt: new Date().toISOString(),
        summary: marker,
      }),
      "manual interaction",
    );
    interactionId = interaction.entityId;
    await mutate({
      action: "updateInteraction",
      entityId: interactionId,
      summary: `${marker} call edited`,
    });
    const interactions = await call<CrmData<"interactions">>("crm.interactions", {
      contactEntityId: contact.entityId,
    });
    check(interactions, {
      "manual interaction edit is visible on the contact": (rows) =>
        !!rows?.some(
          (row) => row.entityId === interactionId && row.summary === `${marker} call edited`,
        ),
    });
    projectId = required(
      await call<{ id: string }>("tasks.mutations", { action: "createProject", name: marker }),
      "follow-up project",
    ).id;
    const followInput = {
      action: "createFollowUp" as const,
      entityId: deal.entityId,
      projectEntityId: projectId,
      title: marker,
      dueDate: new Date().toISOString().slice(0, 10),
      requestId: crypto.randomUUID(),
      consentToTaskAudience: true as const,
    };
    const task = required(await mutate(followInput), "follow-up");
    const taskReplay = required(await mutate(followInput), "follow-up replay");
    const followUps = await call<CrmData<"followUps">>("crm.followUps", {
      entityId: deal.entityId,
    });
    check(followUps, {
      "follow-up replay preserves one task and structured project/source link": (row) =>
        task.entityId === taskReplay.entityId &&
        row?.tasks.filter(
          (item) => item.entityId === task.entityId && item.projectEntityId === projectId,
        ).length === 1 &&
        row.nextAction?.entityId === task.entityId,
    });
    const board = await call<TaskProject>("tasks.project", {
      projectEntityId: projectId,
    });
    check(board, {
      "follow-up is a real task in the required project": (row) =>
        !!row?.tasks.some((item) => item.entityId === task.entityId),
    });

    conversationId = required(
      await call<{ id: string }>("messaging.conversations.create", {
        kind: "channel",
        name: marker,
        private: true,
      }),
      "discussion conversation",
    ).id;
    const message = required(
      await call<Message>("messaging.messages.send", {
        conversationId,
        body: "Review the customer rollout.",
        requestId: crypto.randomUUID(),
      }),
      "discussion message",
    );
    for (const entityId of [...ids, interactionId]) {
      await call("context.links.attach", { messageId: message.id, entityId });
      const related = await call<RelatedContext>("context.related", { entityId });
      check(related, {
        "CRM target backlink includes the attached discussion": (rows) =>
          !!rows?.some((row) => row.messageId === message.id),
      });
    }
    const context = await call<ContextRow[]>("context.messagePage", { messageIds: [message.id] });
    check(context, {
      "discussion context keeps structured CRM target IDs": (rows) =>
        [...ids, interactionId].every((id) =>
          rows?.some(
            (row) => row.messageId === message.id && row.links.some((link) => link.entityId === id),
          ),
        ),
    });
    for (const entityId of [...ids, interactionId])
      await call("context.links.detach", { messageId: message.id, entityId });
    const detached = await call<ContextRow[]>("context.messagePage", { messageIds: [message.id] });
    check(detached, {
      "manual detach removes CRM associations": (rows) =>
        !!rows &&
        !rows.some((row) =>
          row.links.some((link) => [...ids, interactionId].includes(link.entityId)),
        ),
    });
    const afterDetach = await call<RelatedContext>("context.related", {
      entityId: deal.entityId,
    });
    check(afterDetach, {
      "detach removes the discussion backlink": (rows) =>
        !!rows && !rows.some((row) => row.messageId === message.id),
    });
    const sourceInput = {
      kind: "account" as const,
      messageId: message.id,
      requestId: crypto.randomUUID(),
      consentToRecordAudience: true as const,
      associate: false,
      fields: { name: `${marker} sourced`, summary: "Reviewed commercial summary" },
    };
    const sourced = required(
      await createFromMessage(sourceInput),
      "source-backed account creation",
    );
    sourceAccountId = sourced.entityId;
    const sourcedReplay = required(
      await createFromMessage(sourceInput),
      "source-backed account replay",
    );
    check(sourcedReplay, {
      "source-backed CRM request replay returns the same account": (row) =>
        row.entityId === sourceAccountId && row.entityType === "account",
    });
    const sourcedAccounts = await call<CrmData<"listAccounts">>("crm.accounts", {
      search: sourceInput.fields.name,
    });
    check(sourcedAccounts, {
      "source-backed CRM replay creates exactly one account": (rows) =>
        rows?.length === 1 && rows[0]?.entityId === sourceAccountId,
    });
    const sourceRecord = await call<CrmData<"getAccount">>("crm.account", {
      entityId: sourceAccountId,
    });
    check(sourceRecord, {
      "source-backed CRM creation stores reviewed fields, not private source text": (row) =>
        row?.account.name === sourceInput.fields.name &&
        row.account.summary === sourceInput.fields.summary,
    });
    const sourceLinks = await call<MessageLinks>("context.messageLinks", { messageId: message.id });
    check(sourceLinks, {
      "associate false retains structured non-removable CRM provenance": (rows) => {
        const links = rows?.filter((row) => row.entityId === sourceAccountId);
        return (
          links?.length === 1 && links[0]?.purpose === "source" && links[0].canRemove === false
        );
      },
    });
    const sourceBacklinks = await call<RelatedContext>("context.related", {
      entityId: sourceAccountId,
    });
    check(sourceBacklinks, {
      "source-backed CRM account backlink keeps the original message identity": (rows) =>
        !!rows?.some((row) => row.messageId === message.id && row.purpose === "source"),
    });
    const publishInput = {
      action: "publishInteraction" as const,
      contactEntityId: contact.entityId,
      kind: "message" as const,
      occurredAt: new Date().toISOString(),
      summary: "Approved rollout summary",
      messageId: message.id,
      consentToContactAudience: true as const,
    };
    const published = required(await mutate(publishInput), "message publication");
    publicationId = published.entityId;
    const publicationReplay = required(await mutate(publishInput), "publication replay");
    await call("context.links.attach", { messageId: message.id, entityId: publicationId });
    await call("context.links.detach", { messageId: message.id, entityId: publicationId });
    const provenance = await call<MessageLinks>("context.messageLinks", { messageId: message.id });
    check(provenance, {
      "manual detach preserves immutable publication source": (rows) =>
        published.entityId === publicationReplay.entityId &&
        !!rows?.some(
          (row) =>
            row.entityId === publicationId && row.purpose === "source" && row.canRemove === false,
        ),
    });

    const period = reportPeriod();
    const drilldown = await call<CrmData<"reportDeals">>("crm.reportDeals", {
      cohort: "due_today",
      ownerActorEntityId: detail.deal.ownerActorEntityId,
      limit: 100,
    });
    check(drilldown, {
      "report due-today cohort contains the deal with a follow-up": (row) =>
        !!row?.items.some((item) => item.entityId === deal.entityId),
    });
    await mutate({
      action: "transitionDeal",
      entityId: deal.entityId,
      expectedVersion: 3,
      requestId: crypto.randomUUID(),
      stageId: stages[1]!.id,
      outcome: "won",
    });
    const report = await call<CrmData<"report">>("crm.report", {
      ...period,
      ownerActorEntityId: detail.deal.ownerActorEntityId,
    });
    check(report, {
      "closed report includes this won deal": (row) =>
        !!row &&
        row.won >= 1 &&
        row.closedDeals.some((item) => item.entityId === deal.entityId && item.outcome === "won"),
    });
    await mutate({
      action: "transitionDeal",
      entityId: deal.entityId,
      expectedVersion: 4,
      requestId: crypto.randomUUID(),
      stageId: stages[1]!.id,
      outcome: "open",
    });
    const reopened = await call<DealDetail>("crm.deal", { entityId: deal.entityId });
    check(reopened, {
      "reopening clears the previous close timestamp": (row) =>
        row?.deal.version === 5 && row.deal.outcome === "open" && row.deal.closedAt === null,
    });
    await mutate({
      action: "transitionDeal",
      entityId: deal.entityId,
      expectedVersion: 5,
      requestId: crypto.randomUUID(),
      stageId: stages[1]!.id,
      outcome: "lost",
      lostReason: "Customer deferred the rollout.",
    });
    const lost = await call<DealDetail>("crm.deal", { entityId: deal.entityId });
    check(lost, {
      "lost transition keeps its reason and actual close time": (row) =>
        row?.deal.version === 6 &&
        row.deal.outcome === "lost" &&
        row.deal.lostReason === "Customer deferred the rollout." &&
        !!row.deal.closedAt,
    });

    await login(member);
    await rejected(
      "crm/account",
      { organizationId: org.id, entityId: account.entityId },
      404,
      marker,
    );
    const hidden = await call<CrmData<"listAccounts">>("crm.accounts", { search: marker });
    check(hidden, {
      "member list hides unshared customer": (rows) =>
        !!rows && !rows.some((row) => row.entityId === account.entityId),
    });
    await rejected(
      "crm/activity",
      { organizationId: org.id, entityId: deal.entityId },
      404,
      marker,
    );
    await rejectedMutation(
      {
        organizationId: org.id,
        action: "updateAccount",
        entityId: account.entityId,
        name: "Unauthorized customer edit",
      },
      404,
      marker,
    );
    await rejectedMutation(
      {
        organizationId: org.id,
        action: "createFollowUp",
        entityId: fixture(member).dealEntityId,
        projectEntityId: projectId,
        requestId: crypto.randomUUID(),
        title: "Inaccessible project follow-up",
        consentToTaskAudience: true,
      },
      404,
    );
    await rejectedMutation(
      { organizationId: org.id, action: "updateSettings", defaultCurrency: "GBP" },
      404,
    );
    await rejectedMutation(
      {
        organizationId: org.id,
        action: "configureStages",
        stages: stages.map(({ id, name }) => ({ id, name })),
      },
      404,
    );
    await login(outsider);
    await rejected(
      "crm/account",
      { organizationId: org.id, entityId: account.entityId },
      403,
      marker,
    );
    await rejected(
      "crm/account",
      { organizationId: outsider.organizationId, entityId: account.entityId },
      404,
      marker,
    );
    await rejected(
      "crm/activity",
      { organizationId: outsider.organizationId, entityId: deal.entityId },
      404,
      marker,
    );
    await rejectedMutation(
      { organizationId: org.id, action: "updateSettings", defaultCurrency: "GBP" },
      403,
    );
    await login(owner);
    const protectedAccount = await call<CrmData<"getAccount">>("crm.account", {
      entityId: account.entityId,
    });
    check(protectedAccount, {
      "denied customer edits leave the original record unchanged": (row) =>
        row?.account.name === `${marker} edited`,
    });
    await mutate({ action: "updateSettings", defaultCurrency: "EUR" });
    const renamed = stages.map((stage, index) => ({
      id: stage.id,
      name: index === 0 ? `${stage.name} smoke` : stage.name,
    }));
    await mutate({ action: "configureStages", stages: renamed });
    check(await call<Stage[]>("crm.pipeline"), {
      "owner pipeline rename persists without replacing IDs": (rows) =>
        rows?.[0]?.id === renamed[0]!.id && rows[0].name === renamed[0]!.name,
    });
    check(await call<CrmData<"settings">>("crm.settings"), {
      "owner settings edit persists": (row) => row?.defaultCurrency === "EUR",
    });
    required(
      await call("auth.updateMemberRole", {
        organizationId: org.id,
        memberId: membership.id,
        role: "admin",
      }),
      "admin promotion",
    );
    roleChanged = true;
    await login(member);
    await mutate({ action: "updateSettings", defaultCurrency: "GBP" });
    await mutate({
      action: "configureStages",
      stages: stages.map(({ id, name }) => ({ id, name })),
    });
    check(await call<CrmData<"settings">>("crm.settings"), {
      "admin settings edit persists": (row) => row?.defaultCurrency === "GBP",
    });
    check(await call<Stage[]>("crm.pipeline"), {
      "admin pipeline change persists": (rows) => rows?.[0]?.name === stages[0]!.name,
    });
    const unchanged = await call<DealDetail>("crm.deal", { entityId: deal.entityId });
    check(unchanged, {
      "management edits preserve existing deal version": (row) => row?.deal.version === 6,
    });
    await rejected(
      "messaging/messages",
      { organizationId: org.id, conversationId },
      404,
      "Review the customer rollout.",
    );
    const memberDeal = required(
      await call<DealDetail>("crm.deal", { entityId: fixture(member).dealEntityId }),
      "member actor identity",
    );
    await mutate({
      action: "assignOwner",
      entityId: deal.entityId,
      expectedVersion: 6,
      expectedOwnerActorEntityId: detail.deal.ownerActorEntityId,
      ownerActorEntityId: memberDeal.deal.ownerActorEntityId,
      accessDecision: "keep_restricted",
    });
    const assigned = await call<DealDetail>("crm.deal", { entityId: deal.entityId });
    check(assigned, {
      "admin owner assignment persists with optimistic version": (row) =>
        row?.deal.ownerActorEntityId === memberDeal.deal.ownerActorEntityId &&
        row.deal.version === 7,
    });
    const activity = required(
      await call<CrmActivityPage>("crm.activity", { entityId: deal.entityId, limit: 100 }),
      "CRM activity",
    );
    check(activity, {
      "activity records stage and management changes with human attribution": (page) =>
        page.items.filter((row) => row.action === "stage_changed").length === 4 &&
        page.items.some(
          (row) =>
            row.action === "owner_changed" && row.actor.type === "human" && !!row.actor.displayName,
        ),
      "activity does not leak private message text, IDs or customer field values": (page) =>
        ![
          "Review the customer rollout.",
          message.id,
          conversationId!,
          marker,
          "Approved rollout summary",
        ].some((text) => JSON.stringify(page).includes(text)),
    });
    const firstPage = required(
      await call<CrmActivityPage>("crm.activity", { entityId: deal.entityId, limit: 2 }),
      "first activity page",
    );
    if (!firstPage.nextCursor) fail("CRM smoke activity must have a continuation cursor.");
    const nextPage = required(
      await call<CrmActivityPage>("crm.activity", {
        entityId: deal.entityId,
        limit: 100,
        beforeCreatedAt: firstPage.nextCursor.createdAt,
        beforeId: firstPage.nextCursor.id,
      }),
      "activity continuation",
    );
    check(nextPage, {
      "stable activity cursor has no missing or duplicate events": (page) =>
        [...firstPage.items, ...page.items].map((row) => row.id).join(",") ===
        activity.items.map((row) => row.id).join(","),
    });

    await login(owner);
    for (const entityId of ids) {
      await mutate(
        { action: "archive", entityId, archived: true },
        entityId === contactId ? "contacts" : "crm",
      );
      let route: "crm.accounts" | "crm.contacts" | "crm.deals" = "crm.deals";
      if (entityId === account.entityId) route = "crm.accounts";
      if (entityId === contact.entityId) route = "crm.contacts";
      const archived = await archiveRows(route, marker, "archived");
      check(archived, {
        "archived CRM record is in archived results": (rows) =>
          !!rows?.some((row) => row.entityId === entityId),
      });
      const active = await archiveRows(route, marker, "active");
      check(active, {
        "archived CRM record leaves active results": (rows) =>
          !!rows && !rows.some((row) => row.entityId === entityId),
      });
    }
  } finally {
    await login(owner);
    if (roleChanged)
      await call("auth.updateMemberRole", {
        organizationId: org.id,
        memberId: membership.id,
        role: membership.role,
      });
    await mutate({ action: "updateSettings", defaultCurrency: settings.defaultCurrency });
    await mutate({
      action: "configureStages",
      stages: stages.map(({ id, name }) => ({ id, name })),
    });
    if (interactionId) await mutate({ action: "deleteInteraction", entityId: interactionId });
    if (publicationId) await mutate({ action: "deleteInteraction", entityId: publicationId });
    if (sourceAccountId)
      await mutate({ action: "archive", entityId: sourceAccountId, archived: true });
    for (const entityId of ids.toReversed())
      await mutate(
        { action: "archive", entityId, archived: true },
        entityId === contactId ? "contacts" : "crm",
      );
    if (conversationId) await call("messaging.conversations.delete", { conversationId });
    if (projectId)
      await call("tasks.mutations", { action: "deleteProject", projectEntityId: projectId });
    await call("auth.signOut");
  }
}

async function archiveRows(
  route: "crm.accounts" | "crm.contacts" | "crm.deals",
  search: string,
  archived: "active" | "archived",
) {
  if (route === "crm.contacts") {
    const rows = await call<CrmData<"listContacts">>(route, { search, archived });
    return rows?.map((row) => row.contact) ?? null;
  }
  return call<RecordId[]>(route, { search, archived });
}
