import { user } from "../../core/authentication/schema";
import { organization } from "../../core/organizations/schema";
import { messagingConversations } from "./schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// A connection authorizes an org to participate. Individual consent is still required.
export const messagingConnections = pgTable(
  "messaging_connections",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    approvedBy: text("approved_by")
      .notNull()
      .references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }).defaultNow().notNull(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.organizationId] }),
    index("messaging_connection_organization_idx").on(t.organizationId),
  ],
);

// IDs are locators, not bearer credentials: reads and acceptance require verified identity.
export const messagingInvitations = pgTable(
  "messaging_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id").notNull(),
    hostOrganizationId: text("host_organization_id").notNull(),
    senderOrganizationId: text("sender_organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id),
    email: text("email").notNull(),
    purpose: text("purpose").$type<"organization" | "person">().notNull(),
    targetOrganizationId: text("target_organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    recipientUserId: text("recipient_user_id").references(() => user.id),
    status: text("status")
      .$type<"pending" | "accepted" | "declined" | "revoked">()
      .default("pending")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveryAttempts: integer("delivery_attempts").default(0).notNull(),
    nextDeliveryAt: timestamp("next_delivery_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.hostOrganizationId, t.conversationId],
      foreignColumns: [messagingConversations.organizationId, messagingConversations.id],
    }).onDelete("cascade"),
    index("messaging_invitation_email_idx").on(t.email),
    index("messaging_invitation_conversation_idx").on(t.conversationId),
    index("messaging_invitation_sender_idx").on(t.senderOrganizationId, t.createdAt),
    index("messaging_invitation_target_idx").on(t.targetOrganizationId, t.status),
    index("messaging_invitation_recipient_idx").on(t.recipientUserId, t.status),
    index("messaging_invitation_delivery_idx")
      .on(t.nextDeliveryAt)
      .where(sql`${t.status} = 'pending' AND ${t.deliveredAt} IS NULL`),
    check(
      "messaging_invitation_status_check",
      sql`${t.status} IN ('pending', 'accepted', 'declined', 'revoked')`,
    ),
    check("messaging_invitation_purpose_check", sql`${t.purpose} IN ('organization', 'person')`),
  ],
);

export const messagingSharingEvents = pgTable(
  "messaging_sharing_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    action: text("action")
      .$type<
        | "invited"
        | "approval-requested"
        | "accepted"
        | "revoked"
        | "declined"
        | "disconnected"
        | "removed"
      >()
      .notNull(),
    targetOrganizationId: text("target_organization_id").references(() => organization.id),
    invitationId: uuid("invitation_id").references(() => messagingInvitations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("messaging_sharing_event_conversation_idx").on(t.conversationId, t.createdAt),
    index("messaging_sharing_event_invitation_idx").on(t.invitationId),
  ],
);
