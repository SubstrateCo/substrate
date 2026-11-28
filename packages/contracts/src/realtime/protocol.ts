import type { RealtimeMethods } from "./ipc.ts";
import { z } from "zod";

const identifier = z.string().min(1).max(200);

// Audience keys select recipients; the server must still authorize each delivery.
export const realtimeKeys = {
  organization: (organizationId: string) => ["organization", organizationId] as const,
  conversation: (conversationId: string) => ["conversation", conversationId] as const,
  actor: (organizationId: string, actorEntityId: string) =>
    ["actor", organizationId, actorEntityId] as const,
  user: (userId: string) => ["user", userId] as const,
  // Members who can read the entity through its access container.
  entity: (organizationId: string, entityId: string) =>
    ["entity", organizationId, entityId] as const,
};

export const realtimeAudience = z.union([
  z.tuple([z.literal("organization"), identifier]),
  z.tuple([z.literal("conversation"), identifier]),
  z.tuple([z.literal("actor"), identifier, identifier]),
  z.tuple([z.literal("user"), identifier]),
  z.tuple([z.literal("entity"), identifier, identifier]),
]);
export type RealtimeAudience = z.infer<typeof realtimeAudience>;

export const realtimeDomain = z.enum([
  "messaging",
  "tasks",
  "context",
  "notifications",
  "notification-preferences",
  "access",
  "organization",
  "apps",
  "session",
  "agents",
  "agent-work",
  "profile",
]);
export type RealtimeDomain = z.infer<typeof realtimeDomain>;

// Narrows a messaging change. "messages": message content changed, but membership and
// conversation details did not. "reactions": only the reactions of one message changed.
// "read": only the viewer's read position, so only unread state, changed. Optional: without it,
// clients refresh the whole messaging domain.
//
// "activity" narrows an agent-work change: only a live turn's activity text changed. What waits
// for the owner, and what the host must run, did not.
export const realtimeScope = z.enum(["messages", "reactions", "read", "activity"]);
export type RealtimeScope = z.infer<typeof realtimeScope>;

// A hint names at most this many tasks; a larger change names only the project.
export const realtimeTaskLimit = 50;

// Identifiers of the changed records. A hint carries them only to an audience that can see those
// records, and never carries record data. Each is optional: without it, clients refresh more.
export const realtimeDetail = {
  scope: realtimeScope.optional(),
  messageId: identifier.optional(),
  // The thread of the changed message: null for the main timeline.
  threadId: identifier.nullable().optional(),
  // The project of the changed work. Without taskIds, the project itself or any of its tasks.
  projectId: identifier.optional(),
  // The changed tasks, all in projectId.
  taskIds: z.array(identifier).min(1).max(realtimeTaskLimit).optional(),
};

interface MessagingDetail {
  scope?: Exclude<RealtimeScope, "activity">;
  messageId?: string;
  threadId?: string | null;
}

interface WorkDetail {
  projectId?: string;
  taskIds?: string[];
}

type Audience = { audience: Readonly<RealtimeAudience> };

/**
 * Messaging changes name messages; task changes name work. A reference change names either the
 * message whose references changed, to its conversation, or the referenced work, to its readers.
 */
export type RealtimeHint =
  | (Audience & { domain: "messaging" } & MessagingDetail)
  | (Audience & { domain: "tasks"; scope?: never } & WorkDetail)
  | (Audience & { domain: "context"; scope?: never; messageId?: string } & WorkDetail)
  | (Audience & { domain: "agent-work"; scope?: "activity" })
  | (Audience & {
      domain: Exclude<RealtimeDomain, "messaging" | "tasks" | "context" | "agent-work">;
      scope?: never;
    });

export const realtimeEvent = z.discriminatedUnion("type", [
  z.object({ version: z.literal(1), type: z.literal("ready") }),
  z.object({
    version: z.literal(1),
    type: z.literal("change"),
    id: z.uuid(),
    organizationId: identifier.nullable(),
    domain: realtimeDomain,
    conversationId: identifier.optional(),
    ...realtimeDetail,
  }),
]);
export type RealtimeEvent = z.infer<typeof realtimeEvent>;
export type RealtimeStatus = "connecting" | "connected" | "disconnected" | "forbidden";
export type RealtimeUpdate = RealtimeEvent | { type: "status"; status: RealtimeStatus };

export const realtimeEventChannel = "substrate:realtime:event";
export interface RealtimeAPI extends RealtimeMethods {
  onEvent(callback: (event: RealtimeUpdate) => void): () => void;
}
