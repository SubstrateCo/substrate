import { setupDatabase } from "../../testing/database";
import { member } from "../organizations/schema";
import { getRememberedOrganization, rememberOrganization } from "./organization-preference";
import { user } from "./schema";
import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

describe("remembered organization", () => {
  test("persists per user and restores only verified current memberships", async () => {
    await rememberOrganization(f.db, "alice", f.orgA);
    expect(await getRememberedOrganization(f.db, "alice")).toBeNull();
    await f.db.update(user).set({ emailVerified: true }).where(eq(user.id, "alice"));
    expect(await getRememberedOrganization(f.db, "alice")).toBe(f.orgA);
    expect(await getRememberedOrganization(f.db, "bob")).toBeNull();
    await f.db
      .delete(member)
      .where(and(eq(member.userId, "alice"), eq(member.organizationId, f.orgA)));
    expect(await getRememberedOrganization(f.db, "alice")).toBeNull();
  });

  test("explicit unset is persistent and cannot restore another organization's membership", async () => {
    await f.db.update(user).set({ emailVerified: true }).where(eq(user.id, "alice"));
    await rememberOrganization(f.db, "alice", f.orgB);
    expect(await getRememberedOrganization(f.db, "alice")).toBeNull();
    await rememberOrganization(f.db, "alice", f.orgA);
    await rememberOrganization(f.db, "alice", null);
    const [stored] = await f.db.select().from(user).where(eq(user.id, "alice"));
    expect(stored!.lastOrganizationId).toBeNull();
    expect(await getRememberedOrganization(f.db, "alice")).toBeNull();
  });
});
