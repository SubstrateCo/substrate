import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { provisionWorkspaceSession } from "../../../web/e2e/test-support/organizations.js";
import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("Electron labels external authors in partner channels and threads", async ({
  desktop,
  browser,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const context = await browser.newContext();
  try {
    const partner = await context.newPage();
    await partner.goto("/login");
    // The same name and email domain must not make this author an organization member.
    await provisionVerifiedAccount(partner, desktop.mailpit, {
      ...desktop.member,
      name: desktop.owner.name,
    });
    await provisionWorkspaceSession(
      partner.request,
      "Partner workspace",
      `partner-${desktop.suffix}`,
    );
    await partner.goto("/dashboard");
    const page = desktop.page;
    const created = await callMessaging<{ id: string }>(page, "createConversation", {
      kind: "channel",
      name: "external-authors",
      private: true,
      emails: [desktop.member.email],
    });
    expect(created.error).toBeNull();
    const conversationId = created.data!.id;
    const root = await callMessaging<{ id: string }>(partner, "sendMessage", {
      conversationId,
      body: "Partner root message",
    });
    expect(root.error).toBeNull();
    const reply = await callMessaging(partner, "sendMessage", {
      conversationId,
      threadId: root.data!.id,
      body: "Partner thread reply",
    });
    expect(reply.error).toBeNull();
    const internal = await callMessaging(page, "sendMessage", {
      conversationId,
      body: "Internal root message",
    });
    expect(internal.error).toBeNull();
    const internalReply = await callMessaging(page, "sendMessage", {
      conversationId,
      threadId: root.data!.id,
      body: "Internal thread reply",
    });
    expect(internalReply.error).toBeNull();
    await page.reload();
    await page
      .getByRole("complementary", { name: "Conversations", exact: true })
      .getByRole("button", { name: /external-authors/ })
      .click();
    const externalRoot = page.getByRole("article").filter({ hasText: "Partner root message" });
    await expect(externalRoot.getByText("External", { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("article")
        .filter({ hasText: "Internal root message" })
        .getByText("External", { exact: true }),
    ).toHaveCount(0);
    await externalRoot.hover();
    await externalRoot.getByRole("button", { name: "2 replies", exact: true }).click();
    const thread = page.getByRole("complementary", { name: "Thread", exact: true });
    for (const body of ["Partner root message", "Partner thread reply"]) {
      await expect(
        thread
          .getByRole("article")
          .filter({ hasText: body })
          .getByText("External", { exact: true }),
      ).toBeVisible();
    }
    const internalThread = thread.getByRole("article").filter({ hasText: "Internal thread reply" });
    await expect(internalThread).toBeVisible();
    await expect(internalThread.getByText("External", { exact: true })).toHaveCount(0);
    await thread.getByRole("button", { name: "Close thread", exact: true }).click();
    const internalRoot = page.getByRole("article").filter({ hasText: "Internal root message" });
    await internalRoot.hover();
    await internalRoot.getByRole("button", { name: "Reply in thread", exact: true }).click();
    const internalThreadRoot = thread
      .getByRole("article")
      .filter({ hasText: "Internal root message" });
    await expect(internalThreadRoot).toBeVisible();
    await expect(internalThreadRoot.getByText("External", { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
