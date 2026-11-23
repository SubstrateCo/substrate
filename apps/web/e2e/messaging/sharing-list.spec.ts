import { acceptCollaboration, conversation, post, test, visit } from "../test-support/fixtures";
import { expect, type Page } from "@playwright/test";

function sharedRow(page: Page, text: string) {
  return page
    .getByRole("list", { name: "Shared conversations", exact: true })
    .getByRole("listitem")
    .filter({ hasText: text });
}

test("the sharing list shows each conversation's partner organization and status", async ({
  account,
  actors,
  client,
}) => {
  const connected = await conversation(account, [actors.partner.email], [actors.partner]);
  const requested = await conversation(account, [actors.member.email]);
  const inbox = await actors.member.request.get("/api/v1/messaging/sharing/inbox", {
    params: { organizationId: actors.member.organizationId },
  });
  const invitation = (await inbox.json()).data.find(
    (item: { conversationId: string }) => item.conversationId === requested.id,
  );
  const approval = await actors.member.request.post("/api/v1/messaging/sharing/accept", {
    data: {
      invitationId: invitation.id,
      organizationId: actors.member.organizationId,
      shareHistory: true,
    },
  });
  expect((await approval.json()).data.status).toBe("approval-required");
  const invited = await conversation(account, [`invited-${crypto.randomUUID()}@example.test`]);
  const host = await client(account);
  await visit(host, undefined, "/settings/organization/sharing");
  const connectedRow = sharedRow(host.page, connected.name);
  await expect(connectedRow.getByText("Connected", { exact: true })).toBeVisible();
  await expect(connectedRow.getByText(actors.partner.organizationName)).toBeVisible();
  await expect(
    sharedRow(host.page, requested.name).getByText("Needs approval", { exact: true }),
  ).toBeVisible();
  await expect(
    sharedRow(host.page, invited.name).getByText("Invited", { exact: true }),
  ).toBeVisible();
  await connectedRow.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(
    host.page.getByRole("dialog", {
      name: `External collaboration for ${connected.name}`,
      exact: true,
    }),
  ).toBeVisible();
});

test("a partner admin sees a shared group they cannot open without its members' names", async ({
  account,
  actors,
  client,
}) => {
  const group = await post<{ id: string }>(account, "messaging/conversations", {
    kind: "group",
    emails: [actors.member.email, actors.partner.email],
    shareHistory: true,
  });
  await acceptCollaboration(actors.member, group.id);
  await acceptCollaboration(actors.partner, group.id);
  const admin = await client(actors.sender);
  await visit(admin, undefined, "/settings/organization/sharing");
  const row = sharedRow(admin.page, account.organizationName);
  await expect(row.getByText("A conversation you can’t open", { exact: true })).toBeVisible();
  await expect(row.getByText("Connected", { exact: true })).toBeVisible();
  await expect(row).not.toContainText(actors.member.name);
  await expect(row).not.toContainText(actors.partner.name);
  await row.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(
    admin.page.getByRole("dialog", {
      name: "External collaboration for a conversation you can’t open",
      exact: true,
    }),
  ).toBeVisible();
});
