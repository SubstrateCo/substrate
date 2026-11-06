import { expect, test } from "@playwright/test";
import { openStory } from "./stories";

test("shipping composer isolates channel, thread, and workspace drafts across remounts", async ({
  page,
}) => {
  await openStory(page, "messaging-production-compositions--composer-destinations");
  for (const scope of ["channel", "other channel", "thread A", "thread B", "other workspace"]) {
    await page.getByRole("button", { name: scope, exact: true }).click();
    const input = page.getByRole("textbox", { name: `Message ${scope}`, exact: true });
    await expect(input).toHaveValue("");
    await input.fill(`Private draft for ${scope}`);
  }
  for (const scope of ["channel", "thread A", "other channel", "thread B", "other workspace"]) {
    await page.getByRole("button", { name: scope, exact: true }).click();
    await expect(page.getByRole("textbox")).toHaveValue(`Private draft for ${scope}`);
  }
});

test("shipping composer prevents duplicate sends and preserves failed input for retry", async ({
  page,
}) => {
  await openStory(page, "messaging-production-compositions--composer-destinations");
  const input = page.getByRole("textbox");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await input.fill("Keep this draft");
  await input.press("Enter");
  await expect(input).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sending…", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Fail send" }).click();
  await expect(input).toHaveValue("Keep this draft");
  await expect(
    page.getByText(
      "Your message couldn’t be sent. Your draft is still here. Try sending it again.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Complete send" }).click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Sent: Keep this draft");
});

test("production message action strip exposes copy, work, reaction, and thread actions", async ({
  page,
}) => {
  await openStory(page, "messaging-production-compositions--message-actions");
  await page.getByRole("article").hover();
  const actions = page.getByRole("group", { name: "Message actions" });
  await actions.getByRole("button", { name: "Copy message link" }).click();
  await expect(page.getByText("Link copied", { exact: true })).toBeVisible();
  await actions.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByText("Create task selected", { exact: true })).toBeVisible();
  await actions.getByRole("button", { name: "Link existing work" }).click();
  await expect(page.getByText("Link existing work selected", { exact: true })).toBeVisible();
  await actions.getByRole("button", { name: "Reply in thread", exact: true }).click();
  await expect(page.getByText("Thread opened", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "👍, 1 reactions" }).click();
  await expect(page.getByRole("button", { name: "👍, 2 reactions" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

for (const replies of [false, true]) {
  test(`production history disables navigation and keeps loaded ${replies ? "replies" : "messages"} during fetch`, async ({
    page,
  }) => {
    await openStory(
      page,
      `messaging-production-compositions--pending-${replies ? "replies" : "messages"}-history`,
    );
    const older = page.getByRole("button", {
      name: replies ? "Older replies" : "Older messages",
      exact: true,
    });
    const latest = page.getByRole("button", {
      name: replies ? "Latest replies" : "Back to latest",
      exact: true,
    });
    const loadingOlder = page.getByRole("button", {
      name: replies ? "Loading older replies…" : "Loading older messages…",
      exact: true,
    });
    const loadingLatest = page.getByRole("button", {
      name: replies ? "Loading latest replies…" : "Loading latest messages…",
      exact: true,
    });
    await older.click();
    await expect(loadingOlder).toBeDisabled();
    await expect(latest).toBeDisabled();
    await expect(loadingLatest).toHaveCount(0);
    await expect(loadingOlder).toHaveAttribute("aria-busy", "true");
    await expect(page.getByText("Current launch discussion", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Complete history request" }).click();
    await expect(page.getByText("Older launch discussion", { exact: true })).toBeVisible();
    await expect(older).toBeEnabled();
    await expect(latest).toBeEnabled();
    await latest.click();
    await expect(older).toBeDisabled();
    await expect(loadingOlder).toHaveCount(0);
    await expect(loadingLatest).toBeDisabled();
    await expect(loadingLatest).toHaveAttribute("aria-busy", "true");
    await expect(page.getByText("Older launch discussion", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Complete history request" }).click();
    await expect(page.getByText("Latest launch discussion", { exact: true })).toBeVisible();
    await expect(older).toBeEnabled();
    await expect(latest).toBeEnabled();
  });

  test(`production history navigates older and latest ${replies ? "replies" : "messages"}`, async ({
    page,
  }) => {
    await openStory(
      page,
      `messaging-production-compositions--${replies ? "replies" : "messages"}-history`,
    );
    await expect(page.getByText("Latest launch update", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: replies ? "Older replies" : "Older messages" }).click();
    await expect(page.getByText("Earlier launch discussion", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: replies ? "Older replies" : "Older messages" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: replies ? "Latest replies" : "Back to latest" }).click();
    await expect(page.getByText("Latest launch update", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: replies ? "Latest replies" : "Back to latest" }),
    ).toHaveCount(0);
  });
}

test("linked message scrolls into its history viewport and removes highlight when cleared", async ({
  page,
}) => {
  await openStory(page, "messaging-production-compositions--linked-target-scroll");
  const history = page.getByRole("region", { name: "Message history" });
  expect(await history.evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "Toggle linked target" }).click();
  const linked = page.getByLabel("Linked message", { exact: true });
  await expect(
    linked.getByText("Confirm the launch checklist before release.", { exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect
    .poll(() => linked.evaluate((element) => getComputedStyle(element).borderTopWidth))
    .toBe("2px");
  await page.getByRole("button", { name: "Toggle linked target" }).click();
  await expect(linked).toHaveCount(0);
  await expect(page.getByRole("article")).toBeVisible();
});

test("unavailable message retry restores the actual message", async ({ page }) => {
  await openStory(page, "messaging-production-compositions--message-recovery");
  await expect(page.getByText("Message unavailable", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByText("Confirm the launch checklist before release.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Message unavailable", { exact: true })).toHaveCount(0);
});

test("conversation access notice does not reveal a private conversation", async ({ page }) => {
  await openStory(page, "messaging-production-compositions--conversation-access");
  await expect(
    page.getByText("Conversation unavailable or access denied.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Check that you are in the right workspace and still have access.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("organization actions preserve invitation navigation and prevent repeat sign out", async ({
  page,
}) => {
  await openStory(page, "components-production-workspace-controls--selection-and-theme");
  await expect(page.getByRole("link", { name: "Your invitations" })).toHaveAttribute(
    "href",
    "#invitations",
  );
  await page.getByRole("link", { name: "Your invitations" }).click();
  await expect(page).toHaveURL(/#invitations$/);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Signing out…", exact: true })).toBeDisabled();
});

test("fixed production theme control changes the rendered theme", async ({ page }) => {
  await openStory(page, "components-production-workspace-controls--selection-and-theme");
  for (const theme of ["Dark", "Light"]) {
    await page.getByRole("button", { name: "Color theme" }).click();
    await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
    if (theme === "Dark") await expect(page.locator("html")).toHaveClass(/dark/);
    else await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.getByRole("button", { name: "Color theme" }).click();
    await expect(page.getByRole("menuitemradio", { name: theme, exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("Escape");
  }
});

for (const [name, width, height, dark] of [
  ["light", 1440, 900, false],
  ["dark", 1440, 900, true],
  ["short", 800, 420, false],
  ["narrow", 320, 740, false],
] as const) {
  test(`shipping composition proof ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(
      `/iframe.html?id=messaging-production-compositions--message-actions&viewMode=story&globals=theme:${dark ? "dark" : "light"}`,
    );
    await expect(page.getByRole("article")).toBeVisible();
    await page.getByRole("article").hover();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `C:/Users/mahar/AppData/Local/Temp/opencode/shipping-compositions-${name}.png`,
      fullPage: true,
    });
    for (const action of [
      "Copy message link",
      "Create task",
      "Link existing work",
      "Reply in thread",
    ]) {
      await expect(page.getByRole("button", { name: action, exact: true })).toBeInViewport({
        ratio: 1,
      });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}
