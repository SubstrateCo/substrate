import { ac, roles } from "@substrate/contracts/auth/permissions";
import { managedPicture } from "@substrate/contracts/files/pictures";
import {
  getRememberedOrganization,
  rememberOrganization,
} from "@substrate/database/authentication";
import { clearMembershipSharing } from "@substrate/database/messaging";
import * as schema from "@substrate/database/schema";
import { ensureHumanActor } from "@substrate/database/trusted";
import { createStorageRepository } from "@substrate/database/trusted";
import type { Database } from "@substrate/database/trusted";

import { environment } from "../environment";
import type { MailService } from "../mail/service";
import { isTrustedOrigin } from "../shared/origin";
import type { createCommittedPublisher } from "../v1/realtime/committed";
import { createOrganizationLifecycle } from "./organization-lifecycle";
import {
  organizationBody,
  organizationResult,
  rememberedOrganization,
  rethrowInvitationLookupError,
} from "./organization-policy";
import {
  authorizePictureMutation,
  readPictureMutation,
  protectUserPicture,
} from "./picture-policy";
import type { createAuthPublisher } from "./realtime";
import { normalizeUserName } from "./user-name";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { electron } from "@better-auth/electron";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { organization } from "better-auth/plugins";

export function createAuth(deps: {
  db: Database;
  mail: MailService;
  publish: ReturnType<typeof createCommittedPublisher>;
  realtime: ReturnType<typeof createAuthPublisher>;
}) {
  const { db, mail, publish: publishCommitted } = deps;
  const {
    publishSessionChange,
    publishProfileChange,
    publishMembershipChange,
    publishInvitationChange,
    publishOrganizationChange,
    publishOrganizationDeletion,
  } = deps.realtime;
  const provisionMember = async (input: {
    organization: { id: string };
    user: { id: string; name: string };
  }) => {
    await publishCommitted(await clearMembershipSharing(db, input.user.id, input.organization.id));
    await ensureHumanActor(db, {
      organizationId: input.organization.id,
      userId: input.user.id,
    });
    await publishMembershipChange(input);
  };

  const handleOrganizationLifecycle = createOrganizationLifecycle({
    clearMembershipSharing: async (userId, organizationId) => {
      await publishCommitted(await clearMembershipSharing(db, userId, organizationId));
    },
    publishMembershipChange,
    publishInvitationChange,
  });

  return betterAuth({
    appName: "Substrate",
    baseURL: environment.apiURL,
    trustedOrigins: environment.trustedOrigins,
    secret: environment.authSecret,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    session: { cookieCache: { enabled: true, maxAge: 60 } },
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mail.resetPassword(user.email, url);
      },
      onPasswordReset: async ({ user }) => {
        await publishSessionChange({ userId: user.id });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mail.verifyEmail(user.email, url);
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
        update: {
          // Bulk password updates return a count; onPasswordReset supplies their owner.
          after: async (account: { userId: string } | number | null) => {
            // oxlint-disable-next-line deslop/no-runtime-typeof -- Better Auth returns either an account row or a bulk affected-row count.
            if (account === null || typeof account === "number") return;
            await publishSessionChange(account);
          },
        },
        delete: { after: publishSessionChange },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const mutation = readPictureMutation(ctx.path, ctx.body ?? {});
        if (!mutation) return;
        const origin = ctx.headers?.get("origin");
        if (!isTrustedOrigin(origin, environment.trustedOrigins))
          throw new APIError("FORBIDDEN", { message: "Invalid request origin." });
        const session = await getSessionFromCtx(ctx);
        await authorizePictureMutation(mutation, session, createStorageRepository(db));
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.context.returned instanceof APIError)
          rethrowInvitationLookupError(ctx.path, ctx.context.returned);
        await handleOrganizationLifecycle({
          path: ctx.path,
          body: ctx.body,
          returned: ctx.context.returned,
          session: ctx.context.session ?? null,
        });
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
          afterAddMember: provisionMember,
          afterAcceptInvitation: async (input) => {
            await provisionMember(input);
            await publishInvitationChange(input);
          },
          afterRemoveMember: async (input) => {
            await publishCommitted(
              await clearMembershipSharing(db, input.user.id, input.organization.id),
            );
            await publishMembershipChange(input);
          },
          afterUpdateMemberRole: publishMembershipChange,
          afterUpdateOrganization: publishOrganizationChange,
          afterDeleteOrganization: publishOrganizationDeletion,
          afterRejectInvitation: publishInvitationChange,
          afterCancelInvitation: publishInvitationChange,
        },
        sendInvitationEmail: async ({ id, email, organization }, request) => {
          await mail.organizationInvitation(
            email,
            { id, organizationName: organization.name },
            request,
          );
        },
      }),
    ],
  });
}
export type Auth = ReturnType<typeof createAuth>;
