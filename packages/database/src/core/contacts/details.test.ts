import { AccessDeniedError, ConflictError } from "../../errors";
import { ActorRepositories } from "../../repositories";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { describe, expect, test } from "bun:test";

const f = setupDatabase();

describe("contact details", () => {
  test("keeps multiple labeled methods and changes primary within each type", async () => {
    const repo = f.forActor(f.alice).contacts;
    const contact = await repo.create({
      displayName: "Jane",
      givenName: "Jane",
      familyName: "Doe",
    });
    const work = await repo.addIdentifier(contact.entityId, {
      type: "email",
      value: "jane@EXAMPLE.com",
      label: "work",
      isPrimary: true,
    });
    const home = await repo.addIdentifier(contact.entityId, {
      type: "email",
      value: "jane@home.com",
    });
    await repo.addIdentifier(contact.entityId, {
      type: "phone",
      value: "+1 415 555 0123",
      isPrimary: true,
    });
    await repo.setPrimaryIdentifier(contact.entityId, home.id);
    const detail = await repo.getDetail(contact.entityId);
    expect(detail.profile.familyName).toBe("Doe");
    expect(detail.identifiers).toHaveLength(3);
    expect(detail.identifiers.find((row) => row.id === work.id)).toMatchObject({
      normalizedValue: "jane@example.com",
      isPrimary: false,
    });
    expect(
      detail.identifiers
        .filter((row) => row.isPrimary)
        .map((row) => row.type)
        .sort(),
    ).toEqual(["email", "phone"]);
  });

  test("matches organization contacts, allows shared addresses, and rejects duplicates within a contact", async () => {
    const alice = f.forActor(f.alice).contacts;
    const bob = f.forActor(f.bob).contacts;
    const outsider = f.forActor(f.outsider, f.orgB).contacts;
    const a = await alice.create({ displayName: "Alice's" });
    await alice.addIdentifier(a.entityId, { type: "email", value: "shared@example.com" });
    const b = await bob.create({ displayName: "Shared inbox" });
    await bob.addIdentifier(b.entityId, { type: "email", value: "shared@example.com" });
    const foreign = await outsider.create({ displayName: "Foreign" });
    await outsider.addIdentifier(foreign.entityId, { type: "email", value: "shared@example.com" });
    expect(
      (await bob.findByIdentifier({ type: "email", value: "shared@example.com" }))
        .map((row) => row.entityId)
        .sort(),
    ).toEqual([a.entityId, b.entityId].sort());
    await rejection(
      alice.addIdentifier(a.entityId, { type: "email", value: "shared@example.com" }),
    );
    await rejection(
      outsider.addIdentifier(a.entityId, { type: "email", value: "unauthorized@example.com" }),
    );
    await rejection(outsider.getDetail(a.entityId));
  });

  test("reports duplicate methods and URLs within a contact as conflicts", async () => {
    const repo = f.forActor(f.alice).contacts;
    const contact = await repo.create({ displayName: "Jane" });
    await repo.addIdentifier(contact.entityId, { type: "email", value: "jane@example.com" });
    const other = await repo.addIdentifier(contact.entityId, {
      type: "email",
      value: "other@example.com",
    });
    await repo.addUrl(contact.entityId, { url: "https://example.com" });
    const otherUrl = await repo.addUrl(contact.entityId, { url: "https://example.org" });
    expect(
      await rejection(
        repo.addIdentifier(contact.entityId, { type: "email", value: "jane@EXAMPLE.com" }),
      ),
    ).toBeInstanceOf(ConflictError);
    expect(
      await rejection(
        repo.updateIdentifier(contact.entityId, other.id, {
          type: "email",
          value: "jane@example.com",
        }),
      ),
    ).toBeInstanceOf(ConflictError);
    expect(
      await rejection(repo.addUrl(contact.entityId, { url: "https://example.com" })),
    ).toBeInstanceOf(ConflictError);
    expect(
      await rejection(
        repo.updateUrl(contact.entityId, otherUrl.id, { url: "https://example.com" }),
      ),
    ).toBeInstanceOf(ConflictError);
  });

  test("validates methods, URLs, and addresses without leaving partial writes", async () => {
    const repo = f.forActor(f.alice).contacts;
    const contact = await repo.create({ displayName: "Jane" });
    await rejection(repo.addIdentifier(contact.entityId, { type: "email", value: "not-email" }));
    await rejection(
      repo.addIdentifier(contact.entityId, {
        type: "email",
        value: "jane@example.com",
        extension: "42",
      }),
    );
    await rejection(repo.addUrl(contact.entityId, { url: "javascript:alert(1)" }));
    await rejection(repo.addAddress(contact.entityId, {}));
    const address = await repo.addAddress(contact.entityId, {
      city: "London",
      postalCode: "SW1A 1AA",
      countryCode: "GB",
    });
    const url = await repo.addUrl(contact.entityId, { url: "https://example.com", label: "work" });
    expect((await repo.getDetail(contact.entityId)).addresses).toContainEqual(address);
    await repo.updateUrl(contact.entityId, url.id, { url: "https://example.org", isPrimary: true });
    expect((await repo.getDetail(contact.entityId)).urls[0]).toMatchObject({
      url: "https://example.org",
      isPrimary: true,
    });
    await repo.removeAddress(contact.entityId, address.id);
    await repo.removeUrl(contact.entityId, url.id);
    expect((await repo.getDetail(contact.entityId)).addresses).toEqual([]);
    expect((await repo.getDetail(contact.entityId)).urls).toEqual([]);
  });

  test("does not allow a detail to be updated through a different contact and rolls back caller transactions", async () => {
    const repo = f.forActor(f.alice);
    const a = await repo.contacts.create({ displayName: "A" });
    const b = await repo.contacts.create({ displayName: "B" });
    const method = await repo.contacts.addIdentifier(a.entityId, {
      type: "phone",
      value: "020 7946 0018",
      countryCode: "GB",
    });
    expect(method.normalizedValue).toBe("+442079460018");
    await rejection(
      repo.contacts.updateIdentifier(b.entityId, method.id, {
        type: "email",
        value: "wrong@example.com",
      }),
    );
    await rejection(repo.contacts.removeIdentifier(a.entityId, ""));
    await rejection(
      repo.transaction(async (tx) => {
        await tx.contacts.addIdentifier(a.entityId, {
          type: "email",
          value: "rollback@example.com",
        });
        throw new Error("rollback");
      }),
    );
    expect((await repo.contacts.getDetail(a.entityId)).identifiers).toHaveLength(1);
  });

  test("concurrent primary changes leave one primary and failed changes preserve it", async () => {
    const repo = f.forActor(f.alice).contacts;
    const contact = await repo.create({ displayName: "Jane" });
    const added = await Promise.allSettled([
      repo.addIdentifier(contact.entityId, {
        type: "email",
        value: "one@example.com",
        isPrimary: true,
      }),
      repo.addIdentifier(contact.entityId, {
        type: "email",
        value: "two@example.com",
        isPrimary: true,
      }),
    ]);
    // A change that overlaps the other one loses with a conflict and writes nothing.
    const lost = added.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    expect(lost.length).toBeLessThan(2);
    for (const reason of lost) expect(reason).toBeInstanceOf(ConflictError);
    const before = await repo.getDetail(contact.entityId);
    expect(before.identifiers).toHaveLength(2 - lost.length);
    expect(before.identifiers.filter((row) => row.isPrimary)).toHaveLength(1);
    const one = await repo.addIdentifier(contact.entityId, {
      type: "email",
      value: "three@example.com",
    });
    const two = await repo.addIdentifier(contact.entityId, {
      type: "email",
      value: "four@example.com",
    });
    const switched = await Promise.allSettled([
      repo.setPrimaryIdentifier(contact.entityId, one.id),
      repo.setPrimaryIdentifier(contact.entityId, two.id),
    ]);
    for (const result of switched)
      if (result.status === "rejected") expect(result.reason).toBeInstanceOf(ConflictError);
    expect(switched.some((result) => result.status === "fulfilled")).toBe(true);
    const after = await repo.getDetail(contact.entityId);
    expect(after.identifiers.filter((row) => row.isPrimary)).toHaveLength(1);
    expect([one.id, two.id]).toContain(after.identifiers.find((row) => row.isPrimary)!.id);
    await rejection(
      repo.addIdentifier(contact.entityId, {
        type: "email",
        value: "three@example.com",
        isPrimary: true,
      }),
    );
    expect((await repo.getDetail(contact.entityId)).identifiers).toEqual(after.identifiers);
  });

  test("primary changes write the selected row once and clear only competitors", async () => {
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Jane" });
    const seed = f.forActor(f.alice).contacts;
    const work = await seed.addIdentifier(contact.entityId, {
      type: "email",
      value: "work@example.com",
      isPrimary: true,
    });
    const home = await seed.addIdentifier(contact.entityId, {
      type: "email",
      value: "home@example.com",
    });
    const phone = await seed.addIdentifier(contact.entityId, {
      type: "phone",
      value: "+1 415 555 0123",
      isPrimary: true,
    });
    await seed.addAddress(contact.entityId, { city: "London", isPrimary: true });
    const otherAddress = await seed.addAddress(contact.entityId, { city: "Paris" });
    await seed.addUrl(contact.entityId, { url: "https://a.example", isPrimary: true });
    const otherUrl = await seed.addUrl(contact.entityId, { url: "https://b.example" });
    const tracked = recordQueries();
    const repo = new ActorRepositories(tracked.db, {
      organizationId: f.orgA,
      actorEntityId: f.alice,
    }).contacts;
    const updates = (table: string) => {
      const found = tracked.queries
        .map((query, index) => ({ query, parameters: tracked.parameters[index]! }))
        .filter(({ query }) => query.startsWith(`update "${table}"`));
      tracked.queries.length = 0;
      tracked.parameters.length = 0;
      return found;
    };
    const clears = (rows: { parameters: unknown[] }[], id: string) =>
      rows.filter(({ parameters }) => parameters[0] === false && parameters.includes(id));

    await repo.setPrimaryIdentifier(contact.entityId, work.id);
    expect(updates("contact_identifiers")).toHaveLength(1);
    await repo.updateIdentifier(contact.entityId, work.id, {
      type: "email",
      value: "work@example.com",
      label: "work",
    });
    expect(updates("contact_identifiers")).toHaveLength(1);
    await repo.setPrimaryIdentifier(contact.entityId, home.id);
    const switched = updates("contact_identifiers");
    expect(switched).toHaveLength(2);
    expect(clears(switched, home.id)).toHaveLength(1);
    expect(switched[0]!.query).toContain(`"id" <> `);
    await repo.updateAddress(contact.entityId, otherAddress.id, { city: "Paris", isPrimary: true });
    const addressWrites = updates("contact_addresses");
    expect(addressWrites[0]!.query).toContain(`"id" <> `);
    expect(clears(addressWrites, otherAddress.id)).toHaveLength(1);
    await repo.updateUrl(contact.entityId, otherUrl.id, {
      url: "https://b.example",
      isPrimary: true,
    });
    const urlWrites = updates("contact_urls");
    expect(urlWrites[0]!.query).toContain(`"id" <> `);
    expect(clears(urlWrites, otherUrl.id)).toHaveLength(1);
    // Moving the email primary to the phone type replaces the phone primary.
    await repo.updateIdentifier(contact.entityId, home.id, {
      type: "phone",
      value: "+1 415 555 0199",
    });

    const detail = await seed.getDetail(contact.entityId);
    const primary = (rows: { id: string; isPrimary: boolean }[]) =>
      rows.flatMap((row) => (row.isPrimary ? [row.id] : []));
    expect(primary(detail.identifiers)).toEqual([home.id]);
    expect(detail.identifiers.find((row) => row.id === home.id)).toMatchObject({
      type: "phone",
      label: null,
    });
    expect(detail.identifiers.find((row) => row.id === work.id)).toMatchObject({
      label: "work",
      isPrimary: false,
    });
    expect(detail.identifiers.find((row) => row.id === phone.id)?.isPrimary).toBe(false);
    expect(primary(detail.addresses)).toEqual([otherAddress.id]);
    expect(primary(detail.urls)).toEqual([otherUrl.id]);
  });

  test("a missing primary target rolls back the cleared competitor", async () => {
    const repo = f.forActor(f.alice).contacts;
    const contact = await repo.create({ displayName: "Jane" });
    await repo.addIdentifier(contact.entityId, {
      type: "email",
      value: "a@example.com",
      isPrimary: true,
    });
    await repo.addAddress(contact.entityId, { city: "London", isPrimary: true });
    await repo.addUrl(contact.entityId, { url: "https://a.example", isPrimary: true });
    const before = await repo.getDetail(contact.entityId);
    const missing = crypto.randomUUID();
    for (const write of [
      () =>
        repo.updateIdentifier(contact.entityId, missing, {
          type: "email",
          value: "b@example.com",
          isPrimary: true,
        }),
      () => repo.setPrimaryIdentifier(contact.entityId, missing),
      () => repo.updateAddress(contact.entityId, missing, { city: "Paris", isPrimary: true }),
      () =>
        repo.updateUrl(contact.entityId, missing, { url: "https://b.example", isPrimary: true }),
    ])
      expect(await rejection(write())).toBeInstanceOf(AccessDeniedError);
    expect(await repo.getDetail(contact.entityId)).toEqual(before);
  });

  test("members change any contact's details and outsiders cannot", async () => {
    const alice = f.forActor(f.alice).contacts;
    const bob = f.forActor(f.bob).contacts;
    const outsider = f.forActor(f.outsider, f.orgB).contacts;
    const contact = await alice.create({ displayName: "Jane" });
    const method = await alice.addIdentifier(contact.entityId, {
      type: "email",
      value: "jane@example.com",
    });
    expect((await bob.getDetail(contact.entityId)).identifiers).toContainEqual(method);
    await rejection(outsider.removeIdentifier(contact.entityId, method.id));
    await rejection(outsider.addAddress(contact.entityId, { city: "London" }));
    await bob.removeIdentifier(contact.entityId, method.id);
    const address = await bob.addAddress(contact.entityId, { city: "London" });
    const detail = await alice.getDetail(contact.entityId);
    expect(detail.identifiers).toEqual([]);
    expect(detail.addresses).toContainEqual(address);
  });
});
