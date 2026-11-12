import type { accountFields, dealFields } from "@substrate/contracts/crm/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { parseInput } from "../../core/contacts/inputs";
import type { RepositoryContext } from "../../core/repository-context";
import { ConflictError } from "../../errors";
import { crmCreateRequests } from "./requests.schema";
import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";

type CreatePayload = z.output<typeof accountFields> | z.output<typeof dealFields>;

export async function createOnce<T extends { entityId: string }>(
  context: RepositoryContext,
  operation: "account" | "deal",
  requestId: string | undefined,
  payload: CreatePayload,
  create: (ctx: RepositoryContext) => Promise<T>,
  read: (ctx: RepositoryContext, id: string) => Promise<T>,
) {
  if (requestId !== undefined) parseInput(z.uuid(), requestId);
  return context.transaction(async (ctx) => {
    await ctx.requireActiveActor();
    if (!requestId) return create(ctx);
    const { organizationId, actorEntityId } = ctx.scope;
    await ctx.db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`crm-create:${organizationId}:${actorEntityId}:${operation}:${requestId}`}, 0))`,
    );
    const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const [previous] = await ctx.db
      .select()
      .from(crmCreateRequests)
      .where(
        and(
          eq(crmCreateRequests.organizationId, organizationId),
          eq(crmCreateRequests.actorEntityId, actorEntityId),
          eq(crmCreateRequests.operation, operation),
          eq(crmCreateRequests.requestId, requestId),
        ),
      );
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new ConflictError("Request identity was reused with different input.");
      const result = await read(ctx, previous.entityId);
      ctx.effects.hint({
        audience: realtimeKeys.entity(organizationId, previous.entityId),
        domain: "context",
      });
      return result;
    }
    const result = await create(ctx);
    await ctx.db.insert(crmCreateRequests).values({
      organizationId,
      actorEntityId,
      operation,
      requestId,
      fingerprint,
      entityId: result.entityId,
    });
    return result;
  });
}
