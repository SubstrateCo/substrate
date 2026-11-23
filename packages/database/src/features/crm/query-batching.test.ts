import { RepositoryContext } from "../../core/repository-context";
import { ActorRepositories } from "../../repositories";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { mcpCrmTools } from "../mcp/crm";
import { recordCrmActivities } from "./activity";
import { crmActivityEvents } from "./activity.schema";
import { requireDealRelations } from "./deals/deal-relations";
import { expect, test } from "bun:test";
import { inArray } from "drizzle-orm";

const f = setupDatabase();

test("CRM creation and deal updates avoid duplicate authorization and participant reads", async () => {
  const tracked = recordQueries();
  const a = new ActorRepositories(tracked.db, { organizationId: f.orgA, actorEntityId: f.alice });
  const [stage] = await a.crm.ensurePipeline();
  const contact = await a.contacts.createContact({ displayName: "Buyer" });
  tracked.queries.length = 0;
  const account = await a.crm.createAccount({ name: "Customer" });
  const accountCount = tracked.queries.length;
  tracked.queries.length = 0;
  const input = {
    title: "Sale",
    accountEntityId: account.entityId,
    contactEntityIds: [contact.entityId],
    primaryContactEntityId: contact.entityId,
    stageId: stage!.id,
  };
  const deal = await a.crm.createDeal(input);
  const dealCount = tracked.queries.length;
  tracked.queries.length = 0;
  const updated = await a.crm.updateDeal(deal.entityId, deal.version, {
    ...input,
    title: "Edited",
  });
  const updateCount = tracked.queries.length;
  expect([accountCount, dealCount, updateCount]).toEqual([8, 12, 13]);
  expect(account.ownerActorEntityId).toBe(f.alice);
  expect(deal.ownerActorEntityId).toBe(f.alice);
  expect(updated.title).toBe("Edited");
  expect((await a.crm.activity(account.entityId)).items).toMatchObject([{ action: "created" }]);
  expect((await a.crm.activity(deal.entityId)).items).toMatchObject([
    { action: "updated", changedFields: ["title"] },
    { action: "created" },
  ]);
});

test("deal lists batch account visibility and keep unreadable accounts redacted", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Customer" });
  const [stage] = await a.crm.ensurePipeline();
  const deals = [];
  for (let index = 0; index < 4; index++) {
    const deal = await a.crm.createDeal({
      title: `Sale ${index}`,
      accountEntityId: account.entityId,
      stageId: stage!.id,
    });
    await a.crm.share(deal.entityId, f.bob, "view");
    deals.push(deal);
  }
  const tracked = recordQueries();
  const b = new ActorRepositories(tracked.db, {
    organizationId: f.orgA,
    actorEntityId: f.bob,
  });
  const first = await b.crm.listDeals({ limit: 1 });
  const singleCount = tracked.queries.length;
  tracked.queries.length = 0;
  const page = await b.crm.listDeals({ limit: 4 });
  expect(tracked.queries.length).toBe(singleCount);
  expect(page).toHaveLength(4);
  expect(page.map((row) => row.accountEntityId)).toEqual([null, null, null, null]);
  expect(first[0]?.entityId).toBe(page[0]?.entityId);
  await a.crm.share(account.entityId, f.bob, "view");
  expect((await b.crm.listDeals()).map((row) => row.accountEntityId)).toEqual(
    deals.map(() => account.entityId),
  );
});

test("deal relation checks batch contacts and preserve archive and access rules", async () => {
  const a = f.forActor(f.alice);
  const contacts = [];
  for (let index = 0; index < 4; index++)
    contacts.push(await a.contacts.createContact({ displayName: `Buyer ${index}` }));
  const tracked = recordQueries();
  const ctx = new RepositoryContext(tracked.db, {
    organizationId: f.orgA,
    actorEntityId: f.alice,
  });
  await requireDealRelations(ctx, { contactEntityIds: [contacts[0]!.entityId] });
  const singleCount = tracked.queries.length;
  tracked.queries.length = 0;
  const input = { contactEntityIds: contacts.map((contact) => contact.entityId) };
  await requireDealRelations(ctx, input);
  expect(tracked.queries.length).toBe(singleCount);
  const [stage] = await a.crm.ensurePipeline();
  const repos = new ActorRepositories(tracked.db, ctx.scope);
  tracked.queries.length = 0;
  await repos.crm.createDeal({
    title: "One buyer",
    stageId: stage!.id,
    contactEntityIds: [contacts[0]!.entityId],
  });
  const writeCount = tracked.queries.length;
  tracked.queries.length = 0;
  await repos.crm.createDeal({ title: "All buyers", stageId: stage!.id, ...input });
  expect(tracked.queries.length).toBe(writeCount);
  const tools = mcpCrmTools(ctx, { userId: "alice", organizationId: f.orgA });
  const replay = {
    requestId: crypto.randomUUID(),
    title: "Replay",
    stageId: stage!.id,
    accountEntityId: null,
    primaryContactEntityId: null,
    amount: null,
    currency: null,
    expectedCloseDate: null,
    summary: "",
    ...input,
  };
  tracked.queries.length = 0;
  await tools.requireDealRelations({ ...replay, contactEntityIds: [contacts[0]!.entityId] });
  const replayCount = tracked.queries.length;
  tracked.queries.length = 0;
  await tools.requireDealRelations(replay);
  expect(tracked.queries.length).toBe(replayCount);
  await a.contacts.archive(contacts[0]!.entityId, true);
  expect(await rejection(requireDealRelations(ctx, input))).toMatchObject({
    name: "ValidationError",
  });
  await requireDealRelations(ctx, input, { active: false });
  const bob = new RepositoryContext(tracked.db, {
    organizationId: f.orgA,
    actorEntityId: f.bob,
  });
  await requireDealRelations(bob, input, { active: false });
  const outsider = new RepositoryContext(tracked.db, {
    organizationId: f.orgB,
    actorEntityId: f.outsider,
  });
  expect(await rejection(requireDealRelations(outsider, input, { active: false }))).toMatchObject({
    name: "AccessDeniedError",
  });
});

test("stage configuration uses constant queries and keeps retire, rename, and order rules", async () => {
  const a = f.forActor(f.alice);
  const [first, second, third, fourth] = await a.crm.ensurePipeline();
  const tracked = recordQueries();
  const repos = new ActorRepositories(tracked.db, {
    organizationId: f.orgA,
    actorEntityId: f.alice,
  });
  await repos.crm.configureStages([{ id: first!.id, name: "First" }, { name: "Added" }]);
  const smallCount = tracked.queries.length;
  const added = (await a.crm.pipeline()).find((stage) => stage.name === "Added")!;
  tracked.queries.length = 0;
  const result = await repos.crm.configureStages([
    { id: fourth!.id, name: "Fourth again" },
    { id: added.id, name: "Added" },
    { name: "New one" },
    { id: second!.id, name: "Second again" },
    { name: "New two" },
    { id: first!.id, name: "First" },
    { name: "New three" },
  ]);
  expect(tracked.queries.length).toBe(smallCount);
  const active = result.filter((stage) => !stage.retired);
  expect(active.map((stage) => [stage.name, stage.position])).toEqual([
    ["Fourth again", 0],
    ["Added", 1],
    ["New one", 2],
    ["Second again", 3],
    ["New two", 4],
    ["First", 5],
    ["New three", 6],
  ]);
  expect(result.filter((stage) => stage.retired).map((stage) => stage.id)).toEqual([third!.id]);
  const account = await a.crm.createAccount({ name: "Customer" });
  await a.crm.createDeal({ title: "Open", accountEntityId: account.entityId, stageId: second!.id });
  const before = await a.crm.pipeline();
  expect(
    await rejection(a.crm.configureStages([{ id: first!.id, name: "Only first" }])),
  ).toMatchObject({ name: "ConflictError" });
  expect(await a.crm.pipeline()).toEqual(before);
});

test("CRM activities record many rows with one access lookup and one insert", async () => {
  const a = f.forActor(f.alice);
  const contact = await a.contacts.createContact({ displayName: "Buyer" });
  const account = await a.crm.createAccount({ name: "Customer" });
  const tracked = recordQueries();
  const ctx = new RepositoryContext(tracked.db, { organizationId: f.orgA, actorEntityId: f.alice });
  expect(await recordCrmActivities(ctx, [])).toEqual([]);
  expect(tracked.queries).toEqual([]);
  await recordCrmActivities(ctx, [{ entityId: contact.entityId, action: "updated" }]);
  const singleCount = tracked.queries.length;
  tracked.queries.length = 0;
  const written = await recordCrmActivities(ctx, [
    {
      entityId: contact.entityId,
      action: "context_linked",
      changedFields: ["title", "affiliation", "title"],
      relatedEntityId: account.entityId,
    },
    { entityId: account.entityId, action: "context_linked", relatedEntityId: contact.entityId },
    { entityId: account.entityId, action: "updated", changedFields: ["name"] },
  ]);
  expect(singleCount).toBe(2);
  expect(tracked.queries.length).toBe(singleCount);
  const rows = await f.db
    .select()
    .from(crmActivityEvents)
    .where(
      inArray(
        crmActivityEvents.id,
        written.map((row) => row.id),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  expect(written.map((row) => byId.get(row.id))).toMatchObject([
    {
      entityId: contact.entityId,
      entityType: "contact",
      actorEntityId: f.alice,
      action: "context_linked",
      changedFields: ["affiliation", "title"],
      relatedEntityId: account.entityId,
    },
    {
      entityId: account.entityId,
      entityType: "account",
      action: "context_linked",
      changedFields: [],
      relatedEntityId: contact.entityId,
    },
    { entityId: account.entityId, entityType: "account", action: "updated", relatedEntityId: null },
  ]);
  const hidden = await a.crm.createAccount({ name: "Hidden" });
  await a.crm.share(account.entityId, f.bob, "view");
  const bob = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  const count = async () => (await f.db.select().from(crmActivityEvents)).length;
  const total = await count();
  for (const inputs of [
    [{ entityId: crypto.randomUUID(), action: "updated" as const }],
    [
      {
        entityId: contact.entityId,
        action: "context_linked" as const,
        relatedEntityId: crypto.randomUUID(),
      },
    ],
    [
      { entityId: contact.entityId, action: "updated" as const },
      { entityId: hidden.entityId, action: "updated" as const },
    ],
    [
      { entityId: contact.entityId, action: "updated" as const },
      {
        entityId: account.entityId,
        action: "context_linked" as const,
        relatedEntityId: hidden.entityId,
      },
    ],
  ])
    expect(await rejection(recordCrmActivities(bob, inputs))).toMatchObject({
      name: "AccessDeniedError",
    });
  const project = await ctx.createEntity("project");
  expect(
    await rejection(
      recordCrmActivities(ctx, [
        { entityId: contact.entityId, action: "updated" },
        { entityId: project.entityId, action: "updated" },
      ]),
    ),
  ).toMatchObject({ name: "ValidationError" });
  expect(await count()).toBe(total);
  await recordCrmActivities(bob, [
    { entityId: contact.entityId, action: "updated" },
    { entityId: account.entityId, action: "context_linked", relatedEntityId: contact.entityId },
  ]);
  expect(await count()).toBe(total + 2);
});

test("affiliation changes write paired activity in one insert", async () => {
  const a = f.forActor(f.alice);
  const contact = await a.contacts.createContact({ displayName: "Buyer" });
  const account = await a.crm.createAccount({ name: "Customer" });
  const tracked = recordQueries();
  const repos = new ActorRepositories(tracked.db, {
    organizationId: f.orgA,
    actorEntityId: f.alice,
  });
  const inserts = () =>
    tracked.queries.filter((query) => query.startsWith('insert into "crm_activity_events"')).length;
  await repos.crm.setAffiliation({
    contactEntityId: contact.entityId,
    accountEntityId: account.entityId,
    title: "Buyer",
    isPrimary: true,
  });
  expect(inserts()).toBe(1);
  tracked.queries.length = 0;
  await repos.crm.removeAffiliation(contact.entityId, account.entityId);
  expect(inserts()).toBe(1);
  const pairs = async (entityId: string) =>
    (await a.crm.activity(entityId)).items.map((item) => [item.action, item.relatedEntityId]);
  expect(await pairs(contact.entityId)).toEqual([
    ["context_unlinked", account.entityId],
    ["context_linked", account.entityId],
    ["created", undefined],
  ]);
  expect(await pairs(account.entityId)).toEqual([
    ["context_unlinked", contact.entityId],
    ["context_linked", contact.entityId],
    ["created", undefined],
  ]);
});
