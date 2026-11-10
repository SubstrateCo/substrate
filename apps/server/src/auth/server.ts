import { ac, roles } from "@startup-os/contracts/auth/permissions";
import { managedPicture } from "@startup-os/contracts/files/pictures";
import {
  getRememberedOrganization,
  rememberOrganization,
} from "@startup-os/database/authentication";
import { clearMembershipSharing } from "@startup-os/database/messaging";
import { ensureHumanActor } from "@startup-os/database/provisioning";
import * as schema from "@startup-os/database/schema";
import { createStorageRepository } from "@startup-os/database/storage";

import { environment as env } from "../environment";
import { publishRefresh } from "../v1/realtime/publisher";
import { db } from "./database";
import { frontendAuthLink, invitationLink } from "./email-link";
import { createMailer } from "./mail";
import {
  organizationBody,
  organizationResult,
  rememberedOrganization,
} from "./organization-policy";
import {
  authorizePictureMutation,
  readPictureMutation,
  protectUserPicture,
} from "./picture-policy";
import {
  publishSessionChange,
  publishProfileChange,
  publishMembershipChange,
  publishInvitationChange,
  publishOrganizationChange,
  publishOrganizationDeletion,
} from "./realtime";
import { normalizeUserName } from "./user-name";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { electron } from "@better-auth/electron";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { organization } from "better-auth/plugins";

const sendMail = createMailer(env);

const provisionMember = async (input: {
  organization: { id: string };
  user: { id: string; name: string };
}) => {
  const hints = await clearMembershipSharing(db, input.user.id, input.organization.id);
  await publishRefresh(hints);
  await ensureHumanActor(db, {
    organizationId: input.organization.id,
    userId: input.user.id,
  });
  await publishMembershipChange(input);
};

export const auth = betterAuth({
  appName: "Startup OS",
  baseURL: env.apiURL,
  trustedOrigins: env.trustedOrigins,
  secret: env.authSecret,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail(
        user.email,
        "Reset your Startup OS password",
        `Reset your password: ${frontendAuthLink(url, env.webURL)}`,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(
        user.email,
        "Verify your Startup OS email",
        `Verify your email address: ${frontendAuthLink(url, env.webURL)}`,
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
        before: async (user) => ({ data: protectUserPicture(normalizeUserName(user), true) }),
      },
      update: {
        before: async (user) => ({ data: protectUserPicture(normalizeUserName(user)) }),
        after: publishProfileChange,
      },
    },
    session: {
      create: {
        before: async (session) => {
          // No authenticated session exists yet, so the organization APIs cannot be used here.
          const activeOrganizationId = await getRememberedOrganization(db, session.userId);
          return { data: { ...session, activeOrganizationId } };
        },
        after: publishSessionChange,
      },
      update: { after: publishSessionChange },
      delete: { after: publishSessionChange },
    },
    account: {
      create: { after: publishSessionChange },
      update: { after: publishSessionChange },
      delete: { after: publishSessionChange },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const mutation = readPictureMutation(ctx.path, ctx.body ?? {});
      if (!mutation) return;
      const origin = ctx.headers?.get("origin");
      if (!origin || !env.trustedOrigins.includes(origin))
        throw new APIError("FORBIDDEN", { message: "Invalid request origin." });
      const session = await getSessionFromCtx(ctx);
      await authorizePictureMutation(mutation, session, createStorageRepository(db));
    }),
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
    electron(),
    organization({
      ac,
      roles,
      creatorRole: "owner",
      allowUserToCreateOrganization: (user) => user.emailVerified,
      requireEmailVerificationOnInvitation: true,
      organizationHooks: {
        beforeCreateOrganization: async ({ organization }) => {
          if (organization.logo != null)
            throw new APIError("BAD_REQUEST", {
              message: "Upload a picture after creating your organization.",
            });
        },
        beforeUpdateOrganization: async ({ organization }) => {
          if (
            organization.logo !== undefined &&
            !managedPicture.safeParse(organization.logo).success
          )
            throw new APIError("BAD_REQUEST", {
              message: "Use an uploaded picture URL or null.",
            });
        },
        afterCreateOrganization: provisionMember,
        afterAddMember: provisionMember,
        afterAcceptInvitation: async (input) => {
          await provisionMember(input);
          await publishInvitationChange(input);
        },
        afterRemoveMember: async (input) => {
          const hints = await clearMembershipSharing(db, input.user.id, input.organization.id);
          await publishRefresh(hints);
          await publishMembershipChange(input);
        },
        afterUpdateMemberRole: publishMembershipChange,
        afterUpdateOrganization: publishOrganizationChange,
        afterDeleteOrganization: publishOrganizationDeletion,
        afterCreateInvitation: publishInvitationChange,
        afterRejectInvitation: publishInvitationChange,
        afterCancelInvitation: publishInvitationChange,
      },
      sendInvitationEmail: async ({ id, email, organization }, request) => {
        const url = invitationLink(id, env.webURL, { baseURL: env.apiURL, request });
        await sendMail(
          email,
          `Join ${organization.name} on Startup OS`,
          `Accept your invitation: ${url}`,
        );
      },
    }),
  ],
});
