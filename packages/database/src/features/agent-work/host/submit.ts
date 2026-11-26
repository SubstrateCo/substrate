import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { ResolvedDeviceIdentity } from "../../../core/session/device";
import { AccessDeniedError } from "../../../errors";
import { admit } from "../admission/admission";
import { agentSessions } from "../sessions.schema";
import { and, eq } from "drizzle-orm";

/**
 * Work the host creates itself: an epoch handoff for one of its sessions. Admission admits it
 * only from the agent's home device. Returns whether a new item was created; a repeated handoff
 * for the same epoch creates nothing.
 */
export async function submitEpoch(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  input: { sessionId: string; fromEpoch: number; body: string },
  now = new Date(),
) {
  const [session] = await db
    .select()
    .from(agentSessions)
    .where(
      and(
        eq(agentSessions.id, input.sessionId),
        eq(agentSessions.organizationId, identity.organizationId),
        eq(agentSessions.ownerUserId, identity.userId),
      ),
    );
  if (!session) throw new AccessDeniedError();
  const { items, hints } = await admit(
    db,
    [
      {
        type: "host",
        source: "epoch",
        deviceId: identity.deviceId,
        session,
        fromEpoch: input.fromEpoch,
        body: input.body,
      },
    ],
    now,
  );
  for (const hint of hints) effectsFor(db).hint(hint);
  return { created: items.length > 0 };
}
