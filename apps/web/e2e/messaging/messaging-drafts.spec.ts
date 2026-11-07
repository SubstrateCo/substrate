import { callMessaging } from "../test-support/api";
import { provisionVerifiedAccount } from "../test-support/auth";
import { Mailpit } from "../test-support/mailpit";
import { provisionWorkspace } from "../test-support/organizations";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("production composers preserve separate channel and thread drafts", async ({
  page,
  request,
}) => {
  const suffix = randomUUID();
  await provisionVerifiedAccount(page, new Mailpit(request), {
    name: "Draft reviewer",
    email: `draft-${suffix}@example.test`,
    password: `Draft-${randomUUID()}!`,
  });
  await provisionWorkspace(page, `Drafts ${suffix}`, `drafts-${suffix}`);
  const channels: string[] = [];
  for (const name of ["draft-first", "draft-second"]) {
    const created = await callMessaging<{ id: string }>(page, "createConversation", {
      kind: "channel",
      name,
      private: false,
      emails: [],
    });
    expect(created.error).toBeNull();
    channels.push(created.data!.id);
  }
  for (const body of ["Root A", "Root B"]) {
    const sent = await callMessaging(page, "sendMessage", { conversationId: channels[0], body });
    expect(sent.error).toBeNull();
  }
  await page.reload();
  const sidebar = page.getByRole("complementary", { name: "Conversations" });
  await sidebar.getByRole("button", { name: "draft-first", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message #draft-first", exact: true })
    .fill("First channel draft");
  await sidebar.getByRole("button", { name: "draft-second", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message #draft-second", exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("textbox", { name: "Message #draft-second", exact: true })
    .fill("Second channel draft");
  await sidebar.getByRole("button", { name: "draft-first", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message #draft-first", exact: true }),
  ).toHaveValue("First channel draft");
  for (const root of ["Root A", "Root B"]) {
    const article = page
      .getByRole("region", { name: "draft-first", exact: true })
      .getByRole("article")
      .filter({ hasText: root });
    await article.getByRole("button", { name: "Reply in thread", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Reply in thread…", exact: true });
    await expect(input).toHaveValue("");
    await input.fill(`Draft for ${root}`);
    await page.getByRole("button", { name: "Close thread", exact: true }).click();
  }
  for (const root of ["Root A", "Root B"]) {
    await page
      .getByRole("region", { name: "draft-first", exact: true })
      .getByRole("article")
      .filter({ hasText: root })
      .getByRole("button", { name: "Reply in thread", exact: true })
      .click();
    await expect(page.getByRole("textbox", { name: "Reply in thread…", exact: true })).toHaveValue(
      `Draft for ${root}`,
    );
    await page.getByRole("button", { name: "Close thread", exact: true }).click();
  }
  await expect(
    page.getByRole("textbox", { name: "Message #draft-first", exact: true }),
  ).toHaveValue("First channel draft");
  await sidebar.getByRole("button", { name: "draft-second", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message #draft-second", exact: true }),
  ).toHaveValue("Second channel draft");
});
