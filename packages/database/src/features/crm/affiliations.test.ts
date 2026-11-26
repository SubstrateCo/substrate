import { realtimeKeys } from "@substrate/contracts/realtime";

import { ActorRepositories } from "../../repositories";
import { actors, organizationApps } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { crmActivityEvents } from "./activity.schema";
import { crmAccounts, crmAffiliations, crmContactProfiles } from "./schema";
import { expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

const f = setupDatabase();

async function records() {
  const a = f.forActor(f.alice);
  const contact = await a.contacts.createContact({ displayName: "Buyer" });
  const account = await a.crm.createAccount({ name: "Customer" });
  return {
    a,
    input: {
      contactEntityId: contact.entityId,
      accountEntityId: account.entityId,
      title: "Buyer",
      isPrimary: true,
    },
  };
}

test("affiliation writes batch guards and retain paired activities and hints", async () => {
  const { a, input } = await records();
  const tracked = recordQueries();
  const repos = new ActorRepositories(tracked.db, {
    organizationId: f.orgA,
    actorEntityId: f.alice,
  });
  const counts: number[] = [];
  const measure = async <T>(work: () => Promise<T>) => {
    tracked.queries.length = 0;
    await work();
    counts.push(
      tracked.queries.filter((query) => !/^(begin|commit|rollback|savepoint|release)/i.test(query))
        .length,
    );
  };
  await measure(() => repos.crm.setAffiliation(input));
  await measure(() => repos.crm.setAffiliation({ ...input, isPrimary: false, title: "Updated" }));
  await measure(() => repos.crm.removeAffiliation(input.contactEntityId, input.accountEntityId));
  await measure(() => repos.crm.removeAffiliation(input.contactEntityId, input.accountEntityId));
  expect(await f.db.select().from(crmAffiliations)).toEqual([]);
  for (const [entityId, relatedEntityId] of [
    [input.contactEntityId, input.accountEntityId],
    [input.accountEntityId, input.contactEntityId],
  ]) {
    const events = (await a.crm.activity(entityId!)).items.filter((row) =>
      row.changedFields.includes("affiliation"),
    );
    expect(events.map((row) => [row.action, row.relatedEntityId])).toEqual([
      ["context_unlinked", relatedEntityId],
      ["updated", relatedEntityId],
      ["context_linked", relatedEntityId],
    ]);
  }
  const result = await a.transaction((tx) => tx.crm.setAffiliation(input));
  for (const id of [input.contactEntityId, input.accountEntityId])
    expect(result.hints).toContainEqual({
      audience: realtimeKeys.entity(f.orgA, id),
      domain: "context",
    });
  expect(result.result).toMatchObject(input);
  expect(counts).toEqual([9, 7, 5, 3]);
});

test("primary selection resets the old primary without rewriting false rows", async () => {
  const { a, input } = await records();
  const accounts = await Promise.all(
    ["Other primary", "Not primary", "Also not primary"].map((name) =>
      a.crm.createAccount({ name }),
    ),
  );
  await f.db.insert(crmAffiliations).values(
    accounts.map((account, index) => ({
      organizationId: f.orgA,
      contactEntityId: input.contactEntityId,
      accountEntityId: account.entityId,
      isPrimary: index === 0,
      title: "Other",
    })),
  );
  const version = async () =>
    f.db.execute(sql`select xmin::text, ctid::text from ${crmAffiliations}
      where account_entity_id in (${accounts[1]!.entityId}, ${accounts[2]!.entityId})
      order by account_entity_id`);
  const before = await version();
  await a.crm.setAffiliation(input);
  const events = await f.db.select().from(crmActivityEvents);
  await a.crm.setAffiliation(input);
  expect(await version()).toEqual(before);
  const rows = await f.db.select().from(crmAffiliations);
  expect(rows.filter((row) => row.isPrimary).map((row) => row.accountEntityId)).toEqual([
    input.accountEntityId,
  ]);
  expect(await f.db.select().from(crmActivityEvents)).toEqual(events);
});

for (const archived of ["contact", "account"] as const) {
  test(`archived ${archived} denies set but permits removal`, async () => {
    const { a, input } = await records();
    await a.crm.setAffiliation(input);
    if (archived === "contact") await a.contacts.archive(input.contactEntityId, true);
    else await a.crm.archive(input.accountEntityId, true);
    expect(await rejection(a.crm.setAffiliation({ ...input, title: "Denied" }))).toMatchObject({
      name: "ValidationError",
      message: "Restore the archived record first.",
    });
    expect((await f.db.select().from(crmAffiliations))[0]).toMatchObject(input);
    await a.crm.removeAffiliation(input.contactEntityId, input.accountEntityId);
    expect(await f.db.select().from(crmAffiliations)).toEqual([]);
  });
}

test("missing contact profile remains unarchived; missing account retains its FK failure", async () => {
  const { a, input } = await records();
  await f.db
    .delete(crmContactProfiles)
    .where(eq(crmContactProfiles.contactEntityId, input.contactEntityId));
  expect(await a.crm.setAffiliation(input)).toMatchObject(input);
  await a.crm.removeAffiliation(input.contactEntityId, input.accountEntityId);
  await f.db.delete(crmAccounts).where(eq(crmAccounts.entityId, input.accountEntityId));
  expect(await rejection(a.crm.setAffiliation(input))).toMatchObject({
    cause: { code: "23503" },
  });
  await a.crm.removeAffiliation(input.contactEntityId, input.accountEntityId);
  expect(await f.db.select().from(crmAffiliations)).toEqual([]);
});

for (const invalid of [
  "swapped",
  "same contact",
  "same account",
  "cross org",
  "view",
  "inactive",
  "disabled",
] as const) {
  test(`affiliation set and removal reject ${invalid}`, async () => {
    const { a, input } = await records();
    await a.crm.setAffiliation(input);
    let repos = a;
    let contactId = input.contactEntityId;
    let accountId = input.accountEntityId;
    if (invalid === "swapped") [contactId, accountId] = [accountId, contactId];
    if (invalid === "same contact") accountId = contactId;
    if (invalid === "same account") contactId = accountId;
    if (invalid === "cross org")
      accountId = (await f.forActor(f.outsider, f.orgB).crm.createAccount({ name: "Foreign" }))
        .entityId;
    if (invalid === "view") {
      await a.crm.share(accountId, f.bob, "view");
      repos = f.forActor(f.bob);
    }
    if (invalid === "inactive")
      await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.alice));
    if (invalid === "disabled")
      await f.db
        .update(organizationApps)
        .set({ enabled: false })
        .where(and(eq(organizationApps.organizationId, f.orgA), eq(organizationApps.appId, "crm")));
    const before = await f.db.select().from(crmActivityEvents);
    for (const work of [
      () =>
        repos.crm.setAffiliation({
          ...input,
          contactEntityId: contactId,
          accountEntityId: accountId,
        }),
      () => repos.crm.removeAffiliation(contactId, accountId),
    ])
      expect(await rejection(work())).toMatchObject({
        name: invalid === "disabled" ? "AppDisabledError" : "AccessDeniedError",
      });
    expect((await f.db.select().from(crmAffiliations))[0]).toMatchObject(input);
    expect(await f.db.select().from(crmActivityEvents)).toEqual(before);
  });
}

test("caller rollback restores primary selection and paired activities", async () => {
  const { a, input } = await records();
  const other = await a.crm.createAccount({ name: "Other" });
  await a.crm.setAffiliation(input);
  const before = await f.db.select().from(crmActivityEvents);
  expect(
    await rejection(
      a.transaction(async (tx) => {
        await tx.crm.setAffiliation({ ...input, accountEntityId: other.entityId });
        await tx.crm.removeAffiliation(input.contactEntityId, input.accountEntityId);
        throw new Error("abort");
      }),
    ),
  ).toMatchObject({ message: "abort" });
  expect(await f.db.select().from(crmAffiliations)).toMatchObject([input]);
  expect(await f.db.select().from(crmActivityEvents)).toEqual(before);
});

test("concurrent primary selections leave one primary", async () => {
  const { a, input } = await records();
  const other = await a.crm.createAccount({ name: "Other" });
  const results = await Promise.allSettled([
    a.crm.setAffiliation(input),
    a.crm.setAffiliation({ ...input, accountEntityId: other.entityId }),
  ]);
  // The loser conflicts, or applies cleanly after the winner. Its writes never half-apply.
  const applied = results.filter((result) => result.status === "fulfilled").length;
  expect(applied).toBeGreaterThanOrEqual(1);
  for (const result of results)
    if (result.status === "rejected")
      expect(result.reason).toMatchObject({
        name: "ConflictError",
        message: "The primary affiliation changed. Reload and try again.",
      });
  const rows = await f.db.select().from(crmAffiliations);
  expect(rows).toHaveLength(applied);
  expect(rows.filter((row) => row.isPrimary)).toHaveLength(1);
  const linked = (await a.crm.activity(input.contactEntityId)).items.filter(
    (row) => row.action === "context_linked",
  );
  expect(linked).toHaveLength(applied);
});
