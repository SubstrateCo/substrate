import type { DealOutcome } from "@substrate/contracts/crm/input";

import { actors } from "../../core/actors/schema";
import { contacts } from "../../core/contacts/schema";
import { entities, entityType } from "../../core/entities/schema";
import { idColumn } from "../../core/ids";
import { organization } from "../../core/organizations/schema";
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  numeric,
  date,
  boolean,
  foreignKey,
  unique,
  uniqueIndex,
  check,
  index,
} from "drizzle-orm/pg-core";

export const crmAccounts = pgTable(
  "crm_accounts",
  {
    entityId: uuid("entity_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    entityType: entityType("entity_type").notNull(),
    name: text("name").notNull(),
    website: text("website"),
    domain: text("domain"),
    summary: text("summary").notNull().default(""),
    ownerActorEntityId: uuid("owner_actor_entity_id").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.entityId, t.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.ownerActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    unique().on(t.organizationId, t.entityId),
    check("crm_account_type", sql`${t.entityType}::text = 'account'`),
    check("crm_account_name", sql`length(trim(${t.name})) between 1 and 300`),
  ],
);
export const crmContactProfiles = pgTable(
  "crm_contact_profiles",
  {
    organizationId: text("organization_id").notNull(),
    contactEntityId: uuid("contact_entity_id").primaryKey(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.contactEntityId],
      foreignColumns: [contacts.organizationId, contacts.entityId],
    }).onDelete("cascade"),
  ],
);
export const crmAffiliations = pgTable(
  "crm_affiliations",
  {
    id: idColumn(),
    organizationId: text("organization_id").notNull(),
    contactEntityId: uuid("contact_entity_id").notNull(),
    accountEntityId: uuid("account_entity_id").notNull(),
    title: text("title").default("").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.contactEntityId],
      foreignColumns: [contacts.organizationId, contacts.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.accountEntityId],
      foreignColumns: [crmAccounts.organizationId, crmAccounts.entityId],
    }).onDelete("cascade"),
    unique().on(t.organizationId, t.contactEntityId, t.accountEntityId),
    index("crm_affiliations_account_idx").on(t.organizationId, t.accountEntityId),
    uniqueIndex("crm_affiliations_primary_unique")
      .on(t.organizationId, t.contactEntityId)
      .where(sql`${t.isPrimary}`),
  ],
);
export const crmStages = pgTable(
  "crm_stages",
  {
    id: idColumn(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    retired: boolean("retired").default(false).notNull(),
  },
  (t) => [unique().on(t.organizationId, t.id)],
);
export const crmDeals = pgTable(
  "crm_deals",
  {
    entityId: uuid("entity_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    entityType: entityType("entity_type").notNull(),
    title: text("title").notNull(),
    accountEntityId: uuid("account_entity_id"),
    ownerActorEntityId: uuid("owner_actor_entity_id").notNull(),
    stageId: uuid("stage_id").notNull(),
    outcome: text("outcome").$type<DealOutcome>().default("open").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }),
    currency: text("currency"),
    expectedCloseDate: date("expected_close_date"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).defaultNow().notNull(),
    summary: text("summary").default("").notNull(),
    lostReason: text("lost_reason"),
    version: integer("version").default(1).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.entityId, t.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.accountEntityId],
      foreignColumns: [crmAccounts.organizationId, crmAccounts.entityId],
    }),
    foreignKey({
      columns: [t.organizationId, t.ownerActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    foreignKey({
      columns: [t.organizationId, t.stageId],
      foreignColumns: [crmStages.organizationId, crmStages.id],
    }),
    unique().on(t.organizationId, t.entityId),
    check("crm_deal_type", sql`${t.entityType}::text = 'deal'`),
    check(
      "crm_deal_money",
      sql`(${t.amount} is null and ${t.currency} is null) or (${t.amount} is not null and ${t.currency} is not null and ${t.amount} >= 0 and ${t.currency} ~ '^[A-Z]{3}$')`,
    ),
    check("crm_deal_outcome", sql`(${t.outcome} = 'open') = (${t.closedAt} is null)`),
    index("crm_deals_stage_idx").on(t.organizationId, t.stageId),
  ],
);
export const crmDealContacts = pgTable(
  "crm_deal_contacts",
  {
    id: idColumn(),
    organizationId: text("organization_id").notNull(),
    dealEntityId: uuid("deal_entity_id").notNull(),
    contactEntityId: uuid("contact_entity_id").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.dealEntityId],
      foreignColumns: [crmDeals.organizationId, crmDeals.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.contactEntityId],
      foreignColumns: [contacts.organizationId, contacts.entityId],
    }),
    unique().on(t.organizationId, t.dealEntityId, t.contactEntityId),
  ],
);
