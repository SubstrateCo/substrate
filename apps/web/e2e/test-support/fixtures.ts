import type { contextSourceTask } from "@startup-os/contracts/context/input";
import type { conversationInput, messageInput } from "@startup-os/contracts/messaging/input";
import { realtimeEvent, type RealtimeEvent } from "@startup-os/contracts/realtime";
import type { ServiceResult } from "@startup-os/contracts/result";
import type { TasksWrite } from "@startup-os/contracts/tasks/input";

import { provisionVerifiedAccount } from "../../../server/integration/test-support/auth";
import { Mailpit } from "../../../server/integration/test-support/mailpit";
import { provisionWorkspaceSession } from "../../../server/integration/test-support/organizations";
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
  state: StorageState;
}
export interface Client {
  page: Page;
  actor: Actor;
  events: RealtimeEvent[];
}
type Actors = { sender: Actor; member: Actor; partner: Actor };

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
    state: await request.storageState(),
  };
}

export const test = base.extend<
  { client: (actor: Actor) => Promise<Client>; account: Actor },
  { actors: Actors }
>({
  actors: [
    async ({ playwright }, use, workerInfo) => {
      const origin = process.env.PLAYWRIGHT_BASE_URL!;
      const requests: APIRequestContext[] = [];
      const account = async (role: string) => {
        const request = await playwright.request.newContext({ baseURL: origin });
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
        const invitation = await sender.request.post("/api/auth/organization/invite-member", {
          headers: { origin },
          data: { email: member.email, role: "member" },
        });
        expect(invitation.ok()).toBe(true);
        const { id } = await invitation.json();
        const accepted = await member.request.post("/api/auth/organization/accept-invitation", {
          headers: { origin },
          data: { invitationId: id },
        });
        expect(accepted.ok()).toBe(true);
        const activated = await member.request.post("/api/auth/organization/set-active", {
          headers: { origin },
          data: { organizationId: sender.organizationId },
        });
        expect(activated.ok()).toBe(true);
        member.organizationId = sender.organizationId;
        member.state = await member.request.storageState();
        await use({ sender, member, partner });
      } finally {
        await Promise.all(requests.map((request) => request.dispose()));
      }
    },
    { scope: "worker", timeout: 30_000 },
  ],

  account: async ({ request }, use) => {
    await use(await provisionActor(request, `Account ${randomUUID()}`));
  },

  client: async ({ browser, viewport }, use) => {
    const contexts: BrowserContext[] = [];
    try {
      await use(async (actor) => {
        const context = await browser.newContext({ viewport, storageState: actor.state });
        contexts.push(context);
        const page = await context.newPage();
        const events: RealtimeEvent[] = [];
        page.on("websocket", (socket) => {
          if (new URL(socket.url()).pathname !== "/api/v1/realtime") return;
          socket.on("framereceived", ({ payload }) => {
            events.push(realtimeEvent.parse(JSON.parse(payload.toString())));
          });
        });
        return { page, actor, events };
      });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
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
  await client.page.goto(`${pathname}?${search}`);
  await expect
    .poll(() => client.events.some((event) => event.type === "ready"), {
      message: "The real authenticated WebSocket completes its ready handshake",
    })
    .toBe(true);
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
    headers: { origin: process.env.PLAYWRIGHT_BASE_URL! },
    data: { organizationId: actor.organizationId, ...data },
  });
  expect(response.ok(), `${path} fixture succeeds`).toBe(true);
  const result: ServiceResult<T> = await response.json();
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

export function conversation(actor: Actor, emails: string[] = []) {
  return post<{ id: string; name: string }>(actor, "messaging/conversations", {
    kind: "channel",
    name: `e2e-${randomUUID()}`,
    private: true,
    emails,
  });
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
  await expect
    .poll(
      () =>
        client.events
          .slice(since)
          .some(
            (event) =>
              event.type === "change" &&
              event.domain === domain &&
              event.organizationId === client.actor.organizationId &&
              (!conversationId || event.conversationId === conversationId),
          ),
      { message: `A real ${domain} WebSocket event reaches the recipient's organization` },
    )
    .toBe(true);
}
