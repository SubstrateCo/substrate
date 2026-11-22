import type { DatabaseExecutor } from "../executor";
import { member } from "../organizations/schema";
import { user } from "./schema";
import { and, eq } from "drizzle-orm";

// Trusted auth lifecycle APIs; never expose these as tools or accept a client user ID.
export async function getRememberedOrganization(db: DatabaseExecutor, userId: string) {
  const [membership] = await db
    .select({ organizationId: member.organizationId })
    .from(user)
    .innerJoin(
      member,
      and(eq(member.userId, user.id), eq(member.organizationId, user.lastOrganizationId)),
    )
    .where(and(eq(user.id, userId), eq(user.emailVerified, true)));
  return membership?.organizationId ?? null;
}

export async function rememberOrganization(
  db: DatabaseExecutor,
  userId: string,
  organizationId: string | null,
) {
  await db.update(user).set({ lastOrganizationId: organizationId }).where(eq(user.id, userId));
}
