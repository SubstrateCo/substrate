import type { ContactWrite } from "@substrate/contracts/contacts/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { lockContact } from "../../core/contacts/access";
import { contactDetailRows, readContactProfile } from "../../core/contacts/profile";
import { contactRepository } from "../../core/contacts/repository";
import type { RepositoryContext } from "../../core/repository-context";
import { recordCrmActivity } from "../crm/activity";

type Action =
  | "addIdentifier"
  | "updateIdentifier"
  | "removeIdentifier"
  | "addAddress"
  | "updateAddress"
  | "removeAddress"
  | "addUrl"
  | "updateUrl"
  | "removeUrl";
type Input = Extract<ContactWrite, { action: Action }>;
function collectionOf(action: Action) {
  if (action.endsWith("Identifier")) return "identifiers";
  if (action.endsWith("Address")) return "addresses";
  return "urls";
}
/** The content of the collection the action edits, without timestamps. A primary change edits
 * other rows too, so the snapshot covers the whole collection. */
async function contentKey(ctx: RepositoryContext, contactId: string, action: Action) {
  await readContactProfile(ctx, contactId);
  const rows = await contactDetailRows(ctx, contactId)[collectionOf(action)]();
  return JSON.stringify(
    rows.map((row) => ({ ...row, createdAt: undefined, updatedAt: undefined })),
  );
}
export function mutateContactDetail(context: RepositoryContext, input: Input) {
  return context.transaction(async (ctx) => {
    await lockContact(ctx, input.contactEntityId);
    const repo = contactRepository(ctx);
    const before = await contentKey(ctx, input.contactEntityId, input.action);
    async function write() {
      switch (input.action) {
        case "addIdentifier":
          return repo.addIdentifier(input.contactEntityId, input);
        case "updateIdentifier":
          return repo.updateIdentifier(input.contactEntityId, input.id, input);
        case "removeIdentifier":
          await repo.removeIdentifier(input.contactEntityId, input.id);
          return { entityId: input.contactEntityId };
        case "addAddress":
          return repo.addAddress(input.contactEntityId, input);
        case "updateAddress":
          return repo.updateAddress(input.contactEntityId, input.id, input);
        case "removeAddress":
          await repo.removeAddress(input.contactEntityId, input.id);
          return { entityId: input.contactEntityId };
        case "addUrl":
          return repo.addUrl(input.contactEntityId, input);
        case "updateUrl":
          return repo.updateUrl(input.contactEntityId, input.id, input);
        case "removeUrl":
          await repo.removeUrl(input.contactEntityId, input.id);
          return { entityId: input.contactEntityId };
      }
    }
    const result = await write();
    const after = await contentKey(ctx, input.contactEntityId, input.action);
    if (before !== after) {
      let field: "identifier" | "address" | "url" = "url";
      if (input.action.endsWith("Identifier")) field = "identifier";
      else if (input.action.endsWith("Address")) field = "address";
      await recordCrmActivity(ctx, {
        entityId: input.contactEntityId,
        action: "updated",
        changedFields: [field],
      });
      ctx.effects.hint({
        audience: realtimeKeys.entity(ctx.scope.organizationId, input.contactEntityId),
        domain: "context",
      });
    }
    return result;
  });
}
