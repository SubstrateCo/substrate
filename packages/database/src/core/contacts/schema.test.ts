import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { contactIdentifiers } from "./schema";
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
    expect(
      await rejection(
        f.db
          .insert(contactIdentifiers)
          .values({ ...identifier, organizationId: f.orgB })
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
    expect(
      await rejection(
        f.db
          .insert(contactIdentifiers)
          .values({ ...identifier, contactEntityId: f.alice })
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
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
    expect(
      await rejection(f.db.insert(contactIdentifiers).values(identifier).execute()),
    ).toMatchObject({ cause: { code: "23505" } });
    expect(
      await rejection(
        f.db
          .insert(contactIdentifiers)
          .values({ ...identifier, value: "  " })
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23514" } });
  });
});
