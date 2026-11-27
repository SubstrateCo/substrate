import { decodeAvatarCode } from "@substrate/agent-avatars/config";

import { createAgent } from "../test-support/agent-work";
import { test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { expect } from "@playwright/test";
import { z } from "zod";

const savedCatalog = z.object({
  data: z.object({ agents: z.array(z.object({ id: z.string(), avatar: z.string() })) }),
});

test("agent settings keep their controls within the sheet at desktop and narrow widths", async ({
  account,
  client,
}) => {
  const agent = await createAgent(account, "Release helper");
  const routine = await account.request.post("/api/v1/agent-work/routines", {
    data: {
      organizationId: account.organizationId,
      agentId: agent.id,
      name: "Morning brief",
      prompt: "Summarize open work.",
      cron: "0 9 * * 1-5",
      timezone: "UTC",
      enabled: true,
      destination: null,
    },
  });
  expect(routine.ok()).toBe(true);
  const user = await client(account);
  await visit(user, undefined, "/agents", { agentId: agent.id, settings: "overview" });
  const sheet = user.page.getByRole("dialog", { name: "Agent settings", exact: true });
  await expect(sheet.getByLabel("Agent name", { exact: true })).toHaveValue(agent.name);
  for (const width of [1440, 390]) {
    await user.page.setViewportSize({ width, height: 900 });
    // Switching between modal and desktop sheet layouts remounts the content.
    await user.page.reload();
    await expect(sheet.getByLabel("Agent name", { exact: true })).toHaveValue(agent.name);
    for (const control of [
      sheet.getByLabel("Agent name", { exact: true }),
      sheet.getByRole("button", { name: /^Model:/ }),
      sheet.getByRole("radio", { name: "Hexagon", exact: true }),
      sheet.getByRole("radio", { name: "Cloud", exact: true }),
      sheet.getByRole("switch", { name: "Enabled", exact: true }),
      sheet.getByRole("switch", { name: "Run Morning brief on schedule", exact: true }),
      sheet.getByRole("button", { name: /Skills/ }),
      sheet.getByRole("button", { name: /MCP servers/ }),
    ]) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeVisible();
      const bounds = await control.boundingBox();
      const frame = await sheet.boundingBox();
      expect(bounds).not.toBeNull();
      expect(frame).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(frame!.x);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(frame!.x + frame!.width);
    }
    const name = await sheet.getByLabel("Agent name", { exact: true }).boundingBox();
    const model = await sheet.getByRole("button", { name: /^Model:/ }).boundingBox();
    expect(name).not.toBeNull();
    expect(model).not.toBeNull();
    expect(model!.y).toBeGreaterThan(name!.y + name!.height);
    const enabled = await sheet.getByRole("switch", { name: "Enabled", exact: true }).boundingBox();
    const scheduled = await sheet
      .getByRole("switch", { name: "Run Morning brief on schedule", exact: true })
      .boundingBox();
    expect(enabled).not.toBeNull();
    expect(scheduled).not.toBeNull();
    expect(
      Math.abs(enabled!.x + enabled!.width - scheduled!.x - scheduled!.width),
    ).toBeLessThanOrEqual(2);
    const routineIcon = await sheet
      .getByRole("list", { name: "Routines that need you and the next runs", exact: true })
      .locator('[data-slot="item-media"]')
      .first()
      .boundingBox();
    const toolIcon = await sheet
      .getByRole("button", { name: /Skills/ })
      .locator('[data-slot="item-media"]')
      .boundingBox();
    expect(routineIcon).not.toBeNull();
    expect(toolIcon).not.toBeNull();
    expect(Math.abs(routineIcon!.x - toolIcon!.x)).toBeLessThanOrEqual(2);
    await sheet.getByRole("button", { name: "Manage routines", exact: true }).click();
    const search = await sheet
      .getByRole("searchbox", { name: "Search routines", exact: true })
      .boundingBox();
    const add = await sheet.getByRole("button", { name: "New routine", exact: true }).boundingBox();
    expect(search).not.toBeNull();
    expect(add).not.toBeNull();
    expect(Math.abs(search!.y + search!.height / 2 - add!.y - add!.height / 2)).toBeLessThanOrEqual(
      2,
    );
    await sheet.getByRole("button", { name: "Back to settings", exact: true }).click();
  }
});

test("an agent's shape and colour save at once and stay after reload", async ({
  account,
  client,
}) => {
  const agent = await createAgent(account, "Release helper");
  const user = await client(account);
  await visit(user, undefined, "/agents", { agentId: agent.id, settings: "overview" });
  const sheet = user.page.getByRole("dialog", { name: "Agent settings", exact: true });
  const bodies = sheet.getByRole("group", { name: "Shape", exact: true });
  const colours = sheet.getByRole("group", { name: "Colour", exact: true });
  // The generated look already holds one shape and one colour; pick others.
  await expect(bodies.getByRole("radio", { checked: true })).toHaveCount(1);
  await expect(colours.getByRole("radio", { checked: true })).toHaveCount(1);
  const body = bodies.getByRole("radio", { checked: false }).first();
  const colour = colours.getByRole("radio", { checked: false }).first();
  const bodyName = await body.getAttribute("aria-label");
  const colourName = await colour.getAttribute("aria-label");
  expect(bodyName).toBeTruthy();
  expect(colourName).toBeTruthy();
  const saved = (choice: Promise<unknown>) =>
    Promise.all([
      user.page.waitForResponse(
        (response) => response.url().endsWith("/api/v1/agents/actors/avatar") && response.ok(),
      ),
      choice,
    ]);
  await saved(body.click());
  await saved(colour.click());
  await colours.scrollIntoViewIfNeeded();
  await captureScreenshot(user.page, "agent-appearance-light");
  await user.page.emulateMedia({ colorScheme: "dark" });
  await captureScreenshot(user.page, "agent-appearance-dark");
  await user.page.reload();
  await expect(bodies.getByRole("radio", { name: bodyName!, exact: true })).toBeChecked();
  await expect(colours.getByRole("radio", { name: colourName!, exact: true })).toBeChecked();
  const catalog = await account.request.post("/api/v1/agents/list", { data: {} });
  expect(catalog.ok()).toBe(true);
  const { data } = savedCatalog.parse(await catalog.json());
  const look = decodeAvatarCode(data.agents.find((item) => item.id === agent.id)?.avatar ?? "");
  expect(look?.body).toBe(bodyName!.toLowerCase());
  expect(look?.color).toBe(colourName!.toLowerCase());
});

test("a weekly routine saves its schedule and reopens with the same fields", async ({
  account,
  client,
}) => {
  const agent = await createAgent(account, "Release helper");
  const user = await client(account);
  await visit(user, undefined, "/agents", { agentId: agent.id, settings: "routines" });
  await user.page.getByRole("button", { name: "New routine", exact: true }).click();
  const editor = user.page.getByRole("dialog", { name: "New routine", exact: true });
  await editor.getByRole("textbox", { name: "Name", exact: true }).fill("Design digest");
  await editor
    .getByRole("textbox", { name: "What should it do?", exact: true })
    .fill("Summarize design reviews.");
  await editor.getByRole("radio", { name: "Weekly", exact: true }).click();
  await editor.getByRole("combobox", { name: "On", exact: true }).click();
  await user.page.getByRole("option", { name: "Wednesday", exact: true }).click();
  await editor.getByRole("combobox", { name: "At", exact: true }).click();
  await user.page.getByRole("option", { name: "10:30 AM", exact: true }).click();
  const time = await editor.getByRole("combobox", { name: "At", exact: true }).boundingBox();
  const zone = await editor.getByRole("combobox", { name: "Time zone", exact: true }).boundingBox();
  expect(time).not.toBeNull();
  expect(zone).not.toBeNull();
  expect(time!.y).toBe(zone!.y);
  await editor.getByRole("button", { name: "Create routine", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await user.page.reload();
  const sheet = user.page.getByRole("dialog", { name: "Agent settings", exact: true });
  await sheet
    .getByRole("searchbox", { name: "Search routines", exact: true })
    .fill("Design digest");
  await expect(sheet.getByText("Every Wednesday at 10:30 AM", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Edit Design digest", exact: true }).click();
  const saved = user.page.getByRole("dialog", { name: "Edit Design digest", exact: true });
  await expect(saved.getByRole("textbox", { name: "What should it do?", exact: true })).toHaveValue(
    "Summarize design reviews.",
  );
  await expect(saved.getByRole("combobox", { name: "On", exact: true })).toHaveText("Wednesday");
  await expect(saved.getByRole("combobox", { name: "At", exact: true })).toHaveText("10:30 AM");
});
