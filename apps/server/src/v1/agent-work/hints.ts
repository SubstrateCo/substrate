import { realtimeKeys, type RealtimeHint } from "@startup-os/contracts/realtime";

import { publishRefresh } from "../realtime/publisher";

// Agent work belongs to one person. Every window and desktop of that person refreshes its views.
export const ownerHint = (userId: string): RealtimeHint => ({
  audience: realtimeKeys.user(userId),
  domain: "agent-work",
});

export const ownerChanged = (userId: string, hints: RealtimeHint[] = []) =>
  publishRefresh([ownerHint(userId), ...hints]);
