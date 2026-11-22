import { contactInteractions } from "../../core/contacts/interactions.schema";
import { contacts } from "../../core/contacts/schema";
import { appEnabledCondition } from "../../core/permissions/app-visibility";
import { crmAccounts, crmContactProfiles, crmDeals } from "../crm/schema";
import { isNull, sql, type SQLWrapper } from "drizzle-orm";

function activeContact(organizationId: SQLWrapper, contactEntityId: SQLWrapper) {
  return sql`not exists (select 1 from ${crmContactProfiles}
    where ${crmContactProfiles.organizationId} = ${organizationId}
      and ${crmContactProfiles.contactEntityId} = ${contactEntityId}
      and ${appEnabledCondition(organizationId, "crm")}
      and ${crmContactProfiles.archivedAt} is not null)`;
}

export const crmContextTargets = {
  contact: {
    table: contacts,
    title: contacts.displayName,
    active: activeContact(contacts.organizationId, contacts.entityId),
  },
  account: { table: crmAccounts, title: crmAccounts.name, active: isNull(crmAccounts.archivedAt) },
  deal: { table: crmDeals, title: crmDeals.title, active: isNull(crmDeals.archivedAt) },
  contact_interaction: {
    table: contactInteractions,
    title: contactInteractions.summary,
    active: activeContact(contactInteractions.organizationId, contactInteractions.contactEntityId),
  },
};

export type CrmContextType = keyof typeof crmContextTargets;
export const crmContextTypes = ["contact", "account", "deal", "contact_interaction"] as const;
export function isCrmContextType(type: string): type is CrmContextType {
  return Object.hasOwn(crmContextTargets, type);
}
