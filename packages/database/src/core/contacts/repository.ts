import { AccessDeniedError } from "../../errors";
import { RepositoryContext, pageSize } from "../repository-context";
import { contacts } from "./schema";
import { and, asc, eq, gt } from "drizzle-orm";

export function contactRepository(context: RepositoryContext) {
  const { db, scope } = context;
  return {
    async create(input: { displayName: string }) {
      return db.transaction(async (tx) => {
        const entity = await new RepositoryContext(tx, scope).createEntity("contact");
        const [contact] = await tx
          .insert(contacts)
          .values({
            entityId: entity.entityId,
            organizationId: scope.organizationId,
            displayName: input.displayName,
          })
          .returning();
        return contact!;
      });
    },

    async get(entityId: string) {
      await context.requireAccess(entityId, "view");
      const [contact] = await db
        .select()
        .from(contacts)
        .where(
          and(eq(contacts.organizationId, scope.organizationId), eq(contacts.entityId, entityId)),
        );
      if (!contact) throw new AccessDeniedError();
      return contact;
    },

    async list(options: { limit?: number; afterEntityId?: string } = {}) {
      await context.requireActiveActor();
      return db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, scope.organizationId),
            context.readable(contacts.entityId),
            options.afterEntityId ? gt(contacts.entityId, options.afterEntityId) : undefined,
          ),
        )
        .orderBy(asc(contacts.entityId))
        .limit(pageSize(options.limit));
    },

    async update(entityId: string, input: { displayName: string }) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(entityId, "edit", true);
        const [contact] = await tx
          .update(contacts)
          .set({ displayName: input.displayName })
          .where(
            and(eq(contacts.organizationId, scope.organizationId), eq(contacts.entityId, entityId)),
          )
          .returning();
        if (!contact) throw new AccessDeniedError();
        await ctx.touch(entityId);
        return contact;
      });
    },
  };
}
