import { AccessDeniedError } from "../../errors";
import {
  RepositoryContext,
  entityCursor,
  pageSize,
  type LockedAccess,
} from "../repository-context";
import { contactReadable, lockContact } from "./access";
import { contactDetailsRepository } from "./details.repository";
import { contactProfileInput, parseInput, type ContactInput } from "./inputs";
import { readContactProfile } from "./profile";
import { contacts } from "./schema";
import { and, asc, eq, gt } from "drizzle-orm";

/** `locked` is the contact lock the caller holds in this transaction; writes to that contact reuse
 * it instead of locking again. */
export function contactRepository(context: RepositoryContext, locked?: LockedAccess<"edit">) {
  const { db, scope } = context;
  return {
    ...contactDetailsRepository(context, locked),
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

    get(entityId: string) {
      return readContactProfile(context, entityId);
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
        if (locked?.entity.entityId !== entityId) await lockContact(ctx, entityId);
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
