import { createAgent } from "../test-support/agent-work";
import { test, visit } from "../test-support/fixtures";
import { expect, type Page, type Route } from "@playwright/test";

const catalogPath = "**/api/v1/agents/list";
const sidebar = (page: Page) => page.getByRole("complementary", { name: "Agents", exact: true });
const agents = (page: Page) => sidebar(page).getByRole("region", { name: "Your agents" });

async function failCatalog(route: Route, status = 503) {
  await route.fulfill({
    status,
    json: {
      success: false,
      error: {
        code: status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR",
        message: "Private diagnostic that must not be shown",
      },
    },
  });
}

test("a delayed catalog shows loading without blocking Needs you", async ({ account, client }) => {
  const agent = await createAgent(account);
  const user = await client(account);
  const release = Promise.withResolvers<void>();
  await user.page.route(catalogPath, async (route) => {
    // Refetches can cancel the initial query while the catalog is held.
    await release.promise;
    await route.continue();
  });
  try {
    await user.page.goto(`/agents?workspaceId=${account.organizationId}`);
    await expect(agents(user.page).getByRole("status", { name: "Loading agents" })).toBeVisible();
    await expect(agents(user.page).getByText("No agents yet")).toHaveCount(0);
    await expect(user.page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
    await expect(user.page.getByRole("heading", { name: "Nothing needs you" })).toBeVisible();
    await expect(sidebar(user.page).getByRole("link", { name: "Needs you" })).toBeEnabled();
  } finally {
    release.resolve();
    await user.page.unrouteAll({ behavior: "wait" });
  }
  await expect(agents(user.page).getByRole("link", { name: agent.name })).toBeVisible();
  await expect(agents(user.page).getByRole("status", { name: "Loading agents" })).toHaveCount(0);
});

test("an initial catalog failure can be retried without blocking Needs you", async ({
  account,
  client,
}) => {
  const agent = await createAgent(account);
  const user = await client(account);
  let failing = true;
  await user.page.route(catalogPath, (route) => (failing ? failCatalog(route) : route.continue()));
  await user.page.goto(`/agents?workspaceId=${account.organizationId}`);
  await expect(agents(user.page).getByRole("alert")).toContainText("Couldn’t load agents");
  await expect(user.page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
  await expect(user.page.getByRole("heading", { name: "Nothing needs you" })).toBeVisible();
  await expect(agents(user.page).getByText("No agents yet")).toHaveCount(0);
  await expect(user.page.getByText("Private diagnostic that must not be shown")).toHaveCount(0);
  failing = false;
  await agents(user.page).getByRole("button", { name: "Try again" }).click();
  await expect(agents(user.page).getByRole("link", { name: agent.name })).toBeVisible();
  await expect(agents(user.page).getByRole("alert")).toHaveCount(0);
});

test("a missing selected agent is unavailable after a successful catalog load", async ({
  account,
  client,
}) => {
  const user = await client(account);
  await visit(user, undefined, "/agents", { agentId: crypto.randomUUID() });
  await expect(
    user.page.getByRole("heading", { name: "Agent unavailable", exact: true }),
  ).toBeVisible();
  await expect(user.page.getByRole("status", { name: /Loading agent/ })).toHaveCount(0);
  await expect(user.page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await sidebar(user.page).getByRole("link", { name: "Needs you" }).click();
  await expect(user.page.getByRole("heading", { name: "Create your first agent" })).toBeVisible();
});

for (const status of [503, 403]) {
  test(`cached catalog refetch ${status} ${status === 403 ? "redacts metadata" : "keeps agents usable and recovers"}`, async ({
    account,
    client,
  }) => {
    const agent = await createAgent(account);
    const user = await client(account);
    await visit(user, undefined, "/agents", { agentId: agent.id });
    await expect(agents(user.page).getByRole("link", { name: agent.name })).toBeVisible();
    await expect(user.page.getByRole("button", { name: "Start conversation" })).toBeVisible();
    let failing = true;
    await user.page.route(catalogPath, (route) =>
      failing ? failCatalog(route, status) : route.continue(),
    );
    // A real owner edit emits the catalog change event and refetches the cached query.
    const changed = await account.request.post("/api/v1/agents/actors/save", {
      data: {
        id: agent.id,
        name: agent.name,
        instructions: "Updated for catalog refresh",
        harness: "opencode",
        enabled: true,
      },
    });
    expect(changed.ok()).toBe(true);
    const feedback = agents(user.page).getByRole("alert");
    await expect(feedback).toContainText(
      status === 403 ? "Agents unavailable" : "Couldn’t load agents",
    );
    await expect(user.page.getByText("Private diagnostic that must not be shown")).toHaveCount(0);
    if (status === 403) {
      await expect(user.page.getByText(agent.name, { exact: true })).toHaveCount(0);
      await expect(
        user.page.getByRole("heading", { name: "Agent unavailable", exact: true }),
      ).toBeVisible();
      await expect(agents(user.page).getByRole("button", { name: "Try again" })).toHaveCount(0);
      await expect(user.page.getByRole("button", { name: "Start conversation" })).toHaveCount(0);
    } else {
      await expect(agents(user.page).getByRole("link", { name: agent.name })).toBeVisible();
      await expect(user.page.getByRole("button", { name: "Start conversation" })).toBeVisible();
      failing = false;
      await agents(user.page).getByRole("button", { name: "Try again" }).click();
      await expect(feedback).toHaveCount(0);
      await expect(agents(user.page).getByRole("link", { name: agent.name })).toBeVisible();
    }
    await sidebar(user.page).getByRole("link", { name: "Needs you" }).click();
    await expect(user.page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
    await expect(user.page.getByRole("heading", { name: "Nothing needs you" })).toBeVisible();
  });
}
