import { AccessDeniedError } from "../../errors";
import { user } from "../authentication/schema";
import type { RepositoryContext } from "../repository-context";
import type { SessionIdentity } from "../session/identity";
import { member, organization } from "./schema";
import { and, eq } from "drizzle-orm";

export function organizationRepository(context: RepositoryContext, identity: SessionIdentity) {
  return {
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
  };
}
