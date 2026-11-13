import { ConflictError } from "../../errors";
import type { RepositoryContext } from "../repository-context";
import { idempotentRequests, type RequestOperation } from "./schema";
import { and, eq, sql } from "drizzle-orm";
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
 * Locks the actor's request identity until the transaction ends. Returns the entity an earlier
 * request with the same input produced, or null for a new request. Call inside a transaction.
 */
export async function previousRequest(
  ctx: RepositoryContext,
  operation: RequestOperation,
  requestId: string,
  fingerprint: string,
) {
  const { organizationId, actorEntityId } = ctx.scope;
  await ctx.db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`request:${organizationId}:${actorEntityId}:${operation}:${requestId}`}, 0))`,
  );
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
  if (!previous) return null;
  if (previous.fingerprint !== fingerprint)
    throw new ConflictError("Request identity was reused with different input.");
  return previous.entityId;
}

/** Records a completed request. Call in the transaction that called previousRequest. */
export async function recordRequest(
  ctx: RepositoryContext,
  operation: RequestOperation,
  requestId: string,
  fingerprint: string,
  entityId: string,
) {
  await ctx.db.insert(idempotentRequests).values({
    organizationId: ctx.scope.organizationId,
    actorEntityId: ctx.scope.actorEntityId,
    operation,
    requestId,
    fingerprint,
    entityId,
  });
}
