import type { WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";

import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
} from "../../../../../packages/database/src/errors";
import { crmActivityEvents } from "../../../../../packages/database/src/features/crm/activity.schema";
import { member } from "../../../../../packages/database/src/schema";
import { dmTurn, ownerAgentWork } from "../../../../../packages/database/src/testing/agent-work";
import { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { rejection } from "../../../../../packages/database/src/testing/rejection";
import { agentWorkFixture } from "./test-support";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";

const f = setupDatabase();

async function tools() {
  const fixture = await agentWorkFixture(f);
  const turn = dmTurn(fixture.dm.id);
  const call = <K extends Parameters<typeof fixture.call>[0]>(
    tool: K,
    input: Parameters<typeof fixture.call>[1],
  ) => fixture.call(tool, input, turn);
  const contact = async (displayName: string) =>
    String(
      (await call("create_crm_contact", { requestId: crypto.randomUUID(), displayName })).record
        .entityId,
    );
  const account = async (name: string) =>
    String(
      (await call("create_crm_account", { requestId: crypto.randomUUID(), name })).record.entityId,
    );
  const interaction = async (contactEntityId: string, summary: string, occurredAt: string) =>
    String(
      (
        await call("create_crm_interaction", {
          requestId: crypto.randomUUID(),
          contactEntityId,
          kind: "call",
          occurredAt,
          summary,
        })
      ).record.entityId,
    );
  return { ...fixture, call, contact, account, interaction };
}

// The contact detail lists, as get_crm_record returns them.
const contactDetails = z.object({
  identifiers: z.array(z.object({ id: z.string(), value: z.string() })),
  urls: z.array(z.object({ url: z.string() })),
  addresses: z.array(z.object({ city: z.string().nullable() })),
});

test("contact details are added, updated and removed, and contacts are found by email", async () => {
  const { call, contact } = await tools();
  const ada = await contact("Ada Park");
  const change = async (input: WorkspaceApiRequest["input"]) =>
    contactDetails.parse(
      (
        await call("change_crm_contact_detail", {
          requestId: crypto.randomUUID(),
          contactEntityId: ada,
          ...input,
        })
      ).record,
    );
  await change({ action: "addIdentifier", type: "email", value: "ada@northwind.test" });
  await change({ action: "addUrl", url: "https://northwind.test/ada" });
  const withAddress = await change({ action: "addAddress", city: "Lisbon", countryCode: "PT" });
  expect(withAddress.identifiers.map((row) => row.value)).toEqual(["ada@northwind.test"]);
  expect(withAddress.urls.map((row) => row.url)).toEqual(["https://northwind.test/ada"]);
  expect(withAddress.addresses.map((row) => row.city)).toEqual(["Lisbon"]);

  // Find by the exact address; a different address finds nobody.
  expect(
    (await call("find_crm_contacts", { type: "email", value: "ada@northwind.test" })).items,
  ).toEqual([{ entityId: ada, displayName: "Ada Park" }]);
  expect((await call("find_crm_contacts", { type: "email", value: "x@y.test" })).items).toEqual([]);

  const [email] = withAddress.identifiers;
  const updated = await change({
    action: "updateIdentifier",
    id: email!.id,
    type: "email",
    value: "ada@contoso.test",
  });
  expect(updated.identifiers.map((row) => row.value)).toEqual(["ada@contoso.test"]);
  const removed = await change({ action: "removeIdentifier", id: email!.id });
  expect(removed.identifiers).toEqual([]);
  expect(
    await rejection(
      call("change_crm_contact_detail", {
        contactEntityId: ada,
        action: "addUrl",
        url: "https://x.test",
      }),
    ),
  ).toBeInstanceOf(ZodError);
});

test("affiliations link a contact to an account and show on both records", async () => {
  const { call, contact, account } = await tools();
  const ada = await contact("Ada Park");
  const northwind = await account("Northwind");
  const input = {
    requestId: crypto.randomUUID(),
    contactEntityId: ada,
    accountEntityId: northwind,
    title: "Head of Ops",
    isPrimary: true,
  };
  const linked = await call("set_crm_affiliation", input);
  expect(linked.record.affiliations).toMatchObject([
    { affiliation: { title: "Head of Ops", isPrimary: true }, account: { entityId: northwind } },
  ]);
  expect(
    (await call("get_crm_record", { kind: "account", entityId: northwind })).record.contacts,
  ).toMatchObject([{ contact: { entityId: ada } }]);
  const unlinked = await call("remove_crm_affiliation", {
    requestId: crypto.randomUUID(),
    contactEntityId: ada,
    accountEntityId: northwind,
  });
  expect(unlinked.record.affiliations).toEqual([]);

  // An account the owner cannot edit cannot gain people.
  const hidden = await f.forActor(f.bob).crm.createAccount({ name: "Bob's account" });
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  expect(
    await rejection(
      call("set_crm_affiliation", {
        ...input,
        requestId: crypto.randomUUID(),
        accountEntityId: hidden.entityId,
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

test("interactions are read by account, searched by period and words, read and corrected", async () => {
  const { call, contact, account, interaction } = await tools();
  const ada = await contact("Ada Park");
  const ben = await contact("Ben Ode");
  const northwind = await account("Northwind");
  await call("set_crm_affiliation", {
    requestId: crypto.randomUUID(),
    contactEntityId: ada,
    accountEntityId: northwind,
  });
  const intro = await interaction(ada, "Intro call about renewal", "2026-11-02T10:00:00Z");
  const other = await interaction(ben, "Pricing question", "2026-11-03T10:00:00Z");
  await interaction(ada, "Kickoff", "2026-09-01T10:00:00Z");

  // An account's history covers its affiliated contacts only.
  const accountHistory = await call("list_crm_interactions", { entityId: northwind });
  expect(accountHistory.items.map((row) => row.summary)).toEqual([
    "Intro call about renewal",
    "Kickoff",
  ]);
  expect(
    (await call("list_crm_interactions", { entityId: northwind, linkedOnly: true })).items,
  ).toEqual([]);

  const ids = async (input: WorkspaceApiRequest["input"]) =>
    (await call("search_crm_interactions", input)).items.map((row) => row.entityId);
  const november = { from: "2026-11-01T00:00:00Z", until: "2026-12-01T00:00:00Z" };
  expect(await ids(november)).toEqual([other, intro]);
  expect(await ids({ ...november, search: "renewal" })).toEqual([intro]);
  expect(await ids({ ...november, accountEntityId: northwind })).toEqual([intro]);
  expect((await ids({ search: "Kickoff" })).length).toBe(1);
  expect(await rejection(call("search_crm_interactions", { from: november.from }))).toBeInstanceOf(
    ZodError,
  );
  expect(
    await rejection(
      call("search_crm_interactions", { from: "2026-09-01T00:00:00Z", until: november.until }),
    ),
  ).toBeInstanceOf(ZodError);

  expect(await call("get_crm_interaction", { entityId: intro })).toMatchObject({
    interaction: { entityId: intro, contactName: "Ada Park", summary: "Intro call about renewal" },
    archived: false,
  });
  const corrected = await call("update_crm_interaction", {
    requestId: crypto.randomUUID(),
    entityId: intro,
    summary: "Intro call about the renewal date",
  });
  expect(corrected.record).toMatchObject({
    entityId: intro,
    summary: "Intro call about the renewal date",
    kind: "call",
  });
});

test("a record's open follow-ups list its linked tasks", async () => {
  const { call, account } = await tools();
  const northwind = await account("Northwind");
  const project = await f.forActor(f.alice).projects.create({ name: "Sales" });
  const follow = await call("create_crm_follow_up", {
    requestId: crypto.randomUUID(),
    entityId: northwind,
    projectEntityId: project.entityId,
    title: "Send renewal quote",
    dueDate: "2026-12-01",
    consentToTaskAudience: true,
  });
  const listed = await call("list_crm_follow_ups", { entityId: northwind });
  expect(listed.tasks).toMatchObject([
    { entityId: follow.id, title: "Send renewal quote", dueDate: "2026-12-01" },
  ]);
  expect(listed.nextAction).toMatchObject({ entityId: follow.id });
  await call("update_task", {
    requestId: crypto.randomUUID(),
    taskId: follow.id,
    changes: { status: "completed" },
  });
  expect((await call("list_crm_follow_ups", { entityId: northwind })).tasks).toEqual([]);
});

test("archived records refuse new affiliations", async () => {
  const { call, contact, account } = await tools();
  const ada = await contact("Ada Park");
  const northwind = await account("Northwind");
  await f.forActor(f.alice).crm.archive(northwind, true);
  expect(
    await rejection(
      call("set_crm_affiliation", {
        requestId: crypto.randomUUID(),
        contactEntityId: ada,
        accountEntityId: northwind,
      }),
    ),
  ).toBeInstanceOf(ValidationError);
});

test("records are archived and restored, and the archive names the record's kind", async () => {
  const { call, contact, account } = await tools();
  const northwind = await account("Northwind");
  const ada = await contact("Ada Park");
  const archive = (kind: string, entityId: string, archived: boolean) =>
    call("archive_crm_record", { requestId: crypto.randomUUID(), kind, entityId, archived });
  expect((await archive("account", northwind, true)).record).toMatchObject({
    account: { archivedAt: expect.any(String) },
  });
  expect((await archive("account", northwind, false)).record).toMatchObject({
    account: { archivedAt: null },
  });
  expect((await archive("contact", ada, true)).record).toMatchObject({
    archivedAt: expect.any(String),
  });
  // An account is not a deal; the archive refuses another kind's record.
  expect(await rejection(archive("deal", northwind, true))).toBeInstanceOf(AccessDeniedError);
});

test("an interaction is deleted on approval, only when the owner could delete it", async () => {
  const { call, contact, interaction, dm, owner, pending } = await tools();
  const ada = await contact("Ada Park");
  const own = await interaction(ada, "Mine", "2026-11-12T10:00:00Z");
  const bobs = await f.forActor(f.bob).contactInteractions.createManual({
    contactEntityId: ada,
    kind: "call",
    occurredAt: new Date("2026-11-12T11:00:00Z"),
    summary: "Bob's",
  });
  const remove = (entityId: string) =>
    pending("delete_crm_interaction", { requestId: crypto.randomUUID(), entityId }, dmTurn(dm.id));
  const proposalId = await remove(own);
  // The interaction stays until the owner approves.
  expect(await call("get_crm_interaction", { entityId: own })).toMatchObject({
    interaction: { entityId: own },
  });
  const { outcome } = (await (await ownerAgentWork(f.db, owner)).approveProposal(proposalId))
    .result;
  expect(outcome).toEqual({
    status: "executed",
    receipt: { kind: "deleted", entityType: "contact_interaction", id: own },
    result: { deleted: true, entityId: own },
  });
  expect(await rejection(call("get_crm_interaction", { entityId: own }))).toBeInstanceOf(
    AccessDeniedError,
  );
  // Without the admin role, Alice deletes only her own interactions.
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  expect(await rejection(remove(bobs.entityId))).toBeInstanceOf(AccessDeniedError);
});

test("responsibility moves to a person from the owner the agent read, and sharing needs owner access", async () => {
  const { agent, call, account } = await tools();
  const northwind = await account("Northwind");
  const read = await call("get_crm_record", { kind: "account", entityId: northwind });
  const owner = z
    .object({ account: z.object({ ownerActorEntityId: z.string() }) })
    .parse(read.record).account.ownerActorEntityId;
  const assign = (ownerActorEntityId: string, expectedOwnerActorEntityId: string) =>
    call("assign_crm_owner", {
      requestId: crypto.randomUUID(),
      entityId: northwind,
      ownerActorEntityId,
      expectedOwnerActorEntityId,
      accessDecision: "keep_restricted",
    });
  expect(await assign(f.bob, owner)).toEqual({ entityId: northwind, ownerActorEntityId: f.bob });
  // The owner the agent read is stale now.
  expect(await rejection(assign(f.alice, owner))).toBeInstanceOf(ConflictError);
  expect(await rejection(assign(agent.actorId, f.bob))).toBeInstanceOf(ValidationError);

  const share = (entityId: string) =>
    call("share_crm_record", {
      requestId: crypto.randomUUID(),
      entityId,
      actorEntityId: f.bob,
      level: "view",
    });
  expect(await share(northwind)).toEqual({ entityId: northwind });
  expect(
    await call("revoke_crm_access", {
      requestId: crypto.randomUUID(),
      entityId: northwind,
      actorEntityId: f.bob,
    }),
  ).toEqual({ entityId: northwind });
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const contoso = await f.forActor(f.bob).crm.createAccount({ name: "Contoso" });
  await f.forActor(f.bob).crm.share(contoso.entityId, f.alice, "edit");
  expect(await rejection(share(contoso.entityId))).toBeInstanceOf(AccessDeniedError);
});

test("a background CRM write waits for approval and then runs as the agent", async () => {
  const { dm, owner, pending, agent } = await tools();
  const proposalId = await pending(
    "create_crm_account",
    { requestId: crypto.randomUUID(), name: "Northwind" },
    dmTurn(dm.id, "unattended"),
  );
  expect(await f.forActor(f.alice).crm.listAccounts()).toEqual([]);
  const { outcome } = (await (await ownerAgentWork(f.db, owner)).approveProposal(proposalId))
    .result;
  const [created] = await f.forActor(f.alice).crm.listAccounts();
  expect(created).toMatchObject({ name: "Northwind" });
  expect(outcome).toMatchObject({
    status: "executed",
    receipt: { kind: "crm", entityType: "account", id: created!.entityId },
    result: { record: { entityId: created!.entityId } },
  });
  const [activity] = await f.db
    .select({ actor: crmActivityEvents.actorEntityId })
    .from(crmActivityEvents)
    .where(eq(crmActivityEvents.entityId, created!.entityId));
  expect(activity).toEqual({ actor: agent.actorId });
});
