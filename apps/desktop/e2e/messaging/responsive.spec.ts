import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { provisionWorkspaceSession } from "../../../web/e2e/test-support/organizations.js";
import { test } from "../test-support/fixture.js";
import { expect, type Locator, type Page } from "@playwright/test";

async function withinViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await expect
    .poll(async () =>
      locator.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.left >= 0 &&
          box.top >= 0 &&
          box.right <= innerWidth + 1 &&
          box.bottom <= innerHeight + 1
        );
      }),
    )
    .toBe(true);
}

for (const size of [
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
  { width: 320, height: 812 },
  { width: 320, height: 568 },
]) {
  test(`Electron messaging fits and completes workflows at ${size.width}x${size.height}`, async ({
    desktop,
  }) => {
    test.setTimeout(180_000);
    await desktop.provision();
    await provisionVerifiedAccount(desktop.browser, desktop.mailpit, desktop.member);
    await provisionWorkspaceSession(
      desktop.browser.request,
      "Member workspace",
      `member-${desktop.suffix}`,
    );
    const otherMember = {
      ...desktop.member,
      name: "Other Member",
      email: `other-${desktop.member.email}`,
    };
    await provisionVerifiedAccount(desktop.browser, desktop.mailpit, otherMember);
    await provisionWorkspaceSession(
      desktop.browser.request,
      "Other workspace",
      `other-${desktop.suffix}`,
    );
    await desktop.app.evaluate(({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setMinimumSize(320, 200);
      window.setContentSize(size.width, size.height);
    }, size);
    const page = desktop.page;
    const project = await page.evaluate(async () => {
      const session = await (await fetch("/api/v1/session")).json();
      return (
        await fetch("/api/v1/tasks/mutations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "createProject",
            organizationId: session.data.session.activeOrganizationId,
            name: "Responsive messaging work",
          }),
        })
      ).json();
    });
    expect(project.success).toBe(true);
    await expect
      .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      .toEqual(size);
    const sidebar = page.getByRole("complementary", { name: "Conversations", exact: true });
    const showConversations = page.getByRole("button", { name: "Show conversations", exact: true });
    if (size.width < 768) await showConversations.click();
    await withinViewport(page, sidebar);
    const createChannel = sidebar.getByRole("button", { name: "Create channel", exact: true });
    await createChannel.click();
    await page.getByLabel("Channel name", { exact: true }).fill("discard-this-channel");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(createChannel).toBeFocused();
    await withinViewport(page, sidebar);
    await createChannel.click();
    const longName = `responsive-${"longchannelname".repeat(4)}`;
    await page.getByLabel("Channel name", { exact: true }).fill(longName);
    await page.getByRole("button", { name: "Create channel", exact: true }).last().click();
    const welcome = page.getByRole("heading", { name: `Welcome to #${longName}`, exact: true });
    await expect(welcome).toBeVisible();
    await withinViewport(page, welcome);
    if (size.width < 768) await showConversations.click();
    await createChannel.click();
    await page.getByLabel("Channel name", { exact: true }).fill("responsive-channel");
    const create = page.getByRole("button", { name: "Create channel", exact: true }).last();
    await withinViewport(page, create);
    await create.click();
    const channel = page.getByRole("region", { name: "responsive-channel", exact: true });
    await expect(channel).toBeVisible();
    if (size.width < 768) await expect(sidebar).toBeHidden();
    const composer = page.getByRole("textbox", {
      name: "Message #responsive-channel",
      exact: true,
    });
    await withinViewport(page, composer);
    await composer.fill("A responsive message with a long token " + "long".repeat(80));
    await withinViewport(page, channel.getByRole("button", { name: "Send", exact: true }));
    await composer.press("Enter");
    const root = channel.getByRole("article").filter({ hasText: "A responsive message" });
    await expect(root).toBeVisible();
    await expect
      .poll(() => root.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true);
    const actions = root.getByRole("group", { name: "Message actions", exact: true });
    await actions.hover();
    await withinViewport(page, root.getByRole("button", { name: "React to message", exact: true }));
    await root.getByRole("button", { name: "React to message", exact: true }).click();
    const emojiPicker = page.locator('[data-slot="popover-content"]');
    await withinViewport(page, emojiPicker);
    await expect(emojiPicker.getByRole("button").last()).toBeInViewport({ ratio: 1 });
    await withinViewport(page, page.getByRole("button", { name: "🚀", exact: true }));
    await page.getByRole("button", { name: "🚀", exact: true }).click();
    await expect(
      root.getByRole("button", { name: "🚀, 1 reactions", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    for (const action of ["Create task", "Link existing work"]) {
      await actions.hover();
      await withinViewport(page, root.getByRole("button", { name: action, exact: true }));
      await root.getByRole("button", { name: action, exact: true }).click();
      const panel = root.getByRole("region", {
        name: action === "Create task" ? "Create task from message" : action,
        exact: true,
      });
      await expect(panel).toBeVisible();
      if (action === "Create task") {
        await panel.getByRole("combobox", { name: "Destination project", exact: true }).click();
        await page.getByRole("option", { name: "Responsive messaging work", exact: true }).click();
        const title = panel.getByLabel("Task title", { exact: true });
        await title.fill("A task from a narrow conversation");
        await title.scrollIntoViewIfNeeded();
        await withinViewport(page, title);
      } else {
        await panel.getByRole("button", { name: "Projects", exact: true }).click();
        await expect(panel.getByText("Responsive messaging work", { exact: true })).toBeVisible();
      }
      const cancel = panel.getByRole("button", { name: "Cancel", exact: true });
      await cancel.scrollIntoViewIfNeeded();
      await withinViewport(page, cancel);
      await withinViewport(
        page,
        panel.getByRole("button", {
          name: action === "Create task" ? "Create task" : "Link Responsive messaging work",
          exact: true,
        }),
      );
      await cancel.click();
      await expect(panel).toBeHidden();
    }

    await actions.hover();
    await root.getByRole("button", { name: "Link existing work", exact: true }).click();
    const linking = root.getByRole("region", { name: "Link existing work", exact: true });
    await linking.getByRole("button", { name: "Projects", exact: true }).click();
    await linking
      .getByRole("button", { name: "Link Responsive messaging work", exact: true })
      .click();
    const unlink = root.getByRole("button", {
      name: "Unlink Responsive messaging work",
      exact: true,
    });
    await unlink.scrollIntoViewIfNeeded();
    await withinViewport(page, unlink);
    const linkedTitle = root
      .getByRole("region", { name: "Linked work", exact: true })
      .getByText("Responsive messaging work", { exact: true });
    await expect
      .poll(() =>
        linkedTitle.evaluate(
          (element) =>
            element.getBoundingClientRect().height <=
            Number.parseFloat(getComputedStyle(element).lineHeight) * 3,
        ),
      )
      .toBe(true);
    await expect(unlink).toHaveAttribute("data-variant", "destructive");
    await unlink.click();
    await expect(unlink).toHaveCount(0);

    await page.getByRole("button", { name: "Add emoji", exact: true }).click();
    await page.getByRole("button", { name: "😀", exact: true }).click();
    await expect(composer).toHaveValue("😀");
    await composer.fill("formatted message");
    await composer.selectText();
    await page.getByRole("button", { name: "Bold text", exact: true }).click();
    await expect(composer).toHaveValue("**formatted message**");
    await composer.fill("@");
    const references = page.getByRole("region", {
      name: "Insert workspace reference",
      exact: true,
    });
    await withinViewport(page, references);
    await references.getByRole("button", { name: "People", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Search references", exact: true })
      .fill("Desktop Owner");
    const referenceOption = references.getByRole("option").filter({ hasText: "Desktop Owner" });
    await expect(referenceOption).toBeVisible();
    await expect(referenceOption).toBeInViewport({ ratio: 1 });
    await referenceOption.click();
    await expect(composer).toHaveValue(/@\[person:/);
    await composer.press("Enter");
    await expect(
      channel.locator(".message-markdown").getByText("Desktop Owner", { exact: true }),
    ).toBeVisible();

    const conversationComposerWidth = (await composer.boundingBox())!.width;
    await actions.hover();
    await withinViewport(page, root.getByRole("button", { name: "Reply in thread", exact: true }));
    await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
    const thread = page.getByRole("complementary", { name: "Thread", exact: true });
    await expect(thread).toBeVisible();
    await withinViewport(page, thread);
    const reply = thread.getByRole("textbox", { name: "Reply in thread…", exact: true });
    await withinViewport(page, reply);
    const replyWidth = (await reply.boundingBox())!.width;
    if (size.width >= 1024) expect(replyWidth).toBeGreaterThanOrEqual(260);
    else expect(replyWidth).toBeCloseTo(conversationComposerWidth, 0);
    await reply.fill("Responsive thread reply");
    await withinViewport(page, thread.getByRole("button", { name: "Send", exact: true }));
    await reply.press("Enter");
    const replyMessage = thread.getByRole("article").filter({ hasText: "Responsive thread reply" });
    await expect(replyMessage).toBeVisible();
    await expect(reply).toBeEnabled();
    await expect(
      thread.getByRole("status", { name: "Loading linked work", exact: true }),
    ).toHaveCount(0);
    await replyMessage.hover();
    for (const action of [
      "React to message",
      "Copy message link",
      "Create task",
      "Link existing work",
    ]) {
      await withinViewport(page, replyMessage.getByRole("button", { name: action, exact: true }));
    }
    await thread.getByRole("button", { name: "Close thread", exact: true }).click();
    await withinViewport(page, composer);

    await channel.getByRole("button", { name: "Add people", exact: true }).click();
    await page
      .getByLabel("Add people by exact email address", { exact: true })
      .fill(desktop.member.email);
    const addPeople = page.getByRole("button", { name: "Add people", exact: true }).last();
    await withinViewport(page, addPeople);
    const [added] = await Promise.all([
      page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/v1/messaging/members",
      ),
      addPeople.click(),
    ]);
    const addedResult = await added.json();
    expect(addedResult, JSON.stringify(addedResult)).toMatchObject({ success: true });
    await expect(
      page.getByLabel("Add people by exact email address", { exact: true }),
    ).toBeHidden();
    await withinViewport(page, composer);

    for (const kind of ["New direct message", "New group message"]) {
      if (size.width < 768) {
        await showConversations.click();
        await expect(page.getByRole("textbox", { name: /^Message / })).toBeHidden();
      }
      await sidebar.getByRole("button", { name: "New message", exact: true }).click();
      await withinViewport(page, page.getByRole("menuitem", { name: kind, exact: true }));
      await page.getByRole("menuitem", { name: kind, exact: true }).click();
      await page
        .getByLabel("To", { exact: true })
        .fill(
          kind === "New group message"
            ? `${desktop.member.email}, ${otherMember.email}`
            : desktop.member.email,
        );
      if (kind === "New group message")
        await page.getByLabel("Group name (optional)").fill("Responsive group");
      const start = page.getByRole("button", { name: "Start conversation", exact: true });
      await withinViewport(page, start);
      await start.click();
      await expect(
        page.getByRole("heading", {
          name: kind === "New group message" ? "Responsive group" : desktop.member.name,
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("textbox", { name: /^Message / })).toBeVisible();
    }
    if (size.width < 768) await showConversations.click();
    await sidebar.getByRole("button", { name: "responsive-channel", exact: true }).click();
    await expect(root).toBeVisible();
    await withinViewport(page, composer);
  });
}
