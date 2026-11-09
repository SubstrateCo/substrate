import { test, visit } from "./test-support/fixtures";
import { expect, type Page } from "@playwright/test";

const section = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Agent settings sections", exact: true })
    .getByRole("button", { name, exact: true });

test("agent definitions can be created, edited, persisted and deleted without running a provider", async ({
  account,
  client,
}) => {
  const user = await client(account);
  await visit(user, undefined, "/agents");
  const name = `Release helper ${crypto.randomUUID()}`;
  await user.page.getByLabel("Create agent", { exact: true }).click();
  await user.page.getByLabel("Agent name", { exact: true }).fill(name);
  await user.page
    .getByRole("textbox", { name: "Additional instructions (optional)", exact: true })
    .fill("Review release tasks. Do not contact external services.");
  await user.page
    .getByRole("dialog")
    .getByRole("button", { name: "Create agent", exact: true })
    .click();
  await expect(user.page.getByRole("dialog")).toHaveCount(0);
  await expect(user.page.getByLabel("Agent name", { exact: true })).toHaveValue(name);
  const save = user.page.getByRole("button", { name: "Save changes", exact: true });
  await expect(save).toBeInViewport();
  await expect(save).toBeDisabled();
  await user.page.getByLabel("Agent name", { exact: true }).fill("");
  await save.click();
  await expect(user.page.getByText("Enter an agent name.", { exact: true })).toBeVisible();
  await user.page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(user.page.getByLabel("Agent name", { exact: true })).toHaveValue(name);
  await expect(save).toBeDisabled();
  await expect(user.page.getByRole("switch", { name: "Direct message", exact: true })).toBeHidden();
  await section(user.page, "Skills").click();
  await expect(section(user.page, "Skills")).toHaveAttribute("aria-current", "true");
  await expect(section(user.page, "General")).not.toHaveAttribute("aria-current");
  await expect(user.page.getByText("startup-os-search", { exact: true })).toBeVisible();
  await section(user.page, "MCP servers").click();
  await expect(user.page.getByText("hello_world", { exact: true })).toHaveCount(0);
  await expect(
    user.page.getByRole("listitem").filter({ hasText: "startup-os" }).getByText("Built-in"),
  ).toBeVisible();
  const sidebar = user.page.getByRole("region", { name: "Your agents", exact: true });
  await expect(sidebar.getByRole("button", { name, exact: true })).toBeVisible();
  await sidebar.getByRole("button", { name, exact: true }).click();
  await expect(user.page.getByRole("tab", { name: "Activity", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await user.page.getByRole("tab", { name: "Routines", exact: true }).click();
  await expect(user.page.getByRole("tabpanel", { name: "Routines", exact: true })).toBeVisible();
  await expect(user.page.getByRole("tabpanel", { name: "Activity", exact: true })).toBeHidden();
  await user.page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(user.page.getByRole("tabpanel", { name: "Activity", exact: true })).toBeVisible();
  await expect(user.page.getByRole("tabpanel", { name: "Routines", exact: true })).toBeHidden();
  await user.page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(user.page.getByRole("tabpanel", { name: "Activity", exact: true })).toBeHidden();
  await user.page.reload();
  await expect(user.page.getByRole("tab", { name: "Settings", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await section(user.page, "Run settings").click();
  const directMessage = user.page.getByRole("switch", { name: "Direct message", exact: true });
  const enabled = await directMessage.isChecked();
  await directMessage.click();
  await Promise.all([
    user.page.waitForResponse(
      (response) => response.url().endsWith("/actors/triggers") && response.ok(),
    ),
    user.page.getByRole("button", { name: "Save run settings", exact: true }).click(),
  ]);
  await user.page.reload();
  await section(user.page, "Run settings").click();
  await expect(directMessage).toBeChecked({ checked: !enabled });
  await user.page.getByRole("button", { name: "Needs you", exact: true }).click();
  await expect(user.page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
  await user.page.goBack();
  await expect(user.page.getByRole("tab", { name: "Settings", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await section(user.page, "Instructions").click();
  await expect(
    user.page.getByRole("region", { name: "Startup OS instructions", exact: true }),
  ).toBeHidden();
  await expect(
    user.page.getByRole("textbox", { name: "Additional instructions (optional)", exact: true }),
  ).toHaveValue("Review release tasks. Do not contact external services.");
  await user.page
    .getByRole("textbox", { name: "Additional instructions (optional)", exact: true })
    .fill("Summarize release risks only.");
  const updatedName = `${name} updated`;
  await section(user.page, "General").click();
  await user.page.getByLabel("Agent name", { exact: true }).fill(updatedName);
  await Promise.all([
    user.page.waitForResponse(
      (response) => response.url().endsWith("/actors/save") && response.ok(),
    ),
    user.page.getByRole("button", { name: "Save changes", exact: true }).click(),
  ]);
  await expect(sidebar.getByRole("button", { name: updatedName, exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name, exact: true })).toHaveCount(0);
  await user.page.reload();
  await section(user.page, "Instructions").click();
  await expect(
    user.page.getByRole("textbox", { name: "Additional instructions (optional)", exact: true }),
  ).toHaveValue("Summarize release risks only.");
  await user.page
    .getByRole("textbox", { name: "Additional instructions (optional)", exact: true })
    .fill("Unsaved draft");
  await user.page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(
    user.page.getByRole("textbox", { name: "Additional instructions (optional)", exact: true }),
  ).toHaveValue("Summarize release risks only.");
  await section(user.page, "General").click();
  await user.page.getByRole("button", { name: `Delete ${updatedName}`, exact: true }).click();
  await user.page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(sidebar.getByRole("button", { name: updatedName, exact: true })).toHaveCount(0);
  await expect(user.page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
  await user.page.reload();
  await expect(sidebar.getByText("You have no agents yet.", { exact: true })).toBeVisible();
  await expect(user.page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
});

test("the rail places Agents above Notifications and user settings no longer has an Agents tab", async ({
  account,
  client,
}) => {
  const user = await client(account);
  await visit(user, undefined, "/agents");
  const apps = user.page.getByRole("navigation", { name: "Apps", exact: true });
  const agents = apps.getByRole("button", { name: "Agents", exact: true });
  const notifications = apps.getByRole("button", { name: /^Notifications/ });
  await expect(agents).toHaveAttribute("aria-current", "page");
  const agentBox = await agents.boundingBox();
  const notificationBox = await notifications.boundingBox();
  expect(agentBox).not.toBeNull();
  expect(notificationBox).not.toBeNull();
  expect(notificationBox!.y - (agentBox!.y + agentBox!.height)).toBeGreaterThanOrEqual(0);
  expect(notificationBox!.y - (agentBox!.y + agentBox!.height)).toBeLessThanOrEqual(16);
  expect(agentBox!.y).toBeGreaterThan(user.page.viewportSize()!.height / 2);

  await notifications.click();
  await expect(notifications).toHaveAttribute("aria-current", "page");
  await agents.click();
  await expect(user.page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
  await apps.getByRole("button", { name: `Signed in as ${account.name}`, exact: true }).click();
  await user.page.getByRole("button", { name: "User settings", exact: true }).click();
  await expect(
    user.page.getByRole("tab", { name: "Profile and appearance", exact: true }),
  ).toBeVisible();
  await expect(user.page.getByRole("tab", { name: "Agents", exact: true })).toHaveCount(0);
});
