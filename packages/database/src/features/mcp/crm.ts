import { contactDetailActions, mcpTools } from "@substrate/contracts/agent-tools/tools";
import type { McpInput } from "@substrate/contracts/agent-tools/tools";
import { contactWrite, type ContactWrite } from "@substrate/contracts/contacts/input";
import { crmFromMessage } from "@substrate/contracts/crm/from-message";
import type { CrmFromMessageResult } from "@substrate/contracts/crm/from-message";
import type { JsonValue } from "@substrate/contracts/harness-runtime";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { ValidationError } from "../../errors";
import { contactApplicationRepository } from "../contacts/repository";
import { contextContactInteractionRepository } from "../context/interactions/contact-interactions";
import { requireDealRelations } from "../crm/deals/deal-relations";
import { createCrmFromMessageInContext } from "../crm/from-message";
import { crmRepository } from "../crm/repository";
import { requireCrmAdmin } from "../crm/settings";
import { linkSummary } from "./links";
import { mcpTaskQueries } from "./tasks";
import { z } from "zod";

/**
 * A phone number without a country cannot be matched later. People may store one as written;
 * an agent must say which country a national number belongs to.
 */
function requireDialable(value: string, countryCode: string | undefined) {
  if (!countryCode && !value.trim().startsWith("+"))
    throw new ValidationError(
      "This phone number has no country. Set the two-letter country code, such as US, or write the number with its + country prefix.",
    );
}

// Not strict: it reads these fields out of a contact's other fields.
const contactExtras = z.object(
  mcpTools.create_crm_contact.input.pick({
    email: true,
    phone: true,
    phoneCountryCode: true,
    accountEntityId: true,
    title: true,
  }).shape,
);

type DetailChange = Parameters<
  ReturnType<typeof contactApplicationRepository>["mutateContactDetail"]
>[0];

function isDetailChange(change: ContactWrite): change is ContactWrite & DetailChange {
  return contactDetailActions.some((action) => action === change.action);
}

/** The fields a caller supplied: a field left out must not overwrite a stored value. */
function supplied<T extends { [field: string]: JsonValue | undefined }>(changes: T) {
  // SAFETY: removing undefined values leaves a subset of the same fields.
  return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

/**
 * Checks a flat tool input against the form schema of its kind or action. The message names the
 * fields to correct, because the tool's own schema cannot say which fields each variant needs.
 */
function form<T>(schema: z.ZodType<T>, value: { [field: string]: JsonValue | undefined }): T {
  const given = Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  );
  const parsed = schema.safeParse(given);
  if (parsed.success) return parsed.data;
  throw new ValidationError(
    parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; ")
      .slice(0, 1000),
  );
}

/** Called only behind the MCP turn/device/write gates, on the caller's transaction. */
export function mcpCrmTools(context: RepositoryContext, identity: SessionIdentity) {
  // Preserve the validated acting agent. CRM resolves human responsibility separately.
  const crm = crmRepository(context);
  const interactions = contextContactInteractionRepository(context);
  const contacts = contactApplicationRepository(context);
  /** Stage names by ID, so that a deal says where it is without a pipeline read. */
  const stageNames = async () =>
    new Map((await crm.pipeline()).map((stage) => [stage.id, stage.name]));
  const read = async (input: McpInput<"get_crm_record">) => {
    switch (input.kind) {
      case "account":
        return crm.getAccount(input.entityId);
      case "contact":
        return contacts.getContact(input.entityId);
      case "deal": {
        const found = await crm.getDeal(input.entityId);
        const stageName = (await stageNames()).get(found.deal.stageId) ?? null;
        return { ...found, deal: { ...found.deal, stageName } };
      }
    }
  };
  /** The email, phone and account that a new contact can take in the call that creates it. */
  const addContactDetails = async (
    contactEntityId: string,
    { email, phone, phoneCountryCode, accountEntityId, title }: z.output<typeof contactExtras>,
  ) => {
    const detail = { organizationId: context.scope.organizationId, isPrimary: true };
    if (email)
      await contacts.mutateContactDetail({
        ...detail,
        action: "addIdentifier",
        contactEntityId,
        type: "email",
        value: email,
      });
    if (phone)
      await contacts.mutateContactDetail({
        ...detail,
        action: "addIdentifier",
        contactEntityId,
        type: "phone",
        value: phone,
        countryCode: phoneCountryCode,
      });
    if (accountEntityId)
      await crm.setAffiliation({
        contactEntityId,
        accountEntityId,
        title: title ?? "",
        isPrimary: true,
      });
  };
  const fromMessageView = async (result: CrmFromMessageResult) => ({
    entityId: result.entityId,
    entityType: result.entityType,
    record: await read({ kind: result.entityType, entityId: result.entityId }),
  });
  return {
    fromMessageView,
    async createFromMessage(input: McpInput<"create_crm_from_message">) {
      // A contact takes its email, phone and account here as in create_crm_contact.
      const extras = input.kind === "contact" ? contactExtras.parse(input.fields) : {};
      const fields = Object.fromEntries(
        Object.entries(input.fields).filter(([field]) => !(field in contactExtras.shape)),
      );
      if (extras.phone) requireDialable(extras.phone, extras.phoneCountryCode);
      const result = await createCrmFromMessageInContext(
        context,
        identity,
        form(crmFromMessage, {
          ...input,
          fields: input.kind === "contact" ? fields : input.fields,
          organizationId: context.scope.organizationId,
        }),
      );
      if (input.kind === "contact") await addContactDetails(result.entityId, extras);
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
    async requireDealRelations(input: {
      accountEntityId?: string | null;
      contactEntityIds?: string[];
    }) {
      await requireDealRelations(
        context,
        { accountEntityId: input.accountEntityId, contactEntityIds: input.contactEntityIds ?? [] },
        { active: false },
      );
    },
    async list(input: McpInput<"list_crm_records">) {
      const limit = input.limit ?? 25;
      const dealsWithStage = async (options: typeof input) => {
        const deals = await crm.listDeals(options);
        const names = deals.length ? await stageNames() : new Map<string, string>();
        return deals.map((deal) => ({ ...deal, stageName: names.get(deal.stageId) ?? null }));
      };
      const { kind } = input;
      if (!kind) {
        // One page of each kind. A caller that needs more pages one kind.
        const options = { ...input, afterEntityId: undefined, limit };
        const [accounts, people, deals] = await Promise.all([
          crm.listAccounts(options),
          contacts.listContacts(options),
          dealsWithStage(options),
        ]);
        return {
          items: [
            ...accounts.map((row) => ({ kind: "account" as const, ...row })),
            ...people.map((row) => ({ kind: "contact" as const, ...row })),
            ...deals.map((row) => ({ kind: "deal" as const, ...row })),
          ],
          nextAfterEntityId: null,
        };
      }
      const list = (options: typeof input) => {
        switch (kind) {
          case "account":
            return crm.listAccounts(options);
          case "contact":
            return contacts.listContacts(options);
          case "deal":
            return dealsWithStage(options);
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
      const { entityId, requestId: _request, ...changes } = input;
      const { account } = await crm.getAccount(entityId);
      const { name, website, domain, summary } = account;
      return {
        record: await crm.updateAccount(entityId, {
          name,
          website,
          domain,
          summary,
          ...supplied(changes),
        }),
      };
    },
    async createContact(input: McpInput<"create_crm_contact">) {
      const { email, phone, phoneCountryCode, accountEntityId, title, ...fields } = input;
      if (phone) requireDialable(phone, phoneCountryCode);
      const created = await contacts.createContact(fields);
      const contactEntityId = created.entityId;
      await addContactDetails(contactEntityId, {
        email,
        phone,
        phoneCountryCode,
        accountEntityId,
        title,
      });
      if (!email && !phone && !accountEntityId) return { record: created };
      const { identifiers, affiliations } = await contacts.getContact(contactEntityId);
      return { record: { ...created, identifiers, affiliations } };
    },
    async updateContact(input: McpInput<"update_crm_contact">) {
      return { record: await contacts.updateContact(input.entityId, input) };
    },
    async createDeal(input: McpInput<"create_crm_deal">) {
      return { record: await crm.createDeal(input) };
    },
    async updateDeal(input: McpInput<"update_crm_deal">) {
      const { entityId, expectedVersion, requestId: _request, ...changes } = input;
      // The deal form replaces every field, so fields the agent left out keep their value here.
      const { deal, contacts: people } = await crm.getDeal(entityId);
      return {
        record: await crm.updateDeal(entityId, expectedVersion, {
          title: deal.title,
          accountEntityId: deal.accountEntityId,
          contactEntityIds: people.map((entry) => entry.contact.entityId),
          primaryContactEntityId: people.find((entry) => entry.isPrimary)?.contact.entityId ?? null,
          stageId: deal.stageId,
          amount: deal.amount,
          currency: deal.currency,
          expectedCloseDate: deal.expectedCloseDate,
          summary: deal.summary,
          ...supplied(changes),
        }),
      };
    },
    async transition(input: McpInput<"transition_crm_deal">) {
      const { entityId, ...change } = input;
      // Without a stage, the outcome changes in the stage the deal is in.
      const stageId = change.stageId ?? (await crm.getDeal(entityId)).deal.stageId;
      return { record: await crm.transitionDeal(entityId, { ...change, stageId }) };
    },
    async listInteractions(input: McpInput<"list_crm_interactions">) {
      const page = (limit: number, before?: { occurredAt: string; entityId: string }) =>
        crm.timeline(input.entityId, {
          limit,
          beforeOccurredAt: before?.occurredAt,
          beforeEntityId: before?.entityId,
          mode: input.linkedOnly ? "linked" : "participants",
        });
      const items = await page(input.limit, input.before);
      const last = items.at(-1);
      const cursor = last && {
        occurredAt: new Date(last.occurredAt).toISOString(),
        entityId: last.entityId,
      };
      // A full page has more only if an interaction follows it.
      const more = items.length === input.limit && cursor && (await page(1, cursor)).length > 0;
      return { items, nextBefore: more ? cursor : null };
    },
    async searchInteractions(input: McpInput<"search_crm_interactions">) {
      // Without a period the search covers all time; the period fields then only pass validation.
      const until = input.until ?? new Date().toISOString();
      const from = input.from ?? new Date(Date.parse(until) - 86_400_000).toISOString();
      const page = await interactions.workspaceTimeline({
        organizationId: context.scope.organizationId,
        from,
        until,
        timeZone: "UTC",
        allTime: input.from ? undefined : "true",
        contactEntityId: input.contactEntityId,
        accountEntityId: input.accountEntityId,
        kind: input.kind,
        origin: input.origin,
        search: input.search,
        beforeOccurredAt: input.before?.occurredAt,
        beforeEntityId: input.before?.entityId,
      });
      return {
        items: page.items,
        nextBefore: page.nextCursor && {
          occurredAt: page.nextCursor.beforeOccurredAt,
          entityId: page.nextCursor.beforeEntityId,
        },
      };
    },
    getInteraction: (entityId: string) => interactions.workspaceRecord(entityId),
    async updateInteraction(input: McpInput<"update_crm_interaction">) {
      return { record: await interactions.updateInteraction(input.entityId, input) };
    },
    async findContacts(input: McpInput<"find_crm_contacts">) {
      const rows = await contacts.findByIdentifier(input);
      return { items: rows.map(({ entityId, displayName }) => ({ entityId, displayName })) };
    },
    async changeContactDetail(input: McpInput<"change_crm_contact_detail">) {
      const change = form(contactWrite, {
        ...input,
        organizationId: context.scope.organizationId,
      });
      if (
        (change.action === "addIdentifier" || change.action === "updateIdentifier") &&
        change.type === "phone"
      )
        requireDialable(change.value, change.countryCode);
      // The tool offers only detail actions; the form schema also knows the record actions.
      if (!isDetailChange(change)) throw new ValidationError("Use a contact detail action.");
      await contacts.mutateContactDetail(change);
      return { record: await contacts.getContact(input.contactEntityId) };
    },
    async setAffiliation(input: McpInput<"set_crm_affiliation">) {
      await crm.setAffiliation(input);
      return { record: await contacts.getContact(input.contactEntityId) };
    },
    async removeAffiliation(input: McpInput<"remove_crm_affiliation">) {
      await crm.removeAffiliation(input.contactEntityId, input.accountEntityId);
      return { record: await contacts.getContact(input.contactEntityId) };
    },
    followUps: (entityId: string) => crm.followUps(entityId),
    async archiveRecord(input: McpInput<"archive_crm_record">) {
      if (input.kind === "contact") await contacts.archive(input.entityId, input.archived);
      else {
        // The archive write checks access but not the kind, so check the kind first.
        await read({ kind: input.kind, entityId: input.entityId });
        await crm.archive(input.entityId, input.archived);
      }
      return { record: await read(input) };
    },
    async deleteInteraction(input: McpInput<"delete_crm_interaction">) {
      await interactions.deleteInteraction(input.entityId);
      return { deleted: true as const, entityId: input.entityId };
    },
    assignOwner: (input: McpInput<"assign_crm_owner">) => crm.assignOwner(input.entityId, input),
    async share(input: McpInput<"share_crm_record">) {
      return crm.share(input.entityId, input.actorEntityId, input.level);
    },
    async revoke(input: McpInput<"revoke_crm_access">) {
      return crm.revoke(input.entityId, input.actorEntityId);
    },
    async requireContact(entityId: string) {
      await contacts.getContact(entityId);
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
