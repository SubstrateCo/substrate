import { AccessDeniedError } from "../../errors";
import {
  RepositoryContext,
  entityCursor,
  pageSize,
  type AuthorizedAccess,
} from "../repository-context";
import { contactDetailsRepository } from "./details.repository";
import { contactProfileInput, parseInput, type ContactInput } from "./inputs";
import { readContactProfile } from "./profile";
import { contacts } from "./schema";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";

/** `checked` is the caller's requireContact in this transaction; writes to that contact reuse it
 * instead of checking again. */
export function contactRepository(context: RepositoryContext, checked?: AuthorizedAccess<"edit">) {
  const { db, scope } = context;
  async function write(entityId: string, input: Partial<ContactInput>, changedOnly = false) {
    const value = parseInput(contactProfileInput.partial(), input);
    return db.transaction(async (tx) => {
      const ctx = new RepositoryContext(tx, scope);
      if (checked?.entity.entityId !== entityId)
        await ctx.requireAccess(entityId, "edit", { type: "contact" });
      // SAFETY: parsing strips unknown keys; every own key is a column of contacts.
      const fields = (Object.keys(value) as (keyof typeof value)[]).filter(
        (key) => value[key] !== undefined,
      );
      // The liveness condition makes an edit lose to a deletion that committed after the check.
      const [contact] = await tx
        .update(contacts)
        .set(value)
        .where(
          and(
            eq(contacts.organizationId, scope.organizationId),
            eq(contacts.entityId, entityId),
            ctx.readable(contacts.entityId, "view", "contact"),
            changedOnly
              ? or(...fields.map((key) => sql`${contacts[key]} IS DISTINCT FROM ${value[key]}`))
              : undefined,
          ),
        )
        .returning();
      if (contact) await ctx.touch(entityId);
      return contact;
    });
  }
  return {
    ...contactDetailsRepository(context, checked),
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
      const afterEntityId = entityCursor(options.afterEntityId);
      return db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, scope.organizationId),
            context.readable(contacts.entityId, "view", "contact"),
            afterEntityId ? gt(contacts.entityId, afterEntityId) : undefined,
          ),
        )
        .orderBy(asc(contacts.entityId))
        .limit(pageSize(options.limit));
    },

    async update(entityId: string, input: Partial<ContactInput>) {
      const contact = await write(entityId, input);
      if (!contact) throw new AccessDeniedError();
      return contact;
    },

    /** update, but only when a given field differs from the stored value. Returns null when a
     * concurrent identical edit already wrote them, so the caller records one change. */
    async updateChanged(entityId: string, input: Partial<ContactInput>) {
      return (await write(entityId, input, true)) ?? null;
    },
  };
}
