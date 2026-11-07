import { provisionMember, switchWorkspace } from "../../../web/e2e/test-support/organizations.js";
import type { DesktopFixture } from "./fixture.js";

export async function joinWorkspace(
  owner: DesktopFixture,
  member: DesktopFixture,
  role: "member" | "admin" = "member",
) {
  await provisionMember(owner.browser, member.browser, member.owner.email, role);
  await member.page.reload();
  await switchWorkspace(member.page, member.workspace, owner.workspace);
}
