import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
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
  await editor.getByRole("button", { name: /^Harness & model:/ }).click();
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { selected: true })).toHaveCount(1);
  await page.getByPlaceholder("Search models…", { exact: true }).press("ArrowDown");
  await expect(page.getByRole("option", { selected: true })).toHaveCount(1);
  await page.keyboard.press("Escape");
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
  await expect(editor.getByRole("tablist")).toHaveAttribute("data-variant", "line");
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
  await expect(editor.getByRole("tab", { name: "Workspace access", exact: true })).toHaveCount(0);
  await expect(editor.locator("footer")).toContainText("Personal agent");
  await editor.getByRole("tab", { name: "Instructions", exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "Instructions", exact: true })).toHaveValue(
    "Cite the source for each finding.",
  );
  await editor.getByRole("button", { name: /^Harness & model:/ }).click();
  await expect(page.getByRole("button", { name: "Favorites", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Favorite / })).toHaveCount(0);
  await page.getByRole("button", { name: "Claude Code", exact: true }).click();
  await page.getByPlaceholder("Search models…", { exact: true }).fill("claude-custom-model");
  await page.getByRole("option", { name: /Use .*claude-custom-model/ }).click();
  await expect(editor.getByRole("button", { name: /^Harness & model:/ })).toContainText(
    "claude-custom-model",
  );
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    Object.assign(window, {
      releaseAgentSave: () => {
        window.fetch = originalFetch;
        release();
      },
    });
    Object.assign(window, {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (new URL(url, location.href).pathname === "/api/v1/agents/actors/save") await gate;
        return originalFetch(input, init);
      },
    });
  });
  const save = editor.getByRole("button", { name: "Save agent", exact: true });
  try {
    await save.click();
    await expect(save).toHaveAttribute("aria-busy", "true");
    await expect(save).toBeDisabled();
    await expect(save.locator('[data-slot="spinner"]')).toBeVisible();
    await expect(save).toHaveText("Save agent");
  } finally {
    await page.evaluate(() => {
      // SAFETY: The request gate above installs this callback before Save is clicked.
      const windowWithGate = window as typeof window & { releaseAgentSave?: () => void };
      windowWithGate.releaseAgentSave?.();
      delete windowWithGate.releaseAgentSave;
    });
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

test("personal agents follow their owner across workspaces and reject another user's updates", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  await page.goto(new URL("/settings/user/agents", desktop.rendererOrigin).href);
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Create agent", exact: true });
  await create.getByLabel("Agent name", { exact: true }).fill("Project researcher");
  await create.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(create).toBeHidden();
  await page.getByRole("button", { name: "Edit Project researcher", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit agent", exact: true });
  await expect(editor.getByRole("tab", { name: "Workspace access", exact: true })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Grant access", exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  const catalog = async () =>
    page.evaluate(async () => (await fetch("/api/v1/agents/list", { method: "POST" })).json());
  const original = await catalog();
  expect(original.success).toBe(true);
  expect(original.data.agents).toHaveLength(1);
  const agent = original.data.agents[0];
  await desktop.openPath("/organizations");
  await page.getByLabel("Workspace name", { exact: true }).fill("Research workspace");
  await page.getByLabel("Workspace slug", { exact: true }).fill(`research-${desktop.suffix}`);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Research workspace ▾", exact: true }),
  ).toBeVisible();
  await desktop.openPath("/settings/user/agents");
  await page.getByRole("button", { name: "Edit Project researcher", exact: true }).click();
  await expect(editor.getByLabel("Agent name", { exact: true })).toHaveValue("Project researcher");
  await expect(editor.getByRole("tab", { name: "Workspace access", exact: true })).toHaveCount(0);

  await provisionVerifiedAccount(desktop.browser, desktop.mailpit, desktop.member);
  const headers = { origin: new URL(desktop.browser.url()).origin };
  const other = await desktop.browser.request.post("/api/v1/agents/list");
  expect(other.ok()).toBe(true);
  expect(await other.json()).toEqual({ success: true, data: { agents: [] } });
  for (const [path, data] of [
    [
      "save",
      {
        id: agent.id,
        name: "Unauthorized edit",
        instructions: "",
        harness: "opencode",
        enabled: true,
      },
    ],
    ["delete", { id: agent.id }],
  ] as const) {
    const denied = await desktop.browser.request.post(`/api/v1/agents/actors/${path}`, {
      headers,
      data,
    });
    expect(denied.status()).toBe(404);
    expect(await denied.json()).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  }
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Edit Project researcher", exact: true }),
  ).toBeVisible();
  expect(await catalog()).toEqual(original);
});

test("agent creator and model picker fit desktop and narrow windows", async ({ desktop }) => {
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
    for (const tab of ["Instructions", "Skills", "MCP servers"]) {
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
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
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
