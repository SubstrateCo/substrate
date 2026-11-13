import {
  crmFromMessage,
  type CrmFromMessageInput,
  type CrmFromMessageResult,
} from "@substrate/contracts/crm/from-message";

import type { DatabaseExecutor } from "../../client";
import { parseInput } from "../../core/contacts/inputs";
import { commit } from "../../core/effects";
import type { RepositoryContext } from "../../core/repository-context";
import { previousRequest, recordRequest, requestFingerprint } from "../../core/requests/once";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError } from "../../errors";
import { contactApplicationRepository } from "../contacts/repository";
import { messageEntityReferences } from "../context/schema";
import { requireMessage } from "../messaging/access";
import { referenceChangeHints } from "../realtime/routing";
import { recordCrmActivity } from "./activity";
import { crmRepository } from "./repository";

// The identity and actor context are supplied by the host, never by model/request fields.
export async function createCrmFromMessageInContext(
  context: RepositoryContext,
  identity: SessionIdentity,
  input: CrmFromMessageInput,
): Promise<CrmFromMessageResult> {
  const value = parseInput(crmFromMessage, input);
  if (
    value.organizationId !== context.scope.organizationId ||
    identity.organizationId !== context.scope.organizationId
  )
    throw new AccessDeniedError();
  return context.transaction(async (ctx) => {
    const resolved = await workspaceContext(ctx.db, identity);
    if (resolved.context.scope.actorEntityId !== ctx.scope.actorEntityId)
      throw new AccessDeniedError();
    await ctx.requireActiveActor();
    const destinationIds =
      value.kind === "deal"
        ? [value.fields.accountEntityId, ...value.fields.contactEntityIds].filter(
            (id): id is string => id !== null,
          )
        : [];
    // Match createTaskFromMessage: conversation, sorted access paths, then message.
    // Admin/CRM access never substitutes for independently readable source access.
    const { conversation, message } = await requireMessage(
      ctx.db,
      identity,
      value.messageId,
      "share",
      async (source) => {
        if (source.taskEntityId) {
          await ctx.lockAccessPaths([...destinationIds, source.taskEntityId]);
          await ctx.requireAccess(source.taskEntityId, "view");
        }
      },
    );
    if (message.deletedAt || conversation.organizationId !== ctx.scope.organizationId)
      throw new AccessDeniedError();
    if (!conversation.taskEntityId) await ctx.lockAccessPaths(destinationIds);

    const { organizationId, actorEntityId } = ctx.scope;
    const fields =
      value.kind === "deal"
        ? { ...value.fields, contactEntityIds: [...value.fields.contactEntityIds].sort() }
        : value.fields;
    const fingerprint = requestFingerprint({
      messageId: value.messageId,
      kind: value.kind,
      fields,
      consentToRecordAudience: value.consentToRecordAudience,
      associate: value.associate,
    });
    const previous = await previousRequest(ctx, "crm_from_message", value.requestId, fingerprint);
    const crm = crmRepository(ctx);
    const contacts = contactApplicationRepository(ctx);
    let entityId: string;
    if (previous) {
      // Read the current record, not stored source content. Never restore a missing source edge.
      if (value.kind === "account") await crm.getAccount(previous);
      else if (value.kind === "contact") await contacts.getContact(previous);
      else await crm.getDeal(previous);
      entityId = previous;
    } else {
      if (value.kind === "account") entityId = (await crm.createAccount(value.fields)).entityId;
      else if (value.kind === "contact")
        entityId = (await contacts.createContact(value.fields)).entityId;
      else entityId = (await crm.createDeal(value.fields)).entityId;
      // Only reviewed fields above are saved. A message is not an entity or a contact identity.
      await ctx.db.insert(messageEntityReferences).values(
        (value.associate ? (["source", "association"] as const) : (["source"] as const)).map(
          (purpose) => ({
            organizationId,
            conversationId: conversation.id,
            messageId: value.messageId,
            entityId,
            entityType: value.kind,
            purpose,
            createdByActorEntityId: actorEntityId,
          }),
        ),
      );
      // Account/deal and the canonical contact wrapper already record "created" activity.
      if (value.associate) await recordCrmActivity(ctx, { entityId, action: "discussion_linked" });
      await recordRequest(ctx, "crm_from_message", value.requestId, fingerprint, entityId);
    }
    for (const hint of referenceChangeHints(
      organizationId,
      [{ entityId, entityType: value.kind, accessEntityId: entityId }],
      { id: value.messageId, conversationId: conversation.id },
    ))
      ctx.effects.hint(hint);
    return { entityId, entityType: value.kind };
  });
}

export function createCrmFromMessage(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  input: CrmFromMessageInput,
) {
  return commit(db, async (tx) => {
    const { context } = await workspaceContext(tx, identity);
    return createCrmFromMessageInContext(context, identity, input);
  });
}
