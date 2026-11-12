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
};

export const realtimeAudience = z.union([
  z.tuple([z.literal("organization"), identifier]),
  z.tuple([z.literal("conversation"), identifier]),
  z.tuple([z.literal("actor"), identifier, identifier]),
  z.tuple([z.literal("user"), identifier]),
]);
export type RealtimeAudience = z.infer<typeof realtimeAudience>;

export const realtimeDomain = z.enum([
  "messaging",
  "tasks",
  "context",
  "notifications",
  "access",
  "organization",
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
export const realtimeScope = z.enum(["messages", "reactions", "read"]);
export type RealtimeScope = z.infer<typeof realtimeScope>;

// Identifiers of the changed records. A hint carries them only to an audience that can see those
// records, and never carries record data. Each is optional: without it, clients refresh more.
export const realtimeDetail = {
  scope: realtimeScope.optional(),
  messageId: identifier.optional(),
  // The thread of the changed message: null for the main timeline.
  threadId: identifier.nullable().optional(),
};

interface MessagingDetail {
  scope?: RealtimeScope;
  messageId?: string;
  threadId?: string | null;
}

/** Only messaging changes have a scope and message identifiers. */
export type RealtimeHint =
  | ({ audience: Readonly<RealtimeAudience>; domain: "messaging" } & MessagingDetail)
  | {
      audience: Readonly<RealtimeAudience>;
      domain: Exclude<RealtimeDomain, "messaging">;
      scope?: never;
    };

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
