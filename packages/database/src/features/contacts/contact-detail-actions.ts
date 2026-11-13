import type { ContactWrite } from "@substrate/contracts/contacts/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

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
type Details = Awaited<ReturnType<ReturnType<typeof contactRepository>["getDetail"]>>;
function contentKey(detail: Details) {
  return JSON.stringify({
    identifiers: detail.identifiers.map((row) => ({
      ...row,
      createdAt: undefined,
      updatedAt: undefined,
    })),
    addresses: detail.addresses.map((row) => ({
      ...row,
      createdAt: undefined,
      updatedAt: undefined,
    })),
    urls: detail.urls.map((row) => ({ ...row, createdAt: undefined, updatedAt: undefined })),
  });
}
export function mutateContactDetail(context: RepositoryContext, input: Input) {
  return context.transaction(async (ctx) => {
    await ctx.requireAccess(input.contactEntityId, "edit", true);
    const repo = contactRepository(ctx);
    const before = contentKey(await repo.getDetail(input.contactEntityId));
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
    const after = contentKey(await repo.getDetail(input.contactEntityId));
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
