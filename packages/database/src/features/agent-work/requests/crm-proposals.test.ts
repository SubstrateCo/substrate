import type { WorkspaceApiRequest } from "@substrate/contracts/agent-tools/mcp";
import type { ServerToolName } from "@substrate/contracts/agent-tools/tools";
import { staleProposalError } from "@substrate/contracts/agent-work";

import { AccessDeniedError } from "../../../errors";
import { crmAccounts, crmContactProfiles, entities, entityGrants, member } from "../../../schema";
import { agentWorkFixture, ownerAgentWork } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { dmTurn } from "../../../testing/turns";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

async function proposals() {
  const fixture = await agentWorkFixture(f);
  const turn = dmTurn(fixture.dm.id);
  const propose = (tool: ServerToolName, input: WorkspaceApiRequest["input"]) =>
    fixture.propose(tool, { requestId: crypto.randomUUID(), ...input }, turn);
  const work = await ownerAgentWork(f.db, fixture.owner);
  const approve = async (tool: ServerToolName, input: WorkspaceApiRequest["input"]) =>
    (await work.approveProposal(await propose(tool, input))).result.outcome;
  return { ...fixture, propose, approve, work };
}

const account = async (entityId: string) =>
  (await f.db.select().from(crmAccounts).where(eq(crmAccounts.entityId, entityId)))[0]!;

test("records are archived and restored through approvals, and the receipt names the record", async () => {
  const { approve } = await proposals();
  const repos = f.forActor(f.alice);
  const northwind = await repos.crm.createAccount({ name: "Northwind" });
  const ada = await repos.contacts.create({ displayName: "Ada Park" });
  const archive = (kind: string, entityId: string, archived: boolean) =>
    approve("archive_crm_record", { kind, entityId, archived });

  expect(await archive("account", northwind.entityId, true)).toMatchObject({
    status: "executed",
    receipt: { kind: "crm", entityType: "account", id: northwind.entityId },
  });
  expect((await account(northwind.entityId)).archivedAt).not.toBeNull();
  await archive("account", northwind.entityId, false);
  expect((await account(northwind.entityId)).archivedAt).toBeNull();

  expect(await archive("contact", ada.entityId, true)).toMatchObject({
    status: "executed",
    receipt: { kind: "crm", entityType: "contact", id: ada.entityId },
  });
  const [profile] = await f.db
    .select()
    .from(crmContactProfiles)
    .where(eq(crmContactProfiles.contactEntityId, ada.entityId));
  expect(profile?.archivedAt).not.toBeNull();
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
  expect(await approve("delete_crm_interaction", { entityId: own.entityId })).toMatchObject({
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
    await rejection(propose("delete_crm_interaction", { entityId: bobs.entityId })),
  ).toBeInstanceOf(AccessDeniedError);
});

test("sharing grants and revokes a person's access through approvals", async () => {
  const { approve } = await proposals();
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
  expect(
    await approve("share_crm_record", {
      entityId: northwind.entityId,
      actorEntityId: f.bob,
      level: "view",
    }),
  ).toMatchObject({
    status: "executed",
    receipt: { kind: "crm", entityType: "account", id: northwind.entityId },
  });
  expect(await level()).toBe("view");
  await approve("revoke_crm_access", { entityId: northwind.entityId, actorEntityId: f.bob });
  expect(await level()).toBeUndefined();
});

test("an approval fails when the record changed after it was proposed", async () => {
  const { propose, work } = await proposals();
  const repos = f.forActor(f.alice);
  const northwind = await repos.crm.createAccount({ name: "Northwind" });
  const proposalId = await propose("archive_crm_record", {
    kind: "account",
    entityId: northwind.entityId,
    archived: true,
  });
  await repos.crm.updateAccount(northwind.entityId, { name: "Northwind Ltd" });
  expect((await work.approveProposal(proposalId)).result.outcome).toEqual({
    status: "failed",
    error: staleProposalError,
  });
  expect((await account(northwind.entityId)).archivedAt).toBeNull();
});
