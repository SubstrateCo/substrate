import type { HarnessAPI } from "@startup-os/contracts/harness/desktop";

import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

test("the embedded MCP serves hello_world in Electron and revokes access", async ({ desktop }) => {
  const result = await desktop.app.evaluate(
    async (_electron, source) => {
      const { createRequire } = process.getBuiltinModule("node:module");
      const require = createRequire(source);
      const { createStartupMcp } = require(source);
      const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
      const {
        StreamableHTTPClientTransport,
      } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
      const host = await createStartupMcp();
      const lease = host.issue("org-a", "agent-a");
      const client = new Client({ name: "electron-mcp-test", version: "1.0.0" });
      try {
        await client.connect(
          new StreamableHTTPClientTransport(new URL(lease.url), {
            requestInit: { headers: { Authorization: `Bearer ${lease.token}` } },
          }),
        );
        const tools = await client.listTools();
        const greeting = await client.callTool({ name: "hello_world", arguments: {} });
        lease.revoke();
        const revoked = await fetch(lease.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${lease.token}` },
          body: "{}",
        });
        return {
          tools: tools.tools.map((tool: { name: string }) => tool.name),
          content: greeting.content,
          revoked: revoked.status,
        };
      } finally {
        await client.close();
        await host.close();
      }
    },
    fileURLToPath(new URL("../../../../packages/harness-runtime/src/mcp.ts", import.meta.url)),
  );
  expect(result).toEqual({
    tools: ["hello_world"],
    content: [{ type: "text", text: "Hello, world!" }],
    revoked: 401,
  });
});

test("user agents and device-local configuration survive reload and restart in Electron", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  await desktop.page.goto(new URL("/settings/user/agents", desktop.rendererOrigin).href);
  const page = desktop.page;

  await page.getByRole("button", { name: "Create skill", exact: true }).click();
  const skill = page.getByRole("dialog", { name: "Create skill", exact: true });
  await skill.getByLabel("Skill name", { exact: true }).fill("review-customer-context");
  await skill
    .getByLabel("Description", { exact: true })
    .fill("Check the available source context.");
  await skill
    .getByLabel("Skill content", { exact: true })
    .fill(
      "Read the supplied context. State which facts are missing before making a recommendation.",
    );
  await skill.getByRole("button", { name: "Save skill", exact: true }).click();
  await expect(skill).toBeHidden();

  const organizationId = await page.evaluate(async () => {
    const result: { data: { session: { activeOrganizationId: string } } } = await (
      await fetch("/api/v1/session")
    ).json();
    return result.data.session.activeOrganizationId;
  });
  const nativeSkill = await desktop.app.evaluate(async ({ app }, orgId) => {
    const fs = process.getBuiltinModule("node:fs/promises");
    const path = process.getBuiltinModule("node:path");
    const accounts = path.join(app.getPath("userData"), "accounts");
    const roots = await fs.readdir(accounts);
    if (roots.length !== 1) throw new Error("The desktop test must have exactly one account root.");
    const root = path.join(accounts, roots[0]!, "orgs", orgId);
    const sqlite = process.getBuiltinModule("node:sqlite");
    const metadata = new sqlite.DatabaseSync(
      path.join(accounts, roots[0]!, ".startup-os", "harness-metadata.sqlite"),
      { readOnly: true },
    );
    let migrations;
    try {
      migrations = metadata
        .prepare("SELECT count(*) AS count FROM __drizzle_migrations")
        .get()?.count;
    } finally {
      metadata.close();
    }
    const external = path.join(root, ".opencode", "skills", "native-file-skill");
    await fs.mkdir(external, { recursive: true });
    await fs.writeFile(
      path.join(external, "SKILL.md"),
      "---\nname: native-file-skill\ndescription: Added outside the settings UI.\n---\n\nUse native context.\n",
    );
    return {
      migrations,
      entries: await fs.readdir(root),
      content: await fs.readFile(
        path.join(root, ".opencode", "skills", "review-customer-context", "SKILL.md"),
        "utf8",
      ),
    };
  }, organizationId);
  expect(nativeSkill.migrations).toBeGreaterThan(0);
  expect(nativeSkill.entries).not.toContain("workspace");
  expect(nativeSkill.content).toContain("State which facts are missing");
  await page.getByRole("button", { name: "Scan local configuration", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit native-file-skill", exact: true }),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: "Add MCP server", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  const agent = page.getByRole("dialog", { name: "Create agent", exact: true });
  await agent.getByLabel("Agent name", { exact: true }).fill("Customer reviewer");
  await agent.getByRole("button", { name: /^Harness & model:/ }).click();
  for (const harness of ["OpenCode", "Antigravity", "Claude Code", "Codex"]) {
    await expect(page.getByRole("button", { name: harness, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Claude Code", exact: true }).click();
  await page.getByRole("option", { name: "Harness default", exact: true }).click();
  await agent
    .getByRole("textbox", { name: "Instructions", exact: true })
    .fill("Review customer requests carefully.");
  await agent.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(agent).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Edit review-customer-context", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Customer reviewer", exact: true }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Edit Customer reviewer", exact: true }).click();
  const editing = page.getByRole("dialog", { name: "Edit agent", exact: true });
  await expect(editing.getByRole("button", { name: /^Harness & model:/ })).toContainText(
    "Claude Code",
  );
  await expect(editing.getByRole("textbox", { name: "Instructions", exact: true })).toHaveValue(
    "Review customer requests carefully.",
  );
  const pictureBytes = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#2563eb";
    context.fillRect(0, 0, 128, 128);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const picture = editing.getByRole("region", { name: "Profile picture", exact: true });
  await picture.locator('input[type="file"]').setInputFiles({
    name: "agent-avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(pictureBytes, "base64"),
  });
  const crop = page.getByRole("dialog", { name: "Edit profile picture", exact: true });
  await crop.getByRole("button", { name: "Save picture", exact: true }).click();
  await expect(crop).toBeHidden();
  await expect(picture.getByRole("img", { name: "Profile picture", exact: true })).toBeVisible();
  await editing.getByLabel("Agent name", { exact: true }).fill("Updated reviewer");
  await editing.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(editing).toBeHidden();

  await desktop.restart();
  await desktop.page.goto(new URL("/settings/user/agents", desktop.rendererOrigin).href);
  await expect(
    desktop.page.getByRole("button", { name: "Edit Updated reviewer", exact: true }),
  ).toBeVisible();
  await expect(
    desktop.page.getByRole("button", { name: "Edit review-customer-context", exact: true }),
  ).toBeVisible();
  await desktop.page.getByRole("button", { name: "Edit Updated reviewer", exact: true }).click();
  const savedAgent = desktop.page.getByRole("dialog", { name: "Edit agent", exact: true });
  const savedPicture = savedAgent.getByRole("region", { name: "Profile picture", exact: true });
  await expect(
    savedPicture.getByRole("img", { name: "Profile picture", exact: true }),
  ).toBeVisible();
  await savedPicture.getByRole("button", { name: "Remove picture", exact: true }).click();
  await expect(savedPicture.getByRole("img", { name: "Profile picture", exact: true })).toHaveCount(
    0,
  );
  await savedAgent.getByRole("button", { name: "Cancel", exact: true }).click();
  for (const name of ["Updated reviewer", "review-customer-context", "native-file-skill"]) {
    await desktop.page.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
    const confirmation = desktop.page.getByRole("dialog", { name: `Delete ${name}?`, exact: true });
    await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(
      desktop.page.getByRole("button", { name: `Edit ${name}`, exact: true }),
    ).toHaveCount(0);
  }
  await desktop.page.reload();
  await expect(
    desktop.page.getByRole("button", { name: "Create agent", exact: true }),
  ).toBeVisible();
  await expect(
    desktop.page.getByRole("button", { name: "Edit Updated reviewer", exact: true }),
  ).toHaveCount(0);
  await desktop.signout();
  const signedOutScan = await desktop.page.evaluate(async () => {
    const bridge: HarnessAPI | undefined = window.startupOSHarness;
    if (!bridge)
      throw new Error("The desktop harness bridge must remain available on sign-in pages.");
    try {
      await bridge.scanConfiguration({ harness: "opencode" });
      return "allowed";
    } catch {
      return "denied";
    }
  });
  expect(signedOutScan).toBe("denied");
});
