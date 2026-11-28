import type { RealtimeReceiver } from "@substrate/database/realtime";

export function testReceiver(value: {
  userId: string;
  organizationId: string | null;
  actorId: string | null;
}) {
  // SAFETY: the brand is type-only; these tests stand in for resolveReceiver.
  return value as RealtimeReceiver;
}
