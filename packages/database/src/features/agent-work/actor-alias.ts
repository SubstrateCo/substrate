import { actors } from "../../core/actors/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { ValidationError } from "../../errors";
import { and, eq } from "drizzle-orm";

export async function resolveActor<T extends string | null | undefined>(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  value: T,
): Promise<T | string> {
  if (value === "me") return ctx.scope.actorEntityId;
  if (value !== "owner") return value;
  const [owner] = await ctx.db
    .select({ id: actors.entityId })
    .from(actors)
    .where(
      and(
        eq(actors.organizationId, ctx.scope.organizationId),
        eq(actors.userId, identity.userId),
        eq(actors.type, "human"),
      ),
    );
  if (!owner) throw new ValidationError("Your owner has no actor in this organization.");
  return owner.id;
}
