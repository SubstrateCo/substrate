import {
  triggerRegistry,
  type InboxSource,
  type InboxSourceRef,
  type InboxStatus,
} from "@substrate/contracts/agent-work";

import { commit } from "../core/effects";
import type { DatabaseExecutor } from "../core/executor";
import type { ResolvedDeviceIdentity } from "../core/session/device";
import { claimTurns, type ClaimOptions } from "../features/agent-work/host/claim";
import { ensureSession, type EnsureSessionInput } from "../features/agent-work/sessions";
import { agentTurns, agentWorkItems, userAgents } from "../schema";
import { agentWorkFixture } from "./agent-work";
import { ownedAgent } from "./agents";
import type { setupDatabase } from "./database";
import { asc, eq } from "drizzle-orm";

type Fixture = ReturnType<typeof setupDatabase>;
type Agent = Awaited<ReturnType<typeof ownedAgent>>;

export const soon = () => new Date(Date.now() + 5_000);

export async function hostFixture(f: Fixture) {
  const x = await agentWorkFixture(f);
  const identity: ResolvedDeviceIdentity = { ...x.agent.identity, deviceId: x.agent.device.id };
  const run = async <T>(work: (tx: DatabaseExecutor) => Promise<T>) =>
    (await commit(f.db, work)).result;
  const claim = (options: ClaimOptions = {}, now = soon(), as = identity) =>
    run((tx) => claimTurns(tx, as, options, now));
  const sibling = async (name: string) => {
    const agent = await ownedAgent(f, "alice", name);
    await f.db
      .update(userAgents)
      .set({ homeDeviceId: x.agent.device.id })
      .where(eq(userAgents.id, agent.agentId));
    return { ...agent, device: x.agent.device, identity: x.agent.identity };
  };
  const session = (
    input: EnsureSessionInput,
    agent: Pick<Agent, "agentId" | "actorId"> = x.agent,
  ) =>
    ensureSession(
      f.db,
      {
        organizationId: f.orgA,
        userAgentId: agent.agentId,
        agentActorEntityId: agent.actorId,
        ownerUserId: "alice",
      },
      input,
      new Date(),
    );
  const item = async (
    target: Awaited<ReturnType<typeof session>>,
    sourceRef: InboxSourceRef,
    options: { availableAt?: Date; status?: InboxStatus; body?: string } = {},
  ) => {
    const source: InboxSource = sourceRef.source;
    const availableAt = options.availableAt ?? new Date();
    const [row] = await f.db
      .insert(agentWorkItems)
      .values({
        organizationId: target.organizationId,
        userAgentId: target.userAgentId,
        agentActorEntityId: target.agentActorEntityId,
        ownerUserId: target.ownerUserId,
        sessionId: target.id,
        source,
        sourceRef,
        body: options.body ?? null,
        lane: triggerRegistry[source].lane,
        dedupeKey: crypto.randomUUID(),
        availableAt,
        deadlineAt: availableAt,
        status: options.status ?? "pending",
        createdAt: availableAt,
      })
      .returning();
    return row!;
  };
  const items = () =>
    f.db
      .select()
      .from(agentWorkItems)
      .orderBy(asc(agentWorkItems.createdAt), asc(agentWorkItems.id));
  const turnRow = async (id: string) =>
    (await f.db.select().from(agentTurns).where(eq(agentTurns.id, id)))[0]!;
  const itemRow = async (id: string) =>
    (await f.db.select().from(agentWorkItems).where(eq(agentWorkItems.id, id)))[0]!;
  return { ...x, identity, run, claim, sibling, session, item, items, turnRow, itemRow };
}
