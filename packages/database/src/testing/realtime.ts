import type { RealtimeAudience } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../core/executor";
import { audienceRecipients, resolveReceiver } from "../features/realtime/audience";

export async function receivesChange(
  db: DatabaseExecutor,
  identity: { userId: string; organizationId: string | null },
  audience: Readonly<RealtimeAudience>,
) {
  const receiver = await resolveReceiver(db, identity);
  return !!receiver && (await audienceRecipients(db, audience))(receiver);
}
