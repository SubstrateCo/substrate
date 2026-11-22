import { sessionKeys } from "@substrate/contracts/agent-work";
import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";
import { mcpTools, type McpOutput, type ServerToolName } from "@substrate/contracts/harness/tools";
import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import { ensureUserAgentActor } from "../../../../../packages/database/src/core/actors/provisioning";
import { organizationApps } from "../../../../../packages/database/src/core/apps/schema";
import { registerDevice } from "../../../../../packages/database/src/core/devices/repository";
import type { DatabaseExecutor } from "../../../../../packages/database/src/core/executor";
import {
  AccessDeniedError,
  AppDisabledError,
  ConflictError,
} from "../../../../../packages/database/src/errors";
import { crmActivityEvents } from "../../../../../packages/database/src/features/crm/activity.schema";
import { crmStages } from "../../../../../packages/database/src/features/crm/schema";
import { crmSettings } from "../../../../../packages/database/src/features/crm/settings.schema";
import { agentToolRequests } from "../../../../../packages/database/src/features/mcp/schema";
import { createMessagingService } from "../../../../../packages/database/src/features/messaging/service";
import {
  entities,
  member,
  user,
  userAgents,
  taskActivity,
  tasks,
  contactInteractions,
  messagingConversations,
  agentWakes,
  messageEntityReferences,
  messagingMessages,
  messagingParticipants,
} from "../../../../../packages/database/src/schema";
import { discardEffects } from "../../../../../packages/database/src/testing/connection";
import { contextConversation } from "../../../../../packages/database/src/testing/context";
import { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { recordQueries } from "../../../../../packages/database/src/testing/queries";
import { rejection } from "../../../../../packages/database/src/testing/rejection";
import { scopeFixture } from "../../test-support";
import { executeAgentTool as executeCommittedTool } from "./execution";
import { createMcpService } from "./service";
import { expect, spyOn, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

const f = setupDatabase();

// Tests that inspect only the payload still use the production commit boundary.
async function executeAgentTool<K extends ServerToolName>(
  db: DatabaseExecutor,
  identity: Parameters<typeof executeCommittedTool>[1],
  tool: K,
  input: WorkspaceApiRequest["input"],
  context: TurnContext,
) {
  const { result } = await executeCommittedTool(db, identity, tool, input, context);
  // SAFETY: execution parses this payload with the schema registered for K.
  return { ...result, output: result.output as McpOutput<K> };
}

function trackedTransactions(failAfterWork = false) {
  let count = 0;
  const failure = new Error("Abort tool transaction");
  const track = (db: DatabaseExecutor, root = true): DatabaseExecutor =>
    discardEffects(
      new Proxy(db, {
        get(target, property: keyof DatabaseExecutor) {
          if (property !== "transaction") return target[property];
          return <T>(work: (tx: DatabaseExecutor) => Promise<T>) => {
            count++;
            return target.transaction(async (tx) => {
              const result = await work(track(tx, false));
              if (root && failAfterWork) throw failure;
              return result;
            });
          };
        },
      }),
    );
  return { db: track(f.db), count: () => count, failure };
}

// An interactive turn without a source place on the agent's home desktop: every tool may run,
// and reply needs a `to`.
const turn = {
  turnId: crypto.randomUUID(),
  attempt: 1,
  sessionKey: sessionKeys.routine(crypto.randomUUID()),
  origin: null,
  kind: "interactive" as const,
  installationId: crypto.randomUUID(),
};

async function fixture() {
  await f.db.update(user).set({ emailVerified: true });
  const device = await registerDevice(f.db, "alice", {
    installationId: turn.installationId,
    name: "Laptop",
    platform: "win32",
  });
  const [agent] = await f.db
    .insert(userAgents)
    .values({
      userId: "alice",
      name: "Research",
      instructions: "",
      harness: "opencode",
      homeDeviceId: device.id,
    })
    .returning();
  const actor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    userAgentId: agent!.id,
  });
  const identity = { organizationId: f.orgA, userId: "alice", actorEntityId: actor.entityId };
  const human = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  // Each call parses its result with the tool's own output schema, as the MCP server does.
  const call = async <K extends ServerToolName>(tool: K, input: WorkspaceApiRequest["input"]) =>
    // SAFETY: the result was parsed with the output schema registered for tool K.
    mcpTools[tool].output.parse(
      (await executeAgentTool(f.db, identity, tool, input, turn)).output,
    ) as McpOutput<K>;
  const createTask = (input: WorkspaceApiRequest["input"]) =>
    call("create_task", { requestId: crypto.randomUUID(), projectId: project.entityId, ...input });
  return { actor, agentId: agent!.id, identity, human, project, call, createTask };
}

async function setCreatedAt(id: string, createdAt: string) {
  await f.db
    .update(messagingMessages)
    .set({ createdAt: new Date(createdAt) })
    .where(eq(messagingMessages.id, id));
}

test("disabled app tools reject fresh calls and cached writes from stale sessions", async () => {
  const { call, project } = await fixture();
  const input = {
    requestId: crypto.randomUUID(),
    projectId: project.entityId,
    title: "Remembered",
  };
  await call("create_task", input);
  await f.db
    .update(organizationApps)
    .set({ enabled: false })
    .where(and(eq(organizationApps.organizationId, f.orgA), eq(organizationApps.appId, "tasks")));
  expect(await rejection(call("create_task", input))).toBeInstanceOf(AppDisabledError);
  expect(await rejection(call("list_projects", {}))).toBeInstanceOf(AppDisabledError);
  expect(
    await rejection(
      call("create_crm_follow_up", {
        requestId: crypto.randomUUID(),
        entityId: project.entityId,
        projectEntityId: project.entityId,
        title: "Follow up",
        consentToTaskAudience: true,
      }),
    ),
  ).toBeInstanceOf(AppDisabledError);
  expect(await call("get_me", {})).toHaveProperty("actor");
});

test("dual-app tools batch their guard and reject either disabled app before cached receipts", async () => {
  const { call, identity, project } = await fixture();
  const account = await call("create_crm_account", {
    requestId: crypto.randomUUID(),
    name: "Customer",
  });
  const input = {
    requestId: crypto.randomUUID(),
    entityId: account.record.entityId,
    projectEntityId: project.entityId,
    title: "Follow up",
    consentToTaskAudience: true,
  };
  const created = await call("create_crm_follow_up", input);
  const { db, queries } = recordQueries();
  const replay = await executeAgentTool(db, identity, "create_crm_follow_up", input, turn);
  expect(replay.output.id).toBe(created.id);
  const receiptIndex = queries.findIndex((query) => query.includes('from "agent_tool_requests"'));
  expect(receiptIndex).toBeGreaterThan(0);
  const guards = queries.slice(0, receiptIndex);
  expect(
    guards.filter((query) => query.includes('from "organization"') && query.includes("for share")),
  ).toHaveLength(1);
  expect(guards.filter((query) => query.includes('from "organization_apps"'))).toHaveLength(1);
  for (const app of ["tasks", "crm"] as const) {
    await f.db
      .update(organizationApps)
      .set({ enabled: false })
      .where(and(eq(organizationApps.organizationId, f.orgA), eq(organizationApps.appId, app)));
    for (const requestId of [input.requestId, crypto.randomUUID()]) {
      queries.length = 0;
      expect(
        await rejection(
          executeAgentTool(db, identity, "create_crm_follow_up", { ...input, requestId }, turn),
        ),
      ).toBeInstanceOf(AppDisabledError);
      expect(queries.some((query) => query.includes('from "agent_tool_requests"'))).toBe(false);
    }
    await f.db
      .update(organizationApps)
      .set({ enabled: true })
      .where(and(eq(organizationApps.organizationId, f.orgA), eq(organizationApps.appId, app)));
  }
});

test("CRM MCP uses owner access, human responsibility and replay without duplicate records", async () => {
  const { call } = await fixture();
  await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
  const hidden = await f.forActor(f.bob).crm.createAccount({ name: "Private customer" });
  const input = { requestId: crypto.randomUUID(), name: "Customer" };
  const created = await call("create_crm_account", input);
  expect(created.record.ownerActorEntityId).toBe(f.alice);
  expect(await call("create_crm_account", input)).toEqual(created);
  const listed = await call("list_crm_records", { kind: "account", search: "Customer" });
  expect(listed.items.map((row) => row.entityId)).toEqual([created.record.entityId]);
  expect(
    await rejection(call("get_crm_record", { kind: "account", entityId: hidden.entityId })),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(call("create_crm_account", { ...input, name: "Different" })),
  ).toBeInstanceOf(ConflictError);
});

test("CRM message creation preserves agent-authored provenance and replays the current public record", async () => {
  const { call, actor } = await fixture();
  const { reply } = await contextConversation(f);
  const input = {
    kind: "account",
    fields: { name: "Reviewed company", summary: "Approved fact" },
    messageId: reply.id,
    requestId: crypto.randomUUID(),
    consentToRecordAudience: true,
    associate: true,
  };
  const created = await call("create_crm_from_message", input);
  expect(created.entityType).toBe("account");
  expect(created.record).toHaveProperty("account.ownerActorEntityId", f.alice);
  await call("update_crm_account", {
    requestId: crypto.randomUUID(),
    entityId: created.entityId,
    name: "Current company",
    summary: "Approved fact",
    website: null,
    domain: null,
  });
  const retry = await call("create_crm_from_message", input);
  expect(retry.entityId).toBe(created.entityId);
  expect(retry.record).toHaveProperty("account.name", "Current company");
  expect(retry.record).toHaveProperty("account.summary", "Approved fact");
  const refs = await f.db
    .select()
    .from(messageEntityReferences)
    .where(eq(messageEntityReferences.entityId, created.entityId));
  expect(refs.map((row) => row.purpose).toSorted((a, b) => a.localeCompare(b))).toEqual([
    "association",
    "source",
  ]);
  expect(
    refs.every(
      (row) => row.messageId === reply.id && row.createdByActorEntityId === actor.entityId,
    ),
  ).toBe(true);
  expect((await call("list_crm_records", { kind: "account" })).items).toHaveLength(1);
});

test("CRM message creation replay requires current source access", async () => {
  const { call } = await fixture();
  const { reply, conversation } = await contextConversation(f);
  const input = {
    kind: "contact",
    fields: { displayName: "Buyer" },
    messageId: reply.id,
    requestId: crypto.randomUUID(),
    consentToRecordAudience: true,
  };
  await call("create_crm_from_message", input);
  await f.db
    .update(messagingParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(messagingParticipants.conversationId, conversation.id),
        eq(messagingParticipants.actorEntityId, f.alice),
      ),
    );
  expect(await rejection(call("create_crm_from_message", input))).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(messageEntityReferences)).toHaveLength(1);
});

test("CRM message creation replay rejects a deleted source without restoring its reference", async () => {
  const { call } = await fixture();
  const { reply } = await contextConversation(f);
  const input = {
    kind: "account",
    fields: { name: "Customer" },
    messageId: reply.id,
    requestId: crypto.randomUUID(),
    consentToRecordAudience: true,
  };
  await call("create_crm_from_message", input);
  await f.db
    .update(messagingMessages)
    .set({ deletedAt: new Date(), body: "" })
    .where(eq(messagingMessages.id, reply.id));
  const references = await f.db.select().from(messageEntityReferences);
  expect(await rejection(call("create_crm_from_message", input))).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(messageEntityReferences)).toEqual(references);
  expect((await call("list_crm_records", { kind: "account" })).items).toHaveLength(1);
});

test("CRM message creation replay cannot return an inaccessible created record", async () => {
  const { call } = await fixture();
  await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
  const { reply } = await contextConversation(f);
  const input = {
    kind: "account",
    fields: { name: "Customer" },
    messageId: reply.id,
    requestId: crypto.randomUUID(),
    consentToRecordAudience: true,
  };
  const created = await call("create_crm_from_message", input);
  await f
    .forActor(f.alice)
    .permissions.grant({ entityId: created.entityId, actorEntityId: f.bob, level: "owner" });
  await f
    .forActor(f.bob)
    .permissions.revoke({ entityId: created.entityId, actorEntityId: f.alice });
  expect(await rejection(call("create_crm_from_message", input))).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(messageEntityReferences)).toHaveLength(1);
});

test("CRM message creation replay refreshes hidden deal relationships instead of cached references", async () => {
  const { call } = await fixture();
  await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
  const { reply } = await contextConversation(f);
  const bob = f.forActor(f.bob);
  const account = await bob.crm.createAccount({ name: "Private account name" });
  await bob.permissions.grant({
    entityId: account.entityId,
    actorEntityId: f.alice,
    level: "view",
  });
  const [stage] = await f.forActor(f.alice).crm.ensurePipeline();
  const input = {
    kind: "deal",
    fields: { title: "Sale", accountEntityId: account.entityId, stageId: stage!.id },
    messageId: reply.id,
    requestId: crypto.randomUUID(),
    consentToRecordAudience: true,
  };
  const created = await call("create_crm_from_message", input);
  expect(created.record).toHaveProperty("deal.accountEntityId", account.entityId);
  await bob.permissions.revoke({ entityId: account.entityId, actorEntityId: f.alice });
  const retry = await call("create_crm_from_message", input);
  expect(retry.entityId).toBe(created.entityId);
  expect(retry.record).toHaveProperty("deal.accountEntityId", null);
  expect(retry.record).toHaveProperty("account", null);
  const serialized = JSON.stringify(retry);
  expect(serialized).not.toContain(account.entityId);
  expect(serialized).not.toContain("Private account name");
});

test("CRM MCP keeps the validated agent actor separate from human responsibility", async () => {
  const { call, actor } = await fixture();
  const account = await call("create_crm_account", {
    requestId: crypto.randomUUID(),
    name: "Customer",
  });
  expect(account.record.ownerActorEntityId).toBe(f.alice);
  const contact = await call("create_crm_contact", {
    requestId: crypto.randomUUID(),
    displayName: "Buyer",
  });
  const interaction = await call("create_crm_interaction", {
    requestId: crypto.randomUUID(),
    contactEntityId: contact.record.entityId,
    kind: "call",
    occurredAt: "2026-11-12T10:00:00Z",
    summary: "Customer call.",
  });
  const [stored] = await f.db
    .select()
    .from(contactInteractions)
    .where(eq(contactInteractions.entityId, interaction.record.entityId));
  expect(stored.createdByActorEntityId).toBe(actor.entityId);
  expect(interaction.record.actor).toEqual({
    type: "agent",
    displayName: "Agent on behalf of Alice",
  });
  expect(interaction.record).not.toHaveProperty("createdByActorEntityId");
});

test("CRM MCP interaction responses redact private agent identity for coworkers", async () => {
  const { call, actor, agentId } = await fixture();
  await f.db
    .update(userAgents)
    .set({ name: "Private customer research agent" })
    .where(eq(userAgents.id, agentId));
  const contact = await call("create_crm_contact", {
    requestId: crypto.randomUUID(),
    displayName: "Buyer",
  });
  const interaction = await call("create_crm_interaction", {
    requestId: crypto.randomUUID(),
    contactEntityId: contact.record.entityId,
    kind: "call",
    occurredAt: "2026-11-12T10:00:00Z",
    summary: "Customer call.",
  });
  const [agent] = await f.db
    .insert(userAgents)
    .values({ userId: "bob", name: "Coworker agent", instructions: "", harness: "opencode" })
    .returning();
  const coworker = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "bob",
    userAgentId: agent!.id,
  });
  const listed = (
    await executeAgentTool(
      f.db,
      { organizationId: f.orgA, userId: "bob", actorEntityId: coworker.entityId },
      "list_crm_interactions",
      { contactEntityId: contact.record.entityId },
      turn,
    )
  ).output;
  expect(listed.items).toMatchObject([
    {
      entityId: interaction.record.entityId,
      actor: { type: "agent", displayName: "Agent on behalf of Alice" },
    },
  ]);
  for (const response of [interaction.record, listed]) {
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("createdByActorEntityId");
    expect(serialized).not.toContain(actor.entityId);
    expect(serialized).not.toContain(agentId);
    expect(serialized).not.toContain("Private customer research agent");
  }
});

test("CRM activity attributes the agent but coworkers see no private agent identity", async () => {
  const { call, actor, agentId } = await fixture();
  await f.db
    .update(userAgents)
    .set({ name: "Private sales strategist" })
    .where(eq(userAgents.id, agentId));
  const account = await call("create_crm_account", {
    requestId: crypto.randomUUID(),
    name: "Customer",
  });
  expect(account.record.ownerActorEntityId).toBe(f.alice);
  const events = await f.db
    .select()
    .from(crmActivityEvents)
    .where(eq(crmActivityEvents.entityId, account.record.entityId));
  expect(events).toMatchObject([{ action: "created", actorEntityId: actor.entityId }]);
  await f
    .forActor(f.alice)
    .permissions.grant({ entityId: account.record.entityId, actorEntityId: f.bob, level: "view" });
  const [coworkerAgent] = await f.db
    .insert(userAgents)
    .values({ userId: "bob", name: "Coworker agent", instructions: "", harness: "opencode" })
    .returning();
  const coworkerActor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "bob",
    userAgentId: coworkerAgent!.id,
  });
  const activity = (
    await executeAgentTool(
      f.db,
      { organizationId: f.orgA, userId: "bob", actorEntityId: coworkerActor.entityId },
      "list_crm_activity",
      { entityId: account.record.entityId },
      turn,
    )
  ).output;
  expect(activity.items).toMatchObject([
    { action: "created", actor: { type: "agent", displayName: "Agent on behalf of Alice" } },
  ]);
  const serialized = JSON.stringify(activity);
  expect(serialized).not.toContain("Private sales strategist");
  expect(serialized).not.toContain(agentId);
  expect(serialized).not.toContain(actor.entityId);
});

test("CRM MCP contact wrappers record agent activity once per actual edit", async () => {
  const { call, actor } = await fixture();
  const create = { requestId: crypto.randomUUID(), displayName: "Buyer" };
  const contact = await call("create_crm_contact", create);
  expect(await call("create_crm_contact", create)).toEqual(contact);
  const update = {
    requestId: crypto.randomUUID(),
    entityId: contact.record.entityId,
    displayName: "Updated buyer",
  };
  await call("update_crm_contact", update);
  await call("update_crm_contact", update);
  const rows = await f.db
    .select()
    .from(crmActivityEvents)
    .where(eq(crmActivityEvents.entityId, contact.record.entityId));
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.actorEntityId === actor.entityId)).toBe(true);
  expect(rows.find((row) => row.action === "updated")?.changedFields).toEqual(["displayName"]);
  const activity = await call("list_crm_activity", { entityId: contact.record.entityId });
  expect(activity.items.map((row) => row.action).toSorted((a, b) => a.localeCompare(b))).toEqual([
    "created",
    "updated",
  ]);
});

test("CRM MCP contact writes retain committed context invalidation hints", async () => {
  const { identity } = await fixture();
  const created = await executeCommittedTool(
    f.db,
    identity,
    "create_crm_contact",
    { requestId: crypto.randomUUID(), displayName: "Buyer" },
    turn,
  );
  const contact = mcpTools.create_crm_contact.output.parse(created.result.output);
  const expected: RealtimeHint = {
    audience: realtimeKeys.entity(f.orgA, contact.record.entityId),
    domain: "context",
  };
  expect(created.hints).toContainEqual(expected);
  const updated = await executeCommittedTool(
    f.db,
    identity,
    "update_crm_contact",
    {
      requestId: crypto.randomUUID(),
      entityId: contact.record.entityId,
      displayName: "Updated buyer",
    },
    turn,
  );
  expect(updated.hints).toContainEqual(expected);
});

test("CRM MCP blocks unattended writes and writes from another desktop", async () => {
  const { identity } = await fixture();
  const input = { requestId: crypto.randomUUID(), name: "Must not exist" };
  expect(
    await rejection(
      executeAgentTool(f.db, identity, "create_crm_account", input, {
        ...turn,
        kind: "unattended",
      }),
    ),
  ).toMatchObject({ name: "ValidationError" });
  expect(
    await rejection(
      executeAgentTool(f.db, identity, "create_crm_account", input, {
        ...turn,
        installationId: crypto.randomUUID(),
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await f.forActor(f.alice).crm.listAccounts()).toEqual([]);
  expect(await f.db.select().from(agentToolRequests)).toEqual([]);
});

test("CRM interaction retries preserve a single manual interaction", async () => {
  const { call } = await fixture();
  const contact = await call("create_crm_contact", {
    requestId: crypto.randomUUID(),
    displayName: "Buyer",
  });
  const input = {
    requestId: crypto.randomUUID(),
    contactEntityId: String(contact.record.entityId),
    kind: "call",
    occurredAt: "2026-11-12T10:00:00Z",
    summary: "Discussed the proposal.",
  };
  const interaction = await call("create_crm_interaction", input);
  expect(await call("create_crm_interaction", input)).toEqual(interaction);
  const timeline = await call("list_crm_interactions", { contactEntityId: input.contactEntityId });
  expect(timeline.items.map((row) => row.entityId)).toEqual([interaction.record.entityId]);
  expect(timeline.items[0]?.origin).toBe("manual");
  expect(timeline.items[0]?.occurredAt).toBe("2026-11-12T10:00:00.000Z");
});

test("CRM follow-up replay rebuilds the current task projection after a project move", async () => {
  const { call, project } = await fixture();
  await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
  const bob = f.forActor(f.bob);
  const original = await bob.projects.create({ name: "Former private project" });
  await bob.permissions.grant({
    entityId: original.entityId,
    actorEntityId: f.alice,
    level: "edit",
  });
  const account = await call("create_crm_account", {
    requestId: crypto.randomUUID(),
    name: "Customer",
  });
  const input = {
    requestId: crypto.randomUUID(),
    entityId: account.record.entityId,
    projectEntityId: original.entityId,
    title: "Call buyer",
    consentToTaskAudience: true,
  };
  const created = await call("create_crm_follow_up", input);
  expect(created.project.id).toBe(original.entityId);
  // Simulate a committed structural move: task parent and access container change together.
  await f.db.execute(sql`with moved as (
    update ${entities} set access_entity_id = ${project.entityId} where entity_id = ${created.id} returning entity_id
  ) update ${tasks} set project_entity_id = ${project.entityId} where entity_id in (select entity_id from moved)`);
  await bob.permissions.revoke({ entityId: original.entityId, actorEntityId: f.alice });
  const retry = await call("create_crm_follow_up", input);
  expect(retry.id).toBe(created.id);
  expect(retry.project).toEqual({ id: project.entityId, name: "Work" });
  const serialized = JSON.stringify(retry);
  expect(serialized).not.toContain(original.entityId);
  expect(serialized).not.toContain("Former private project");
});

test("CRM interaction pagination reaches the 51st entry with stable occurrence-time ties", async () => {
  const { call } = await fixture();
  const repos = f.forActor(f.alice);
  const contact = await repos.contacts.create({ displayName: "Buyer" });
  const created = [];
  for (let index = 0; index < 51; index++)
    created.push(
      await repos.contactInteractions.createManual({
        contactEntityId: contact.entityId,
        kind: "call",
        occurredAt: new Date("2026-11-12T10:00:00Z"),
        summary: `Call ${index}`,
      }),
    );
  const first = await call("list_crm_interactions", { contactEntityId: contact.entityId });
  expect(first.items).toHaveLength(50);
  expect(first.nextBefore).not.toBeNull();
  const second = await call("list_crm_interactions", {
    contactEntityId: contact.entityId,
    before: first.nextBefore,
  });
  expect(second.items).toHaveLength(1);
  expect(second.nextBefore).toBeNull();
  const actual = [...first.items, ...second.items].map((row) => row.entityId);
  const expected = created.map((row) => row.entityId).toSorted((a, b) => b.localeCompare(a));
  expect(actual).toEqual(expected);
  expect(new Set(actual).size).toBe(51);
});

test("CRM deal replay rechecks related account access and stages reject stale versions", async () => {
  const { call } = await fixture();
  await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
  const bob = f.forActor(f.bob);
  const account = await bob.crm.createAccount({ name: "Shared customer" });
  await bob.permissions.grant({
    entityId: account.entityId,
    actorEntityId: f.alice,
    level: "view",
  });
  const [stage] = await f.forActor(f.alice).crm.ensurePipeline();
  const input = {
    requestId: crypto.randomUUID(),
    title: "Sale",
    stageId: stage!.id,
    accountEntityId: account.entityId,
  };
  const deal = await call("create_crm_deal", input);
  const transition = {
    requestId: crypto.randomUUID(),
    entityId: deal.record.entityId,
    expectedVersion: 1,
    stageId: stage!.id,
    outcome: "won",
  };
  const won = await call("transition_crm_deal", transition);
  expect(won.record.outcome).toBe("won");
  expect(won.record.version).toBe(2);
  expect(await call("transition_crm_deal", transition)).toEqual(won);
  expect(
    await rejection(
      call("transition_crm_deal", {
        ...transition,
        requestId: crypto.randomUUID(),
        outcome: "open",
      }),
    ),
  ).toBeInstanceOf(ConflictError);
  await bob.permissions.revoke({ entityId: account.entityId, actorEntityId: f.alice });
  expect(await rejection(call("create_crm_deal", input))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(call("transition_crm_deal", transition))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("CRM MCP message publication retains provenance and returns later edits on retry", async () => {
  const { call } = await fixture();
  const { repos, reply } = await contextConversation(f);
  const contact = await repos.contacts.create({ displayName: "Buyer" });
  const input = {
    contactEntityId: contact.entityId,
    messageId: reply.id,
    kind: "message",
    occurredAt: "2026-11-12T10:00:00Z",
    summary: "Approved summary.",
    consentToContactAudience: true,
  };
  const first = await call("publish_crm_interaction", input);
  expect(first.record.origin).toBe("message_publication");
  await repos.contactInteractions.update(first.record.entityId, { summary: "Later correction." });
  const retry = await call("publish_crm_interaction", input);
  expect(retry.record.entityId).toBe(first.record.entityId);
  expect(retry.record.summary).toBe("Later correction.");
  expect(
    (await f.db.select().from(messageEntityReferences)).filter(
      (row) => row.entityId === first.record.entityId,
    ),
  ).toMatchObject([{ messageId: reply.id, purpose: "source" }]);
  await repos.contactInteractions.softDelete(first.record.entityId);
  expect(await rejection(call("publish_crm_interaction", input))).toBeInstanceOf(AccessDeniedError);
});

test("CRM MCP message associations link only the chosen record without publishing or waking", async () => {
  const { call } = await fixture();
  const { reply } = await contextConversation(f);
  const account = await call("create_crm_account", {
    requestId: crypto.randomUUID(),
    name: "Customer",
  });
  const input = { messageId: reply.id, target: { type: "account", id: account.record.entityId } };
  const wakes = await f.db.select().from(agentWakes);
  const attached = await call("attach_message", input);
  const retry = await call("attach_message", input);
  expect(attached).toEqual({ changed: true });
  expect(retry).toEqual({ changed: false });
  expect(await f.db.select().from(messageEntityReferences)).toMatchObject([
    { entityId: account.record.entityId, purpose: "association" },
  ]);
  expect(await f.db.select().from(agentWakes)).toEqual(wakes);
  expect(await f.db.select().from(contactInteractions)).toEqual([]);
  expect(
    (await call("list_links", { target: { type: "message", id: reply.id } })).items,
  ).toMatchObject([
    {
      kind: "attachment",
      work: { type: "account", id: account.record.entityId, title: "Customer" },
    },
  ]);
  expect(
    (await call("list_links", { target: { type: "account", id: account.record.entityId } })).items,
  ).toMatchObject([{ kind: "attachment", message: { id: reply.id } }]);
  expect(await call("detach_message", input)).toEqual({ changed: true });
  expect(await f.db.select().from(messageEntityReferences)).toEqual([]);
  expect(
    (await call("get_crm_record", { kind: "account", entityId: account.record.entityId })).record,
  ).toHaveProperty("account.name", "Customer");
});

test("CRM settings and pipeline reads do not initialize records, even unattended", async () => {
  const { identity } = await fixture();
  const settings = await executeAgentTool(
    f.db,
    identity,
    "get_crm_settings",
    {},
    { ...turn, kind: "unattended" },
  );
  expect(settings.output.settings.defaultCurrency).toBeNull();
  expect(
    (
      await executeAgentTool(
        f.db,
        identity,
        "get_crm_pipeline",
        {},
        { ...turn, kind: "unattended" },
      )
    ).output.stages,
  ).toEqual([]);
  expect(await f.db.select().from(crmSettings)).toEqual([]);
  expect(await f.db.select().from(crmStages)).toEqual([]);
});

test("CRM settings writes require current admin capability and never rewrite deals", async () => {
  const { call } = await fixture();
  const settingsInput = { requestId: crypto.randomUUID(), defaultCurrency: "EUR" };
  expect((await call("update_crm_settings", settingsInput)).settings.defaultCurrency).toBe("EUR");
  const account = await call("create_crm_account", {
    requestId: crypto.randomUUID(),
    name: "Customer",
  });
  const [stage] = await f.forActor(f.alice).crm.ensurePipeline();
  const base = { title: "Sale", accountEntityId: account.record.entityId, stageId: stage!.id };
  const explicit = await call("create_crm_deal", {
    ...base,
    requestId: crypto.randomUUID(),
    amount: "10",
    currency: "USD",
  });
  const unknown = await call("create_crm_deal", { ...base, requestId: crypto.randomUUID() });
  expect(explicit.record.currency).toBe("USD");
  expect(explicit.record.expectedCloseDate).toBeNull();
  expect(unknown.record.amount).toBeNull();
  expect(unknown.record.currency).toBeNull();
  await call("update_crm_settings", { requestId: crypto.randomUUID(), defaultCurrency: "GBP" });
  const after = await call("get_crm_record", { kind: "deal", entityId: explicit.record.entityId });
  expect(after.record).toHaveProperty("deal.currency", "USD");
  expect(after.record).toHaveProperty("deal.amount", explicit.record.amount);
  expect(after.record).toHaveProperty("deal.expectedCloseDate", null);
  await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
  expect(await rejection(call("update_crm_settings", settingsInput))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(
    await rejection(
      call("update_crm_settings", { requestId: crypto.randomUUID(), defaultCurrency: "EUR" }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect((await call("get_crm_settings", {})).settings.defaultCurrency).toBe("GBP");
});

test("CRM follow-up tools use existing project tasks and expose permission-filtered core links", async () => {
  const { call, project } = await fixture();
  await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
  const alice = f.forActor(f.alice);
  const account = await call("create_crm_account", {
    requestId: crypto.randomUUID(),
    name: "Customer",
  });
  const hidden = await f.forActor(f.bob).crm.createAccount({ name: "Hidden" });
  await f
    .forActor(f.bob)
    .permissions.grant({ entityId: hidden.entityId, actorEntityId: f.alice, level: "view" });
  await alice.links.create({ entityId: account.record.entityId, otherEntityId: hidden.entityId });
  await f.forActor(f.bob).permissions.revoke({ entityId: hidden.entityId, actorEntityId: f.alice });
  const input = {
    requestId: crypto.randomUUID(),
    entityId: account.record.entityId,
    projectEntityId: project.entityId,
    title: "Call buyer",
    dueDate: "2026-11-20",
    consentToTaskAudience: true,
  };
  const task = await call("create_crm_follow_up", input);
  expect(task.project.id).toBe(project.entityId);
  expect(task.dueDate).toBe("2026-11-20");
  expect(await call("create_crm_follow_up", input)).toEqual(task);
  const links = await call("list_links", {
    target: { type: "account", id: account.record.entityId },
    source: "entities",
  });
  expect(links.items).toMatchObject([
    {
      kind: "entity",
      entity: { type: "task", id: task.id, relation: "related_to", direction: "none" },
    },
  ]);
  expect(links.items).toHaveLength(1);
  const reverse = await call("list_links", {
    target: { type: "task", id: task.id },
    source: "entities",
  });
  expect(reverse.items).toMatchObject([
    { entity: { type: "account", id: account.record.entityId, direction: "none" } },
  ]);
  expect(
    await rejection(
      call("list_links", { target: { type: "account", id: hidden.entityId }, source: "entities" }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

test("CRM message and entity links resolve all supported customer record types", async () => {
  const { call } = await fixture();
  const { reply } = await contextConversation(f);
  const account = await call("create_crm_account", {
    requestId: crypto.randomUUID(),
    name: "Customer",
  });
  const contact = await call("create_crm_contact", {
    requestId: crypto.randomUUID(),
    displayName: "Buyer",
  });
  const [stage] = await f.forActor(f.alice).crm.ensurePipeline();
  const deal = await call("create_crm_deal", {
    requestId: crypto.randomUUID(),
    title: "Sale",
    accountEntityId: account.record.entityId,
    stageId: stage!.id,
  });
  const interaction = await call("create_crm_interaction", {
    requestId: crypto.randomUUID(),
    contactEntityId: contact.record.entityId,
    kind: "call",
    occurredAt: "2026-11-12T10:00:00Z",
    summary: "Customer call",
  });
  const targets = [
    { type: "account", id: account.record.entityId },
    { type: "contact", id: contact.record.entityId },
    { type: "deal", id: deal.record.entityId },
    { type: "contact_interaction", id: interaction.record.entityId },
  ] as const;
  for (const target of targets) {
    await call("attach_message", { messageId: reply.id, target });
    expect((await call("list_links", { target })).items).toMatchObject([
      { message: { id: reply.id } },
    ]);
    if (target.type !== "account")
      await f
        .forActor(f.alice)
        .links.create({ entityId: account.record.entityId, otherEntityId: target.id });
  }
  const messages = await call("list_links", { target: { type: "message", id: reply.id } });
  expect(
    messages.items.map((item) => item.work?.type ?? "").toSorted((a, b) => a.localeCompare(b)),
  ).toEqual(targets.map((target) => target.type).toSorted((a, b) => a.localeCompare(b)));
  const core = await call("list_links", { target: targets[0]!, source: "entities", limit: 1 });
  expect(core.items).toHaveLength(1);
  expect(core.nextCursor).not.toBeNull();
  const next = await call("list_links", {
    target: targets[0]!,
    source: "entities",
    limit: 1,
    cursor: core.nextCursor,
  });
  expect(next.items).toHaveLength(1);
  expect(next.items[0]?.entity?.id).not.toBe(core.items[0]?.entity?.id);
});

test("committed MCP reads use one transaction and raw validation opens none", async () => {
  const { identity } = await fixture();
  const tracked = trackedTransactions();
  const result = await executeCommittedTool(tracked.db, identity, "get_me", {}, turn);
  expect(result.result.tool).toBe("get_me");
  expect(tracked.count()).toBe(1);
  expect(result.hints).toEqual([]);
  const invalid = trackedTransactions();
  expect(
    await rejection(executeAgentTool(invalid.db, identity, "get_task", {}, turn)),
  ).toBeInstanceOf(Error);
  expect(invalid.count()).toBe(0);
});

test("MCP writes roll back with their transaction", async () => {
  const { identity, project } = await fixture();
  const input = {
    taskId: (
      await f.forActor(f.alice).tasks.create({
        projectEntityId: project.entityId,
        title: "Atomic discussion",
      })
    ).entityId,
    requestId: crypto.randomUUID(),
  };
  const tracked = trackedTransactions(true);
  expect(
    await rejection(executeCommittedTool(tracked.db, identity, "get_task_discussion", input, turn)),
  ).toBe(tracked.failure);
  expect(await f.db.select().from(messagingConversations)).toEqual([]);
  expect(await f.db.select().from(agentToolRequests)).toEqual([]);
});

test("invalid fresh tool output rolls back its write and never reaches the publisher", async () => {
  const { agentId, project } = await fixture();
  let published = false;
  const service = createMcpService({
    db: f.db,
    publish: async (committed) => {
      published = true;
      return committed.result;
    },
  });
  const parse = mcpTools.create_task.output.parse.bind(mcpTools.create_task.output);
  // Inject a malformed handler result at the output boundary, after the real task write.
  const output = spyOn(mcpTools.create_task.output, "parse").mockImplementation(() =>
    parse({ id: "invalid" }),
  );
  try {
    expect(
      await service.callAgentTool(
        { ...scopeFixture(), userId: "alice", organizationId: f.orgA },
        {
          organizationId: f.orgA,
          agentId,
          tool: "create_task",
          turn,
          input: { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Rollback" },
        },
      ),
    ).toMatchObject({ success: false });
    expect(output).toHaveBeenCalledTimes(1);
  } finally {
    output.mockRestore();
  }
  expect(published).toBe(false);
  expect(await f.db.select().from(tasks)).toEqual([]);
  expect(await f.db.select().from(agentToolRequests)).toEqual([]);
});

test("concurrent identical MCP requests commit one task and one receipt", async () => {
  const { identity, project } = await fixture();
  const input = { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Once" };
  const results = await Promise.all([
    executeCommittedTool(f.db, identity, "create_task", input, turn),
    executeCommittedTool(f.db, identity, "create_task", input, turn),
  ]);
  expect(results[0]!.result.output).toEqual(results[1]!.result.output);
  expect(await f.db.select().from(tasks)).toHaveLength(1);
  const receipts = await f.db.select().from(agentToolRequests);
  expect(receipts).toHaveLength(1);
  expect(receipts[0]!.fingerprint).toBe(JSON.stringify(mcpTools.create_task.input.parse(input)));
});

test("cached tool output must still pass its output schema", async () => {
  const { identity, project } = await fixture();
  const input = { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Once" };
  await executeCommittedTool(f.db, identity, "create_task", input, turn);
  await f.db.update(agentToolRequests).set({ result: sql`'{}'::jsonb` });
  expect(
    await rejection(executeCommittedTool(f.db, identity, "create_task", input, turn)),
  ).toBeInstanceOf(Error);
  expect(await f.db.select().from(tasks)).toHaveLength(1);
});

test("MCP discussion replies preserve provenance, references and notification hints without wakes", async () => {
  const { identity, project, call, actor } = await fixture();
  const repos = await f.forSession("alice");
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const { result: task } = await repos.tasks.create({
    projectEntityId: project.entityId,
    title: "Mention",
  });
  const { conversationId } = await call("get_task_discussion", {
    taskId: task.entityId,
    requestId: crypto.randomUUID(),
  });
  const body = `Hello @[person:${f.bob}] about @[task:${task.entityId}]`;
  const mcp = await executeCommittedTool(
    f.db,
    identity,
    "reply",
    {
      to: { conversationId },
      body,
      requestId: crypto.randomUUID(),
    },
    turn,
  );
  const sent = mcp.result.output;
  expect((await call("read_conversation", { conversationId })).items).toMatchObject([
    { id: sent.messageId, author: { id: actor.entityId }, text: body },
  ]);
  const [stored] = await f.db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, sent.messageId));
  expect(stored).toMatchObject({ originTurnId: turn.turnId, authorActorEntityId: actor.entityId });
  expect(
    await f.db
      .select()
      .from(messageEntityReferences)
      .where(eq(messageEntityReferences.messageId, sent.messageId)),
  ).toEqual([
    expect.objectContaining({
      entityId: task.entityId,
      purpose: "mention",
      createdByActorEntityId: actor.entityId,
    }),
  ]);
  expect(await f.db.select().from(agentWakes)).toEqual([]);
  expect(mcp.hints).toContainEqual({
    audience: realtimeKeys.actor(f.orgA, f.bob),
    domain: "notifications",
  });
});

test("task discussion tools inherit view and comment access and recheck access on replay", async () => {
  const { call } = await fixture();
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const bob = f.forActor(f.bob);
  const project = await bob.projects.create({ name: "Discussion permissions" });
  const task = await bob.tasks.create({ projectEntityId: project.entityId, title: "Shared task" });
  const input = { taskId: task.entityId, requestId: crypto.randomUUID() };
  expect(await rejection(call("get_task_discussion", input))).toBeInstanceOf(AccessDeniedError);
  await bob.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.alice,
    level: "view",
  });
  const { conversationId } = await call("get_task_discussion", input);
  expect(await call("get_task_discussion", { ...input, requestId: crypto.randomUUID() })).toEqual({
    conversationId,
  });
  expect((await call("read_conversation", { conversationId })).items).toEqual([]);
  const reply = { requestId: crypto.randomUUID(), to: { conversationId }, body: "Discuss" };
  expect(await rejection(call("reply", reply))).toBeInstanceOf(AccessDeniedError);
  await bob.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.alice,
    level: "comment",
  });
  const sent = await call("reply", reply);
  const thread = await call("reply", {
    ...reply,
    requestId: crypto.randomUUID(),
    to: { conversationId, threadId: sent.messageId },
    body: "A reply",
  });
  expect((await call("read_thread", { messageId: sent.messageId })).replies.items).toMatchObject([
    { id: thread.messageId },
  ]);
  await bob.permissions.revoke({ entityId: project.entityId, actorEntityId: f.alice });
  expect(await rejection(call("get_task_discussion", input))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(call("read_conversation", { conversationId }))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(call("reply", reply))).toBeInstanceOf(AccessDeniedError);
});

test("task tools use the owner's access, attribute writes and keep the source message across retries", async () => {
  const { actor, human, call } = await fixture();
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const project = await f.forActor(f.bob).projects.create({ name: "Shared" });
  expect(await rejection(call("get_project", { projectId: project.entityId }))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.forActor(f.bob).permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.alice,
    level: "edit",
  });
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  const message = await human.sendMessage(channel.id, "Please follow up");
  const input = {
    requestId: crypto.randomUUID(),
    projectId: project.entityId,
    title: "Follow up",
    sourceMessageId: message.id,
  };
  const created = await call("create_task", input);
  expect(created.source).toEqual({
    type: "message",
    id: message.id,
    conversationId: channel.id,
    threadId: null,
  });
  expect(await call("create_task", input)).toEqual(created);
  expect(await rejection(call("create_task", { ...input, title: "Different" }))).toBeInstanceOf(
    ConflictError,
  );
  const events = await f.db
    .select()
    .from(taskActivity)
    .where(eq(taskActivity.taskEntityId, created.id));
  expect(events).toHaveLength(2);
  expect(events.every((event) => event.actorEntityId === actor.entityId)).toBe(true);
  const [source] = await f.db
    .select()
    .from(messageEntityReferences)
    .where(eq(messageEntityReferences.entityId, created.id));
  expect(source).toMatchObject({ purpose: "source", createdByActorEntityId: actor.entityId });
  const discussionInput = {
    requestId: crypto.randomUUID(),
    taskId: created.id,
  };
  const { conversationId } = await call("get_task_discussion", discussionInput);
  expect(await call("get_task_discussion", discussionInput)).toEqual({ conversationId });
  const posted = await call("reply", {
    requestId: crypto.randomUUID(),
    to: { conversationId },
    body: "Working on it",
  });
  expect((await call("read_conversation", { conversationId })).items[0]).toMatchObject({
    id: posted.messageId,
    author: { id: actor.entityId },
  });
  const updated = await call("update_task", {
    requestId: crypto.randomUUID(),
    taskId: created.id,
    changes: { status: "completed" },
  });
  expect(updated).toMatchObject({
    status: "completed",
    discussionConversationId: conversationId,
    linkedMessageCount: 1,
  });
  expect((await call("get_project", { projectId: project.entityId })).taskCounts).toMatchObject({
    completed: 1,
    not_started: 0,
  });
  expect(
    (await call("list_tasks", { projectId: project.entityId, statuses: ["completed"] })).items.map(
      (item) => item.id,
    ),
  ).toEqual([created.id]);
  expect(
    (await call("list_task_activity", { taskId: created.id })).items.every(
      (item) => item.actor.type === "agent",
    ),
  ).toBe(true);
  const link = { messageId: message.id, target: { type: "task", id: created.id } };
  const attached = [await call("attach_message", link), await call("attach_message", link)];
  expect(attached).toEqual([{ changed: true }, { changed: false }]);
  expect(
    (await call("list_links", { target: { type: "message", id: message.id } })).items
      .map((item) => `${item.kind}:${item.work?.id}`)
      .toSorted(),
  ).toEqual([`attachment:${created.id}`, `origin:${created.id}`]);
  expect(await call("detach_message", link)).toEqual({ changed: true });
  expect(
    (await call("list_links", { target: { type: "task", id: created.id } })).items.map(
      (item) => item.kind,
    ),
  ).toEqual(["origin"]);
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, created.id));
  expect((await call("list_links", { target: { type: "message", id: message.id } })).items).toEqual(
    [],
  );
  await f.db.update(entities).set({ deletedAt: null }).where(eq(entities.entityId, created.id));
  await f
    .forActor(f.bob)
    .permissions.revoke({ entityId: project.entityId, actorEntityId: f.alice });
  expect(await rejection(call("create_task", input))).toBeInstanceOf(AccessDeniedError);
});

test("a task created from a thread reply links to a message that read_thread can open", async () => {
  const { human, call, createTask } = await fixture();
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  const root = await human.sendMessage(channel.id, "Launch plan");
  const first = await human.sendMessage(channel.id, "We need a checklist", root.id);
  await human.sendMessage(channel.id, "Agreed", root.id);
  const task = await createTask({ title: "Write checklist", sourceMessageId: first.id });
  const [linked] = (await call("list_links", { target: { type: "task", id: task.id } })).items;
  expect(linked.message).toMatchObject({
    id: first.id,
    threadId: root.id,
    text: "We need a checklist",
  });
  const thread = await call("read_thread", { messageId: linked!.message!.id });
  expect(thread.root.body).toBe("Launch plan");
  expect(thread.replies.items.map((item) => item.body)).toEqual(["We need a checklist", "Agreed"]);
});

test("read_conversation shows older threads with replies in the window, with one cursor", async () => {
  const { human, call } = await fixture();
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  const old = await human.sendMessage(channel.id, "old root");
  await setCreatedAt(old.id, "2026-11-06T12:00:00Z");
  const reply = await human.sendMessage(channel.id, "today's reply", old.id);
  await setCreatedAt(reply.id, "2026-11-07T15:00:00Z");
  for (const [body, createdAt] of [
    ["before", "2026-11-06T23:59:59Z"],
    ["start", "2026-11-07T00:00:00Z"],
    ["middle", "2026-11-07T12:00:00Z"],
    ["end", "2026-11-08T00:00:00Z"],
  ] as const)
    await setCreatedAt((await human.sendMessage(channel.id, body)).id, createdAt);
  const input = {
    conversationId: channel.id,
    since: "2026-11-07T00:00:00Z",
    until: "2026-11-08T00:00:00Z",
    limit: 2,
  };
  const first = await call("read_conversation", input);
  expect(first.items.map((item) => [item.text, item.includedBecause])).toEqual([
    ["old root", "thread_activity"],
    ["middle", "posted"],
  ]);
  expect(first.items[0]).toMatchObject({ replyCount: 1, truncated: false });
  const second = await call("read_conversation", { ...input, cursor: first.nextCursor });
  expect(second.items.map((item) => item.text)).toEqual(["start"]);
  expect(second.nextCursor).toBeNull();
  expect(
    await rejection(
      call("read_conversation", {
        ...input,
        since: "2026-11-06T00:00:00Z",
        cursor: first.nextCursor,
      }),
    ),
  ).toMatchObject({ message: expect.stringContaining("cursor") });
  expect(
    (await call("list_conversations", { activeSince: input.since })).items.map((item) => item.id),
  ).toEqual([channel.id]);
});

test("task counts and links leave out messages in conversations the caller cannot see", async () => {
  const { human, call, createTask, project } = await fixture();
  await f.forActor(f.alice).permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const task = await createTask({ title: "Launch" });
  const bob = createMessagingService(f.db, { organizationId: f.orgA, userId: "bob" });
  const hidden = await bob.createConversation({ kind: "channel", name: "bob-only", private: true });
  await bob.sendMessage(hidden.id, `See @[task:${task.id}]`);
  const visible = await human.createConversation({ kind: "channel", name: "general" });
  const mention = await human.sendMessage(visible.id, `Working on @[task:${task.id}]`);
  expect(await call("get_task", { taskId: task.id })).toMatchObject({ linkedMessageCount: 1 });
  expect(
    (await call("list_links", { target: { type: "task", id: task.id } })).items.map((item) => [
      item.kind,
      item.message?.id,
    ]),
  ).toEqual([["mention", mention.id]]);
});

test("get_task returns the parent and counts only live subtasks", async () => {
  const { call, createTask } = await fixture();
  const parent = await createTask({ title: "Launch" });
  const kept = await createTask({ title: "Checklist", parentTaskId: parent.id });
  const removed = await createTask({ title: "Dropped", parentTaskId: parent.id });
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, removed.id));
  expect(await call("get_task", { taskId: parent.id })).toMatchObject({
    parent: null,
    subtaskCount: 1,
    discussionConversationId: null,
  });
  expect((await call("get_task", { taskId: kept.id })).parent).toEqual({
    id: parent.id,
    title: "Launch",
  });
});

test("assignees resolve by name and list_tasks accepts me for the agent's own tasks", async () => {
  const { actor, call, createTask, project } = await fixture();
  const [assignee] = (await call("list_assignees", { projectId: project.entityId, query: "resea" }))
    .items;
  expect(assignee).toEqual({ id: actor.entityId, name: "Research", type: "agent" });
  const mine = await createTask({ title: "Mine", assigneeActorId: assignee!.id });
  await createTask({ title: "Unassigned" });
  expect(
    (await call("list_tasks", { projectId: project.entityId, assigneeActorId: "me" })).items.map(
      (item) => item.id,
    ),
  ).toEqual([mine.id]);
});

test("conversations are named after other participants and sorted by latest activity", async () => {
  const { human, call } = await fixture();
  const dm = await human.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  await setCreatedAt((await human.sendMessage(channel.id, "older")).id, "2026-11-06T00:00:00Z");
  await setCreatedAt((await human.sendMessage(dm.id, "newer")).id, "2026-11-07T00:00:00Z");
  expect((await call("list_conversations", {})).items.map((item) => item.name)).toEqual([
    "Bob",
    "general",
  ]);
});

test("conversation names leave out partners who have not consented", async () => {
  const { human, call, agentId } = await fixture();
  const group = await human.createConversation({
    kind: "group",
    emails: ["bob@example.com"],
    agentIds: [agentId],
  });
  await f.db.insert(messagingParticipants).values({
    conversationId: group.id,
    organizationId: f.orgB,
    actorEntityId: f.outsider,
    actorType: "human",
  });
  expect((await call("list_conversations", {})).items).toMatchObject([{ name: "Bob" }]);
});

test("get_me returns the agent, its owner's actor and the organization", async () => {
  const { actor, call } = await fixture();
  expect(await call("get_me", {})).toEqual({
    actor: { id: actor.entityId, name: "Research", type: "agent" },
    owner: { id: f.alice, name: "Alice" },
    organization: { id: f.orgA, name: "A" },
  });
});

test("search pages with a cursor bound to its query", async () => {
  const { call, createTask } = await fixture();
  for (const title of ["Launch one", "Launch two", "Launch three"]) await createTask({ title });
  const input = { query: "Launch", type: "task", limit: 2 };
  const first = await call("search", input);
  expect(first.items).toHaveLength(2);
  const second = await call("search", { ...input, cursor: first.nextCursor });
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(3);
  expect(
    await rejection(call("search", { ...input, query: "Other", cursor: first.nextCursor })),
  ).toMatchObject({ message: expect.stringContaining("cursor") });
});

test("reply resolves the agent once and does not re-authenticate inside messaging", async () => {
  const { human, identity } = await fixture();
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  const { db, queries } = recordQueries();
  const input = {
    requestId: crypto.randomUUID(),
    body: "Agent note",
    to: { conversationId: channel.id },
  };
  const sent = await executeCommittedTool(db, identity, "reply", input, turn);
  expect(
    (await human.listMessages(channel.id)).find((item) => item.id === sent.result.output.messageId)
      ?.authorType,
  ).toBe("agent");
  const identityReads = () => queries.filter((query) => query.includes('from "user"'));
  expect(identityReads()).toHaveLength(1);
  // The send builds its hints in the transaction; a replay still refreshes the same timeline.
  const conversationHint: RealtimeHint = {
    audience: realtimeKeys.conversation(channel.id),
    domain: "messaging",
    scope: "messages",
    messageId: sent.result.output.messageId,
    threadId: null,
  };
  expect(sent.hints).toContainEqual(conversationHint);
  queries.length = 0;
  const replay = await executeCommittedTool(db, identity, "reply", input, turn);
  expect(replay.result.output).toEqual(sent.result.output);
  expect(replay.hints).toEqual([conversationHint]);
  expect(identityReads()).toHaveLength(1);
});

test("read tools take no row locks, and write tools lock the agent's actor row", async () => {
  const { identity, project } = await fixture();
  const { db, queries } = recordQueries();
  await executeAgentTool(db, identity, "list_projects", {}, turn);
  await executeAgentTool(db, identity, "get_project", { projectId: project.entityId }, turn);
  expect(queries.some((query) => /for (update|share)/i.test(query))).toBe(false);
  queries.length = 0;
  const input = { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Locked" };
  await executeAgentTool(db, identity, "create_task", input, turn);
  expect(queries.filter((query) => query.includes('for no key update of "actors"'))).toHaveLength(
    1,
  );
});

test("failed source validation rolls back task creation; foreign owners and organizations cannot impersonate agents", async () => {
  const { identity, project, createTask } = await fixture();
  const before = (await f.forActor(f.alice).tasks.list(project.entityId)).length;
  expect(
    await rejection(createTask({ title: "No", sourceMessageId: crypto.randomUUID() })),
  ).toBeInstanceOf(AccessDeniedError);
  expect((await f.forActor(f.alice).tasks.list(project.entityId)).length).toBe(before);
  expect(
    await rejection(
      executeAgentTool(f.db, { ...identity, userId: "bob" }, "list_projects", {}, turn),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(
      executeAgentTool(f.db, { ...identity, organizationId: f.orgB }, "list_projects", {}, turn),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});
