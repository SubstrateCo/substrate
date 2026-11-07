import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { joinWorkspace } from "../test-support/organizations.js";
import { expect } from "@playwright/test";

test("a same-workspace DM is created through the UI and persists for both participants", async ({
  desktop,
  desktopPeer,
}) => {
  desktopPeer.owner.name = "DM Teammate";
  await Promise.all([desktop.provision(), desktopPeer.provision()]);
  await joinWorkspace(desktop, desktopPeer);
  const { page } = desktop;
  const peer = desktopPeer.page;
  await page
    .getByRole("complementary", { name: "Conversations", exact: true })
    .getByRole("button", { name: "New message", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "New direct message", exact: true }).click();
  await page.getByLabel("To", { exact: true }).fill(desktopPeer.owner.email);
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  const composer = page.getByRole("textbox", {
    name: `Message ${desktopPeer.owner.name}`,
    exact: true,
  });
  await composer.fill("Same-workspace private DM");
  await composer.press("Enter");
  await peer.getByRole("button", { name: desktop.owner.name, exact: true }).click();
  await expect(peer.getByRole("log")).toContainText("Same-workspace private DM");
  await peer.reload();
  await expect(peer.getByRole("log")).toContainText("Same-workspace private DM");
});

for (const kind of ["dm", "group"] as const) {
  test(`cross-workspace ${kind} creation delivers messages without sharing other conversations`, async ({
    desktop,
    desktopPeer,
    createDesktop,
  }) => {
    desktopPeer.owner.name = "External Recipient";
    await Promise.all([desktop.provision(), desktopPeer.provision()]);
    const { page } = desktop;
    const peer = desktopPeer.page;
    const privateChannel = await callMessaging(page, "createConversation", {
      kind: "channel",
      name: "unrelated-private-channel",
      private: true,
    });
    expect(privateChannel.error).toBeNull();
    const recipients = [desktopPeer.owner.email];
    const viewers = [peer];
    if (kind === "group") {
      const teammate = await createDesktop();
      teammate.owner.name = "Group Teammate";
      await teammate.provision();
      await joinWorkspace(desktop, teammate);
      recipients.push(teammate.owner.email);
      viewers.push(teammate.page);
    }
    await page
      .getByRole("complementary", { name: "Conversations", exact: true })
      .getByRole("button", { name: "New message", exact: true })
      .click();
    await page
      .getByRole("menuitem", {
        name: kind === "dm" ? "New direct message" : "New group message",
        exact: true,
      })
      .click();
    await page.getByLabel("To", { exact: true }).fill(recipients.join(", "));
    if (kind === "group") await page.getByLabel("Group name (optional)").fill("Selected group");
    await page.getByRole("button", { name: "Start conversation", exact: true }).click();
    const name = kind === "dm" ? desktopPeer.owner.name : "Selected group";
    await page
      .getByRole("textbox", { name: `Message ${name}`, exact: true })
      .fill("Cross-workspace delivery");
    await page.getByRole("textbox", { name: `Message ${name}`, exact: true }).press("Enter");
    for (const viewer of viewers) {
      await viewer
        .getByRole("button", { name: kind === "dm" ? desktop.owner.name : name, exact: true })
        .click();
      await expect(viewer.getByRole("log")).toContainText("Cross-workspace delivery");
    }
    await expect(
      peer.getByRole("button", { name: `${desktopPeer.workspace} ▾`, exact: true }),
    ).toBeVisible();
    await expect(
      peer.getByRole("button", { name: "unrelated-private-channel", exact: true }),
    ).toHaveCount(0);
    const reply = peer.getByRole("textbox", {
      name: `Message ${kind === "dm" ? desktop.owner.name : name}`,
      exact: true,
    });
    await reply.fill("Cross-workspace receipt");
    await reply.press("Enter");
    await expect(page.getByRole("log")).toContainText("Cross-workspace receipt");
  });
}

test("adding a person through the private-channel UI reveals its history in their own workspace", async ({
  desktop,
  desktopPeer,
}) => {
  await Promise.all([desktop.provision(), desktopPeer.provision()]);
  const { page } = desktop;
  const peer = desktopPeer.page;
  const channel = await callMessaging<{ id: string }>(page, "createConversation", {
    kind: "channel",
    name: "shared-history",
    private: true,
  });
  expect(channel.error).toBeNull();
  expect(
    (
      await callMessaging(page, "sendMessage", {
        conversationId: channel.data!.id,
        body: "History before invitation",
      })
    ).error,
  ).toBeNull();
  await desktop.openPath(`/dashboard?conversationId=${channel.data!.id}`);
  await expect(peer.getByRole("button", { name: "shared-history", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add people", exact: true }).click();
  await page
    .getByLabel("Add people by exact email address", { exact: true })
    .fill(desktopPeer.owner.email);
  await page.getByRole("button", { name: "Add people", exact: true }).last().click();
  await peer.getByRole("button", { name: "shared-history", exact: true }).click();
  await expect(peer.getByRole("log")).toContainText("History before invitation");
  await expect(
    peer.getByRole("button", { name: `${desktopPeer.workspace} ▾`, exact: true }),
  ).toBeVisible();
});
