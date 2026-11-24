import type { CrmFromMessageResult } from "@substrate/contracts/crm/from-message";
import type { McpInput } from "@substrate/contracts/harness/tools";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { contactApplicationRepository } from "../contacts/repository";
import { contextContactInteractionRepository } from "../context/interactions/contact-interactions";
import { requireDealRelations } from "../crm/deals/deal-relations";
import { createCrmFromMessageInContext } from "../crm/from-message";
import { crmRepository } from "../crm/repository";
import { requireCrmAdmin } from "../crm/settings";
import { linkSummary } from "./links";
import { mcpTaskQueries } from "./tasks";

/** Called only behind the MCP turn/device/write gates, on the caller's transaction. */
export function mcpCrmTools(context: RepositoryContext, identity: SessionIdentity) {
  // Preserve the validated acting agent. CRM resolves human responsibility separately.
  const crm = crmRepository(context);
  const interactions = contextContactInteractionRepository(context);
  const contacts = contactApplicationRepository(context);
  const read = (input: McpInput<"get_crm_record">) => {
    switch (input.kind) {
      case "account":
        return crm.getAccount(input.entityId);
      case "contact":
        return contacts.getContact(input.entityId);
      case "deal":
        return crm.getDeal(input.entityId);
    }
  };
  const fromMessageView = async (result: CrmFromMessageResult) => ({
    entityId: result.entityId,
    entityType: result.entityType,
    record: await read({ kind: result.entityType, entityId: result.entityId }),
  });
  return {
    fromMessageView,
    async createFromMessage(input: McpInput<"create_crm_from_message">) {
      const result = await createCrmFromMessageInContext(context, identity, {
        ...input,
        organizationId: context.scope.organizationId,
      });
      return fromMessageView(result);
    },
    async activity(input: McpInput<"list_crm_activity">) {
      return crm.activity(input.entityId, { limit: input.limit, before: input.before });
    },
    async settings() {
      return { settings: await crm.settings() };
    },
    async updateSettings(input: McpInput<"update_crm_settings">) {
      return { settings: await crm.updateSettings(input) };
    },
    async requireSettingsAdmin() {
      await requireCrmAdmin(context);
    },
    async createFollowUp(input: McpInput<"create_crm_follow_up">) {
      const task = await crm.createFollowUp(input);
      return mcpTaskQueries(context, identity).getTask(task.entityId);
    },
    async requireDealRelations(input: McpInput<"create_crm_deal">) {
      await requireDealRelations(context, input, { active: false });
    },
    async list(input: McpInput<"list_crm_records">) {
      const limit = input.limit ?? 25;
      const list = (options: typeof input) => {
        switch (input.kind) {
          case "account":
            return crm.listAccounts(options);
          case "contact":
            return contacts.listContacts(options);
          case "deal":
            return crm.listDeals(options);
        }
      };
      const rows = await list({ ...input, limit });
      const last = rows.at(-1);
      const lastId = last && ("contact" in last ? last.contact.entityId : last.entityId);
      // A full page has more only if a record follows it: a one-row ID seek, not an empty page.
      const more =
        rows.length === limit &&
        lastId !== undefined &&
        (await list({ ...input, afterEntityId: lastId, limit: 1 })).length > 0;
      return { items: rows, nextAfterEntityId: more ? lastId : null };
    },
    async get(input: McpInput<"get_crm_record">) {
      const record = await read(input);
      return { record, linked: await linkSummary(context, identity, input.entityId) };
    },
    async pipeline() {
      return { stages: await crm.pipeline() };
    },
    async createAccount(input: McpInput<"create_crm_account">) {
      return { record: await crm.createAccount(input) };
    },
    async updateAccount(input: McpInput<"update_crm_account">) {
      return { record: await crm.updateAccount(input.entityId, input) };
    },
    async createContact(input: McpInput<"create_crm_contact">) {
      return { record: await contacts.createContact(input) };
    },
    async updateContact(input: McpInput<"update_crm_contact">) {
      return { record: await contacts.updateContact(input.entityId, input) };
    },
    async createDeal(input: McpInput<"create_crm_deal">) {
      return { record: await crm.createDeal(input) };
    },
    async updateDeal(input: McpInput<"update_crm_deal">) {
      return { record: await crm.updateDeal(input.entityId, input.expectedVersion, input) };
    },
    async transition(input: McpInput<"transition_crm_deal">) {
      const { entityId, ...change } = input;
      return { record: await crm.transitionDeal(entityId, change) };
    },
    async listInteractions(input: McpInput<"list_crm_interactions">) {
      const page = (limit: number, before?: { occurredAt: Date; entityId: string }) =>
        interactions.listInteractions(input.contactEntityId, { limit, before });
      const items = await page(
        input.limit,
        input.before && { ...input.before, occurredAt: new Date(input.before.occurredAt) },
      );
      const last = items.at(-1);
      const cursor = last && { occurredAt: last.occurredAt, entityId: last.entityId };
      // A full page has more only if an interaction follows it.
      const more = items.length === input.limit && cursor && (await page(1, cursor)).length > 0;
      return {
        items,
        nextBefore: more
          ? { occurredAt: cursor.occurredAt.toISOString(), entityId: cursor.entityId }
          : null,
      };
    },
    async createInteraction(input: McpInput<"create_crm_interaction">) {
      return {
        record: await interactions.createInteraction({
          ...input,
          occurredAt: new Date(input.occurredAt),
          endedAt: input.endedAt == null ? input.endedAt : new Date(input.endedAt),
        }),
      };
    },
    async requireInteraction(entityId: string) {
      // Access/integrity check only. Never return this core row; public reads use CRM views.
      await interactions.get(entityId);
    },
    async publishInteraction(input: McpInput<"publish_crm_interaction">) {
      return { record: await interactions.publishInteraction(input) };
    },
  };
}
