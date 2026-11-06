import { setupDatabase } from "../../testing/database";
import { contactIdentifiers } from "./schema";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";

const f = setupDatabase();

describe("contact identifiers", () => {
  test("identifiers reference a contact in the same organization", async () => {
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Customer" });
    const identifier = {
      organizationId: f.orgA,
      contactEntityId: contact.entityId,
      type: "email" as const,
      value: "customer@example.com",
    };
    await f.db.insert(contactIdentifiers).values(identifier);
    expect(await f.db.select().from(contactIdentifiers)).toEqual([identifier]);
    await expect(
      f.db
        .insert(contactIdentifiers)
        .values({ ...identifier, organizationId: f.orgB })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      f.db
        .insert(contactIdentifiers)
        .values({ ...identifier, contactEntityId: f.alice })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  test("rejects duplicate identifiers and blank values", async () => {
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Customer" });
    const identifier = {
      organizationId: f.orgA,
      contactEntityId: contact.entityId,
      type: "email" as const,
      value: "customer@example.com",
    };
    await f.db.insert(contactIdentifiers).values(identifier);
    await expect(
      f.db.insert(contactIdentifiers).values(identifier).execute(),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    await expect(
      f.db
        .insert(contactIdentifiers)
        .values({ ...identifier, value: "  " })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
