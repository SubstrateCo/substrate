import { conversation, post, test, visit } from "./test-support/fixtures";
import { pauseClock, searches } from "./test-support/search";
import { project } from "./test-support/tasks";
import { expect, type Page, type Request } from "@playwright/test";

async function holdSearch(page: Page, query: string) {
  const ready = Promise.withResolvers<Request>();
  const release = Promise.withResolvers<void>();
  const delivered = Promise.withResolvers<void>();
  await page.route("**/api/v1/context/search", async (route) => {
    if (route.request().postDataJSON().query !== query) return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    ready.resolve(route.request());
    await release.promise;
    try {
      await route.fulfill({ response });
    } finally {
      delivered.resolve();
    }
  });
  return {
    ready: ready.promise,
    async close() {
      release.resolve();
      await delivered.promise;
    },
  };
}

test("workspace search aborts obsolete work before the next debounce and ignores its late response", async ({
  account,
  client,
}) => {
  const channel = await conversation(account);
  await post(account, "messaging/messages", {
    conversationId: channel.id,
    body: "Obsolete search result",
  });
  const user = await client(account);
  const { page } = user;
  await visit(user, channel.id);
  await pauseClock(page);
  const requests = searches(page);
  const held = await holdSearch(page, "Obsolete");
  const input = page.getByRole("combobox", { name: "Search workspace", exact: true });
  await input.fill("Obsolete");
  await page.clock.runFor(200);
  const request = await held.ready;
  try {
    const aborted = page.waitForEvent("requestfailed", {
      predicate: (failed) => failed === request,
    });
    await input.fill("Replacement");
    expect((await aborted).failure()?.errorText).toContain("ERR_ABORTED");
    expect(requests.map((request) => request.query)).toEqual(["Obsolete"]);
  } finally {
    await held.close();
  }
  const panel = page.getByRole("region", { name: "Workspace search", exact: true });
  await expect(panel.getByText("Obsolete search result", { exact: true })).toHaveCount(0);
  const replacement = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/context/search" &&
      response.request().postDataJSON().query === "Replacement",
  );
  await page.clock.runFor(200);
  expect((await replacement).ok()).toBe(true);
});

test("closing the task-link picker aborts even an empty browse query", async ({
  account,
  client,
}) => {
  const work = await project(account);
  const task = await post<{ id: string }>(account, "tasks/mutations", {
    action: "createTask",
    organizationId: account.organizationId,
    projectEntityId: work.entityId,
    title: "Link cancellation",
  });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/tasks", { projectId: work.entityId, taskId: task.id });
  await pauseClock(page);
  await page.clock.runFor(200);
  const held = await holdSearch(page, "");
  await page.getByRole("button", { name: "Link a task", exact: true }).click();
  const request = await held.ready;
  try {
    const aborted = page.waitForEvent("requestfailed", {
      predicate: (failed) => failed === request,
    });
    await page.keyboard.press("Escape");
    expect((await aborted).failure()?.errorText).toContain("ERR_ABORTED");
  } finally {
    await held.close();
  }
  await expect(page.getByRole("combobox", { name: "Search tasks to link" })).toHaveCount(0);
});

test("CRM search waits for typing to settle and aborts the old request immediately", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/crm", { section: "accounts" });
  const input = page.getByRole("searchbox", { name: "Search accounts", exact: true });
  await expect(input).toBeVisible();
  await pauseClock(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const search = url.searchParams.get("search");
    if (url.pathname === "/api/v1/crm/accounts" && search) requests.push(search);
  });
  const release = Promise.withResolvers<void>();
  const ready = Promise.withResolvers<Request>();
  const delivered = Promise.withResolvers<void>();
  await page.route("**/api/v1/crm/accounts?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("search") !== "North")
      return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    ready.resolve(route.request());
    await release.promise;
    try {
      await route.fulfill({ response });
    } finally {
      delivered.resolve();
    }
  });
  await input.fill("N");
  await page.clock.runFor(100);
  await input.fill("No");
  await page.clock.runFor(100);
  await input.fill("North");
  await page.clock.runFor(199);
  expect(requests).toEqual([]);
  await page.clock.runFor(50);
  const request = await ready.promise;
  try {
    const aborted = page.waitForEvent("requestfailed", {
      predicate: (failed) => failed === request,
    });
    await input.fill("South");
    expect((await aborted).failure()?.errorText).toContain("ERR_ABORTED");
    expect(requests).toEqual(["North"]);
  } finally {
    release.resolve();
    await delivered.promise;
  }
  const settled = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/crm/accounts" && url.searchParams.get("search") === "South";
  });
  await page.clock.runFor(200);
  expect((await settled).ok()).toBe(true);
});

test("reference search aborts the previous audience request while typing", async ({
  account,
  client,
}) => {
  const channel = await conversation(account);
  const user = await client(account);
  const { page } = user;
  await visit(user, channel.id);
  await pauseClock(page);
  const held = await holdSearch(page, "Obsolete");
  const editor = page.getByRole("textbox", { name: /^Message / });
  await editor.fill("@user:Obsolete");
  await expect(page.getByRole("tab", { name: "People", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.clock.runFor(250);
  const request = await held.ready;
  try {
    const aborted = page.waitForEvent("requestfailed", {
      predicate: (failed) => failed === request,
    });
    await editor.fill("@user:Replacement");
    expect((await aborted).failure()?.errorText).toContain("ERR_ABORTED");
  } finally {
    await held.close();
  }
});

for (const [section, endpoint] of [
  ["members", "get-full-organization"],
  ["invitations", "list-invitations"],
]) {
  test(`leaving organization ${section} aborts its Better Auth read`, async ({
    account,
    client,
  }) => {
    const user = await client(account);
    const { page } = user;
    const ready = Promise.withResolvers<Request>();
    const release = Promise.withResolvers<void>();
    const delivered = Promise.withResolvers<void>();
    await page.route(`**/api/auth/organization/${endpoint}?**`, async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      ready.resolve(route.request());
      await release.promise;
      try {
        await route.fulfill({ response });
      } finally {
        delivered.resolve();
      }
    });
    await page.goto(`/settings/organization/${section}?workspaceId=${account.organizationId}`);
    const request = await ready.promise;
    try {
      const aborted = page.waitForEvent("requestfailed", {
        predicate: (failed) => failed === request,
      });
      await page.getByRole("link", { name: "CRM", exact: true }).click();
      expect((await aborted).failure()?.errorText).toContain("ERR_ABORTED");
    } finally {
      release.resolve();
      await delivered.promise;
    }
    await expect(page).toHaveURL(/\/crm/);
  });
}
