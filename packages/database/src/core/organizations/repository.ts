import type { AppSettings } from "@substrate/contracts/apps";

import { AccessDeniedError } from "../../errors";
import { enabledApps } from "../apps/access";
import { appRepository } from "../apps/repository";
import { user } from "../authentication/schema";
import type { RepositoryContext } from "../repository-context";
import type { SessionIdentity } from "../session/identity";
import { invitation, member, organization } from "./schema";
import { and, eq, gt, sql } from "drizzle-orm";

export function organizationRepository(context: RepositoryContext, identity: SessionIdentity) {
  return {
    apps: async (): Promise<AppSettings> => ({
      organizationId: identity.organizationId,
      enabledApps: await enabledApps(context, identity.userId),
    }),
    updateApps: (apps: Parameters<ReturnType<typeof appRepository>["update"]>[0]) =>
      appRepository(context, identity).update(apps),
    updateUserApp: (input: Parameters<ReturnType<typeof appRepository>["updateUserApp"]>[0]) =>
      appRepository(context, identity).updateUserApp(input),
    async summary() {
      const [row] = await context.db
        .select({
          id: organization.id,
          name: organization.name,
          logo: organization.logo,
          role: member.role,
        })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(
          and(
            eq(member.organizationId, identity.organizationId),
            eq(member.userId, identity.userId),
          ),
        );
      if (!row) throw new AccessDeniedError();
      return row;
    },
    async people() {
      return context.db
        .select({ userId: user.id, name: user.name, email: user.email, image: user.image })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, identity.organizationId));
    },
    async pendingInvitation(invitationId: string) {
      const [row] = await context.db
        .select({ id: invitation.id, role: invitation.role, viewerRole: member.role })
        .from(invitation)
        .innerJoin(
          member,
          and(
            eq(member.organizationId, invitation.organizationId),
            eq(member.userId, identity.userId),
          ),
        )
        .where(
          and(
            eq(invitation.id, invitationId),
            eq(invitation.organizationId, identity.organizationId),
            eq(invitation.status, "pending"),
            gt(invitation.expiresAt, sql`now()`),
          ),
        );
      if (!row) throw new AccessDeniedError();
      return row;
    },
  };
}
