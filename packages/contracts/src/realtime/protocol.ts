import type { RealtimeMethods } from "./ipc.ts";
import { z } from "zod";

const identifier = z.string().min(1).max(200);

export const realtimeKeys = {
  organization: (organizationId: string) => ["organization", organizationId] as const,
  conversation: (conversationId: string) => ["conversation", conversationId] as const,
  actor: (organizationId: string, actorEntityId: string) =>
    ["actor", organizationId, actorEntityId] as const,
  user: (userId: string) => ["user", userId] as const,
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

const messagingScopes = ["messages", "reactions", "read"] as const;
const agentWorkScopes = ["activity"] as const;
export const realtimeScope = z.enum([...messagingScopes, ...agentWorkScopes]);
export type RealtimeScope = z.infer<typeof realtimeScope>;

export const realtimeTaskLimit = 50;

export const realtimeDetail = {
  scope: realtimeScope.optional(),
  messageId: identifier.optional(),
  threadId: identifier.nullable().optional(),
  projectId: identifier.optional(),
  taskIds: z.array(identifier).min(1).max(realtimeTaskLimit).optional(),
};

interface MessagingDetail {
  scope?: (typeof messagingScopes)[number];
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
  | (Audience & { domain: "agent-work"; scope?: (typeof agentWorkScopes)[number] })
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
