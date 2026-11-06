import { expect, test, type Locator } from "@playwright/test";
import { openStory } from "./stories";

async function backgroundContrast(control: Locator, parentSelector: string) {
  return control.evaluate((node, selector) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const luminance = (element: Element) => {
      context.fillStyle = "white";
      context.fillRect(0, 0, 1, 1);
      const layers: Element[] = [];
      for (let layer: Element | null = element; layer; layer = layer.parentElement)
        layers.push(layer);
      for (const layer of layers.reverse()) {
        context.fillStyle = getComputedStyle(layer).backgroundColor;
        context.fillRect(0, 0, 1, 1);
      }
      const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = luminance(node);
    const b = luminance(node.closest(selector)!);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, parentSelector);
}

test("isolated button and picker previews are centered, while scenes keep their app layout", async ({
  page,
}) => {
  for (const [id, name] of [
    ["primitives-actions-button--default", "Button"],
    ["messaging-components-emoji-picker--default", "Add emoji"],
  ]) {
    await openStory(page, id);
    const control = page.getByRole("button", { name, exact: true });
    await expect(control).toBeVisible();
    await expect
      .poll(async () => {
        const box = await control.boundingBox();
        if (!box) return Number.POSITIVE_INFINITY;
        return Math.max(
          Math.abs(box.x + box.width / 2 - 720),
          Math.abs(box.y + box.height / 2 - 450),
        );
      })
      .toBeLessThan(2);
  }
  await openStory(page, "messaging-scenes-workspace--public-channel");
  const rail = await page.getByRole("navigation", { name: "Apps" }).boundingBox();
  expect(rail?.x).toBe(0);
  expect(rail?.height).toBe(900);
});

test("desktop sidebar meets the rail without an unused outer frame", async ({ page }) => {
  await openStory(page, "messaging-scenes-workspace--public-channel");
  const rail = page.getByRole("navigation", { name: "Apps" });
  const sidebar = page.getByRole("complementary", { name: "Conversations" });
  await expect(sidebar).toBeVisible();
  const railBox = (await rail.boundingBox())!;
  const sidebarBox = (await sidebar.boundingBox())!;
  const gap = sidebarBox.x - (railBox.x + railBox.width);
  expect(gap).toBeCloseTo(0, 0);
  expect(sidebarBox.y).toBeCloseTo(railBox.y, 0);
});

for (const [story, title] of [
  ["create-channel", "Create a channel"],
  ["create-direct-message", "New direct message"],
  ["create-group", "New group message"],
]) {
  test(`${title} form is centered without a close button`, async ({ page }) => {
    await openStory(page, `messaging-scenes-workspace--${story}`);
    const form = page.locator("section").filter({
      has: page.getByRole("heading", { name: title, exact: true }),
    });
    await expect(form).toBeVisible();
    const box = (await form.boundingBox())!;
    const pane = (await form.locator("..").boundingBox())!;
    expect(box.x + box.width / 2).toBeCloseTo(pane.x + pane.width / 2, 0);
    expect(box.y + box.height / 2).toBeCloseTo(pane.y + pane.height / 2, 0);
    await expect(page.getByRole("button", { name: "Cancel new conversation" })).toHaveCount(0);
  });
}

for (const width of [390, 1440]) {
  test(`adding people is keyboard-accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openStory(page, "messaging-scenes-workspace--public-channel");
    const conversation = page.getByRole("region", { name: "general", exact: true });
    const toggle = conversation.locator("header").getByRole("button", {
      name: "Add people",
      exact: true,
    });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(conversation.getByLabel("Add people by exact email address")).toBeVisible();
    await conversation.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(conversation.getByLabel("Add people by exact email address")).toHaveCount(0);
  });
}

test("message actions appear only for the hovered or focused message without layout shifts", async ({
  page,
}) => {
  await openStory(page, "messaging-scenes-workspace--public-channel");
  const messages = page.getByRole("article");
  const first = messages.nth(0);
  const second = messages.nth(1);
  const actions = first.getByRole("group", { name: "Message actions" });
  await first.scrollIntoViewIfNeeded();
  const before = await first.boundingBox();
  const nextBefore = await second.boundingBox();
  await expect(actions).toHaveCSS("opacity", "0");
  await first.hover();
  await expect(actions).toHaveCSS("opacity", "1");
  await expect(second.getByRole("group", { name: "Message actions" })).toHaveCSS("opacity", "0");
  expect(await first.boundingBox()).toEqual(before);
  expect(await second.boundingBox()).toEqual(nextBefore);
  await page.getByRole("navigation", { name: "Apps" }).hover();
  await expect(actions).toHaveCSS("opacity", "0");
  await first.getByRole("button", { name: "React to message", exact: true }).focus();
  await expect(actions).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "🔥", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "🔥", exact: true }).click();
  await expect(first.getByRole("button", { name: "🔥, 1 reactions", exact: true })).toBeVisible();
});

test("touch devices keep message actions available without hover", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/iframe.html?id=messaging-scenes-workspace--public-channel&viewMode=story");
    await expect(page.getByRole("group", { name: "Message actions" }).first()).toHaveCSS(
      "opacity",
      "1",
    );
    await page.getByRole("button", { name: "Signed in as Taylor Kim", exact: true }).tap();
    await expect(page.getByRole("dialog", { name: "User actions" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("changing threads does not reuse another thread's reply draft", async ({ page }) => {
  await openStory(page, "messaging-scenes-workspace--thread-open");
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  await thread.getByRole("textbox").fill("Reply intended for the launch plan");
  const otherMessage = page
    .getByRole("region", { name: "general", exact: true })
    .getByRole("article")
    .filter({ hasText: "The API is ready:" });
  await otherMessage.getByRole("button", { name: "Reply in thread", exact: true }).click();
  await expect(thread).toContainText("The API is ready:");
  await expect(thread.getByRole("textbox")).toHaveValue("");
});

test("message drafts, emoji, reactions, and threads work without a backend", async ({ page }) => {
  await openStory(page, "messaging-scenes-workspace--public-channel");
  const input = page.getByRole("textbox", { name: "Message #general", exact: true });
  await input.fill("A preview message ");
  await page.getByRole("button", { name: "Add emoji", exact: true }).click();
  await page.getByRole("button", { name: "🚀", exact: true }).click();
  await expect(input).toHaveValue("A preview message 🚀");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  const message = page.getByRole("article").filter({ hasText: "A preview message 🚀" });
  await expect(message).toBeVisible();
  await message.getByRole("button", { name: "React to message" }).click();
  await page.getByRole("button", { name: "👍", exact: true }).click();
  await expect(message.getByRole("button", { name: "👍, 1 reactions" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await message.getByRole("button", { name: "👍, 1 reactions" }).click();
  await expect(message.getByRole("button", { name: "👍, 1 reactions" })).toHaveCount(0);
  await message.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(thread).toContainText("A preview message 🚀");
  await page
    .getByRole("textbox", { name: "Reply in thread…", exact: true })
    .fill("A preview reply");
  await page.getByRole("textbox", { name: "Reply in thread…", exact: true }).press("Enter");
  await expect(thread.getByRole("log")).toContainText("A preview reply");
  await expect(
    page.getByRole("region", { name: "general", exact: true }).getByRole("log"),
  ).not.toContainText("A preview reply");
  await page.getByRole("button", { name: "Close thread" }).click();
  await expect(thread).toHaveCount(0);
});

for (const width of [320, 390]) {
  test(`mobile scene navigation and composer remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 844 });
    await openStory(page, "messaging-scenes-workspace--public-channel");
    const sidebar = page.getByRole("complementary", { name: "Conversations" });
    const input = page.getByRole("textbox", { name: "Message #general" });
    await expect(sidebar).toBeHidden();
    for (const name of ["Bold text", "Italic text", "Code text", "Send"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
    await page.getByRole("button", { name: "Show conversations" }).click();
    await expect(sidebar).toBeVisible();
    await expect(input).toBeHidden();
    await sidebar.getByRole("button", { name: "Alex Morgan", exact: true }).click();
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Message Alex Morgan" })).toBeVisible();
  });
}

test("sidebar plus icons create channels and direct or group messages without duplicate actions", async ({
  page,
}) => {
  await openStory(page, "messaging-scenes-workspace--public-channel");
  const sidebar = page.getByRole("complementary", { name: "Conversations" });
  await expect(sidebar.getByText("Launch Studio", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Add a channel", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "New group message", exact: true })).toHaveCount(
    0,
  );
  await sidebar.getByRole("button", { name: "Create channel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create a channel", exact: true })).toBeVisible();
  for (const title of ["New direct message", "New group message"]) {
    await sidebar.getByRole("button", { name: "New message", exact: true }).click();
    await page.getByRole("menuitem", { name: title, exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
});

test("dark selections and hovered account actions have distinct backgrounds", async ({ page }) => {
  await openStory(page, "messaging-scenes-workspace--dark-workspace");
  const selected = page
    .getByRole("complementary", { name: "Conversations" })
    .getByRole("button", { name: "general", exact: true });
  expect(await backgroundContrast(selected, "aside")).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Signed in as Taylor Kim", exact: true }).click();
  const settings = page.getByRole("button", { name: "User settings", exact: true });
  await settings.hover();
  await expect
    .poll(() => backgroundContrast(settings, '[role="dialog"]'))
    .toBeGreaterThanOrEqual(1.5);
});

test("dark rail controls avoid bright white tiles and inset highlight seams", async ({ page }) => {
  await openStory(page, "messaging-scenes-workspace--dark-workspace");
  const rail = page.getByRole("navigation", { name: "Apps", exact: true });
  const workspace = rail.getByRole("button", { name: "Launch Studio ▾", exact: true });
  expect(await backgroundContrast(workspace, "nav")).toBeLessThan(3);
  const active = rail.getByRole("button", { name: "Messages", exact: true });
  await expect(active).toHaveCSS("box-shadow", "none");
  await expect(workspace).toHaveCSS("box-shadow", "none");
});

test("user icon reveals account actions on click and supports keyboard access", async ({
  page,
}) => {
  await openStory(page, "messaging-scenes-workspace--public-channel");
  const user = page.getByRole("button", { name: "Signed in as Taylor Kim", exact: true });
  await expect(page.getByRole("switch", { name: "Dark mode", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "User settings", exact: true })).toBeHidden();
  await user.hover();
  const actions = page.getByRole("dialog", { name: "User actions" });
  await expect(actions).toBeHidden();
  await user.click();
  await expect(actions).toBeVisible();
  await expect(actions.getByText("Taylor Kim", { exact: true })).toHaveCount(0);
  await expect(actions.getByRole("switch", { name: "Dark mode", exact: true })).toBeVisible();
  const positions = await actions
    .getByRole("button", { name: /^(User settings|Organization settings|Sign out)$/ })
    .evaluateAll((rows) =>
      rows.map((row) => {
        const { x, width } = row.getBoundingClientRect();
        return { x, width };
      }),
    );
  expect(positions.map((box) => box.x)).toEqual(positions.map(() => positions[0]?.x));
  expect(positions.map((box) => box.width)).toEqual(positions.map(() => positions[0]?.width));
  await expect(actions.getByRole("button", { name: "User settings", exact: true })).toBeVisible();
  await expect(
    actions.getByRole("button", { name: "Organization settings", exact: true }),
  ).toBeVisible();
  await actions.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Sign out is a preview only.");
  await page.keyboard.press("Escape");
  await expect(actions).toBeHidden();
  await user.focus();
  await page.keyboard.press("Enter");
  await expect(actions).toBeVisible();
  await actions.getByRole("button", { name: "User settings", exact: true }).click();
  await expect(actions).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Open Scenes / Settings");
});

test("permission and access-loss scenes hide restricted controls and content", async ({ page }) => {
  await openStory(page, "messaging-scenes-workspace--member-workspace");
  await page.getByRole("button", { name: "Signed in as Taylor Kim", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Organization settings", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "User settings", exact: true })).toBeVisible();
  await openStory(page, "messaging-scenes-workspace--public-channel");
  await page.getByRole("button", { name: "Signed in as Taylor Kim", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Organization settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Signed in as Taylor Kim")).toBeVisible();
  await openStory(page, "scenes-workspace-settings--admin");
  await expect(page.getByRole("button", { name: "Send invitation", exact: true })).toHaveCount(0);
  for (const scene of ["stale-workspace-tab", "revoked-membership"]) {
    await openStory(page, `messaging-scenes-workspace--${scene}`);
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByRole("log")).toHaveCount(0);
    await expect(page.getByText("The launch plan is ready.", { exact: false })).toHaveCount(0);
  }
  await openStory(page, "scenes-workspace-selection--expired-invitation");
  await expect(page.getByRole("button", { name: "Accept invitation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("This invitation is no longer available.");
});

test("markdown is safe and uses the active theme", async ({ page }) => {
  const remoteImages: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("tracker.png")) remoteImages.push(request.url());
  });
  await openStory(page, "messaging-components-message-body--safe-markdown");
  const link = page.getByRole("link", { name: "Safe link", exact: true });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByText("[Image: Launch plan]", { exact: true })).toBeVisible();
  await expect(page.getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Unsafe link", exact: true })).not.toHaveAttribute(
    "href",
    /javascript:/,
  );
  expect(remoteImages).toEqual([]);
  for (const theme of ["light", "dark"]) {
    await page.goto(
      `/iframe.html?id=messaging-components-message-body--markdown&viewMode=story&globals=theme:${theme}`,
    );
    await expect(page.getByRole("heading", { name: "A calmer place to work" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    const colors = await page.getByRole("link", { name: "your workspace" }).evaluate((node) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--primary)";
      node.append(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return { actual: getComputedStyle(node).color, expected };
    });
    expect(colors.actual).toBe(colors.expected);
  }
});

test("invitation fields and labels align on desktop and fit on mobile", async ({ page }) => {
  await openStory(page, "scenes-workspace-settings--no-invitations");
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  const role = page.getByRole("combobox", { name: "Role", exact: true });
  const send = page.getByRole("button", { name: "Send invitation", exact: true });
  const controls = await Promise.all([email.boundingBox(), role.boundingBox(), send.boundingBox()]);
  for (const box of controls) {
    expect(box!.y).toBeCloseTo(controls[0]!.y, 0);
    expect(box!.height).toBe(controls[0]!.height);
  }
  const emailLabelY = await email.evaluate(
    (node) =>
      document.querySelector(`label[for="${CSS.escape(node.id)}"]`)!.getBoundingClientRect().y,
  );
  const roleLabelY = await role.evaluate(
    (node) =>
      document.querySelector(`label[for="${CSS.escape(node.id)}"]`)!.getBoundingClientRect().y,
  );
  expect(emailLabelY).toBeCloseTo(roleLabelY, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const control of [email, role, send]) await expect(control).toBeInViewport({ ratio: 1 });
});

test("empty threads show the composer without instructional copy", async ({ page }) => {
  await openStory(page, "messaging-scenes-workspace--empty-thread");
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(
    thread.getByRole("textbox", { name: "Reply in thread…", exact: true }),
  ).toBeVisible();
  await expect(thread.getByText("No replies yet. Start the thread.", { exact: true })).toHaveCount(
    0,
  );
});

test("workspace menu marks the current workspace and selects another workspace", async ({
  page,
}) => {
  await openStory(page, "messaging-scenes-workspace--public-channel");
  await page.getByRole("button", { name: "Launch Studio ▾", exact: true }).click();
  const current = page.getByRole("menuitem", { name: "Launch Studio (current)", exact: true });
  await expect(current).toBeDisabled();
  await expect(current).toBeVisible();
  await page.getByRole("menuitem", { name: "Partner Workspace", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Workspace switching is a preview only.");
});

test("compact rail controls keep their names and expose usable menus", async ({ page }) => {
  await openStory(page, "components-workspace-rail-controls--compact-switcher");
  const compact = page.getByRole("button", { name: "Launch Studio ▾", exact: true });
  await expect(compact).toBeVisible();
  await expect(compact).toHaveText("LS");
  await compact.click();
  await expect(
    page.getByRole("menuitem", { name: "Launch Studio (current)", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("menuitem", { name: "Manage workspaces", exact: true }),
  ).toBeVisible();
  await openStory(page, "components-workspace-rail-controls--workspace-switcher");
  await expect(page.getByRole("button", { name: "Launch Studio ▾", exact: true })).toBeVisible();
  await openStory(page, "components-workspace-rail-controls--compact-sign-out");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await openStory(page, "scenes-workspace-selection--accept-invitation");
  await expect(page.getByRole("button", { name: "Accept invitation", exact: true })).toBeVisible();
});

test("theme switcher supports light, dark, and live system preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openStory(page, "messaging-scenes-workspace--public-channel");
  await page.getByRole("button", { name: "Signed in as Taylor Kim", exact: true }).click();
  const theme = page.getByRole("switch", { name: "Dark mode", exact: true });
  const system = page.getByRole("button", { name: "Use system theme", exact: true });
  const background = () =>
    page
      .getByRole("region", { name: "general", exact: true })
      .evaluate((node) => getComputedStyle(node).backgroundColor);
  const light = await background();
  await theme.check();
  await expect.poll(background).not.toBe(light);
  expect(await page.evaluate(() => localStorage.getItem("startup-os-storybook-theme"))).toBe(
    "dark",
  );
  await expect(theme).toBeChecked();
  await expect(system).toHaveAttribute("aria-pressed", "false");
  await system.click();
  await expect(system).toHaveAttribute("aria-pressed", "true");
  await expect.poll(background).toBe(light);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(background).not.toBe(light);
  await expect(theme).toBeChecked();
  await theme.uncheck();
  await expect.poll(background).toBe(light);
  await expect(system).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("menu")).toHaveCount(0);
});

for (const width of [320, 390, 1440]) {
  test(`authentication feedback preserves field and button positions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [ready, pending, error, button] of [
      ["sign-in", "signing-in", "invalid-credentials", "Sign in"],
      ["sign-up", "creating-account", "sign-up-error", "Create account"],
      ["forgot-password", "sending-reset-link", "reset-request-error", "Send reset link"],
    ]) {
      await openStory(page, `scenes-account-authentication--${ready}`);
      const input = page.getByRole("textbox", { name: "Email", exact: true });
      const fieldBox = await input.boundingBox();
      const buttonBox = await page.getByRole("button", { name: button, exact: true }).boundingBox();
      for (const state of [pending, error]) {
        await openStory(page, `scenes-account-authentication--${state}`);
        expect(await input.boundingBox()).toEqual(fieldBox);
        expect(await page.getByRole("button").boundingBox()).toEqual(buttonBox);
        if (state === error) await expect(page.getByRole("alert")).toBeVisible();
        else await expect(page.getByRole("button")).toBeDisabled();
      }
    }
  });

  test(`pane frames and action errors do not shift layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openStory(page, "messaging-scenes-workspace--public-channel");
    const region = page.getByRole("region", { name: "general", exact: true });
    const ready = await region.boundingBox();
    const composer = await page
      .getByRole("textbox", { name: "Message #general", exact: true })
      .boundingBox();
    for (const state of ["loading-messages", "message-access-error", "send-error"]) {
      await openStory(page, `messaging-scenes-workspace--${state}`);
      const currentRegion = page.getByRole("region", {
        name: state === "message-access-error" ? "Conversation unavailable" : "general",
        exact: true,
      });
      expect(await currentRegion.boundingBox()).toEqual(ready);
      if (state === "message-access-error") {
        await expect(currentRegion.getByRole("alert")).toBeVisible();
        await expect(
          currentRegion.getByRole("heading", { name: "general", exact: true }),
        ).toHaveCount(0);
        await expect(currentRegion.getByRole("log")).toHaveCount(0);
        await expect(
          page.getByRole("textbox", { name: "Message #general", exact: true }),
        ).toHaveCount(0);
      } else {
        const currentComposer = await page
          .getByRole("textbox", { name: "Message #general", exact: true })
          .boundingBox();
        expect(currentComposer!.x).toBe(composer!.x);
        expect(currentComposer!.width).toBe(composer!.width);
        expect(currentComposer!.y + currentComposer!.height).toBe(composer!.y + composer!.height);
        if (state === "loading-messages") expect(currentComposer).toEqual(composer);
        if (state === "loading-messages")
          await expect(region.getByRole("status")).toHaveText("Loading messages…");
        else {
          await expect(page.getByRole("alert")).toBeInViewport();
          const notice = await page.getByRole("alert").boundingBox();
          const send = await page.getByRole("button", { name: "Send", exact: true }).boundingBox();
          expect(notice).not.toBeNull();
          expect(send).not.toBeNull();
          expect(notice!.y + notice!.height).toBeLessThan(send!.y);
          await expect(page.getByRole("alert")).toContainText("Your draft is still here.");
          await expect(
            page.getByRole("textbox", { name: "Message #general", exact: true }),
          ).toHaveValue("Please review the launch plan.");
        }
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await openStory(page, "messaging-scenes-workspace--thread-open");
    const thread = page.getByRole("complementary", { name: "Thread", exact: true });
    const threadBox = await thread.boundingBox();
    for (const state of ["loading-thread", "thread-error"]) {
      await openStory(page, `messaging-scenes-workspace--${state}`);
      expect(await thread.boundingBox()).toEqual(threadBox);
      await expect(thread.getByRole("button", { name: "Close thread" })).toBeVisible();
      if (state === "thread-error") {
        await expect(thread.getByRole("alert")).toBeVisible();
        await expect(thread.getByRole("article")).toHaveCount(0);
        await expect(thread.getByRole("textbox")).toHaveCount(0);
      }
    }
  });
}

test("owner invitation previews can send, resend, and cancel", async ({ page }) => {
  await openStory(page, "scenes-workspace-settings--owner");
  await page.getByLabel("Email", { exact: true }).fill("new@example.com");
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  const invitation = page.getByRole("row").filter({ hasText: "new@example.com" });
  await expect(invitation).toContainText("pending");
  await invitation.getByRole("button", { name: "Resend", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Invitation email sent.");
  await invitation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(invitation).toContainText("canceled");
  await expect(invitation.getByRole("button", { name: "Resend", exact: true })).toHaveCount(0);
});

test("dark previews apply their theme to picker portals too", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=messaging-components-emoji-picker--default&viewMode=story&globals=theme:dark",
  );
  await page.getByRole("button", { name: "Add emoji" }).click();
  const picker = page.locator('[data-slot="popover-content"]');
  await expect(picker).toBeVisible();
  const previewPopoverColor = await page
    .locator(".bg-background")
    .first()
    .evaluate((node) => getComputedStyle(node).getPropertyValue("--popover").trim());
  await expect
    .poll(() =>
      picker.evaluate((node) => getComputedStyle(node).getPropertyValue("--popover").trim()),
    )
    .toBe(previewPopoverColor);
});
