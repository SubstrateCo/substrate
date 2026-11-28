import { conversationButton, post, test, visit, type Client } from "../test-support/fixtures";
import { project } from "../test-support/tasks";
import { expect } from "@playwright/test";

const id = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/**
 * Records the API requests a window sends, as "METHOD /path" with IDs replaced. `take` waits
 * until the window is quiet, then returns the requests since the last call, sorted.
 */
function requestsOf({ page }: Client) {
  const sent: string[] = [];
  let open = 0;
  let last = Date.now();
  const settled = () => {
    open--;
    last = Date.now();
  };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    const search = url.searchParams.has("afterMessageId") ? "?afterMessageId" : "";
    const archived = url.searchParams.get("archived") === "archived" ? "?archived" : "";
    sent.push(`${request.method()} ${url.pathname.replace(id, ":id")}${search}${archived}`);
    open++;
    last = Date.now();
    void request.response().then(settled, settled);
  });
  return {
    async take() {
      await expect
        .poll(() => open === 0 && Date.now() - last >= 400, {
          message: "The window stops sending requests",
          intervals: [100],
        })
        .toBe(true);
      return sent.splice(0).sort();
    },
  };
}

// What every signed-in screen reads once: the session, the workspace, and the shell's counts.
const shell = [
  "GET /api/auth/get-session",
  "GET /api/v1/agent-work/needs-you",
  "GET /api/v1/context/notifications/unread",
  "GET /api/v1/messaging/unread",
  "GET /api/v1/organizations/apps",
  "GET /api/v1/organizations/current",
];

// These lists are budgets. A new request on one of these paths must be a decision, not a side
// effect: each one runs for every person on every load, open, message or return to the window.
test("messaging sends each request once, and nothing for what is already loaded", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const { sender, member } = actors;
  const channel = (name: string) =>
    post<{ id: string; name: string }>(sender, "messaging/conversations", {
      kind: "channel",
      name: `budget-${name}-${crypto.randomUUID().slice(0, 8)}`,
      private: false,
    });
  const open = await channel("open");
  const other = await channel("other");
  for (const channel of [open, other]) {
    await post(sender, "messaging/messages", { conversationId: channel.id, body: "From sender" });
    // The member joins now, so a later post is a plain new message.
    await post(member, "messaging/messages", { conversationId: channel.id, body: "From member" });
  }
  const window = await client(sender);
  const requests = requestsOf(window);

  await test.step("a cold load reads everything once", async () => {
    await visit(window, open.id);
    await expect(window.page.getByText("From member", { exact: true })).toBeVisible();
    expect(await requests.take()).toEqual(
      [
        ...shell,
        // Reading the member's message moves the read position, so the counts are read again.
        "GET /api/v1/messaging/unread",
        "GET /api/v1/agent-work/conversations/:id/work",
        "GET /api/v1/agent-work/status",
        "GET /api/v1/messaging/conversations",
        "GET /api/v1/messaging/messages",
        "GET /api/v1/organizations/people",
        "POST /api/v1/agents/list",
        "POST /api/v1/context/message-page",
        "POST /api/v1/messaging/read",
      ].sort(),
    );
  });

  await test.step("another conversation reads only its own data", async () => {
    await conversationButton(window.page, other.name).click();
    await expect(window.page.getByRole("heading", { name: other.name, level: 1 })).toBeVisible();
    await expect(window.page.getByText("From member", { exact: true })).toBeVisible();
    expect(await requests.take()).toEqual([
      "GET /api/v1/agent-work/conversations/:id/work",
      "GET /api/v1/messaging/messages",
      "GET /api/v1/messaging/unread",
      "POST /api/v1/context/message-page",
      // One ends the viewing lease of the conversation left; one reads this conversation.
      "POST /api/v1/messaging/read",
      "POST /api/v1/messaging/read",
    ]);
  });

  await test.step("a loaded conversation is shown again without reading it", async () => {
    await conversationButton(window.page, open.name).click();
    await expect(window.page.getByRole("heading", { name: open.name, level: 1 })).toBeVisible();
    expect(await requests.take()).toEqual([
      "POST /api/v1/messaging/read",
      "POST /api/v1/messaging/read",
    ]);
  });

  await test.step("returning to the window soon after a full read sends nothing", async () => {
    await window.page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
    expect(await requests.take()).toEqual([]);
  });

  await test.step("a new message reads only the messages after the loaded ones", async () => {
    const body = `Incoming ${crypto.randomUUID()}`;
    await post(member, "messaging/messages", { conversationId: open.id, body });
    await expect(window.page.getByText(body, { exact: true })).toBeVisible();
    expect(await requests.take()).toEqual([
      "GET /api/v1/messaging/messages?afterMessageId",
      "GET /api/v1/messaging/unread",
      "POST /api/v1/context/message-page",
      "POST /api/v1/messaging/read",
    ]);
  });

  await test.step("typing loads the reference suggestions once", async () => {
    const composer = window.page.getByRole("textbox", { name: /^Message / });
    await composer.pressSequentially("Two words");
    expect(await requests.take()).toEqual(["POST /api/v1/context/search"]);
  });
});

test("tasks and the deals board read each list once", async ({ account, client }) => {
  const work = await project(account);
  const window = await client(account);
  const requests = requestsOf(window);

  await visit(window, undefined, "/tasks", { projectId: work.entityId });
  await expect(window.page.getByRole("heading", { name: work.name }).first()).toBeVisible();
  expect(await requests.take()).toEqual(
    [
      ...shell,
      "GET /api/v1/tasks/project",
      "GET /api/v1/tasks/projects",
      "GET /api/v1/tasks/projects?archived",
    ].sort(),
  );

  await visit(window, undefined, "/crm", { section: "deals" });
  await expect(window.page.getByRole("radio", { name: "Pipeline", exact: true })).toBeVisible();
  expect(await requests.take()).toEqual(
    [
      ...shell,
      // The board. The list is read when the person switches to it.
      "GET /api/v1/crm/deals",
      "GET /api/v1/crm/pipeline",
      "GET /api/v1/crm/settings",
    ].sort(),
  );
});
