import { conversation, expectChange, send, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("collapsing channels hides the selected channel without closing it", async ({
  account,
  client,
}) => {
  const selected = await conversation(account);
  const other = await conversation(account);
  const viewer = await client(account);
  await visit(viewer, selected.id);
  const section = viewer.page.getByRole("region", { name: "Channels", exact: true });
  const toggle = section.getByRole("button", { name: /^Channels/ });
  const selectedRow = section.getByRole("button", { name: selected.name, exact: true });
  const otherRow = section.getByRole("button", { name: other.name, exact: true });
  await expect(selectedRow).toBeVisible();
  await expect(otherRow).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(selectedRow).toBeHidden();
  await expect(otherRow).toBeHidden();
  await expect(
    viewer.page.getByRole("heading", { level: 1, name: selected.name, exact: true }),
  ).toBeVisible();

  await toggle.click();
  await expect(selectedRow).toBeVisible();
  await expect(selectedRow).toHaveAttribute("aria-current", "page");
  await expect(otherRow).toBeVisible();
});

test("a sent channel message reaches another member over the real socket", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const [sender, recipient] = await Promise.all([client(actors.sender), client(actors.member)]);
  await Promise.all([visit(sender, channel.id), visit(recipient, channel.id)]);
  const since = recipient.events.length;
  const body = `Live message ${channel.id}`;
  await expect(recipient.page.getByText(body, { exact: true })).toHaveCount(0);
  await send(sender.page, body);
  await expect(recipient.page.getByText(body, { exact: true })).toBeVisible();
  await expectChange(recipient, since, "messaging", channel.id);
  // A new document load proves persistence, not just optimistic state on the sender.
  await sender.page.reload();
  await expect(sender.page.getByText(body, { exact: true })).toBeVisible();
});

for (const kind of ["dm", "channel"] as const) {
  test(`cross-organization ${kind} creation and bidirectional live messages`, async ({
    actors,
    client,
  }) => {
    const [sender, partner] = await Promise.all([client(actors.sender), client(actors.partner)]);
    await Promise.all([visit(sender), visit(partner)]);
    const name = `partner-${crypto.randomUUID()}`;
    if (kind === "channel") {
      await sender.page
        .getByRole("complementary", { name: "Conversations", exact: true })
        .getByRole("button", { name: "Create channel", exact: true })
        .click();
      await sender.page.getByLabel("Channel name").fill(name);
      await sender.page
        .getByLabel("Add people (optional)", { exact: true })
        .fill(actors.partner.email);
      await sender.page.getByLabel("Make this channel private").check();
    } else {
      await sender.page.getByRole("button", { name: "New message", exact: true }).click();
      await sender.page.getByRole("option", { name: /^New direct message/ }).click();
      await sender.page.getByLabel("To", { exact: true }).fill(actors.partner.email);
    }
    const created = sender.page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/messaging/conversations" &&
        response.request().method() === "POST",
    );
    const [response] = await Promise.all([
      created,
      sender.page
        .locator("form")
        .getByRole("button", {
          name: kind === "channel" ? "Create channel" : "Start conversation",
          exact: true,
        })
        .click(),
    ]);
    expect(response.ok()).toBe(true);
    const { data: channel } = await response.json();
    await expect(
      sender.page.getByRole("heading", {
        level: 1,
        name: kind === "channel" ? name : actors.partner.name,
        exact: true,
      }),
    ).toBeVisible();
    const partnerSince = partner.events.length;
    const outgoing = `Across organizations ${channel.id}`;
    await send(sender.page, outgoing);
    // The recipient stays on the open dashboard; socket invalidation must discover the new conversation.
    await partner.page
      .getByRole("button", { name: kind === "channel" ? name : actors.sender.name, exact: true })
      .click();
    await expect(partner.page.getByText(outgoing, { exact: true })).toBeVisible();
    await expectChange(partner, partnerSince, "messaging", channel.id);
    await expect(
      partner.page
        .getByRole("article")
        .filter({ hasText: outgoing })
        .getByText("External", { exact: true }),
    ).toBeVisible();
    const senderSince = sender.events.length;
    const reply = `Partner reply ${channel.id}`;
    await send(partner.page, reply);
    await expect(sender.page.getByText(reply, { exact: true })).toBeVisible();
    await expectChange(sender, senderSince, "messaging", channel.id);
    await expect(
      sender.page
        .getByRole("article")
        .filter({ hasText: reply })
        .getByText("External", { exact: true }),
    ).toBeVisible();
  });
}
