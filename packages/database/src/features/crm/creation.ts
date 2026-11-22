import type { accountFields, dealFields } from "@substrate/contracts/crm/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { parseInput } from "../../core/contacts/inputs";
import type { RepositoryContext } from "../../core/repository-context";
import { previousRequest, recordRequest, requestFingerprint } from "../../core/requests/once";
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
    if (!requestId) return create(ctx);
    await ctx.requireActiveActor();
    const fingerprint = requestFingerprint(payload);
    const previous = await previousRequest(ctx, operation, requestId, fingerprint);
    if (previous) {
      const result = await read(ctx, previous);
      ctx.effects.hint({
        audience: realtimeKeys.entity(ctx.scope.organizationId, previous),
        domain: "context",
      });
      return result;
    }
    const result = await create(ctx);
    await recordRequest(ctx, operation, requestId, result.entityId);
    return result;
  });
}
