import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { contactAddresses, contactUrls } from "./details.schema";
import { contactIdentifiers } from "./schema";
import { describe, expect, test } from "bun:test";

const f = setupDatabase();

describe("contact detail constraints", () => {
  test("addresses and URLs require a contact in the same organization", async () => {
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Jane" });
    for (const reference of [
      { organizationId: f.orgB, contactEntityId: contact.entityId },
      { organizationId: f.orgA, contactEntityId: f.alice },
    ]) {
      expect(
        await rejection(f.db.insert(contactAddresses).values({ ...reference, city: "London" })),
      ).toMatchObject({ cause: { code: "23503" } });
      expect(
        await rejection(
          f.db.insert(contactUrls).values({ ...reference, url: "https://example.com" }),
        ),
      ).toMatchObject({ cause: { code: "23503" } });
    }
  });

  test("enforces primary uniqueness, normalized method uniqueness, and phone-only extensions", async () => {
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Jane" });
    const reference = { organizationId: f.orgA, contactEntityId: contact.entityId };
    const method = {
      ...reference,
      type: "email" as const,
      value: "jane@EXAMPLE.com",
      normalizedValue: "jane@example.com",
      isPrimary: true,
    };
    await f.db.insert(contactIdentifiers).values(method);
    expect(
      await rejection(
        f.db
          .insert(contactIdentifiers)
          .values({ ...method, value: "jane@example.com", isPrimary: false }),
      ),
    ).toMatchObject({ cause: { code: "23505" } });
    expect(
      await rejection(
        f.db
          .insert(contactIdentifiers)
          .values({ ...method, value: "other@example.com", normalizedValue: "other@example.com" }),
      ),
    ).toMatchObject({ cause: { code: "23505" } });
    expect(
      await rejection(
        f.db.insert(contactIdentifiers).values({
          ...method,
          value: "other@example.com",
          normalizedValue: null,
          isPrimary: false,
          extension: "42",
        }),
      ),
    ).toMatchObject({ cause: { code: "23514" } });
    await f.db.insert(contactAddresses).values({ ...reference, city: "London", isPrimary: true });
    expect(
      await rejection(
        f.db.insert(contactAddresses).values({ ...reference, city: "Paris", isPrimary: true }),
      ),
    ).toMatchObject({ cause: { code: "23505" } });
    await f.db
      .insert(contactUrls)
      .values({ ...reference, url: "https://example.com", isPrimary: true });
    expect(
      await rejection(
        f.db
          .insert(contactUrls)
          .values({ ...reference, url: "https://example.org", isPrimary: true }),
      ),
    ).toMatchObject({ cause: { code: "23505" } });
  });
});
