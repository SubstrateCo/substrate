import { userAgents } from "../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../core/executor";
import { eq } from "drizzle-orm";

export async function homeDeviceOf(db: DatabaseExecutor, userAgentId: string) {
  const [agent] = await db
    .select({ homeDeviceId: userAgents.homeDeviceId })
    .from(userAgents)
    .where(eq(userAgents.id, userAgentId));
  return agent?.homeDeviceId ?? null;
}
