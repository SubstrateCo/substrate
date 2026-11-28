import { ConflictError } from "../../errors";
import type { RepositoryContext } from "../repository-context";
import { idempotentRequests, type RequestOperation } from "./schema";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";

type RequestInput =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly RequestInput[]
  | { readonly [key: string]: RequestInput };

export function requestFingerprint(input: RequestInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function previousRequest(
  ctx: RepositoryContext,
  operation: RequestOperation,
  requestId: string,
  fingerprint: string,
) {
  const { organizationId, actorEntityId } = ctx.scope;
  const [claimed] = await ctx.db
    .insert(idempotentRequests)
    .values({ organizationId, actorEntityId, operation, requestId, fingerprint })
    .onConflictDoNothing()
    .returning({ requestId: idempotentRequests.requestId });
  if (claimed) return null;
  const [previous] = await ctx.db
    .select()
    .from(idempotentRequests)
    .where(
      and(
        eq(idempotentRequests.organizationId, organizationId),
        eq(idempotentRequests.actorEntityId, actorEntityId),
        eq(idempotentRequests.operation, operation),
        eq(idempotentRequests.requestId, requestId),
      ),
    );
  if (previous && previous.fingerprint !== fingerprint)
    throw new ConflictError("Request identity was reused with different input.");
  if (!previous?.entityId) throw new ConflictError("The request did not finish. Try again.");
  return previous.entityId;
}

export async function recordRequest(
  ctx: RepositoryContext,
  operation: RequestOperation,
  requestId: string,
  entityId: string,
) {
  await ctx.db
    .update(idempotentRequests)
    .set({ entityId })
    .where(
      and(
        eq(idempotentRequests.organizationId, ctx.scope.organizationId),
        eq(idempotentRequests.actorEntityId, ctx.scope.actorEntityId),
        eq(idempotentRequests.operation, operation),
        eq(idempotentRequests.requestId, requestId),
      ),
    );
}
