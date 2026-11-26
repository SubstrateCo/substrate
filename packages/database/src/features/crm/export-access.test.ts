import { organizationApps } from "../../core/apps/schema";
import { member } from "../../core/organizations/schema";
import { PermissionRequiredError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("only current owners and admins export, and contacts export does not need the CRM app", async () => {
  await f.verifyEmails();
  await f.db
    .update(organizationApps)
    .set({ enabled: false })
    .where(eq(organizationApps.appId, "crm"));
  const owner = await f.forSession("alice");
  const bob = await f.forSession("bob");
  await owner.crm.requireExportAccess();
  expect(await rejection(bob.crm.requireExportAccess())).toBeInstanceOf(PermissionRequiredError);
  // The role is read on each call, not when the scope was created.
  await f.db.update(member).set({ role: "member,admin" }).where(eq(member.id, "bob-a"));
  await bob.crm.requireExportAccess();
  await f.db.update(member).set({ role: "member" }).where(eq(member.id, "bob-a"));
  expect(await rejection(bob.crm.requireExportAccess())).toBeInstanceOf(PermissionRequiredError);
});
