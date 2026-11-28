import {
  defaultAccountNotificationPreferences,
  defaultWorkspaceNotificationPreferences,
  updateAccountNotificationPreferences,
  updateConversationNotificationPreferences,
  updateWorkspaceNotificationPreferences,
  type AccountNotificationPreferences,
  type ConversationNotificationPreferences,
  type NotificationLevel,
  type NotificationSchedule,
  type WorkspaceNotificationPreferences,
} from "@substrate/contracts/notifications/preferences";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { effectsFor } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError, ValidationError } from "../../errors";
import { messagingParticipants } from "../messaging/schema";
import { notificationPreferences, notificationWorkspacePreferences } from "./preferences.schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { z } from "zod";

const iso = (value: Date | null) => value?.toISOString() ?? null;
const date = (value: string | null) => (value === null ? null : new Date(value));

function scheduleColumns(schedule: NotificationSchedule | null) {
  if (!schedule)
    return { scheduleDays: null, scheduleStart: null, scheduleEnd: null, scheduleTimeZone: null };
  return {
    scheduleDays: schedule.days.reduce((mask, day) => mask | (1 << day), 0),
    scheduleStart: schedule.start,
    scheduleEnd: schedule.end,
    scheduleTimeZone: schedule.timeZone,
  };
}

/** Account columns for a select, read back with `toAccount`. */
export const accountColumns = {
  alertsEnabled: notificationPreferences.alertsEnabled,
  pausedUntil: notificationPreferences.pausedUntil,
  scheduleDays: notificationPreferences.scheduleDays,
  scheduleStart: notificationPreferences.scheduleStart,
  scheduleEnd: notificationPreferences.scheduleEnd,
  scheduleTimeZone: notificationPreferences.scheduleTimeZone,
  preview: notificationPreferences.preview,
  sound: notificationPreferences.sound,
  flash: notificationPreferences.flash,
};

/** Workspace columns for a select, read back with `toWorkspace`. */
export const workspaceColumns = {
  channels: notificationWorkspacePreferences.channels,
  mutedUntil: notificationWorkspacePreferences.mutedUntil,
  assignments: notificationWorkspacePreferences.assignments,
};

/** Reads selected account columns. A missing row, such as from a left join, means the defaults. */
export function toAccount(
  row: Omit<typeof notificationPreferences.$inferSelect, "userId"> | null | undefined,
): AccountNotificationPreferences {
  if (!row) return defaultAccountNotificationPreferences;
  const { scheduleDays, scheduleStart, scheduleEnd, scheduleTimeZone } = row;
  return {
    alertsEnabled: row.alertsEnabled,
    pausedUntil: iso(row.pausedUntil),
    schedule:
      scheduleDays !== null &&
      scheduleStart !== null &&
      scheduleEnd !== null &&
      scheduleTimeZone !== null
        ? {
            days: [0, 1, 2, 3, 4, 5, 6].filter((day) => scheduleDays & (1 << day)),
            start: scheduleStart,
            end: scheduleEnd,
            timeZone: scheduleTimeZone,
          }
        : null,
    preview: row.preview,
    sound: row.sound,
    flash: row.flash,
  };
}

/** Reads selected workspace columns. A missing row means the defaults. */
export function toWorkspace(
  row:
    | Omit<typeof notificationWorkspacePreferences.$inferSelect, "organizationId" | "userId">
    | null
    | undefined,
) {
  return row
    ? { ...row, mutedUntil: iso(row.mutedUntil) }
    : defaultWorkspaceNotificationPreferences;
}

/** Reads selected conversation columns. Null when the actor is not a live member. */
export function toConversation(
  row: { level: NotificationLevel | null; mutedUntil: Date | null } | null | undefined,
): ConversationNotificationPreferences | null {
  return row ? { level: row.level, mutedUntil: iso(row.mutedUntil) } : null;
}

/** Joins the account's own settings rows; their columns are null when no row exists. */
export function accountJoin(userId: string) {
  return eq(notificationPreferences.userId, userId);
}
export function workspaceJoin(identity: SessionIdentity) {
  return and(
    eq(notificationWorkspacePreferences.organizationId, identity.organizationId),
    eq(notificationWorkspacePreferences.userId, identity.userId),
  );
}

async function readAccountPreferences(db: DatabaseExecutor, userId: string) {
  const [row] = await db
    .select(accountColumns)
    .from(notificationPreferences)
    .where(accountJoin(userId));
  return toAccount(row);
}

async function readWorkspacePreferences(
  db: DatabaseExecutor,
  identity: SessionIdentity,
): Promise<WorkspaceNotificationPreferences> {
  const [row] = await db
    .select(workspaceColumns)
    .from(notificationWorkspacePreferences)
    .where(workspaceJoin(identity));
  return { organizationId: identity.organizationId, ...toWorkspace(row) };
}

/** The actor's own settings for each conversation they are a live member of. */
async function readConversationPreferences(
  db: DatabaseExecutor,
  actorEntityId: string,
  conversationIds: string[],
) {
  const preferences = new Map<string, ConversationNotificationPreferences>();
  if (!conversationIds.length) return preferences;
  const rows = await db
    .select({
      conversationId: messagingParticipants.conversationId,
      level: messagingParticipants.notificationLevel,
      mutedUntil: messagingParticipants.notificationsMutedUntil,
    })
    .from(messagingParticipants)
    .where(
      and(
        eq(messagingParticipants.actorEntityId, actorEntityId),
        inArray(messagingParticipants.conversationId, conversationIds),
        isNull(messagingParticipants.leftAt),
      ),
    );
  for (const row of rows)
    preferences.set(row.conversationId, { level: row.level, mutedUntil: iso(row.mutedUntil) });
  return preferences;
}

// Every device of the account refreshes its settings and alert decisions.
const changed = (db: DatabaseExecutor, userId: string) =>
  effectsFor(db).hint({ audience: realtimeKeys.user(userId), domain: "notification-preferences" });

/** Settings that apply in every workspace of the account. */
export function accountNotificationRepository(db: DatabaseExecutor, userId: string) {
  return {
    get: () => readAccountPreferences(db, userId),
    async update(
      input: z.input<typeof updateAccountNotificationPreferences>,
    ): Promise<AccountNotificationPreferences> {
      const parsed = updateAccountNotificationPreferences.safeParse(input);
      if (!parsed.success) throw new ValidationError("Invalid notification settings.");
      const { schedule, pausedUntil, ...rest } = parsed.data;
      const values: Partial<typeof notificationPreferences.$inferInsert> = { ...rest };
      if (pausedUntil !== undefined) values.pausedUntil = date(pausedUntil);
      if (schedule !== undefined) Object.assign(values, scheduleColumns(schedule));
      await db
        .insert(notificationPreferences)
        .values({ userId, ...values })
        .onConflictDoUpdate({
          target: notificationPreferences.userId,
          // An empty update still writes one column, so the statement stays valid.
          set: Object.keys(values).length ? values : { userId },
        });
      changed(db, userId);
      return readAccountPreferences(db, userId);
    },
  };
}

/** The account's settings in the scope's workspace and its conversations. */
export function notificationPreferencesRepository(
  ctx: RepositoryContext,
  identity: SessionIdentity,
) {
  const { db } = ctx;
  async function conversation(conversationId: string) {
    const preferences = await readConversationPreferences(db, ctx.scope.actorEntityId, [
      conversationId,
    ]);
    const found = preferences.get(conversationId);
    if (!found) throw new AccessDeniedError();
    return found;
  }
  return {
    workspace: () => readWorkspacePreferences(db, identity),
    conversation,
    async updateWorkspace(
      input: Omit<z.input<typeof updateWorkspaceNotificationPreferences>, "organizationId">,
    ): Promise<WorkspaceNotificationPreferences> {
      const parsed = updateWorkspaceNotificationPreferences.safeParse({
        ...input,
        organizationId: identity.organizationId,
      });
      if (!parsed.success) throw new ValidationError("Invalid workspace notification settings.");
      const { channels, assignments, mutedUntil } = parsed.data;
      const values: Partial<typeof notificationWorkspacePreferences.$inferInsert> = {};
      if (channels !== undefined) values.channels = channels;
      if (assignments !== undefined) values.assignments = assignments;
      if (mutedUntil !== undefined) values.mutedUntil = date(mutedUntil);
      // The workspace context verified membership; the member foreign key keeps it.
      await db
        .insert(notificationWorkspacePreferences)
        .values({ organizationId: identity.organizationId, userId: identity.userId, ...values })
        .onConflictDoUpdate({
          target: [
            notificationWorkspacePreferences.organizationId,
            notificationWorkspacePreferences.userId,
          ],
          set: Object.keys(values).length ? values : { userId: identity.userId },
        });
      changed(db, identity.userId);
      return readWorkspacePreferences(db, identity);
    },
    async updateConversation(
      conversationId: string,
      input: Omit<z.input<typeof updateConversationNotificationPreferences>, "organizationId">,
    ): Promise<ConversationNotificationPreferences> {
      const parsed = updateConversationNotificationPreferences.safeParse({
        ...input,
        organizationId: identity.organizationId,
      });
      if (!parsed.success) throw new ValidationError("Invalid conversation notification settings.");
      const { level, mutedUntil } = parsed.data;
      if (level === undefined && mutedUntil === undefined) return conversation(conversationId);
      const values: Partial<typeof messagingParticipants.$inferInsert> = {};
      if (level !== undefined) values.notificationLevel = level;
      if (mutedUntil !== undefined) values.notificationsMutedUntil = date(mutedUntil);
      // Only the actor's own live membership holds these settings.
      const written = await db
        .update(messagingParticipants)
        .set(values)
        .where(
          and(
            eq(messagingParticipants.conversationId, conversationId),
            eq(messagingParticipants.actorEntityId, ctx.scope.actorEntityId),
            isNull(messagingParticipants.leftAt),
          ),
        )
        .returning({ conversationId: messagingParticipants.conversationId });
      if (!written.length) throw new AccessDeniedError();
      changed(db, identity.userId);
      return conversation(conversationId);
    },
  };
}
