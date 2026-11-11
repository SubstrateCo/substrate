import { Mailpit } from "../../server/integration/test-support/mailpit";
import { signIn, signUp, verifyEmail } from "./test-support/auth";
import {
  acceptCollaboration,
  conversation,
  conversationButton,
  post,
  test,
  visit,
} from "./test-support/fixtures";
import { expect, type Page } from "@playwright/test";

async function chooseOrganization(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Your organization", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function accept(page: Page) {
  await page
    .getByRole("checkbox", {
      name: /I understand that participants can read the full conversation history/,
    })
    .check();
  await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
}

test("a new partner signs up, creates their own org, and accepts a desktop channel invitation", async ({
  actors,
  client,
  page,
  request,
}) => {
  const c = await conversation(actors.sender);
  const history = `Before partner approval ${c.id}`;
  await post(actors.sender, "messaging/messages", { conversationId: c.id, body: history });
  const sender = await client(actors.sender);
  await visit(sender, c.id);
  await sender.page.getByRole("button", { name: "Conversation actions", exact: true }).click();
  await sender.page.getByRole("menuitem", { name: "External collaboration", exact: true }).click();
  const email = `new-partner-${crypto.randomUUID()}@example.test`;
  await sender.page.getByLabel("Invite by email", { exact: true }).fill(email);
  await sender.page
    .getByRole("checkbox", {
      name: /I understand invited people can read all earlier messages/,
    })
    .check();
  await sender.page.getByRole("button", { name: "Send invitation", exact: true }).click();
  const link = await new Mailpit(request).link(
    email,
    `Collaborate with ${actors.sender.organizationName} on Substrate`,
    "/desktop/open",
  );
  await page.goto(link);
  await page.getByRole("link", { name: "Continue in browser", exact: true }).click();
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  const password = `Partner-${crypto.randomUUID()}!`;
  await signUp(page, email, password, "New partner");
  await verifyEmail(page, request, email);
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/accept-sharing\//);
  const invitationId = new URL(page.url()).pathname.split("/").at(-1)!;
  const invitationCheck = await page.request.get("/api/v1/messaging/sharing/invitation", {
    params: { invitationId },
  });
  expect(invitationCheck.ok(), await invitationCheck.text()).toBe(true);
  await expect(page.getByText(history, { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Create an organization", exact: true }).click();
  const name = `Partner ${crypto.randomUUID()}`;
  await page.getByLabel("Workspace name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Workspace slug", { exact: true }).fill(`partner-${crypto.randomUUID()}`);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "External collaboration invitation", exact: true }),
  ).toBeVisible();
  await chooseOrganization(page, name);
  await accept(page);
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  const session = await page.request.get("/api/v1/session");
  const organizationId = (await session.json()).data.session.activeOrganizationId;
  expect(organizationId).not.toBe(actors.sender.organizationId);
  await expect(page.getByRole("link", { name: "Open Substrate", exact: true })).toHaveAttribute(
    "href",
    `substrate://open/dashboard?workspaceId=${organizationId}&conversationId=${c.id}`,
  );
  const memberships = await page.request.get("/api/auth/organization/list");
  expect((await memberships.json()).map((org: { id: string }) => org.id)).toEqual([organizationId]);
  const messages = await page.request.get("/api/v1/messaging/messages", {
    params: { organizationId, conversationId: c.id },
  });
  expect((await messages.json()).data).toEqual(
    expect.arrayContaining([expect.objectContaining({ body: history })]),
  );
  await page.goto(`/dashboard?workspaceId=${organizationId}&conversationId=${c.id}`);
  await page.getByRole("button", { name: "Organizations", exact: true }).click();
  const organizations = page.getByRole("dialog", {
    name: "Organizations in this channel",
    exact: true,
  });
  await expect(organizations.getByText(name, { exact: true })).toBeVisible();
  await expect(
    organizations.getByText(actors.sender.organizationName, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Members, 2 members", exact: true }).click();
  const members = page.getByRole("dialog", { name: "Members", exact: true });
  await expect(members.getByText(`${name} · Your organization`, { exact: true })).toBeVisible();
  await expect(
    members
      .getByText(actors.sender.organizationName, { exact: true })
      .and(members.getByRole("listitem")),
  ).toBeVisible();
  await expect(
    members.getByText(actors.sender.name, { exact: true }).and(members.locator("span")),
  ).toBeVisible();
  await expect(members.getByText("New partner", { exact: true })).toBeVisible();
});

test("an ordinary recipient requests org approval and an owner approves without gaining message access", async ({
  account,
  actors,
  client,
}) => {
  const c = await conversation(account);
  const invited = await account.request.post("/api/v1/messaging/sharing/invite", {
    data: {
      organizationId: account.organizationId,
      conversationId: c.id,
      email: actors.member.email,
      shareHistory: true,
    },
  });
  expect(invited.ok()).toBe(true);
  const { data: invitation } = await invited.json();
  const [recipient, approver] = await Promise.all([client(actors.member), client(actors.sender)]);
  await recipient.page.goto(`/accept-sharing/${invitation.id}`);
  await chooseOrganization(recipient.page, actors.sender.organizationName);
  await accept(recipient.page);
  await expect(
    recipient.page.getByRole("status").filter({ hasText: "Approval requested" }),
  ).toBeVisible();
  await visit(approver, undefined, "/settings/organization/sharing");
  await approver.page.getByRole("link", { name: "Review", exact: true }).click();
  await accept(approver.page);
  await expect(
    approver.page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  const adminRead = await approver.page.request.get("/api/v1/messaging/messages", {
    params: { organizationId: actors.sender.organizationId, conversationId: c.id },
  });
  expect(adminRead.status()).toBe(404);
  await recipient.page.getByRole("button", { name: "Continue setup", exact: true }).click();
  await expect(
    recipient.page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  await expect(
    recipient.page.getByRole("link", { name: "Open Substrate", exact: true }),
  ).toHaveAttribute(
    "href",
    `substrate://open/dashboard?workspaceId=${actors.sender.organizationId}&conversationId=${c.id}`,
  );
});

test("disconnecting clears a partner’s open messages without a reload", async ({
  actors,
  client,
}) => {
  const c = await conversation(actors.sender, [actors.partner.email]);
  await acceptCollaboration(actors.partner, c.id);
  const body = `Remove cached partner content ${c.id}`;
  await post(actors.sender, "messaging/messages", { conversationId: c.id, body });
  const [sender, partner] = await Promise.all([client(actors.sender), client(actors.partner)]);
  await Promise.all([visit(sender, c.id), visit(partner, c.id)]);
  await expect(partner.page.getByText(body, { exact: true })).toBeVisible();
  await sender.page.getByRole("button", { name: "Conversation actions", exact: true }).click();
  await sender.page.getByRole("menuitem", { name: "External collaboration", exact: true }).click();
  await sender.page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await sender.page.getByRole("button", { name: "Remove access", exact: true }).click();
  // The sender's own access hint refreshes the open sharing details.
  await expect(sender.page.getByRole("button", { name: "Disconnect", exact: true })).toHaveCount(0);
  await expect(partner.page.getByText(body, { exact: true })).toHaveCount(0);
  await expect(conversationButton(partner.page, c.name)).toHaveCount(0);
  const messages = await partner.page.request.get("/api/v1/messaging/messages", {
    params: { organizationId: actors.partner.organizationId, conversationId: c.id },
  });
  expect(messages.status()).toBe(404);
});
