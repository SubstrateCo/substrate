import { provisionVerifiedAccount } from "./auth";
import { appOrigin } from "./environment";
import { Mailpit } from "./mailpit";
import { provisionWorkspaceSession, type WorkspaceAccount } from "./organizations";
import { expect, test as base, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = appOrigin;

/** A verified account whose session is active in `organizationId`. */
export type Actor = WorkspaceAccount & { name: string };

/**
 * One set per worker. The owner and member share the owner's workspace; the outsider and the
 * recipient each own a workspace. Tests must leave account state (avatars, active workspace)
 * as they found it; a failed test restarts the worker and so recreates the actors.
 */
export type Actors = { owner: Actor; member: Actor; outsider: Actor; recipient: Actor };

async function activate(actor: Actor, organizationId: string) {
  const response = await actor.request.post("/api/auth/organization/set-active", {
    headers: { origin },
    data: { organizationId },
  });
  expect(response.ok(), `${actor.name} activates the fixture workspace`).toBe(true);
}

async function join(owner: Actor, member: Actor, organizationId: string) {
  const invited = await owner.request.post("/api/auth/organization/invite-member", {
    headers: { origin },
    data: { organizationId, email: member.email, role: "member" },
  });
  expect(invited.ok(), "The fixture invitation is sent").toBe(true);
  const invitation: { id: string } = await invited.json();
  const accepted = await member.request.post("/api/auth/organization/accept-invitation", {
    headers: { origin },
    data: { invitationId: invitation.id },
  });
  expect(accepted.ok(), "The fixture invitation is accepted").toBe(true);
  await activate(member, organizationId);
}

export const test = base.extend<
  {
    /**
     * Creates a workspace owned by `owner`, joins `member` to it, and activates it for both.
     * Returns both actors scoped to it. Teardown activates each actor's own workspace again.
     */
    workspace: {
      (owner: Actor): Promise<[Actor]>;
      (owner: Actor, member: Actor): Promise<[Actor, Actor]>;
    };
  },
  { actors: Actors }
>({
  actors: [
    async ({ playwright }, use) => {
      const contexts: APIRequestContext[] = [];
      const account = async (name: string, ownsWorkspace: boolean): Promise<Actor> => {
        const request = await playwright.request.newContext({ baseURL: origin });
        contexts.push(request);
        const suffix = randomUUID();
        const email = `${name}-${suffix}@example.test`;
        await provisionVerifiedAccount({ request }, new Mailpit(request), {
          name,
          email,
          password: `Integration-${suffix}!`,
        });
        const organization = ownsWorkspace
          ? await provisionWorkspaceSession(request, name, `${name}-${suffix}`)
          : undefined;
        return { request, name, email, organizationId: organization?.id ?? "" };
      };
      try {
        const [owner, member, outsider, recipient] = await Promise.all([
          account("owner", true),
          account("member", false),
          account("outsider", true),
          account("recipient", true),
        ]);
        await join(owner, member, owner.organizationId);
        member.organizationId = owner.organizationId;
        await use({ owner, member, outsider, recipient });
      } finally {
        await Promise.all(contexts.map((context) => context.dispose()));
      }
    },
    { scope: "worker", timeout: 60_000 },
  ],

  workspace: async ({ actors: _actors }, use) => {
    const switched = new Set<Actor>();
    function create(owner: Actor): Promise<[Actor]>;
    function create(owner: Actor, member: Actor): Promise<[Actor, Actor]>;
    async function create(owner: Actor, member?: Actor): Promise<[Actor] | [Actor, Actor]> {
      const suffix = randomUUID();
      switched.add(owner);
      const { id } = await provisionWorkspaceSession(
        owner.request,
        `Workspace ${suffix}`,
        `workspace-${suffix}`,
      );
      const scopedOwner = { ...owner, organizationId: id };
      if (!member) return [scopedOwner];
      switched.add(member);
      await join(owner, member, id);
      return [scopedOwner, { ...member, organizationId: id }];
    }
    try {
      await use(create);
    } finally {
      for (const actor of switched) await activate(actor, actor.organizationId);
    }
  },
});
