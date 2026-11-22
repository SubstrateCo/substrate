import { AccessDeniedError } from "../../errors";
import { appRepository } from "../apps/repository";
import { user } from "../authentication/schema";
import type { RepositoryContext } from "../repository-context";
import type { SessionIdentity } from "../session/identity";
import { invitation, member, organization } from "./schema";
import { and, eq, gt, sql } from "drizzle-orm";

export function organizationRepository(context: RepositoryContext, identity: SessionIdentity) {
  return {
    apps: () => appRepository(context, identity).get(),
    updateApps: (apps: Parameters<ReturnType<typeof appRepository>["update"]>[0]) =>
      appRepository(context, identity).update(apps),
    /** The organization's name and logo, with the viewer's own role in it. */
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
    /** The people who are members of the organization. Only members may read them. */
    async people() {
      return context.db
        .select({ userId: user.id, name: user.name, email: user.email, image: user.image })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, identity.organizationId));
    },
    /**
     * A pending, unexpired invitation to this organization, with the viewer's own role. Other
     * organizations' invitations are denied like missing ones, so their existence is not revealed.
     */
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
