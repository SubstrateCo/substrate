import { staleProposalError } from "@substrate/contracts/agent-work";
import type { WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";

import { AccessDeniedError, ValidationError } from "../../../errors";
import { crmAccounts, crmContactProfiles, entities, entityGrants, member } from "../../../schema";
import { agentWorkFixture, dmTurn, ownerAgentWork } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

async function proposals() {
  const fixture = await agentWorkFixture(f);
  const turn = dmTurn(fixture.dm.id);
  const propose = (action: WorkspaceApiRequest["input"]) =>
    fixture.call("propose", { requestId: crypto.randomUUID(), summary: "Do it", action }, turn);
  const work = await ownerAgentWork(f.db, fixture.owner);
  const approve = async (action: WorkspaceApiRequest["input"]) =>
    (await work.approveProposal((await propose(action)).proposalId)).result.outcome;
  return { ...fixture, propose, approve, work };
}

const account = async (entityId: string) =>
  (await f.db.select().from(crmAccounts).where(eq(crmAccounts.entityId, entityId)))[0]!;

test("records are archived and restored only through approvals, and say what changed", async () => {
  const { approve } = await proposals();
  const repos = f.forActor(f.alice);
  const northwind = await repos.crm.createAccount({ name: "Northwind" });
  const ada = await repos.contacts.create({ displayName: "Ada Park" });

  expect(
    await approve({
      type: "archive_crm_record",
      input: { kind: "account", entityId: northwind.entityId, archived: true },
    }),
  ).toEqual({
    status: "executed",
    receipt: { kind: "crm", entityType: "account", id: northwind.entityId },
  });
  expect((await account(northwind.entityId)).archivedAt).not.toBeNull();
  await approve({
    type: "archive_crm_record",
    input: { kind: "account", entityId: northwind.entityId, archived: false },
  });
  expect((await account(northwind.entityId)).archivedAt).toBeNull();

  await approve({
    type: "archive_crm_record",
    input: { kind: "contact", entityId: ada.entityId, archived: true },
  });
  const [profile] = await f.db
    .select()
    .from(crmContactProfiles)
    .where(eq(crmContactProfiles.contactEntityId, ada.entityId));
  expect(profile?.archivedAt).not.toBeNull();
});

test("an archive names the kind it archives; another kind's record is refused", async () => {
  const { propose } = await proposals();
  const northwind = await f.forActor(f.alice).crm.createAccount({ name: "Northwind" });
  expect(
    await rejection(
      propose({
        type: "archive_crm_record",
        input: { kind: "deal", entityId: northwind.entityId, archived: true },
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

test("an interaction is deleted only when the owner could delete it", async () => {
  const { approve, propose } = await proposals();
  const ada = await f.forActor(f.alice).contacts.create({ displayName: "Ada Park" });
  const interaction = (actor: string, summary: string) =>
    f.forActor(actor).contactInteractions.createManual({
      contactEntityId: ada.entityId,
      kind: "call",
      occurredAt: new Date("2026-11-12T10:00:00Z"),
      summary,
    });
  const own = await interaction(f.alice, "Mine");
  const bobs = await interaction(f.bob, "Bob's");
  expect(
    await approve({ type: "delete_crm_interaction", input: { entityId: own.entityId } }),
  ).toEqual({
    status: "executed",
    receipt: { kind: "deleted", entityType: "contact_interaction", id: own.entityId },
  });
  const [deleted] = await f.db
    .select({ deletedAt: entities.deletedAt })
    .from(entities)
    .where(eq(entities.entityId, own.entityId));
  expect(deleted?.deletedAt).not.toBeNull();
  // Without the admin role, Alice deletes only her own interactions.
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  expect(
    await rejection(
      propose({ type: "delete_crm_interaction", input: { entityId: bobs.entityId } }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

test("responsibility moves to a person, from the owner it had when proposed", async () => {
  const { agent, approve, propose } = await proposals();
  const northwind = await f.forActor(f.alice).crm.createAccount({ name: "Northwind" });
  const assign = (ownerActorId: string) => ({
    type: "assign_crm_owner",
    input: { entityId: northwind.entityId, ownerActorId, accessDecision: "keep_restricted" },
  });
  expect(await approve(assign(f.bob))).toMatchObject({
    status: "executed",
    receipt: { kind: "crm", entityType: "account" },
  });
  expect((await account(northwind.entityId)).ownerActorEntityId).toBe(f.bob);
  expect(await rejection(propose(assign(agent.actorId)))).toBeInstanceOf(ValidationError);
});

test("sharing grants and revokes a person's access and needs owner access", async () => {
  const { approve, propose } = await proposals();
  const northwind = await f.forActor(f.alice).crm.createAccount({ name: "Northwind" });
  const level = async () =>
    (
      await f.db
        .select({ level: entityGrants.level })
        .from(entityGrants)
        .where(
          and(eq(entityGrants.entityId, northwind.entityId), eq(entityGrants.actorEntityId, f.bob)),
        )
    )[0]?.level;
  await approve({
    type: "share_crm_record",
    input: { entityId: northwind.entityId, actorId: f.bob, level: "view" },
  });
  expect(await level()).toBe("view");
  await approve({
    type: "revoke_crm_access",
    input: { entityId: northwind.entityId, actorId: f.bob },
  });
  expect(await level()).toBeUndefined();

  // Edit access is not enough to share Bob's account.
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const bobs = await f.forActor(f.bob).crm.createAccount({ name: "Contoso" });
  await f.forActor(f.bob).crm.share(bobs.entityId, f.alice, "edit");
  expect(
    await rejection(
      propose({
        type: "share_crm_record",
        input: { entityId: bobs.entityId, actorId: f.bob, level: "view" },
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

test("an approval fails when the record changed after it was proposed", async () => {
  const { propose, work } = await proposals();
  const repos = f.forActor(f.alice);
  const northwind = await repos.crm.createAccount({ name: "Northwind" });
  const { proposalId } = await propose({
    type: "archive_crm_record",
    input: { kind: "account", entityId: northwind.entityId, archived: true },
  });
  await repos.crm.updateAccount(northwind.entityId, { name: "Northwind Ltd" });
  expect((await work.approveProposal(proposalId)).result.outcome).toEqual({
    status: "failed",
    error: staleProposalError,
  });
  expect((await account(northwind.entityId)).archivedAt).toBeNull();
});
