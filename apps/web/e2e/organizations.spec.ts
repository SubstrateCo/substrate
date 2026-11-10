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
    headers: { origin: process.env.PLAYWRIGHT_BASE_URL! },
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

test("an owner invites a teammate, who accepts without receiving project access or owner controls", async ({
  account,
  actors,
  client,
}) => {
  const [owner, invitee] = await Promise.all([client(actors.sender), client(account)]);
  await visit(owner, undefined, "/settings/organization");
  await owner.page.getByRole("tab", { name: "Invitations", exact: true }).click();
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
