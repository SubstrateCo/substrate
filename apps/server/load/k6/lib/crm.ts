import type { contactWrite } from "@substrate/contracts/contacts/input";
import type { interactionWrite } from "@substrate/contracts/context/interactions";
import type {
  CrmFromMessageInput,
  CrmFromMessageResult,
} from "@substrate/contracts/crm/from-message";
import type { crmWrite } from "@substrate/contracts/crm/input";

import type { ContactsService } from "../../../src/v1/contacts/service.ts";
import type { ContactInteractionsService } from "../../../src/v1/context/interactions-service.ts";
import type { createContextService } from "../../../src/v1/context/service.ts";
import type { CrmService } from "../../../src/v1/crm/service.ts";
import type { createTasksService } from "../../../src/v1/tasks/service.ts";
import type { LoadUser } from "../../types.ts";
import { call } from "./http.ts";
import { fail } from "k6";
import type { z } from "zod";

type WithoutOrganization<T> = T extends unknown ? Omit<T, "organizationId"> : never;
export type CrmCommand = WithoutOrganization<
  z.input<typeof crmWrite> | z.input<typeof contactWrite> | z.input<typeof interactionWrite>
>;
type RecordReadServices = CrmService & {
  listContacts: ContactsService["list"];
  interactions: ContactInteractionsService["list"];
};
export type CrmData<K extends keyof RecordReadServices> = Extract<
  Awaited<ReturnType<RecordReadServices[K]>>,
  { success: true }
>["data"];
export type ContactDetail = Extract<
  Awaited<ReturnType<ContactsService["get"]>>,
  { success: true }
>["data"];
export type DealDetail = CrmData<"getDeal">;
export type Stage = CrmData<"pipeline">[number];
export type RelatedContext = Extract<
  Awaited<ReturnType<ReturnType<typeof createContextService>["getRelatedContext"]>>,
  { success: true }
>["data"];
export type MessageLinks = Extract<
  Awaited<ReturnType<ReturnType<typeof createContextService>["getMessageLinks"]>>,
  { success: true }
>["data"];
export type TaskProject = Extract<
  Awaited<ReturnType<ReturnType<typeof createTasksService>["getProject"]>>,
  { success: true }
>["data"];
export interface RecordId {
  entityId: string;
}

/** No blind retries: creation/transition callers retain their request ID for an exact replay. */
export function mutate<T = RecordId>(input: CrmCommand, domain: "crm" | "contacts" = "crm") {
  if (domain === "contacts") return call<T>("contacts.mutations", input);
  const interaction = [
    "createInteraction",
    "updateInteraction",
    "deleteInteraction",
    "publishInteraction",
  ].includes(input.action);
  if (interaction) return call<T>("context.interactionMutations", input);
  if (input.action === "createContact" || input.action === "updateContact")
    return call<T>("contacts.mutations", input);
  return call<T>("crm.mutations", input);
}

export function createFromMessage(input: WithoutOrganization<CrmFromMessageInput>) {
  return call<CrmFromMessageResult>("crm.fromMessage", input);
}

export function fixture(user: LoadUser) {
  if (!user.crm) fail("CRM fixtures are missing. Run load:provision against the load server.");
  return user.crm;
}

export function reportPeriod() {
  const now = Date.now();
  return {
    from: new Date(now - 30 * 86400000).toISOString(),
    to: new Date(now + 86400000).toISOString(),
  };
}
