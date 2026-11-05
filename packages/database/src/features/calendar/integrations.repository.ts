import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { AccessDeniedError, ConflictError } from "../../errors";
import { RepositoryContext } from "../../core/repository-context";
import { calendarRepository } from "./calendars.repository";
import { calendarIntegrations } from "./integrations.schema";

type ConnectCalendar = Pick<
  typeof calendarIntegrations.$inferInsert,
  | "calendarEntityId"
  | "provider"
  | "externalAccountId"
  | "externalResourceId"
  | "credentialReference"
>;
type SyncResult = { leaseToken: string } & (
  | { success: true; cursor: string | null }
  | { success: false; error: string }
);

export function calendarIntegrationRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const resource = (entityId: string) =>
    and(
      eq(calendarIntegrations.organizationId, scope.organizationId),
      eq(calendarIntegrations.calendarEntityId, entityId),
    );

  async function finishSync(entityId: string, result: SyncResult) {
    return db.transaction(async (tx) => {
      await new RepositoryContext(tx, scope).requireAccess(entityId, "owner", true);
      const [integration] = await tx
        .update(calendarIntegrations)
        .set({
          syncCursor: result.success ? result.cursor : undefined,
          lastSyncedAt: result.success ? sql`clock_timestamp()` : undefined,
          lastSyncError: result.success ? null : result.error,
          syncLeaseToken: null,
          syncLeaseExpiresAt: null,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(
          and(
            resource(entityId),
            eq(calendarIntegrations.syncLeaseToken, result.leaseToken),
            gt(calendarIntegrations.syncLeaseExpiresAt, sql`clock_timestamp()`),
            eq(calendarIntegrations.connectionStatus, "active"),
          ),
        )
        .returning();
      if (!integration)
        throw new ConflictError("The calendar sync lease is unavailable or expired.");
      return integration;
    });
  }

  async function setPaused(entityId: string, paused: boolean) {
    return db.transaction(async (tx) => {
      await new RepositoryContext(tx, scope).requireAccess(entityId, "owner", true);
      const [integration] = await tx
        .update(calendarIntegrations)
        .set({
          connectionStatus: paused ? "paused" : "active",
          syncLeaseToken: null,
          syncLeaseExpiresAt: null,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(resource(entityId))
        .returning();
      if (!integration) throw new AccessDeniedError();
      return integration;
    });
  }

  return {
    async connect(input: ConnectCalendar) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await calendarRepository(ctx).get(input.calendarEntityId);
        await ctx.requireAccess(input.calendarEntityId, "owner", true);
        const [integration] = await tx
          .insert(calendarIntegrations)
          .values({
            organizationId: scope.organizationId,
            calendarEntityId: input.calendarEntityId,
            provider: input.provider,
            externalAccountId: input.externalAccountId,
            externalResourceId: input.externalResourceId,
            credentialReference: input.credentialReference,
            connectedByActorEntityId: scope.actorEntityId,
          })
          .returning();
        return integration!;
      });
    },
    async get(entityId: string) {
      await context.requireAccess(entityId, "owner");
      const [integration] = await db.select().from(calendarIntegrations).where(resource(entityId));
      if (!integration) throw new AccessDeniedError();
      return integration;
    },
    async claimSync(entityId: string) {
      return db.transaction(async (tx) => {
        await new RepositoryContext(tx, scope).requireAccess(entityId, "owner", true);
        const [integration] = await tx
          .update(calendarIntegrations)
          .set({
            syncLeaseToken: sql`gen_random_uuid()`,
            syncLeaseExpiresAt: sql`clock_timestamp() + interval '5 minutes'`,
            lastSyncAttemptAt: sql`clock_timestamp()`,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              resource(entityId),
              eq(calendarIntegrations.connectionStatus, "active"),
              or(
                isNull(calendarIntegrations.syncLeaseExpiresAt),
                lt(calendarIntegrations.syncLeaseExpiresAt, sql`clock_timestamp()`),
              ),
            ),
          )
          .returning();
        if (!integration)
          throw new ConflictError("The calendar integration is paused or already syncing.");
        return {
          leaseToken: integration.syncLeaseToken!,
          leaseExpiresAt: integration.syncLeaseExpiresAt!,
          cursor: integration.syncCursor,
        };
      });
    },
    completeSync(entityId: string, result: { leaseToken: string; cursor: string | null }) {
      return finishSync(entityId, {
        success: true,
        leaseToken: result.leaseToken,
        cursor: result.cursor,
      });
    },
    failSync(entityId: string, result: { leaseToken: string; error: string }) {
      // Callers must supply a sanitized summary, never raw provider responses or credentials.
      return finishSync(entityId, {
        success: false,
        leaseToken: result.leaseToken,
        error: result.error,
      });
    },
    pause: (entityId: string) => setPaused(entityId, true),
    resume: (entityId: string) => setPaused(entityId, false),
    async disconnect(entityId: string) {
      await db.transaction(async (tx) => {
        await new RepositoryContext(tx, scope).requireAccess(entityId, "owner", true);
        await tx.delete(calendarIntegrations).where(resource(entityId));
      });
    },
  };
}
