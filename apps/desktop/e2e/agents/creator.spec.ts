import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("the Electron picker displays and saves a model from the native OpenCode catalog", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  const catalog = await page.evaluate(async () => {
    await window.startupOSHarness!.synchronize();
    return window.startupOSHarness!.listModels({ harness: "opencode" });
  });
  test.skip(
    catalog.status !== "ready" || !catalog.models.length,
    "An installed OpenCode with available models is required.",
  );
  const model = catalog.models[0]!;
  await page.goto(new URL("/settings/user/agents", desktop.rendererOrigin).href);
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Create agent", exact: true });
  await editor.getByLabel("Agent name", { exact: true }).fill("Native model agent");
  await editor.getByRole("button", { name: /^Harness & model:/ }).click();
  await page.getByPlaceholder("Search models…", { exact: true }).fill(model.id);
  const row = page.getByRole("option", { name: model.name, exact: true });
  await expect(row).toBeVisible({ timeout: 60_000 });
  if (model.provider) await expect(row).toContainText(model.provider);
  await row.click();
  await expect(editor.getByRole("button", { name: /^Harness & model:/ })).toContainText(model.name);
  await editor.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(editor).toBeHidden();
  const savedModel = await page.evaluate(async () => {
    const result = await (
      await fetch("/api/v1/agents/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).json();
    return result.data.agents.find(
      (agent: { name: string; model?: string }) => agent.name === "Native model agent",
    )?.model;
  });
  expect(savedModel).toBe(model.id);
});

test("agent creator keeps drafts across tabs and persists its harness and model", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  await page.goto(new URL("/settings/user/agents", desktop.rendererOrigin).href);
  await page.evaluate(async () => {
    const bridge = window.startupOSHarness!;
    await bridge.synchronize();
    await bridge.saveMcpServer({
      harness: "opencode",
      id: "research-tools",
      name: "Research tools",
      transport: "http",
      url: "https://example.test/mcp",
    });
  });
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Create agent", exact: true });
  await editor.getByLabel("Agent name", { exact: true }).fill("Research partner");
  await editor
    .getByRole("textbox", { name: "Instructions", exact: true })
    .fill("Cite the source for each finding.");
  await editor.getByRole("tab", { name: "Skills", exact: true }).click();
  await expect(editor.getByRole("tabpanel")).toContainText("Startup OS");
  await expect(editor.getByRole("tabpanel")).not.toContainText("hello_world");
  await editor.getByRole("button", { name: "Create skill", exact: true }).click();
  const skill = page.getByRole("dialog", { name: "Create skill", exact: true });
  await skill.getByLabel("Skill name", { exact: true }).fill("source-check");
  await skill.getByLabel("Description", { exact: true }).fill("Verify research sources.");
  await skill.getByLabel("Skill content", { exact: true }).fill("Prefer primary sources.");
  await skill.getByRole("button", { name: "Save skill", exact: true }).click();
  await expect(skill).toBeHidden();
  await expect(
    editor.getByRole("button", { name: "Edit source-check", exact: true }),
  ).toBeVisible();
  await editor.getByRole("tab", { name: "MCP servers", exact: true }).click();
  await expect(editor.getByRole("tabpanel")).toContainText("hello_world");
  await expect(editor.getByRole("tabpanel")).toContainText("research-tools");
  await expect(editor.getByRole("tabpanel")).not.toContainText("source-check");
  await editor.getByRole("tab", { name: "Workspace access", exact: true }).click();
  await expect(editor.getByRole("tabpanel")).toContainText("Save the agent to manage access.");
  await editor.getByRole("tab", { name: "Instructions", exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "Instructions", exact: true })).toHaveValue(
    "Cite the source for each finding.",
  );
  await editor.getByRole("button", { name: /^Harness & model:/ }).click();
  await page.getByRole("button", { name: "Claude Code", exact: true }).click();
  await page.getByPlaceholder("Search models…", { exact: true }).fill("claude-custom-model");
  await page.getByRole("option", { name: /Use .*claude-custom-model/ }).click();
  await expect(editor.getByRole("button", { name: /^Harness & model:/ })).toContainText(
    "claude-custom-model",
  );
  let releaseSave: () => void = () => {};
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/api/v1/agents/actors/save", async (route) => {
    await saveGate;
    await route.continue();
  });
  const save = editor.getByRole("button", { name: "Save agent", exact: true });
  try {
    await save.click();
    await expect(save).toHaveAttribute("aria-busy", "true");
    await expect(save).toBeDisabled();
    await expect(save.locator('[data-slot="spinner"]')).toBeVisible();
    await expect(save).toHaveText("Save agent");
  } finally {
    releaseSave();
  }
  await expect(editor).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "Edit Research partner", exact: true }).click();
  const saved = page.getByRole("dialog", { name: "Edit agent", exact: true });
  await expect(saved.getByRole("button", { name: /^Harness & model:/ })).toContainText(
    "Claude Code",
  );
  await expect(saved.getByRole("button", { name: /^Harness & model:/ })).toContainText(
    "claude-custom-model",
  );
});

test("agent project access requires review and persists grants and revocation", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  await page.evaluate(async () => {
    const session = await (await fetch("/api/v1/session")).json();
    const response = await fetch("/api/v1/tasks/mutations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "createProject",
        organizationId: session.data.session.activeOrganizationId,
        name: "Product launch",
      }),
    });
    if (!response.ok) throw new Error("Could not provision the test project.");
  });
  await page.goto(new URL("/settings/user/agents", desktop.rendererOrigin).href);
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Create agent", exact: true });
  await create.getByLabel("Agent name", { exact: true }).fill("Project researcher");
  await create.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(create).toBeHidden();
  await page.getByRole("button", { name: "Edit Project researcher", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit agent", exact: true });
  await editor.getByRole("tab", { name: "Workspace access", exact: true }).click();
  await editor.getByRole("button", { name: "Grant access", exact: true }).click();
  const grant = page.getByRole("dialog", { name: "Grant workspace access", exact: true });
  await grant.getByRole("button", { name: "Review access", exact: true }).click();
  await expect(
    grant.getByRole("region", { name: "Access change review", exact: true }),
  ).toContainText("every task, subtask, and comment");
  await grant.getByRole("button", { name: "Confirm access", exact: true }).click();
  await expect(grant).toBeHidden();
  await expect(editor.getByRole("link", { name: "Product launch", exact: true })).toBeVisible();
  await expect(editor.getByRole("tabpanel")).toContainText("Direct · view");
  await page.reload();
  await page.getByRole("button", { name: "Edit Project researcher", exact: true }).click();
  await editor.getByRole("tab", { name: "Workspace access", exact: true }).click();
  await expect(editor.getByRole("tabpanel")).toContainText("Direct · view");
  await editor.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(editor.getByRole("tabpanel")).toContainText("No project grants.");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit Project researcher", exact: true }).click();
  await editor.getByRole("tab", { name: "Workspace access", exact: true }).click();
  await expect(editor.getByRole("tabpanel")).toContainText("No project grants.");
});

test("agent creator and model picker fit desktop and narrow windows", async ({
  desktop,
}, testInfo) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  await page.goto(new URL("/settings/user/agents", desktop.rendererOrigin).href);
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Create agent", exact: true });
  await editor.getByLabel("Agent name", { exact: true }).fill("Responsive researcher");
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 600 },
    { width: 375, height: 812 },
    { width: 320, height: 568 },
  ]) {
    await desktop.app.evaluate(({ BrowserWindow }, dimensions) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setMinimumSize(320, 200);
      window.setContentSize(dimensions.width, dimensions.height);
    }, size);
    await expect
      .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      .toEqual(size);
    for (const tab of ["Instructions", "Skills", "MCP servers", "Workspace access"]) {
      await editor.getByRole("tab", { name: tab, exact: true }).click();
      await expect
        .poll(() =>
          editor.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return (
              box.left >= 0 &&
              box.top >= 0 &&
              box.right <= innerWidth &&
              box.bottom <= innerHeight &&
              element.scrollWidth <= element.clientWidth + 1
            );
          }),
        )
        .toBe(true);
      await expect(
        editor.getByRole("button", { name: "Save agent", exact: true }),
      ).toBeInViewport();
      const bodyBounds = await editor
        .getByRole("region", { name: "Agent configuration", exact: true })
        .boundingBox();
      const footerBounds = await editor.locator("footer").boundingBox();
      expect(bodyBounds).not.toBeNull();
      expect(footerBounds).not.toBeNull();
      expect(bodyBounds!.y + bodyBounds!.height).toBeLessThanOrEqual(footerBounds!.y + 1);
      await page.screenshot({
        path: testInfo.outputPath(`${size.width}-${size.height}-${tab.replaceAll(" ", "-")}.png`),
        animations: "disabled",
      });
    }
    await editor.getByRole("button", { name: /^Harness & model:/ }).click();
    const picker = page.getByRole("dialog", { name: "Harness and model picker", exact: true });
    await expect(picker.getByRole("status", { name: "Loading models", exact: true })).toBeHidden({
      timeout: 60_000,
    });
    await expect
      .poll(() =>
        picker.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.left >= 0 &&
            box.top >= 0 &&
            box.right <= innerWidth &&
            box.bottom <= innerHeight &&
            element.scrollWidth <= element.clientWidth + 1
          );
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${size.width}-${size.height}-model-picker.png`),
      animations: "disabled",
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.screenshot({
      path: testInfo.outputPath(`${size.width}-${size.height}-model-picker-dark.png`),
      animations: "disabled",
    });
    await page.emulateMedia({ colorScheme: "light" });
    const search = page.getByPlaceholder("Search models…", { exact: true });
    await expect(search).toBeVisible();
    await search.fill("anthropic/claude-sonnet");
    await page.getByRole("option").filter({ hasText: "anthropic/claude-sonnet" }).click();
    await expect(editor.getByRole("button", { name: /^Harness & model:/ })).toContainText(
      "anthropic/claude-sonnet",
    );
    await editor.getByRole("tab", { name: "Instructions", exact: true }).click();
  }
});
import type {} from "@startup-os/contracts/harness/desktop";
