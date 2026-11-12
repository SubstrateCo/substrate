import { realtimeAudience, type RealtimeHint } from "@substrate/contracts/realtime";
import type { Database } from "@substrate/database/trusted";

import { createAuthPublisher } from "./realtime";
import { createAuth } from "./server";
import { APIError } from "better-auth/api";
import { expect, test } from "bun:test";

async function fixture() {
  const hints: RealtimeHint[] = [];
  const invitationChanges: { organizationId: string; email: string }[] = [];
  // SAFETY: Only configured hooks run; this fixture never executes database operations.
  const db = {} as Database;
  const publish = async <T>(committed: { result: T; hints: RealtimeHint[] }) => {
    hints.push(...committed.hints);
    return committed.result;
  };
  const unexpectedMail = async () => {
    throw new Error("Hook tests must not send mail.");
  };
  const auth = createAuth({
    db,
    mail: {
      resetPassword: unexpectedMail,
      verifyEmail: unexpectedMail,
      organizationInvitation: unexpectedMail,
      sharingInvitation: unexpectedMail,
    },
    publish,
    realtime: {
      ...createAuthPublisher(db, publish),
      publishInvitationChange: async ({ invitation }) => {
        invitationChanges.push(invitation);
      },
    },
  });
  const context = await auth.$context;
  return { options: auth.options, context, hints, invitationChanges };
}

test("password reset publishes a valid user hint instead of a bulk-update count", async () => {
  const { options, hints } = await fixture();
  const after = options.databaseHooks.account.update.after;
  await after(1);
  expect(hints).toEqual([]);

  await options.emailAndPassword.onPasswordReset({
    user: {
      id: "alice",
      name: "Alice",
      email: "alice@example.test",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  expect(hints).toEqual([{ audience: ["user", "alice"], domain: "session" }]);
  for (const hint of hints) {
    expect(realtimeAudience.safeParse(hint.audience).success).toBe(true);
  }
});

test("account row updates still notify their owner and empty results do not publish", async () => {
  const { options, hints } = await fixture();
  const after = options.databaseHooks.account.update.after;
  const account = { id: "credential", userId: "alice" };
  await after(account);
  expect(hints).toEqual([{ audience: ["user", "alice"], domain: "session" }]);

  hints.length = 0;
  await after(0);
  await after(null);
  expect(hints).toEqual([]);
});

test("organization owners use member provisioning without a second organization-create hook", async () => {
  const { options } = await fixture();
  const plugin = options.plugins.find((plugin) => plugin.id === "organization");
  const hooks = plugin?.options.organizationHooks;
  expect(hooks).toMatchObject({
    afterAddMember: expect.any(Function),
    afterAcceptInvitation: expect.any(Function),
  });
  expect(hooks).not.toHaveProperty("afterCreateOrganization");
});

test("configured invite after hook publishes once without a duplicate creation hook", async () => {
  const { options, context, invitationChanges } = await fixture();
  const plugin = options.plugins.find((plugin) => plugin.id === "organization");
  expect(plugin?.options.organizationHooks).not.toHaveProperty("afterCreateInvitation");
  const input = {
    headers: new Headers(),
    path: "/organization/invite-member",
    context: {
      ...context,
      returned: {
        id: "invitation",
        organizationId: "org",
        email: "alice@example.test",
        status: "pending",
      },
    },
  };
  await options.hooks.after(input);
  expect(invitationChanges).toEqual([{ organizationId: "org", email: "alice@example.test" }]);
});

test("configured invite after hook does not publish failed or malformed results", async () => {
  const { options, context, invitationChanges } = await fixture();
  for (const returned of [
    new APIError("FORBIDDEN", { message: "Not allowed" }),
    { organizationId: "org", email: "alice@example.test" },
    null,
  ]) {
    const input = {
      headers: new Headers(),
      path: "/organization/invite-member",
      context: { ...context, returned },
    };
    await options.hooks.after(input);
  }
  expect(invitationChanges).toEqual([]);
});
