import { sessionFixture } from "../../auth/test-support";
import { createOrganizationService } from "./service";
import { expect, test } from "bun:test";

test("settings access grants only owner or admin access in the resolved workspace", async () => {
  for (const [role, expected] of [
    ["owner", { organizationId: "organization-1", isOwner: true }],
    ["admin", { organizationId: "organization-1", isOwner: false }],
    ["member,owner", { organizationId: "organization-1", isOwner: true }],
    ["member", null],
    ["superowner", null],
    ["", null],
    [null, null],
  ] as const) {
    expect(
      await createOrganizationService().settingsAccess({ session: sessionFixture(), role }),
    ).toEqual({ success: true, data: expected });
  }
});
