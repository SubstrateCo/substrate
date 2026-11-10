import { Mailpit } from "../../server/integration/test-support/mailpit";
import { provisionWorkspaceSession } from "../../server/integration/test-support/organizations";
import { conversation, post, test, visit } from "./test-support/fixtures";
import { pauseClock, searches } from "./test-support/search";
import { expect } from "@playwright/test";

test("switching workspaces clears private messages and reconnects in the selected organization", async ({
  account,
  client,
}) => {
  const firstId = account.organizationId;
  const first = await conversation(account);
  const privateBody = `First workspace only ${first.id}`;
  await post(account, "messaging/messages", { conversationId: first.id, body: privateBody });
  const name = `Second ${crypto.randomUUID()}`;
  const second = await provisionWorkspaceSession(
    account.request,
    name,
    `second-${crypto.randomUUID()}`,
  );
  account.organizationId = second.id;
  const secondChannel = await conversation(account);
  const secondBody = `Second workspace only ${secondChannel.id}`;
  await post(account, "messaging/messages", { conversationId: secondChannel.id, body: secondBody });
  const activated = await account.request.post("/api/auth/organization/set-active", {
    data: { organizationId: firstId },
  });
  expect(activated.ok()).toBe(true);
  account.organizationId = firstId;
  account.state = await account.request.storageState();
  const user = await client(account);
  await visit(user, first.id);
  await expect(user.page.getByText(privateBody, { exact: true })).toBeVisible();
  const readyBefore = user.events.filter((event) => event.type === "ready").length;
  const reconnect = user.page.waitForEvent("websocket", {
    predicate: (socket) => new URL(socket.url()).searchParams.get("organizationId") === second.id,
  });
  await pauseClock(user.page);
  const requests = searches(user.page);
  await user.page
    .getByRole("combobox", { name: "Search workspace", exact: true })
    .fill("discard on workspace switch");
  await user.page.getByRole("button", { name: `${account.name} ▾`, exact: true }).click();
  await user.page.clock.resume();
  await Promise.all([reconnect, user.page.getByRole("menuitem", { name, exact: true }).click()]);
  await expect(user.page.getByText(secondBody, { exact: true })).toBeVisible();
  await expect(user.page.getByText(privateBody, { exact: true })).toHaveCount(0);
  await expect(user.page.getByRole("button", { name: first.name, exact: true })).toHaveCount(0);
  await expect
    .poll(() => user.events.filter((event) => event.type === "ready").length)
    .toBeGreaterThan(readyBefore);
  const response = await user.page.request.get("/api/v1/session");
  expect((await response.json()).data.session.activeOrganizationId).toBe(second.id);
  expect(requests.some((request) => request.query === "discard on workspace switch")).toBe(false);
  await user.page.reload();
  await expect(user.page.getByText(secondBody, { exact: true })).toBeVisible();
});

test("switching workspaces asks before an unsaved draft is lost and changes nothing until confirmed", async ({
  account,
  client,
}) => {
  const firstId = account.organizationId;
  const name = `Second ${crypto.randomUUID()}`;
  await provisionWorkspaceSession(account.request, name, `second-${crypto.randomUUID()}`);
  const activated = await account.request.post("/api/auth/organization/set-active", {
    data: { organizationId: firstId },
  });
  expect(activated.ok()).toBe(true);
  account.state = await account.request.storageState();
  const user = await client(account);
  await visit(user, undefined, "/settings/user");
  const activeOrganizationId = async () =>
    (await (await user.page.request.get("/api/v1/session")).json()).data.session
      .activeOrganizationId;
  const switchTo = async () => {
    await user.page.getByRole("button", { name: `${account.name} ▾`, exact: true }).click();
    await user.page.getByRole("menuitem", { name, exact: true }).click();
  };
  await user.page.getByLabel("Full name", { exact: true }).fill("Unsaved profile name");

  await switchTo();
  const dialog = user.page.getByRole("dialog", { name: "Discard unsaved changes?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(user.page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Unsaved profile name",
  );
  expect(await activeOrganizationId()).toBe(firstId);

  await switchTo();
  await dialog.getByRole("button", { name: "Discard changes" }).click();
  await expect.poll(activeOrganizationId).not.toBe(firstId);
});

test("an owner invites a teammate, who accepts without receiving project access or owner controls", async ({
  account,
  actors,
  client,
}) => {
  const [owner, invitee] = await Promise.all([client(actors.sender), client(account)]);
  await visit(owner, undefined, "/settings/organization/invitations");
  await owner.page.getByLabel("Email", { exact: true }).fill(account.email);
  await owner.page.getByRole("button", { name: "Send invitation", exact: true }).click();
  const link = await new Mailpit(account.request).link(
    account.email,
    `Join ${actors.sender.name} on Startup OS`,
    "/accept-invitation/",
  );
  await invitee.page.goto(link);
  await expect(
    invitee.page.getByText(`Invited email: ${account.email}`, { exact: true }),
  ).toBeVisible();
  await invitee.page.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(
    invitee.page.getByRole("heading", { name: "Your workspace is ready", exact: true }),
  ).toBeVisible();
  await invitee.page.goto("/dashboard");
  await expect(
    invitee.page.getByRole("button", { name: `${actors.sender.name} ▾`, exact: true }),
  ).toBeVisible();
  await invitee.page
    .getByRole("button", { name: `Signed in as ${account.name}`, exact: true })
    .click();
  await expect(
    invitee.page.getByRole("button", { name: "Organization settings", exact: true }),
  ).toHaveCount(0);
  await invitee.page.keyboard.press("Escape");
  await invitee.page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(
    invitee.page.getByRole("heading", { name: "No projects yet", exact: true }),
  ).toBeVisible();
});

test("invitation validation and owner confirmation return to the form", async ({
  account,
  client,
}) => {
  const user = await client(account);
  await visit(user, undefined, "/settings/organization/invitations");
  const send = user.page.getByRole("button", { name: "Send invitation", exact: true });
  const email = user.page.getByLabel("Email", { exact: true });
  await send.click();
  await expect(user.page.getByText("Enter an email address to invite.")).toBeVisible();
  await email.fill("owner@example.com");
  await user.page.getByRole("combobox", { name: "Role" }).click();
  await user.page.getByRole("option", { name: "Owner", exact: true }).click();
  await send.click();
  const dialog = user.page.getByRole("dialog", { name: "Invite an owner?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(send).toBeFocused();
  await expect(email).toHaveValue("owner@example.com");
});
