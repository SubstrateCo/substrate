import { leaseTools, mcpTools } from "./index.ts";
import { expect, test } from "bun:test";

test("CRM tools use server scope and reject model-supplied trusted context", () => {
  const requestId = crypto.randomUUID();
  const entityId = crypto.randomUUID();
  const deal = {
    requestId,
    title: "Sale",
    accountEntityId: entityId,
    stageId: crypto.randomUUID(),
  };
  const samples = {
    create_crm_from_message: {
      kind: "account",
      fields: { name: "Customer" },
      messageId: crypto.randomUUID(),
      requestId,
      consentToRecordAudience: true,
    },
    list_crm_activity: { entityId },
    get_crm_settings: {},
    update_crm_settings: { requestId, defaultCurrency: null },
    create_crm_follow_up: {
      requestId,
      entityId,
      projectEntityId: crypto.randomUUID(),
      title: "Call buyer",
      consentToTaskAudience: true,
    },
    list_crm_records: { kind: "account" },
    get_crm_record: { kind: "account", entityId },
    get_crm_pipeline: {},
    create_crm_account: { requestId, name: "Customer" },
    create_crm_contact: { requestId, displayName: "Buyer" },
    create_crm_deal: deal,
    update_crm_account: { requestId, entityId, name: "Customer" },
    update_crm_contact: { requestId, entityId, displayName: "Buyer" },
    update_crm_deal: { ...deal, entityId, expectedVersion: 1 },
    transition_crm_deal: {
      requestId,
      entityId,
      expectedVersion: 1,
      stageId: deal.stageId,
      outcome: "open",
    },
    list_crm_interactions: { contactEntityId: entityId },
    create_crm_interaction: {
      requestId,
      contactEntityId: entityId,
      kind: "call",
      occurredAt: "2026-11-12T10:00:00Z",
      summary: "Discussed proposal.",
    },
    publish_crm_interaction: {
      contactEntityId: entityId,
      messageId: crypto.randomUUID(),
      kind: "message",
      occurredAt: "2026-11-12T10:00:00Z",
      summary: "Approved summary.",
      consentToContactAudience: true,
    },
  };
  for (const name of [
    "create_crm_from_message",
    "list_crm_activity",
    "get_crm_settings",
    "update_crm_settings",
    "create_crm_follow_up",
    "list_crm_records",
    "get_crm_record",
    "get_crm_pipeline",
    "create_crm_account",
    "create_crm_contact",
    "create_crm_deal",
    "update_crm_account",
    "update_crm_contact",
    "update_crm_deal",
    "transition_crm_deal",
    "list_crm_interactions",
    "create_crm_interaction",
    "publish_crm_interaction",
  ] as const) {
    const tool = mcpTools[name];
    expect(tool.scope).toBe("server");
    expect(leaseTools("main")).toContain(name);
    const input = samples[name];
    expect(tool.input.safeParse(input).success).toBe(true);
    for (const field of [
      "organizationId",
      "userId",
      "actorEntityId",
      "agentId",
      "turn",
      "installationId",
    ]) {
      expect(tool.input.safeParse({ ...input, [field]: crypto.randomUUID() }).success).toBe(false);
    }
  }
  expect(mcpTools.list_crm_records.input.safeParse({ kind: "account", limit: 101 }).success).toBe(
    false,
  );
  expect(
    mcpTools.list_crm_records.input.safeParse({ kind: "account", search: "Customer" }).success,
  ).toBe(true);
});

test("source publication requires the shared audience-consent contract", () => {
  const input = {
    contactEntityId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    kind: "message",
    occurredAt: "2026-11-12T10:00:00Z",
    summary: "Approved summary.",
  };
  expect(mcpTools.publish_crm_interaction.input.safeParse(input).success).toBe(false);
  expect(
    mcpTools.publish_crm_interaction.input.safeParse({ ...input, consentToContactAudience: false })
      .success,
  ).toBe(false);
  expect(
    mcpTools.publish_crm_interaction.input.safeParse({ ...input, consentToContactAudience: true })
      .success,
  ).toBe(true);
});

test("manual messaging links accept supported CRM entities but not human actors", () => {
  const messageId = crypto.randomUUID();
  const id = crypto.randomUUID();
  for (const tool of [mcpTools.attach_message, mcpTools.detach_message]) {
    for (const type of ["contact", "account", "deal", "contact_interaction"])
      expect(tool.input.safeParse({ messageId, target: { type, id } }).success).toBe(true);
    expect(tool.input.safeParse({ messageId, target: { type: "person", id } }).success).toBe(false);
  }
});

test("CRM changes require retry identity and stage changes require the observed version", () => {
  expect(mcpTools.create_crm_account.input.safeParse({ name: "Customer" }).success).toBe(false);
  expect(
    mcpTools.create_crm_account.input.safeParse({
      requestId: crypto.randomUUID(),
      name: "Customer",
    }).success,
  ).toBe(true);
  const transition = {
    requestId: crypto.randomUUID(),
    entityId: crypto.randomUUID(),
    stageId: crypto.randomUUID(),
    outcome: "won",
  };
  expect(mcpTools.transition_crm_deal.input.safeParse(transition).success).toBe(false);
  expect(
    mcpTools.transition_crm_deal.input.safeParse({ ...transition, expectedVersion: 1 }).success,
  ).toBe(true);
  for (const name of [
    "create_crm_from_message",
    "update_crm_settings",
    "create_crm_follow_up",
    "create_crm_account",
    "create_crm_contact",
    "create_crm_deal",
    "update_crm_account",
    "update_crm_contact",
    "update_crm_deal",
    "transition_crm_deal",
    "create_crm_interaction",
    "publish_crm_interaction",
  ] as const) {
    expect(mcpTools[name].readOnly).toBe(false);
    expect(mcpTools[name].idempotent).toBe(true);
  }
});

test("message-backed CRM creation reuses strict kind-specific forms and requires audience consent", () => {
  const source = {
    messageId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    consentToRecordAudience: true,
  };
  for (const record of [
    { kind: "account", fields: { name: "Company" } },
    { kind: "contact", fields: { displayName: "Buyer" } },
    {
      kind: "deal",
      fields: { title: "Sale", accountEntityId: crypto.randomUUID(), stageId: crypto.randomUUID() },
    },
  ])
    expect(mcpTools.create_crm_from_message.input.safeParse({ ...source, ...record }).success).toBe(
      true,
    );
  const input = { ...source, kind: "account", fields: { name: "Company" } };
  expect(
    mcpTools.create_crm_from_message.input.safeParse({ ...input, consentToRecordAudience: false })
      .success,
  ).toBe(false);
  expect(
    mcpTools.create_crm_from_message.input.safeParse({
      ...input,
      consentToRecordAudience: undefined,
    }).success,
  ).toBe(false);
  expect(
    mcpTools.create_crm_from_message.input.safeParse({ ...input, requestId: undefined }).success,
  ).toBe(false);
  expect(
    mcpTools.create_crm_from_message.input.safeParse({
      ...input,
      fields: { displayName: "Wrong form" },
    }).success,
  ).toBe(false);
  expect(
    mcpTools.create_crm_from_message.input.safeParse({
      ...input,
      fields: { name: "Company", actorEntityId: crypto.randomUUID() },
    }).success,
  ).toBe(false);
});

test("CRM follow-ups require a project, date-only due date and task-audience consent", () => {
  const input = {
    requestId: crypto.randomUUID(),
    entityId: crypto.randomUUID(),
    title: "Call buyer",
  };
  const projectEntityId = crypto.randomUUID();
  expect(mcpTools.create_crm_follow_up.input.safeParse(input).success).toBe(false);
  expect(mcpTools.create_crm_follow_up.input.safeParse({ ...input, projectEntityId }).success).toBe(
    false,
  );
  expect(
    mcpTools.create_crm_follow_up.input.safeParse({
      ...input,
      projectEntityId,
      consentToTaskAudience: false,
    }).success,
  ).toBe(false);
  expect(
    mcpTools.create_crm_follow_up.input.safeParse({
      ...input,
      projectEntityId,
      consentToTaskAudience: true,
      dueDate: "2026-11-20",
    }).success,
  ).toBe(true);
  expect(
    mcpTools.create_crm_follow_up.input.safeParse({
      ...input,
      projectEntityId,
      consentToTaskAudience: true,
      dueDate: "2026-11-20T10:00:00Z",
    }).success,
  ).toBe(false);
});

test("CRM link reads accept supported entity targets and keep message and core relations distinct", () => {
  for (const type of ["contact", "account", "deal", "contact_interaction"]) {
    for (const source of ["messages", "entities"])
      expect(
        mcpTools.list_links.input.safeParse({ target: { type, id: crypto.randomUUID() }, source })
          .success,
      ).toBe(true);
  }
  expect(
    mcpTools.list_links.input.safeParse({
      target: { type: "person", id: crypto.randomUUID() },
      source: "entities",
    }).success,
  ).toBe(false);
  expect(
    mcpTools.list_links.input.safeParse({
      target: { type: "message", id: crypto.randomUUID() },
      source: "entities",
    }).success,
  ).toBe(false);
  expect(
    mcpTools.list_links.input.safeParse({
      target: { type: "account", id: crypto.randomUUID() },
      source: "entities",
      kind: "attachment",
    }).success,
  ).toBe(false);
});

test("interaction continuation validates the repository's occurrence-time and entity-ID cursor", () => {
  const input = { contactEntityId: crypto.randomUUID() };
  const before = { occurredAt: "2026-11-12T10:00:00Z", entityId: crypto.randomUUID() };
  expect(mcpTools.list_crm_interactions.input.parse(input).limit).toBe(50);
  expect(
    mcpTools.list_crm_interactions.input.safeParse({ ...input, before, limit: 100 }).success,
  ).toBe(true);
  expect(
    mcpTools.list_crm_interactions.input.safeParse({
      ...input,
      before: { ...before, occurredAt: "yesterday" },
    }).success,
  ).toBe(false);
  expect(
    mcpTools.list_crm_interactions.input.safeParse({
      ...input,
      before: { ...before, entityId: "not-an-id" },
    }).success,
  ).toBe(false);
  expect(mcpTools.list_crm_interactions.input.safeParse({ ...input, limit: 101 }).success).toBe(
    false,
  );
});

test("shared CRM activity output rejects private agent identity fields", () => {
  const event = {
    id: crypto.randomUUID(),
    entityId: crypto.randomUUID(),
    action: "created",
    changedFields: [],
    createdAt: "2026-11-12T10:00:00Z",
    actor: { type: "agent", displayName: "Agent on behalf of Alice" },
  };
  expect(
    mcpTools.list_crm_activity.output.safeParse({ items: [event], nextCursor: null }).success,
  ).toBe(true);
  expect(
    mcpTools.list_crm_activity.output.safeParse({
      items: [
        {
          ...event,
          actor: { ...event.actor, agentId: crypto.randomUUID(), name: "Private agent name" },
        },
      ],
      nextCursor: null,
    }).success,
  ).toBe(false);
  expect(
    mcpTools.list_crm_activity.input.safeParse({ entityId: event.entityId, limit: 101 }).success,
  ).toBe(false);
});
