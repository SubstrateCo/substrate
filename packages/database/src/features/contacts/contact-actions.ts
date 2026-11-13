import { contactProfileInput, parseInput, type ContactInput } from "../../core/contacts/inputs";
import { contactRepository } from "../../core/contacts/repository";
import type { RepositoryContext } from "../../core/repository-context";
import { recordCrmActivity } from "../crm/activity";

export function contactActions(context: RepositoryContext) {
  return {
    create(input: ContactInput) {
      return context.transaction(async (ctx) => {
        const contact = await contactRepository(ctx).create(input);
        await recordCrmActivity(ctx, { entityId: contact.entityId, action: "created" });
        return contact;
      });
    },
    update(entityId: string, input: Partial<ContactInput>) {
      const value = parseInput(contactProfileInput.partial(), input);
      return context.transaction(async (ctx) => {
        await ctx.requireAccess(entityId, "edit", true);
        const repo = contactRepository(ctx);
        const previous = await repo.get(entityId);
        // SAFETY: parsing above strips unknown keys; every own key belongs to ContactInput.
        const changedFields = (Object.keys(value) as (keyof typeof value)[]).filter(
          (key) => value[key] !== undefined && value[key] !== previous[key],
        );
        if (!changedFields.length) return previous;
        const contact = await repo.update(entityId, value);
        await recordCrmActivity(ctx, { entityId, action: "updated", changedFields });
        return contact;
      });
    },
  };
}
