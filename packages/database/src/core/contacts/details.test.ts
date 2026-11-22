import { ConflictError } from "../../errors";
import { contacts } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

const f = setupDatabase();

describe("contact details", () => {
  test("detail edits permit foreign-key readers while their transaction is open", async () => {
    const a = f.forActor(f.alice);
    const contact = await a.contacts.create({ displayName: "Jane" });
    await a.transaction(async (tx) => {
      await tx.contacts.addIdentifier(contact.entityId, {
        type: "email",
        value: "jane@example.com",
        isPrimary: true,
      });
      await f.db.transaction(async (reader) => {
        const rows = await reader.execute(sql`
          SELECT entity_id FROM ${contacts} WHERE entity_id = ${contact.entityId}
          FOR KEY SHARE NOWAIT
        `);
        expect(rows).toHaveLength(1);
      });
    });
    expect((await a.contacts.getDetail(contact.entityId)).identifiers).toMatchObject([
      { value: "jane@example.com", isPrimary: true },
    ]);
  });

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

  test("matches only readable contacts, allows shared addresses, and rejects duplicates within a contact", async () => {
    const alice = f.forActor(f.alice).contacts;
    const bob = f.forActor(f.bob).contacts;
    const a = await alice.create({ displayName: "Private" });
    await alice.addIdentifier(a.entityId, { type: "email", value: "shared@example.com" });
    const b = await bob.create({ displayName: "Shared inbox" });
    await bob.addIdentifier(b.entityId, { type: "email", value: "shared@example.com" });
    expect(
      (await bob.findByIdentifier({ type: "email", value: "shared@example.com" })).map(
        (row) => row.entityId,
      ),
    ).toEqual([b.entityId]);
    await rejection(
      alice.addIdentifier(a.entityId, { type: "email", value: "shared@example.com" }),
    );
    await rejection(
      bob.addIdentifier(a.entityId, { type: "email", value: "unauthorized@example.com" }),
    );
    await rejection(f.forActor(f.outsider, f.orgB).contacts.getDetail(a.entityId));
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
    await Promise.all([
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
    const before = await repo.getDetail(contact.entityId);
    expect(before.identifiers.filter((row) => row.isPrimary)).toHaveLength(1);
    await rejection(
      repo.addIdentifier(contact.entityId, {
        type: "email",
        value: "one@example.com",
        isPrimary: true,
      }),
    );
    expect((await repo.getDetail(contact.entityId)).identifiers).toEqual(before.identifiers);
  });

  test("viewers can read details but cannot change them", async () => {
    const alice = f.forActor(f.alice);
    const bob = f.forActor(f.bob).contacts;
    const contact = await alice.contacts.create({ displayName: "Jane" });
    const method = await alice.contacts.addIdentifier(contact.entityId, {
      type: "email",
      value: "jane@example.com",
    });
    await alice.permissions.grant({
      entityId: contact.entityId,
      actorEntityId: f.bob,
      level: "view",
    });
    expect((await bob.getDetail(contact.entityId)).identifiers).toContainEqual(method);
    await rejection(bob.removeIdentifier(contact.entityId, method.id));
    await rejection(bob.addAddress(contact.entityId, { city: "London" }));
    await rejection(bob.addUrl(contact.entityId, { url: "https://example.com" }));
    expect((await bob.getDetail(contact.entityId)).identifiers).toContainEqual(method);
  });
});
