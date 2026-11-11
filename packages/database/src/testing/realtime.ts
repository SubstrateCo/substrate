import type { RealtimeAudience } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../client";
import { audienceRecipients, resolveReceiver } from "../features/realtime/audience";

/** Whether a session identity receives a change, as the realtime hub decides it. */
export async function receivesChange(
  db: DatabaseExecutor,
  identity: { userId: string; organizationId: string | null },
  audience: Readonly<RealtimeAudience>,
) {
  const receiver = await resolveReceiver(db, identity);
  return !!receiver && (await audienceRecipients(db, audience))(receiver);
}
