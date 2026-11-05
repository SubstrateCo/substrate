import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  getRememberedOrganization,
  rememberOrganization,
} from "@startup-os/database/authentication";
import { ensureHumanActor } from "@startup-os/database/provisioning";
import * as schema from "@startup-os/database/schema";
import { betterAuth } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { authEnvironment } from "./environment";
import { createMailer } from "./mail";
import {
  organizationBody,
  organizationResult,
  rememberedOrganization,
} from "./organization-policy";
import { ac, roles } from "./permissions";
import { normalizeUserName } from "./user-name";
import { db } from "./database";

const env = authEnvironment();
const sendMail = createMailer(env);

const provisionMember = async (input: {
  organization: { id: string };
  user: { id: string; name: string };
}) => {
  await ensureHumanActor(db, {
    organizationId: input.organization.id,
    userId: input.user.id,
    name: input.user.name,
  });
};

export const auth = betterAuth({
  appName: "Startup OS",
  baseURL: env.baseURL,
  secret: env.secret,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail(user.email, "Reset your Startup OS password", `Reset your password: ${url}`);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(
        user.email,
        "Verify your Startup OS email",
        `Verify your email address: ${url}`,
      );
    },
  },
  user: {
    additionalFields: {
      lastOrganizationId: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({ data: normalizeUserName(user) }),
      },
      update: {
        before: async (user) => ({ data: normalizeUserName(user) }),
      },
    },
    session: {
      create: {
        before: async (session) => {
          // No authenticated session exists yet, so the organization APIs cannot be used here.
          const activeOrganizationId = await getRememberedOrganization(db, session.userId);
          return { data: { ...session, activeOrganizationId } };
        },
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const body = organizationBody.safeParse(ctx.body ?? {});
      const result = organizationResult.safeParse(ctx.context.returned);
      if (!body.success || !result.success) return;
      const organizationId = rememberedOrganization(ctx.path, body.data, result.data);
      if (organizationId === undefined) return;
      const session = await getSessionFromCtx(ctx);
      if (!session) return;
      await rememberOrganization(db, session.user.id, organizationId);
    }),
  },
  plugins: [
    organization({
      ac,
      roles,
      creatorRole: "owner",
      allowUserToCreateOrganization: (user) => user.emailVerified,
      requireEmailVerificationOnInvitation: true,
      organizationHooks: {
        afterCreateOrganization: provisionMember,
        afterAddMember: provisionMember,
        afterAcceptInvitation: provisionMember,
      },
      sendInvitationEmail: async ({ id, email, organization }) => {
        const url = new URL(`/accept-invitation/${encodeURIComponent(id)}`, env.baseURL).toString();
        await sendMail(
          email,
          `Join ${organization.name} on Startup OS`,
          `Accept your invitation: ${url}`,
        );
      },
    }),
  ],
});

export type Auth = typeof auth;
