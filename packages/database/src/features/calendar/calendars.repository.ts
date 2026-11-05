import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { AccessDeniedError } from "../../errors";
import { RepositoryContext, pageSize } from "../../core/repository-context";
import { calendars } from "./calendars.schema";
import { validateTimeZone } from "./timing";

export function calendarRepository(context: RepositoryContext) {
  const { db, scope } = context;
  return {
    async create(input: { name: string; timeZone: string }) {
      validateTimeZone(input.timeZone);
      return db.transaction(async (tx) => {
        const entity = await new RepositoryContext(tx, scope).createEntity("calendar");
        const [calendar] = await tx
          .insert(calendars)
          .values({
            entityId: entity.entityId,
            organizationId: scope.organizationId,
            name: input.name,
            timeZone: input.timeZone,
          })
          .returning();
        return calendar!;
      });
    },
    async get(entityId: string) {
      await context.requireAccess(entityId, "view");
      const [calendar] = await db
        .select()
        .from(calendars)
        .where(
          and(eq(calendars.organizationId, scope.organizationId), eq(calendars.entityId, entityId)),
        );
      if (!calendar) throw new AccessDeniedError();
      return calendar;
    },
    async list(options: { limit?: number; afterEntityId?: string } = {}) {
      await context.requireActiveActor();
      return db
        .select()
        .from(calendars)
        .where(
          and(
            eq(calendars.organizationId, scope.organizationId),
            inArray(calendars.entityId, context.readableEntities()),
            options.afterEntityId ? gt(calendars.entityId, options.afterEntityId) : undefined,
          ),
        )
        .orderBy(asc(calendars.entityId))
        .limit(pageSize(options.limit));
    },
    async update(entityId: string, input: { name: string; timeZone: string }) {
      validateTimeZone(input.timeZone);
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(entityId, "edit", true);
        const [calendar] = await tx
          .update(calendars)
          .set({ name: input.name, timeZone: input.timeZone })
          .where(
            and(
              eq(calendars.organizationId, scope.organizationId),
              eq(calendars.entityId, entityId),
            ),
          )
          .returning();
        if (!calendar) throw new AccessDeniedError();
        await ctx.touch(entityId);
        return calendar;
      });
    },
  };
}
