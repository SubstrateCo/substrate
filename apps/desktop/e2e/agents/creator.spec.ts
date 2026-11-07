import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { provisionWorkspaceSession } from "../../../web/e2e/test-support/organizations.js";
import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

type ModelPickerProbe = {
  calls: { method: string; harness?: string }[];
  requests: string[];
};

test("model picker loads only needed native catalogs across search, refresh and workspaces", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  await page.goto(new URL("/settings/user/agents", desktop.rendererOrigin).href);
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Create agent", exact: true });
  await desktop.app.evaluate(({ ipcMain }) => {
    const { channel } = process.getBuiltinModule("node:diagnostics_channel");
    const probe: ModelPickerProbe = { calls: [], requests: [] };
    Object.assign(globalThis, { modelPickerProbe: probe });
    // SAFETY: Electron stores invoke handlers here; main registers this channel before opening its window.
    const handlers = (
      ipcMain as typeof ipcMain & {
        _invokeHandlers: Map<
          string,
          (
            event: Electron.IpcMainInvokeEvent,
            method: string,
            value?: { harness?: string },
            // oxlint-disable-next-line deslop/no-unknown-returns -- The observer forwards the native payload unchanged, without interpreting it.
          ) => Promise<unknown>
        >;
      }
    )._invokeHandlers;
    const original = handlers.get("startup-os:harness")!;
    handlers.set("startup-os:harness", (event, method, value) => {
      if (method === "synchronize" || method === "listModels")
        probe.calls.push({ method, harness: value?.harness });
      return original(event, method, value);
    });
    channel("undici:request:create").subscribe((message) => {
      // SAFETY: undici:request:create publishes a request with its path, not response or credential data.
      const { request } = message as { request: { path: string } };
      const path = request.path.split("?")[0]!;
      if (
        [
          "/api/v1/session",
          "/api/auth/organization/get-active-member-role",
          "/api/v1/agents/list",
        ].includes(path)
      )
        probe.requests.push(path);
    });
  });
  const probe = () =>
    desktop.app.evaluate(() => {
      // SAFETY: The setup evaluate above installs this probe before any read.
      const state = (globalThis as typeof globalThis & { modelPickerProbe: ModelPickerProbe })
        .modelPickerProbe;
      return { calls: state.calls.splice(0), requests: state.requests.splice(0) };
    });
  const refresh = page.getByRole("button", { name: "Refresh models", exact: true });
  const check = async (harnesses: string[]) => {
    if (harnesses.length)
      await expect
        .poll(
          () =>
            desktop.app.evaluate(() => {
              // SAFETY: The setup evaluate above installs this probe before any read.
              const state = (
                globalThis as typeof globalThis & { modelPickerProbe: ModelPickerProbe }
              ).modelPickerProbe;
              return state.calls.filter((call) => call.method === "listModels").length;
            }),
          { timeout: 60_000 },
        )
        .toBe(harnesses.length);
    await expect(refresh).toBeEnabled({ timeout: 60_000 });
    const result = await probe();
    console.log("model picker measured", {
      harnesses,
      ipc: result.calls.length,
      http: result.requests.length,
    });
    expect(
      result.calls
        .filter((call) => call.method === "listModels")
        .map((call) => call.harness)
        .sort((a, b) => (a ?? "").localeCompare(b ?? "")),
    ).toEqual([...harnesses].sort((a, b) => a.localeCompare(b)));
    expect(result.calls.filter((call) => call.method === "synchronize")).toHaveLength(
      harnesses.length,
    );
    expect(result.requests).toHaveLength(harnesses.length * 7);
  };
  const open = () => editor.getByRole("button", { name: /^Harness & model:/ }).click();
  await open();
  await check(["opencode"]);
  await page.getByRole("button", { name: "Claude Code", exact: true }).click();
  await check(["claude"]);
  await page.getByRole("button", { name: "OpenCode", exact: true }).click();
  await check([]);
  const search = page.getByPlaceholder("Search models…", { exact: true });
  await search.fill("   ");
  await check([]);
  await search.fill("model");
  await check(["codex", "antigravity"]);
  await refresh.click();
  await check(["opencode", "claude", "codex", "antigravity"]);
  await search.fill("");
  await refresh.click();
  await check(["opencode"]);
  await page.keyboard.press("Escape");
  await open();
  await check([]);
  await page.keyboard.press("Escape");
  await page.clock.setFixedTime(new Date(Date.now() + 61_000));
  await open();
  await check(["opencode"]);
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await desktop.openPath("/organizations");
  await page.getByLabel("Workspace name", { exact: true }).fill("Catalog workspace");
  await page.getByLabel("Workspace slug", { exact: true }).fill(`catalog-${desktop.suffix}`);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Catalog workspace ▾", exact: true }),
  ).toBeVisible();
  await desktop.openPath("/settings/user/agents");
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await probe();
  await open();
  await check(["opencode"]);
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await desktop.signout();
  await provisionVerifiedAccount(desktop.browser, desktop.mailpit, desktop.member);
  await provisionWorkspaceSession(
    desktop.browser.request,
    "Other account",
    `account-${desktop.suffix}`,
  );
  await desktop.authorize();
  await desktop.openPath("/settings/user/agents");
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await probe();
  await open();
  await check(["opencode"]);
});

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
  await editor.getByRole("button", { name: "Edit source-check", exact: true }).click();
  const editingSkill = page.getByRole("dialog", { name: "Edit skill", exact: true });
  await expect(editingSkill.getByLabel("Skill content", { exact: true })).toHaveValue(
    "Prefer primary sources.",
  );
  await editingSkill.getByLabel("Description", { exact: true }).fill("Updated source policy.");
  await editingSkill.getByRole("button", { name: "Save skill", exact: true }).click();
  await expect(editor.getByRole("tabpanel")).toContainText("Updated source policy.");
  await editor.getByRole("tab", { name: "MCP servers", exact: true }).click();
  await expect(editor.getByRole("tabpanel")).toContainText("hello_world");
  await expect(editor.getByRole("tabpanel")).toContainText("research-tools");
  await expect(editor.getByRole("tabpanel")).not.toContainText("source-check");
  await expect(editor.locator("footer")).toContainText("Personal agent");
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
  await saved.getByLabel("Agent name", { exact: true }).fill("Discarded agent draft");
  await saved.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Discarded agent draft", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Delete Research partner", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete Research partner?", exact: true });
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Research partner", exact: true }),
  ).toBeVisible();
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
  const editor = page.getByRole("dialog", { name: "Edit agent", exact: true });
  await expect(editor.getByLabel("Agent name", { exact: true })).toHaveValue("Project researcher");

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

test(
  "agent creator and model picker fit desktop and narrow windows",
  { tag: "@layout" },
  async ({ desktop }) => {
    test.setTimeout(120_000);
    await desktop.provision();
    const page = desktop.page;
    await page.goto(new URL("/settings/user/agents", desktop.rendererOrigin).href);
    await page.getByRole("button", { name: "Create agent", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Create agent", exact: true });
    await editor.getByLabel("Agent name", { exact: true }).fill("Responsive researcher");
    for (const size of [
      { width: 1024, height: 768 },
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
      const search = page.getByPlaceholder("Search models…", { exact: true });
      await expect(search).toBeVisible();
      await search.fill("anthropic/claude-sonnet");
      await page.getByRole("option").filter({ hasText: "anthropic/claude-sonnet" }).click();
      await expect(editor.getByRole("button", { name: /^Harness & model:/ })).toContainText(
        "anthropic/claude-sonnet",
      );
      await editor.getByRole("tab", { name: "Instructions", exact: true }).click();
    }
  },
);
import type {} from "@startup-os/contracts/harness/desktop";
