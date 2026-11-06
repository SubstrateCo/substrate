import { expect, test } from "@playwright/test";
import { openStory } from "./stories";

test("workspace search filters records, opens related context, and pages results", async ({
  page,
}) => {
  await openStory(page, "workspace-search--ready");
  const search = page.getByRole("combobox", { name: "Search workspace" });
  await expect(search).toBeFocused();
  await search.fill("Ship");
  await expect(page.getByRole("link", { name: "task · Ship the launch" })).toBeVisible();
  await expect(page.getByRole("link", { name: "project · Product launch" })).not.toBeVisible();
  await page.getByRole("button", { name: "Find related records for Ship the launch" }).click();
  await expect(page.getByText("Related records", { exact: true })).toBeVisible();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await page.getByRole("button", { name: "Search all records" }).click();
  await expect(page.getByText("Related records", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "More results" }).click();
  await expect(page.getByRole("link", { name: "task · Review release notes" })).toBeVisible();
  await page.getByRole("button", { name: "First results" }).click();
  await expect(page.getByRole("link", { name: "task · Ship the launch" })).toBeVisible();
});

test("search retry preserves input and cached refresh results remain usable", async ({ page }) => {
  await openStory(page, "workspace-search--load-error");
  await page.getByRole("combobox").fill("launch");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("combobox")).toHaveValue("launch");
  await expect(page.getByRole("link", { name: "task · Ship the launch" })).toBeVisible();
  await openStory(page, "workspace-search--refresh-error");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("link", { name: "task · Ship the launch" })).toBeVisible();
});

test("access errors hide cached search and notification metadata", async ({ page }) => {
  await openStory(page, "workspace-search--unavailable");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Ship the launch")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "More results" })).not.toBeVisible();
  await openStory(page, "workspace-notifications--unavailable");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Assigned to you Ship the launch" }),
  ).not.toBeVisible();
});

test("notifications mark one item read and recover from a load failure", async ({ page }) => {
  await openStory(page, "workspace-notifications--load-error");
  await page.getByRole("button", { name: "Try again" }).click();
  const assignment = page.getByRole("listitem").filter({ hasText: "Ship the launch" });
  await assignment.getByRole("button", { name: "Mark as read" }).click();
  await expect(assignment.getByText("Read", { exact: true })).toBeVisible();
  await expect(assignment.getByRole("button", { name: "Mark as read" })).not.toBeVisible();
});

test("pending notification actions cannot submit twice", async ({ page }) => {
  await openStory(page, "workspace-notifications--pending");
  await expect(page.getByRole("button", { name: "Marking as read." })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mark as read", exact: true })).toBeDisabled();
});

test("link work retries without losing the search or selected kind", async ({ page }) => {
  await openStory(page, "workspace-link-work--load-error");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("textbox", { name: "Search work to link" }).fill("Product");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("textbox")).toHaveValue("Product");
  await expect(page.getByRole("button", { name: "Projects", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Product launch", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Work linked.");
});

test("source task creation preserves the draft after failure and links the created task", async ({
  page,
}) => {
  await openStory(page, "workspace-create-source-task--save-error");
  await page.getByRole("combobox", { name: "Destination project" }).click();
  await page.getByRole("option", { name: "Product launch" }).click();
  await page.getByRole("textbox", { name: "Task title", exact: true }).fill("Customer checklist");
  await page.getByRole("button", { name: "Copy source text into description" }).click();
  await expect(page.getByRole("textbox", { name: "Task description" })).toHaveValue(
    "Customer asked for a launch checklist. Please check with [Reference].",
  );
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Task title", exact: true })).toHaveValue(
    "Customer checklist",
  );
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByText("Task created and linked.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open created task" })).toHaveAttribute(
    "href",
    "#created-task",
  );
});

test("related context keeps cached records for refresh failures but hides access-denied records", async ({
  page,
}) => {
  await openStory(page, "workspace-related-context--refresh-error");
  await expect(
    page.getByRole("link", { name: "Created from a discussion · Launch team" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(2);
  await openStory(page, "workspace-related-context--unavailable");
  await expect(
    page.getByText("Customer asked for a launch checklist.", { exact: false }),
  ).not.toBeVisible();
  await expect(page.getByText("Task created · Alex Morgan")).not.toBeVisible();
});

test("workspace tools open from the keyboard and close with Escape", async ({ page }) => {
  await openStory(page, "scenes-workspace-connected-tools--ready");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox", { name: "Search workspace" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Workspace search" })).not.toBeVisible();
  const search = page.getByRole("combobox", { name: "Search workspace", exact: true });
  await expect(search).toBeFocused();
  await search.fill("Ship");
  await expect(page.getByRole("link", { name: "task · Ship the launch" })).toBeVisible();
  await search.press("Escape");
  await expect(search).toHaveValue("Ship");
  await expect(page.getByRole("region", { name: "Workspace search" })).not.toBeVisible();
  await page
    .getByRole("button", { name: "Notifications, unread notifications", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "Notifications", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unread 1", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("You’re all caught up").first()).toBeVisible();
});

test("user invitations expose only current review links", async ({ page }) => {
  await openStory(page, "scenes-workspace-user-settings--invitations");
  await expect(page.getByRole("link", { name: "Invitations", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("link", { name: "Review invitation" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Review invitation" })).toHaveAttribute(
    "href",
    "#review-current",
  );
  await expect(page.getByRole("row").filter({ hasText: "Previous workspace" })).toContainText(
    "expired",
  );
});

test("partner channels are separate from internal channels", async ({ page }) => {
  await openStory(page, "messaging-components-conversation-sidebar--partner-channels");
  const partners = page.getByRole("region", { name: "Partner channels", exact: true });
  await expect(partners.getByRole("button", { name: "Partner launch", exact: true })).toBeVisible();
  await expect(partners.getByRole("button", { name: "general", exact: true })).toHaveCount(0);
  const channels = page.getByRole("region", { name: "Channels", exact: true });
  await expect(channels.getByRole("button", { name: "general", exact: true })).toBeVisible();
  await expect(channels.getByRole("button", { name: "Partner launch", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Workspace", { exact: true })).toHaveCount(0);
});

test("command search supports keyboard selection and keeps server-filtered results", async ({
  page,
}) => {
  await openStory(page, "scenes-workspace-connected-tools--ready");
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: "Search workspace" });
  await input.fill("review");
  const options = page.getByRole("option");
  await expect(options).toHaveCount(2);
  await expect(options.first()).toContainText("Review the onboarding flow");
  await expect(options.last()).toContainText("The updated assets are ready for review");
  const tasks = page.getByRole("button", { name: "Tasks", exact: true }).last();
  await tasks.focus();
  await tasks.press("Enter");
  await expect(options).toHaveCount(1);
  await expect(options).toContainText("Review the onboarding flow");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(options).toHaveCount(2);
  await input.focus();
  await input.press("ArrowDown");
  await expect(page.getByRole("option", { selected: true })).toContainText(
    "The updated assets are ready for review",
  );
  await input.press("Enter");
  await expect(page).toHaveURL(/#message$/);
});

test("desktop sign-in recovers without needing Electron services", async ({ page }) => {
  await openStory(page, "components-auth-desktop-handoff--failed");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Sign in with browser" }).click();
  await expect(page.getByRole("status")).toContainText("Complete sign-in in your browser.");
  await expect(page.getByRole("alert")).not.toBeVisible();
});

test("copy links report clipboard failures", async ({ page }) => {
  await openStory(page, "workspace-links--copy-failed");
  await page.getByRole("button", { name: "Copy task link" }).click();
  await expect(page.getByRole("status")).toHaveText("Couldn't copy link");
});

for (const theme of ["light", "dark"]) {
  test(`moved workspace views fit a narrow desktop window in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    for (const [story, landmark] of [
      ["workspace-search--ready", "Workspace search"],
      ["workspace-notifications--ready", "Notifications"],
      ["workspace-link-work--ready", "Link existing work"],
      ["workspace-create-source-task--ready", "Create task from message"],
    ]) {
      await page.goto(`/iframe.html?id=${story}&viewMode=story&globals=theme:${theme}`);
      await expect(page.getByRole("region", { name: landmark, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.goto(
      `/iframe.html?id=scenes-workspace-connected-tools--ready&viewMode=story&globals=theme:${theme}`,
    );
    const search = page.getByRole("combobox", { name: "Search workspace", exact: true });
    await expect(search).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: "Notifications, unread notifications", exact: true }),
    ).toBeInViewport({
      ratio: 1,
    });
    await search.click();
    await expect(page.getByRole("combobox", { name: "Search workspace" })).toBeInViewport({
      ratio: 1,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
