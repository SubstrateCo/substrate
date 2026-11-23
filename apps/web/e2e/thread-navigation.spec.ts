import { conversation, post, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("cold thread navigation keeps the pane stable and cached navigation restores the right draft", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const roots: string[] = [];
  for (const body of ["First thread", "Second thread"]) {
    const root = await post<{ id: string }>(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body,
    });
    roots.push(root.id);
    await post(actors.member, "messaging/messages", {
      conversationId: channel.id,
      threadId: root.id,
      body: `${body} reply`,
    });
  }
  const user = await client(actors.sender);
  await visit(user, channel.id);
  await user.page.emulateMedia({ reducedMotion: "no-preference" });
  const thread = user.page.getByRole("complementary", { name: "Thread", exact: true });
  const composer = thread.getByRole("textbox", { name: "Reply in thread", exact: true });
  let pane;
  let bounds;
  for (const [index, body] of ["First thread", "Second thread"].entries()) {
    const ready = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const delivered = Promise.withResolvers<void>();
    await user.page.route("**/api/v1/context/message-targets", async (route) => {
      const response = await route.fetch();
      ready.resolve();
      await release.promise;
      try {
        await route.fulfill({ response });
      } finally {
        delivered.resolve();
      }
    });
    const root = user.page.getByRole("article").filter({
      has: user.page.getByText(body, { exact: true }),
    });
    await root.getByRole("button", { name: "1 reply", exact: true }).click();
    await ready.promise;
    try {
      await expect(thread).toBeVisible();
      await expect(thread.getByRole("status", { name: "Loading replies" })).toBeVisible();
      await expect(composer).toHaveCount(0);
      if (pane) {
        expect(await pane.evaluate((element) => element.isConnected)).toBe(true);
        expect(await thread.boundingBox()).toEqual(bounds);
      }
    } finally {
      release.resolve();
      await delivered.promise;
      await user.page.unroute("**/api/v1/context/message-targets");
    }
    await expect(thread.getByText(`${body} reply`, { exact: true })).toBeVisible();
    await expect(thread.getByText(body, { exact: true })).toBeVisible();
    await expect(composer).toBeVisible();
    expect(await thread.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      "none",
    );
    if (index === 0) {
      await composer.fill("First thread draft");
      pane = await thread.elementHandle();
      bounds = await thread.boundingBox();
    } else {
      await expect(composer).toHaveText("");
      expect(await pane!.evaluate((element) => element.isConnected)).toBe(true);
      expect(await thread.boundingBox()).toEqual(bounds);
    }
  }
  await user.page.goBack();
  await expect(user.page).toHaveURL(new RegExp(`messageId=${roots[0]}`));
  await expect(thread.getByText("First thread reply", { exact: true })).toBeVisible();
  await expect(composer).toHaveText("First thread draft");
  await user.page.goForward();
  await expect(thread.getByText("Second thread reply", { exact: true })).toBeVisible();
  await expect(composer).toHaveText("");
  await thread.getByRole("button", { name: "Close thread", exact: true }).click();
  await expect(thread).toHaveCount(0);
});
