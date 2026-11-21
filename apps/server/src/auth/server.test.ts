import { realtimeAudience, type RealtimeHint } from "@substrate/contracts/realtime";
import type { Database } from "@substrate/database/trusted";

import type { MailService } from "../mail/service";
import { createAuthPublisher } from "./realtime";
import { createAuth } from "./server";
import { APIError } from "better-auth/api";
import { expect, spyOn, test } from "bun:test";

async function fixture(mail: Partial<MailService> = {}) {
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
      ...mail,
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

test.each(["resetPassword", "verifyEmail"] as const)(
  "%s email failures are logged without rejecting the auth callback",
  async (kind) => {
    const failure = new Error("SMTP unavailable");
    const send = async () => {
      throw failure;
    };
    const { options } = await fixture({ [kind]: send });
    const report = spyOn(console, "error").mockImplementation(() => {});
    try {
      const input = {
        user: {
          id: "alice",
          name: "Alice",
          email: "alice@example.test",
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        url: "https://api.example.test/auth?token=secret",
        token: "secret",
      };
      const callback =
        kind === "resetPassword"
          ? options.emailAndPassword.sendResetPassword
          : options.emailVerification.sendVerificationEmail;
      const result = await callback(input);
      expect(result).toBeUndefined();
      expect(report.mock.calls).toEqual([
        [
          kind === "resetPassword" ? "Password reset email failed" : "Verification email failed",
          "Error",
        ],
      ]);
    } finally {
      report.mockRestore();
    }
  },
);

test("an invitation email failure is logged and does not turn the saved invitation into an API error", async () => {
  const { options, context, invitationChanges } = await fixture();
  const plugin = options.plugins.find((plugin) => plugin.id === "organization");
  if (!plugin) throw new Error("Organization plugin missing");
  const request = new Request("https://api.example.test/api/auth/organization/invite-member");
  const invitation = {
    id: "invitation",
    organizationId: "org",
    email: "alice@example.test",
    status: "pending" as const,
    role: "member",
    inviterId: "owner",
    expiresAt: new Date(),
    createdAt: new Date(),
  };
  const report = spyOn(console, "error").mockImplementation(() => {});
  try {
    await plugin.options.sendInvitationEmail(
      {
        ...invitation,
        invitation,
        organization: { id: "org", name: "Workspace", slug: "workspace", createdAt: new Date() },
        inviter: {
          id: "membership",
          organizationId: "org",
          userId: "owner",
          role: "owner",
          createdAt: new Date(),
          user: {
            id: "owner",
            name: "Owner",
            email: "owner@example.test",
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      },
      request,
    );
    const input = {
      headers: new Headers(),
      request,
      path: "/organization/invite-member",
      context: { ...context, returned: invitation },
    };
    const result = await options.hooks.after(input);
    expect(result).toBeUndefined();
    expect(report.mock.calls).toEqual([["Invitation email failed", "Error"]]);
    expect(invitationChanges).toEqual([{ organizationId: "org", email: "alice@example.test" }]);
  } finally {
    report.mockRestore();
  }
});

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
