import { userAgents } from "../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../core/executor";
import { eq } from "drizzle-orm";

/**
 * The device an agent runs on, or null when no device runs it. Agent-work code reaches an
 * agent's home only through this lookup and the homed-agent queries in device.ts.
 */
export async function homeDeviceOf(db: DatabaseExecutor, userAgentId: string) {
  const [agent] = await db
    .select({ homeDeviceId: userAgents.homeDeviceId })
    .from(userAgents)
    .where(eq(userAgents.id, userAgentId));
  return agent?.homeDeviceId ?? null;
}
