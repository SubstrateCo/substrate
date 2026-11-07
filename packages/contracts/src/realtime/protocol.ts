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
  "profile",
]);
export type RealtimeDomain = z.infer<typeof realtimeDomain>;

export const realtimeEvent = z.discriminatedUnion("type", [
  z.object({ version: z.literal(1), type: z.literal("ready") }),
  z.object({
    version: z.literal(1),
    type: z.literal("change"),
    id: z.uuid(),
    organizationId: identifier.nullable(),
    domain: realtimeDomain,
    conversationId: identifier.optional(),
  }),
]);
export type RealtimeEvent = z.infer<typeof realtimeEvent>;
export type RealtimeStatus = "connecting" | "connected" | "disconnected" | "forbidden";
export type RealtimeUpdate = RealtimeEvent | { type: "status"; status: RealtimeStatus };
export const realtimeConnectInput = z.object({ organizationId: identifier.nullable() });

export const realtimeChannel = "startup-os:realtime";
export const realtimeEventChannel = "startup-os:realtime:event";
export interface RealtimeAPI {
  connect(input: z.infer<typeof realtimeConnectInput>): Promise<void>;
  disconnect(): Promise<void>;
  onEvent(callback: (event: RealtimeUpdate) => void): () => void;
}
