import type { contextSourceTask } from "@startup-os/contracts/context/input";
import type { conversationInput, messageInput } from "@startup-os/contracts/messaging/input";
import { realtimeEvent, type RealtimeEvent } from "@startup-os/contracts/realtime";
import type { ServiceResult } from "@startup-os/contracts/result";
import type { TasksWrite } from "@startup-os/contracts/tasks/input";

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
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { z } from "zod";

type StorageState = Awaited<ReturnType<APIRequestContext["storageState"]>>;
export interface Actor {
  request: APIRequestContext;
  name: string;
  email: string;
  password: string;
  organizationId: string;
  /** The active organization's name. Tests may rename the person, so do not derive it from `name`. */
  organizationName: string;
  state: StorageState;
}
export interface Client {
  page: Page;
  actor: Actor;
  events: RealtimeEvent[];
  /** Waits for a realtime event received at or after index `since` that matches. */
  waitForEvent: (
    since: number,
    match: (event: RealtimeEvent) => boolean,
    message: string,
  ) => Promise<void>;
}
type Actors = { sender: Actor; member: Actor; partner: Actor };

const changedContexts = new WeakSet<BrowserContext>();

/** Stops a browser context from being reused, after a change that outlives its pages. */
export function isolateContext(page: Page) {
  changedContexts.add(page.context());
}

/**
 * The server accepts writes only from its trusted renderer origin. Worker contexts sit idle between
 * tests, and reusing an idle keep-alive socket races the dev server proxy closing it (ECONNRESET),
 * so each request uses a new connection.
 */
const trustedOrigin = () => ({ origin: process.env.PLAYWRIGHT_BASE_URL!, connection: "close" });

/** Invites an email to the actor's organization through Better Auth, as an owner does. */
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
    /** Signs the actor in again, for tests that sign out. */
    freshSession: (actor: Actor) => Promise<Actor>;
  },
  { actors: Actors; idleContexts: BrowserContext[] }
>({
  actors: [
    async ({ playwright }, use, workerInfo) => {
      const requests: APIRequestContext[] = [];
      const account = async (role: string) => {
        const request = await playwright.request.newContext({
          baseURL: process.env.PLAYWRIGHT_BASE_URL,
          extraHTTPHeaders: trustedOrigin(),
        });
        requests.push(request);
        // The member joins the sender's organization below, rather than creating another one.
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

  // API requests carry the trusted origin, so specs and helpers need no per-call header.
  request: async ({ playwright, baseURL }, use) => {
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: trustedOrigin(),
    });
    await use(request);
    await request.dispose();
  },

  account: async ({ request }, use) => {
    await use(await provisionActor(request, `Account ${randomUUID()}`));
  },

  // A new sign-in needs no email, and signing it out leaves the actor's own session valid.
  freshSession: async ({ playwright }, use) => {
    const requests: APIRequestContext[] = [];
    try {
      await use(async (actor) => {
        const request = await playwright.request.newContext({
          baseURL: process.env.PLAYWRIGHT_BASE_URL,
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

  idleContexts: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their first argument.
    async ({}, use) => {
      const idle: BrowserContext[] = [];
      await use(idle);
      await Promise.all(idle.map((context) => context.close()));
    },
    { scope: "worker" },
  ],

  client: async ({ browser, viewport, video, idleContexts }, use, testInfo) => {
    const taken: BrowserContext[] = [];
    const recorded: BrowserContext[] = [];
    const pages: Page[] = [];
    const recordings: Page[] = [];
    try {
      await use(async (actor) => {
        // oxlint-disable-next-line deslop/no-runtime-typeof -- Playwright defines video as a mode string or an options object.
        const record = typeof video === "string" ? video !== "off" : video.mode !== "off";
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
          // Each window takes a context no other window of this test uses, so windows keep separate
          // storage. Reusing contexts keeps the HTTP cache, which spares the dev server from
          // serving every module again. API responses are never cached, so only the session
          // cookies decide who the window is.
          context =
            idleContexts.pop() ??
            (await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL, viewport }));
          taken.push(context);
          await context.clearCookies();
          await context.addCookies(actor.state.cookies);
        }
        const page = await context.newPage();
        pages.push(page);
        if (record) recordings.push(page);
        // A reused context keeps local storage. Clear it on this window's first app load only, so
        // reloads within the test still see what the test stored.
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
            // A deadline, not a sleep: the wait ends as soon as the event arrives.
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
      // A context that a test changed for good is closed instead of reused.
      const changed = taken.filter((context) => changedContexts.has(context));
      idleContexts.push(...taken.filter((context) => !changedContexts.has(context)));
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
  pathname = "/dashboard",
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
  await expect(
    client.page.getByText(
      /Reconnecting to live updates|Live updates disconnected|some data failed to refresh/,
    ),
  ).toHaveCount(0);
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
    | "context/source-tasks",
  data: MessagingInput | TasksWrite | z.input<typeof contextSourceTask>,
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
