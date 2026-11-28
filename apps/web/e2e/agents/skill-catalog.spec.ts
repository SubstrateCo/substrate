import { startupSkills } from "@substrate/contracts/agent-tools";
import type { SkillPackages } from "@substrate/contracts/harness-runtime";
import type { HarnessAPI } from "@substrate/contracts/harness/ipc";

import { createAgent } from "../test-support/agent-work";
import { test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { expect } from "@playwright/test";

test("skills catalog searches through the backend and supports direct repository import", async ({
  account,
  client,
}) => {
  test.setTimeout(60_000);
  const agent = await createAgent(account, "Design partner");
  const user = await client(account);
  await visit(user, undefined, "/agents", { agentId: agent.id, settings: "skills" });
  const sheet = user.page.getByRole("dialog", { name: "Agent settings", exact: true });
  await expect(sheet.getByRole("heading", { name: "Catalog skills", exact: true })).toBeVisible();
  await sheet.getByRole("tab", { name: "Browse skills", exact: true }).click();
  const response = user.page.waitForResponse((reply) =>
    reply.url().endsWith("/api/v1/agents/skills/search"),
  );
  await sheet.getByRole("searchbox", { name: "Search skill catalog" }).fill("web-design");
  const searched = await response;
  expect(searched.ok(), await searched.text()).toBe(true);
  const results = sheet.getByRole("list", { name: "Skill search results" });
  await expect(results.getByRole("listitem").first()).toBeVisible();
  await captureScreenshot(user.page, "skills-catalog-search-desktop");
  await user.page.setViewportSize({ width: 390, height: 900 });
  await sheet.getByRole("tab", { name: "Browse skills", exact: true }).click();
  await sheet.getByRole("searchbox", { name: "Search skill catalog" }).fill("web-design");
  await expect(results.getByRole("listitem").first()).toBeVisible();
  await captureScreenshot(user.page, "skills-catalog-search-narrow");
  const input = sheet.getByRole("searchbox", { name: "Search skill catalog" });
  const bounds = await input.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await user.page.setViewportSize({ width: 1440, height: 900 });
  await sheet.getByRole("tab", { name: "Browse skills", exact: true }).click();
  await sheet.getByRole("textbox", { name: "GitHub repository" }).fill("vercel-labs/agent-skills");
  await sheet.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    sheet.getByText("Open this agent on its home desktop to preview and add skills."),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Add skill", exact: true })).toHaveCount(0);
});

test("catalog search does not retry a rate-limited request", async ({ account, client }) => {
  const agent = await createAgent(account, "Writing partner");
  const user = await client(account);
  let calls = 0;
  // A transport failure fixture, not a substitute catalog/backend workflow.
  await user.page.route("**/api/v1/agents/skills/search", async (route) => {
    calls++;
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": "60" },
      json: { success: false, error: { code: "RATE_LIMITED", message: "Slow down" } },
    });
  });
  await visit(user, undefined, "/agents", { agentId: agent.id, settings: "skills" });
  await user.page.getByRole("tab", { name: "Browse skills", exact: true }).click();
  await user.page.getByRole("searchbox", { name: "Search skill catalog" }).fill("writing");
  await expect(
    user.page.getByText("Search is paused to respect rate limits. Try again shortly."),
  ).toBeVisible();
  await user.page.getByRole("searchbox", { name: "Search skill catalog" }).fill("testing");
  await expect(
    user.page.getByText("Search is paused to respect rate limits. Try again shortly."),
  ).toBeVisible();
  expect(calls).toBe(1);
});

test("catalog settings show native package state and save an update frequency", async ({
  account,
  client,
}) => {
  const agent = await createAgent(account, "Design partner");
  const user = await client(account);
  await user.page.setExtraHTTPHeaders({ "x-substrate-installation": agent.installationId });
  // Browser-only native boundary fixture. Backend auth/catalog are real; native filesystem
  // and CLI behavior are covered separately by runtime tests and Electron smoke checks.
  await user.page.addInitScript(
    ({ organizationId, agentId, builtInSkills }) => {
      const packages: SkillPackages = {
        skills: [
          {
            name: "web-design-guidelines",
            source: "vercel-labs/agent-skills",
            description:
              "Review interfaces for accessibility, usability, and web design best practices.",
          },
          {
            name: "writing-guidelines",
            source: "vercel-labs/agent-skills",
            description: "Write clear, concise content with a consistent voice.",
          },
        ],
        updates: {
          frequency: "daily",
          lastAttemptAt: null,
          lastSuccessAt: null,
          error: null,
        },
      };
      const bridge = {
        synchronize: async () => ({ connected: true as const, organizationId }),
        scanConfiguration: async () => ({
          organizationId,
          agentId,
          harness: "opencode" as const,
          skills: [
            ...builtInSkills,
            {
              id: "team-writing-style",
              name: "team-writing-style",
              description: "Use our team's tone and terminology when drafting content.",
              content: "Write in short, direct sentences.",
            },
          ],
          mcpServers: [],
          workspace: null,
        }),
        scanSkillPackages: async () => structuredClone(packages),
        setSkillUpdateFrequency: async ({ frequency }) => {
          packages.updates.frequency = frequency;
        },
        updateSkillPackages: async () => {
          packages.updates.lastAttemptAt = Date.now();
          packages.updates.lastSuccessAt = Date.now();
        },
      } satisfies Partial<HarnessAPI>;
      Object.defineProperty(window, "substrateHarness", { value: bridge });
    },
    { organizationId: account.organizationId, agentId: agent.id, builtInSkills: startupSkills },
  );
  await visit(user, undefined, "/agents", { agentId: agent.id, settings: "skills" });
  const sheet = user.page.getByRole("dialog", { name: "Agent settings", exact: true });
  await expect(sheet.getByRole("list", { name: "Installed catalog skills" })).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Custom skills", exact: true })).toBeVisible();
  await expect(sheet.getByText("team-writing-style", { exact: true })).toBeVisible();
  await expect(sheet.getByRole("combobox", { name: "Skill update frequency" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Update now", exact: true })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Reset defaults", exact: true })).toHaveCount(0);
  await sheet
    .getByRole("button", { name: `Show ${startupSkills.length} skills`, exact: true })
    .click();
  await expect(sheet.getByRole("button", { name: "Reset defaults", exact: true })).toBeVisible();
  await sheet
    .getByRole("button", { name: `Hide ${startupSkills.length} skills`, exact: true })
    .click();
  await captureScreenshot(user.page, "skills-catalog-installed-desktop");
  await user.page.emulateMedia({ colorScheme: "dark" });
  await captureScreenshot(user.page, "skills-catalog-installed-dark");
  await user.page.setViewportSize({ width: 390, height: 900 });
  await expect(sheet.getByRole("list", { name: "Installed catalog skills" })).toBeVisible();
  await captureScreenshot(user.page, "skills-catalog-installed-narrow");
  await sheet.getByRole("button", { name: "Add skill", exact: true }).click();
  await expect(sheet.getByRole("searchbox", { name: "Search skill catalog" })).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Custom skills", exact: true })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Reset defaults", exact: true })).toHaveCount(0);
  await sheet.getByRole("tab", { name: "Updates", exact: true }).click();
  await expect(sheet.getByRole("list", { name: "Installed catalog skills" })).toHaveCount(0);
  await expect(sheet.getByRole("heading", { name: "Custom skills", exact: true })).toHaveCount(0);
  const frequency = sheet.getByRole("combobox", { name: "Skill update frequency" });
  await frequency.click();
  await user.page.getByRole("option", { name: "Weekly", exact: true }).click();
  await expect(frequency).toHaveText("Weekly");
  await captureScreenshot(user.page, "skills-catalog-updates-narrow");
  await user.page.setViewportSize({ width: 1440, height: 900 });
  await user.page.emulateMedia({ colorScheme: "light" });
  await sheet.getByRole("tab", { name: "Updates", exact: true }).click();
  await expect(frequency).toHaveText("Weekly");
  await captureScreenshot(user.page, "skills-catalog-updates-desktop");
  await sheet.getByRole("button", { name: "Update now", exact: true }).click();
  await expect(sheet.getByText("No updates run yet.", { exact: true })).toHaveCount(0);
  await expect(sheet.locator("time")).toHaveCount(1);
});
