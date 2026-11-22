import { AccessDeniedError } from "../../errors";
import { RepositoryContext, entityCursor, pageSize } from "../repository-context";
import { contactReadable, lockContact, requireContact } from "./access";
import { contactDetailsRepository } from "./details.repository";
import { contactProfileInput, parseInput, type ContactInput } from "./inputs";
import { contacts } from "./schema";
import { and, asc, eq, gt } from "drizzle-orm";

export function contactRepository(context: RepositoryContext) {
  const { db, scope } = context;
  return {
    ...contactDetailsRepository(context),
    async create(input: ContactInput) {
      const value = parseInput(contactProfileInput, input);
      return db.transaction(async (tx) => {
        const entity = await new RepositoryContext(tx, scope).createEntity("contact");
        const [contact] = await tx
          .insert(contacts)
          .values({
            entityId: entity.entityId,
            organizationId: scope.organizationId,
            ...value,
          })
          .returning();
        return contact!;
      });
    },

    async get(entityId: string) {
      await requireContact(context, entityId);
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
      const afterEntityId = entityCursor(options.afterEntityId);
      return db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, scope.organizationId),
            contactReadable(context, contacts.entityId),
            afterEntityId ? gt(contacts.entityId, afterEntityId) : undefined,
          ),
        )
        .orderBy(asc(contacts.entityId))
        .limit(pageSize(options.limit));
    },

    async update(entityId: string, input: Partial<ContactInput>) {
      const value = parseInput(contactProfileInput.partial(), input);
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await lockContact(ctx, entityId);
        const [contact] = await tx
          .update(contacts)
          .set(value)
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
