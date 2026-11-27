import { RepositoryContext } from "../../../core/repository-context";
import { setupDatabase } from "../../../testing/database";
import { pageStatement, recordQueries } from "../../../testing/queries";
import { timeline } from "./timeline";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("an account timeline page filters by its contacts before loading interactions", async () => {
  const repo = f.forActor(f.alice);
  const account = await repo.crm.createAccount({ name: "Customer" });
  const buyer = await repo.contacts.create({ displayName: "Buyer" });
  await repo.crm.setAffiliation({
    accountEntityId: account.entityId,
    contactEntityId: buyer.entityId,
    title: "Buyer",
    isPrimary: true,
  });
  const call = await repo.contactInteractions.createManual({
    contactEntityId: buyer.entityId,
    kind: "call",
    occurredAt: new Date("2026-11-10T12:00:00Z"),
    summary: "Kickoff",
  });
  const unrelated = await repo.contacts.create({ displayName: "Unrelated" });
  await repo.contactInteractions.createManual({
    contactEntityId: unrelated.entityId,
    kind: "call",
    occurredAt: new Date("2026-11-11T12:00:00Z"),
    summary: "Another customer",
  });
  const recorded = recordQueries();
  const context = new RepositoryContext(recorded.db, {
    organizationId: f.orgA,
    actorEntityId: f.alice,
  });
  const rows = await timeline(context, account.entityId);
  expect(rows.map((row) => row.entityId)).toEqual([call.entityId]);
  const { query, parameters } = pageStatement(recorded, "contact_interactions");
  // The scope is resolved before the page, so no per-row test of links or affiliations remains.
  expect(query).not.toContain('"entity_links"');
  expect(query).not.toContain('"crm_affiliations"');
  expect(query).toContain('"contact_interactions"."contact_entity_id"');
  expect(parameters).toContain(buyer.entityId);
  expect(parameters).not.toContain(unrelated.entityId);
});
