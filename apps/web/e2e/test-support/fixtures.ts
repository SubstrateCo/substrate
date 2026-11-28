import type { contextSourceTask } from "@substrate/contracts/context/input";
import type { conversationInput, messageInput } from "@substrate/contracts/messaging/input";
import { realtimeEvent, type RealtimeEvent } from "@substrate/contracts/realtime";
import type { ServiceResult } from "@substrate/contracts/result";
import type { taskRequest, TasksWrite } from "@substrate/contracts/tasks/input";

import { provisionVerifiedAccount } from "../../../server/integration/test-support/auth";
import { Mailpit } from "../../../server/integration/test-support/mailpit";
import { provisionWorkspaceSession } from "../../../server/integration/test-support/organizations";
import { expectTimeout } from "./timeouts";
import {
  expect,
  test as base,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type ViewportSize,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// Playwright defines video as a mode string or an options object.
const videoMode = z.union([
  z.string(),
  z.object({ mode: z.string() }).transform(({ mode }) => mode),
]);

type StorageState = Awaited<ReturnType<APIRequestContext["storageState"]>>;
export interface Actor {
  request: APIRequestContext;
  name: string;
  email: string;
  password: string;
  organizationId: string;
  organizationName: string;
  state: StorageState;
}
export interface Client {
  page: Page;
  actor: Actor;
  events: RealtimeEvent[];
  waitForEvent: (
    since: number,
    match: (event: RealtimeEvent) => boolean,
    message: string,
  ) => Promise<void>;
}
type Actors = { sender: Actor; member: Actor; partner: Actor };
interface ContextPool {
  take: (viewport: ViewportSize | null) => Promise<BrowserContext>;
  release: (contexts: BrowserContext[]) => void;
}

const changedContexts = new WeakSet<BrowserContext>();

export function isolateContext(page: Page) {
  changedContexts.add(page.context());
}

const trustedOrigin = () => ({ origin: process.env.PLAYWRIGHT_BASE_URL! });

export async function inviteMember(
  actor: Actor,
  email: string,
  headers?: Record<string, string>,
): Promise<{ id: string }> {
  const response = await actor.request.post("/api/auth/organization/invite-member", {
    headers,
    data: { organizationId: actor.organizationId, email, role: "member" },
  });
  expect(response.ok(), "invitation fixture succeeds").toBe(true);
  return response.json();
}

async function provisionActor(
  request: APIRequestContext,
  name: string,
  { workspace = true }: { workspace?: boolean } = {},
): Promise<Actor> {
  const id = randomUUID();
  const email = `e2e-${id}@example.test`;
  const password = `E2E-${id}!`;
  await provisionVerifiedAccount({ request }, new Mailpit(request), { name, email, password });
  const organization = workspace
    ? await provisionWorkspaceSession(request, name, `e2e-${id}`)
    : undefined;
  return {
    request,
    name,
    email,
    password,
    organizationId: organization?.id ?? "",
    organizationName: organization ? name : "",
    state: await request.storageState(),
  };
}

export const test = base.extend<
  {
    client: (actor: Actor) => Promise<Client>;
    account: Actor;
    freshSession: (actor: Actor) => Promise<Actor>;
  },
  { actors: Actors; contextPool: ContextPool; workspaceIdentity: Actor }
>({
  actors: [
    async ({ playwright }, use, workerInfo) => {
      const requests: APIRequestContext[] = [];
      const account = async (role: string) => {
        const request = await playwright.request.newContext({
          baseURL: process.env.PLAYWRIGHT_API_URL,
          extraHTTPHeaders: trustedOrigin(),
        });
        requests.push(request);
        return provisionActor(request, `E2E ${role} ${workerInfo.parallelIndex}`, {
          workspace: role !== "member",
        });
      };
      try {
        const [sender, member, partner] = await Promise.all([
          account("sender"),
          account("member"),
          account("partner"),
        ]);
        const { id } = await inviteMember(sender, member.email);
        const accepted = await member.request.post("/api/auth/organization/accept-invitation", {
          data: { invitationId: id },
        });
        expect(accepted.ok()).toBe(true);
        const activated = await member.request.post("/api/auth/organization/set-active", {
          data: { organizationId: sender.organizationId },
        });
        expect(activated.ok()).toBe(true);
        member.organizationId = sender.organizationId;
        member.organizationName = sender.organizationName;
        member.state = await member.request.storageState();
        await use({ sender, member, partner });
      } finally {
        await Promise.all(requests.map((request) => request.dispose()));
      }
    },
    { scope: "worker", timeout: 30_000 },
  ],

  workspaceIdentity: [
    async ({ playwright }, use, workerInfo) => {
      const request = await playwright.request.newContext({
        baseURL: process.env.PLAYWRIGHT_API_URL,
        extraHTTPHeaders: trustedOrigin(),
      });
      try {
        await use(
          await provisionActor(request, `Workspace owner ${workerInfo.parallelIndex}`, {
            workspace: false,
          }),
        );
      } finally {
        await request.dispose();
      }
    },
    { scope: "worker", timeout: 30_000 },
  ],

  request: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({
      baseURL: process.env.PLAYWRIGHT_API_URL,
      extraHTTPHeaders: trustedOrigin(),
    });
    await use(request);
    await request.dispose();
  },

  account: async ({ request }, use) => {
    await use(await provisionActor(request, `Account ${randomUUID()}`));
  },

  freshSession: async ({ playwright }, use) => {
    const requests: APIRequestContext[] = [];
    try {
      await use(async (actor) => {
        const request = await playwright.request.newContext({
          baseURL: process.env.PLAYWRIGHT_API_URL,
          extraHTTPHeaders: trustedOrigin(),
        });
        requests.push(request);
        const signedIn = await request.post("/api/auth/sign-in/email", {
          data: { email: actor.email, password: actor.password },
        });
        expect(signedIn.ok(), "The actor signs in to a new session").toBe(true);
        const activated = await request.post("/api/auth/organization/set-active", {
          data: { organizationId: actor.organizationId },
        });
        expect(activated.ok(), "The new session opens the actor's workspace").toBe(true);
        return { ...actor, request, state: await request.storageState() };
      });
    } finally {
      await Promise.all(requests.map((request) => request.dispose()));
    }
  },

  contextPool: [
    async ({ browser }, use) => {
      const idle = new Map<string, BrowserContext[]>();
      const pools = new WeakMap<BrowserContext, BrowserContext[]>();
      await use({
        take: async (viewport) => {
          const key = JSON.stringify(viewport);
          let pool = idle.get(key);
          if (!pool) idle.set(key, (pool = []));
          const context =
            pool.pop() ??
            (await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL, viewport }));
          pools.set(context, pool);
          return context;
        },
        release: (contexts) => {
          for (const context of contexts) pools.get(context)!.push(context);
        },
      });
      await Promise.all([...idle.values()].flat().map((context) => context.close()));
    },
    { scope: "worker" },
  ],

  client: async ({ browser, viewport, video, reducedMotion, contextPool }, use, testInfo) => {
    const taken: BrowserContext[] = [];
    const recorded: BrowserContext[] = [];
    const pages: Page[] = [];
    const recordings: Page[] = [];
    try {
      await use(async (actor) => {
        const record = videoMode.parse(video) !== "off";
        let context: BrowserContext;
        if (record) {
          context = await browser.newContext({
            baseURL: process.env.PLAYWRIGHT_BASE_URL,
            viewport,
            storageState: actor.state,
            recordVideo: { dir: testInfo.outputPath("videos"), size: viewport ?? undefined },
          });
          recorded.push(context);
        } else {
          context = await contextPool.take(viewport);
          taken.push(context);
          await context.clearCookies();
          await context.addCookies(actor.state.cookies);
        }
        const page = await context.newPage();
        pages.push(page);
        if (reducedMotion) await page.emulateMedia({ reducedMotion });
        if (record) recordings.push(page);
        await page.addInitScript(() => {
          try {
            if (sessionStorage.getItem("e2e-storage-cleared")) return;
            localStorage.clear();
            sessionStorage.setItem("e2e-storage-cleared", "true");
          } catch {
            // Pages without an origin, such as about:blank, have no storage.
          }
        });
        const events: RealtimeEvent[] = [];
        const listeners = new Set<() => void>();
        page.on("websocket", (socket) => {
          if (new URL(socket.url()).pathname !== "/api/v1/realtime") return;
          socket.on("framereceived", ({ payload }) => {
            events.push(realtimeEvent.parse(JSON.parse(payload.toString())));
            for (const listener of listeners) listener();
          });
        });
        const waitForEvent: Client["waitForEvent"] = async (since, match, message) => {
          const found = () => events.slice(since).some(match);
          if (!found()) {
            const { promise, resolve } = Promise.withResolvers<void>();
            const listener = () => {
              if (found()) resolve();
            };
            listeners.add(listener);
            const deadline = setTimeout(resolve, expectTimeout);
            try {
              await promise;
            } finally {
              clearTimeout(deadline);
              listeners.delete(listener);
            }
          }
          expect(found(), message).toBe(true);
        };
        return { page, actor, events, waitForEvent };
      });
    } finally {
      await Promise.all(pages.map((page) => page.close()));
      const changed = taken.filter((context) => changedContexts.has(context));
      contextPool.release(taken.filter((context) => !changedContexts.has(context)));
      await Promise.all([...changed, ...recorded].map((context) => context.close()));
      for (const [index, page] of recordings.entries()) {
        const path = await page.video()?.path();
        if (path)
          await testInfo.attach(`workflow-${index + 1}`, { path, contentType: "video/webm" });
      }
    }
  },
});

export async function visit(
  client: Client,
  conversationId?: string,
  pathname = "/messages",
  params: Record<string, string | undefined> = {},
) {
  const search = new URLSearchParams({ workspaceId: client.actor.organizationId });
  for (const [key, value] of Object.entries({ conversationId, ...params }))
    if (value) search.set(key, value);
  const since = client.events.length;
  await client.page.goto(`${pathname}?${search}`);
  await client.waitForEvent(
    since,
    (event) => event.type === "ready",
    "The real authenticated WebSocket completes its ready handshake",
  );
  await expect
    .poll(
      () =>
        client.page
          .getByText(
            /Reconnecting to live updates|Live updates disconnected|some data failed to refresh/,
          )
          .count(),
      { message: "Live updates finish refreshing the initial page", intervals: [50] },
    )
    .toBe(0);
}

type MessagingInput =
  | Omit<z.input<typeof conversationInput>, "organizationId">
  | Omit<z.input<typeof messageInput>, "organizationId">;

export async function post<T>(
  actor: Actor,
  path:
    | "messaging/conversations"
    | "messaging/messages"
    | "tasks/mutations"
    | "tasks/discussion"
    | "context/source-tasks",
  data:
    | MessagingInput
    | TasksWrite
    | z.input<typeof contextSourceTask>
    | z.input<typeof taskRequest>,
) {
  const response = await actor.request.post(`/api/v1/${path}`, {
    data: { organizationId: actor.organizationId, ...data },
  });
  expect(response.ok(), `${path} fixture succeeds`).toBe(true);
  const result: ServiceResult<T> = await response.json();
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

export async function conversation(actor: Actor, emails: string[] = [], invitees: Actor[] = []) {
  const created = await post<{ id: string; name: string }>(actor, "messaging/conversations", {
    kind: "channel",
    name: `e2e-${randomUUID()}`,
    private: true,
    emails,
    shareHistory: true,
  });
  for (const invitee of invitees) await acceptCollaboration(invitee, created.id);
  return created;
}

export async function acceptCollaboration(actor: Actor, conversationId: string) {
  const response = await actor.request.get("/api/v1/messaging/sharing/inbox", {
    params: { organizationId: actor.organizationId },
  });
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  const invitation = data.find(
    (item: { conversationId: string }) => item.conversationId === conversationId,
  );
  if (!invitation) return;
  const accepted = await actor.request.post("/api/v1/messaging/sharing/accept", {
    data: { invitationId: invitation.id, organizationId: actor.organizationId, shareHistory: true },
  });
  expect(accepted.ok()).toBe(true);
  expect((await accepted.json()).data.status).toBe("accepted");
}

export async function send(page: Page, body: string, label: string | RegExp = /^Message /) {
  const editor = page.getByRole("textbox", { name: label });
  await editor.fill(body);
  await editor.press("Enter");
}

export function conversationButton(page: Page, name: string) {
  return page
    .getByRole("complementary", { name: "Conversations", exact: true })
    .getByRole("link")
    .filter({ has: page.getByText(name, { exact: true }) });
}

export async function expectChange(
  client: Client,
  since: number,
  domain: string,
  conversationId?: string,
) {
  await client.waitForEvent(
    since,
    (event) =>
      event.type === "change" &&
      event.domain === domain &&
      event.organizationId === client.actor.organizationId &&
      (!conversationId || event.conversationId === conversationId),
    `A real ${domain} WebSocket event reaches the recipient's organization`,
  );
}
