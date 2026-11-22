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

/** A hash of the request's input, to tell a retry from a reused request ID. */
export function requestFingerprint(input: RequestInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/**
 * Claims the actor's request identity by inserting its row first. A concurrent request with the
 * same identity waits on the primary key until this transaction ends. Returns the entity an
 * earlier request with the same input produced, or null for a new request. Call inside a
 * transaction, and call recordRequest before it commits.
 */
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

/** Records the entity of a new request. Call in the transaction that called previousRequest. */
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
