import { isOrganizationAdmin } from "./admin-access";
import { expect, test } from "bun:test";

test("only the server's admin answer for this workspace makes the viewer an admin", () => {
  expect(isOrganizationAdmin({ organizationId: "org-1" }, "org-1")).toBe(true);
  expect(isOrganizationAdmin(null, "org-1")).toBe(false);
  expect(isOrganizationAdmin(undefined, "org-1")).toBe(false);
  expect(isOrganizationAdmin({ organizationId: "org-2" }, "org-1")).toBe(false);
});
