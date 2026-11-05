import { expect, test, type Locator, type Page } from "@playwright/test";

async function backgroundContrast(control: Locator, parentSelector: string) {
  return control.evaluate((node, selector) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const luminance = (element: Element) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(element).backgroundColor;
      context.fillRect(0, 0, 1, 1);
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

async function openStory(page: Page, id: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await expect(page.locator("#storybook-root > div")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test("every story renders without app services or runtime errors", async ({ page, request }) => {
  const response = await request.get("/index.json");
  const index: { entries: Record<string, { id: string; type: string }> } = await response.json();
  const stories = Object.values(index.entries).filter((entry) => entry.type === "story");
  const errors: string[] = [];
  const serviceRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith("/api/") ||
      request.method() === "POST" ||
      url.origin !== "http://127.0.0.1:6007"
    )
      serviceRequests.push(request.url());
  });
  expect(stories.length).toBeGreaterThan(0);
  for (const story of stories) {
    await test.step(story.id, async () => {
      await openStory(page, story.id);
      await expect(page.locator(".sb-errordisplay")).not.toBeVisible();
      expect(errors, story.id).toEqual([]);
    });
  }
  expect(serviceRequests).toEqual([]);
});

test("isolated button and picker previews are centered, while scenes keep their app layout", async ({
  page,
}) => {
  for (const [id, name] of [
    ["components-button--default", "Button"],
    ["components-messaging--emoji", "Add emoji"],
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
  await openStory(page, "scenes-messaging--public-channel");
  const rail = await page.getByRole("navigation", { name: "Apps" }).boundingBox();
  expect(rail?.x).toBe(0);
  expect(rail?.height).toBe(900);
});

test("desktop sidebar is inset from the app rail", async ({ page }) => {
  await openStory(page, "scenes-messaging--public-channel");
  const rail = page.getByRole("navigation", { name: "Apps" });
  const sidebar = page.getByRole("complementary", { name: "Conversations" });
  await expect(sidebar).toBeVisible();
  const railBox = (await rail.boundingBox())!;
  const sidebarBox = (await sidebar.boundingBox())!;
  const gap = sidebarBox.x - (railBox.x + railBox.width);
  expect(gap).toBeGreaterThanOrEqual(8);
  expect(gap).toBeCloseTo(sidebarBox.y - railBox.y, 0);
});

for (const [story, title] of [
  ["create-channel", "Create a channel"],
  ["create-direct-message", "New direct message"],
  ["create-group", "New group message"],
]) {
  test(`${title} form is centered without a close button`, async ({ page }) => {
    await openStory(page, `scenes-messaging--${story}`);
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

test("message actions appear only for the hovered or focused message without layout shifts", async ({
  page,
}) => {
  await openStory(page, "scenes-messaging--public-channel");
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

test("touch devices keep message actions available without hover", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto(
      "http://127.0.0.1:6007/iframe.html?id=scenes-messaging--public-channel&viewMode=story",
    );
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

test("message drafts, emoji, reactions, and threads work without a backend", async ({ page }) => {
  await openStory(page, "scenes-messaging--public-channel");
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
    await openStory(page, "scenes-messaging--public-channel");
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
  await openStory(page, "scenes-messaging--public-channel");
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
  await openStory(page, "scenes-messaging--dark-workspace");
  const selected = page
    .getByRole("complementary", { name: "Conversations" })
    .getByRole("button", { name: "general", exact: true });
  expect(await backgroundContrast(selected, "aside")).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Signed in as Taylor Kim", exact: true }).hover();
  const settings = page.getByRole("button", { name: "User settings", exact: true });
  await settings.hover();
  await expect
    .poll(() => backgroundContrast(settings, '[role="dialog"]'))
    .toBeGreaterThanOrEqual(1.5);
});

test("user icon reveals account actions on hover and supports keyboard access", async ({
  page,
}) => {
  await openStory(page, "scenes-messaging--public-channel");
  const user = page.getByRole("button", { name: "Signed in as Taylor Kim", exact: true });
  await expect(page.getByRole("switch", { name: "Dark mode", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "User settings", exact: true })).toBeHidden();
  await user.hover();
  const actions = page.getByRole("dialog", { name: "User actions" });
  await expect(actions).toBeVisible();
  await expect(actions.getByText("Taylor Kim", { exact: true })).toHaveCount(0);
  await expect(actions.getByRole("switch", { name: "Dark mode", exact: true })).toBeVisible();
  const actionRows = await actions
    .getByRole("button", { name: /^(User settings|Organization settings|Sign out)$/ })
    .all();
  const positions = await Promise.all(actionRows.map((row) => row.boundingBox()));
  expect(positions.map((box) => box?.x)).toEqual(positions.map(() => positions[0]?.x));
  expect(positions.map((box) => box?.width)).toEqual(positions.map(() => positions[0]?.width));
  await expect(actions.getByRole("button", { name: "User settings", exact: true })).toBeVisible();
  await expect(
    actions.getByRole("button", { name: "Organization settings", exact: true }),
  ).toBeVisible();
  await actions.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sign out is a preview only.");
  await page.keyboard.press("Escape");
  await expect(actions).toBeHidden();
  await user.focus();
  await page.keyboard.press("Enter");
  await expect(actions).toBeVisible();
  await actions.getByRole("button", { name: "User settings", exact: true }).click();
  await expect(actions).toBeHidden();
  await expect(page.getByRole("alert")).toContainText("Open Scenes / Settings");
});

test("permission and access-loss scenes hide restricted controls and content", async ({ page }) => {
  await openStory(page, "scenes-messaging--member-workspace");
  await page.getByRole("button", { name: "Signed in as Taylor Kim", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Organization settings", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "User settings", exact: true })).toBeVisible();
  await openStory(page, "scenes-messaging--public-channel");
  await page.getByRole("button", { name: "Signed in as Taylor Kim", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Organization settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Signed in as Taylor Kim")).toBeVisible();
  await openStory(page, "scenes-settings--admin");
  await expect(page.getByRole("button", { name: "Send invitation", exact: true })).toHaveCount(0);
  for (const scene of ["stale-workspace-tab", "revoked-membership"]) {
    await openStory(page, `scenes-messaging--${scene}`);
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByRole("log")).toHaveCount(0);
    await expect(page.getByText("The launch plan is ready.", { exact: false })).toHaveCount(0);
  }
  await openStory(page, "scenes-workspaces--expired-invitation");
  await expect(page.getByRole("button", { name: "Accept invitation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("This invitation is no longer available.");
});

test("markdown is safe and uses the active theme", async ({ page }) => {
  const remoteImages: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("tracker.png")) remoteImages.push(request.url());
  });
  await openStory(page, "components-messaging--safe-markdown");
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
      `/iframe.html?id=components-messaging--markdown&viewMode=story&globals=theme:${theme}`,
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
  await openStory(page, "scenes-settings--no-invitations");
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  const role = page.getByRole("combobox", { name: "Role", exact: true });
  const send = page.getByRole("button", { name: "Send invitation", exact: true });
  const controls = await Promise.all([email.boundingBox(), role.boundingBox(), send.boundingBox()]);
  for (const box of controls) {
    expect(box!.y).toBeCloseTo(controls[0]!.y, 0);
    expect(box!.height).toBe(controls[0]!.height);
  }
  const emailLabel = await page.getByText("Email", { exact: true }).boundingBox();
  const roleLabel = await page.getByText("Role", { exact: true }).boundingBox();
  expect(emailLabel!.y).toBeCloseTo(roleLabel!.y, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const control of [email, role, send]) await expect(control).toBeInViewport({ ratio: 1 });
});

test("empty threads show the composer without instructional copy", async ({ page }) => {
  await openStory(page, "scenes-messaging--empty-thread");
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
  await openStory(page, "scenes-messaging--public-channel");
  await page.getByRole("button", { name: "Launch Studio ▾", exact: true }).click();
  const current = page.getByRole("menuitem", { name: "Launch Studio (current)", exact: true });
  await expect(current).toBeDisabled();
  await expect(current).toBeVisible();
  await page.getByRole("menuitem", { name: "Partner Workspace", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Workspace switching is a preview only.");
});

test("compact rail controls keep their names and expose usable menus", async ({ page }) => {
  await openStory(page, "components-rail-controls--compact-switcher");
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
  await openStory(page, "components-rail-controls--workspace-switcher");
  await expect(page.getByRole("button", { name: "Launch Studio ▾", exact: true })).toBeVisible();
  await openStory(page, "components-rail-controls--compact-sign-out");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await openStory(page, "scenes-workspaces--accept-invitation");
  await expect(page.getByRole("button", { name: "Accept invitation", exact: true })).toBeVisible();
});

test("theme switcher supports light, dark, and live system preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openStory(page, "scenes-messaging--public-channel");
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
      await openStory(page, `scenes-authentication--${ready}`);
      const input = page.getByRole("textbox", { name: "Email", exact: true });
      const fieldBox = await input.boundingBox();
      const buttonBox = await page.getByRole("button", { name: button, exact: true }).boundingBox();
      for (const state of [pending, error]) {
        await openStory(page, `scenes-authentication--${state}`);
        expect(await input.boundingBox()).toEqual(fieldBox);
        expect(await page.getByRole("button").boundingBox()).toEqual(buttonBox);
        if (state === error) await expect(page.getByRole("alert")).toBeVisible();
        else await expect(page.getByRole("button")).toBeDisabled();
      }
    }
  });

  test(`pane frames and action errors do not shift layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openStory(page, "scenes-messaging--public-channel");
    const region = page.getByRole("region", { name: "general", exact: true });
    const ready = await region.boundingBox();
    const composer = await page
      .getByRole("textbox", { name: "Message #general", exact: true })
      .boundingBox();
    for (const state of ["loading-messages", "message-access-error", "send-error"]) {
      await openStory(page, `scenes-messaging--${state}`);
      expect(await region.boundingBox()).toEqual(ready);
      if (state === "message-access-error") {
        await expect(region.getByRole("alert")).toBeVisible();
        await expect(region.getByRole("log")).toHaveCount(0);
        await expect(
          page.getByRole("textbox", { name: "Message #general", exact: true }),
        ).toHaveCount(0);
      } else {
        expect(
          await page.getByRole("textbox", { name: "Message #general", exact: true }).boundingBox(),
        ).toEqual(composer);
        if (state === "loading-messages")
          await expect(region.getByRole("status")).toHaveText("Loading messages…");
        else {
          await expect(page.getByRole("alert")).toBeInViewport();
          const notice = await page.getByRole("alert").boundingBox();
          const send = await page.getByRole("button", { name: "Send", exact: true }).boundingBox();
          expect(notice).not.toBeNull();
          expect(send).not.toBeNull();
          expect(notice!.y + notice!.height).toBeLessThan(send!.y);
          await page.getByRole("button", { name: "Dismiss notification" }).click();
          await expect(page.getByRole("alert")).toHaveCount(0);
          await expect(
            page.getByRole("textbox", { name: "Message #general", exact: true }),
          ).toHaveValue("Please review the launch plan.");
        }
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await openStory(page, "scenes-messaging--thread-open");
    const thread = page.getByRole("complementary", { name: "Thread", exact: true });
    const threadBox = await thread.boundingBox();
    for (const state of ["loading-thread", "thread-error"]) {
      await openStory(page, `scenes-messaging--${state}`);
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
  await openStory(page, "scenes-settings--owner");
  await page.getByLabel("Email", { exact: true }).fill("new@example.com");
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  const invitation = page.getByRole("listitem").filter({ hasText: "new@example.com" });
  await expect(invitation).toContainText("pending");
  await invitation.getByRole("button", { name: "Resend", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Invitation email sent.");
  await invitation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(invitation).toContainText("canceled");
  await expect(invitation.getByRole("button", { name: "Resend", exact: true })).toHaveCount(0);
});

test("dark previews apply their theme to picker portals too", async ({ page }) => {
  await page.goto("/iframe.html?id=components-messaging--emoji&viewMode=story&globals=theme:dark");
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
