import { result } from "../../server/integration/test-support/api";
import { createCrm, readCrm } from "../../server/integration/test-support/crm";
import { conversation, isolateContext, post, test, visit } from "./test-support/fixtures";
import { expect, type Locator, type Page } from "@playwright/test";

async function pauseClock(page: Page) {
  isolateContext(page);
  const time = new Date("2026-11-21T12:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
}

async function holdResponse(page: Page, pattern: string) {
  let ready = false;
  const release = Promise.withResolvers<void>();
  const delivered = Promise.withResolvers<void>();
  await page.route(pattern, async (route) => {
    const response = await route.fetch();
    ready = true;
    await release.promise;
    try {
      await route.fulfill({ response });
    } finally {
      delivered.resolve();
    }
  });
  return {
    ready: () => ready,
    release: async () => {
      release.resolve();
      await delivered.promise;
      await page.unroute(pattern);
    },
  };
}

async function flushUntil(page: Page, ready: () => Promise<boolean> | boolean) {
  await expect
    .poll(async () => {
      await page.clock.runFor(1);
      return ready();
    })
    .toBe(true);
}

async function expectDelayedPlaceholder(page: Page, loading: Locator, slow: boolean) {
  await flushUntil(page, async () => (await loading.count()) > 0);
  const skeleton = loading.locator('[data-slot="skeleton"]').first();
  await expect(skeleton).toBeHidden();
  await page.clock.runFor(100);
  await expect(skeleton).toBeHidden();
  if (slow) {
    await page.clock.runFor(250);
    await expect(skeleton).toBeVisible();
  }
}

test("reply placeholders skip fast responses and appear for slow responses", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  const roots = [];
  for (const body of ["Fast thread", "Slow thread"]) {
    const root = await post<{ id: string }>(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body,
    });
    await post(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      threadId: root.id,
      body: `${body} reply`,
    });
    roots.push({ ...root, body });
  }
  const user = await client(actors.sender);
  await visit(user, channel.id);
  await expect(user.page.getByText("Fast thread", { exact: true })).toBeVisible();
  await pauseClock(user.page);
  for (const [index, root] of roots.entries()) {
    const held = await holdResponse(
      user.page,
      `**/api/v1/messaging/messages?**threadId=${root.id}`,
    );
    await user.page
      .getByRole("log", { name: "Messages", exact: true })
      .first()
      .getByRole("article")
      .filter({ has: user.page.getByText(root.body, { exact: true }) })
      .getByRole("button", { name: "1 reply", exact: true })
      .click();
    await flushUntil(user.page, held.ready);
    const loading = user.page.locator('[role="status"][aria-label="Loading replies"]');
    try {
      await expectDelayedPlaceholder(user.page, loading, index === 1);
    } finally {
      await held.release();
    }
    // Flush query notifications without advancing through a minimum spinner duration.
    await flushUntil(user.page, () =>
      user.page.getByText(`${root.body} reply`, { exact: true }).isVisible(),
    );
    await expect(loading).toHaveCount(0);
  }
});

for (const view of ["pipeline", "detail"] as const) {
  for (const speed of ["fast", "slow"] as const) {
    test(`CRM ${view} handles ${speed} responses without loading flashes`, async ({
      account,
      client,
    }) => {
      const customer = await createCrm(account, {
        action: "createAccount",
        name: "Loading customer",
      });
      const stages = await result<{ id: string }[]>(await readCrm(account, "pipeline"));
      const title = `${speed} deal`;
      await createCrm(account, {
        action: "createDeal",
        accountEntityId: customer.entityId,
        stageId: stages[0]!.id,
        title,
      });
      const user = await client(account);
      await visit(user, undefined, "/crm", {
        section: view === "detail" ? "deals" : "settings",
      });
      if (view === "detail")
        await expect(user.page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
      else
        await expect(
          user.page.getByRole("heading", { name: "CRM settings", exact: true }),
        ).toBeVisible();
      await pauseClock(user.page);
      const held = await holdResponse(
        user.page,
        view === "detail" ? "**/api/v1/crm/deal?**" : "**/api/v1/crm/deals?**",
      );
      if (view === "detail") await user.page.getByRole("link", { name: new RegExp(title) }).click();
      else
        await user.page
          .getByRole("navigation", { name: "CRM", exact: true })
          .getByRole("link", { name: "Deals", exact: true })
          .click();
      await flushUntil(user.page, held.ready);
      const loading = user.page.locator('[role="status"][aria-label="Loading deals"]');
      try {
        await expectDelayedPlaceholder(user.page, loading, speed === "slow");
      } finally {
        await held.release();
      }
      await flushUntil(user.page, () =>
        view === "detail"
          ? user.page.getByRole("heading", { name: title, exact: true }).isVisible()
          : user.page.getByText(title, { exact: true }).isVisible(),
      );
      await expect(loading).toHaveCount(0);
    });
  }
}
