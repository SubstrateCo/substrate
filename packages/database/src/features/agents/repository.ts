import {
  agentTriggerKinds,
  type SaveAgentTriggersInput,
  type AgentCatalog,
  type AgentConfiguration,
  type SaveAgentValues,
} from "@substrate/contracts/agents";
import { managedPicturePath } from "@substrate/contracts/files/pictures";

import { userAgents } from "../../core/actors/user-agents.schema";
import { deviceOnline, findDevice } from "../../core/devices/repository";
import { desktopDevices } from "../../core/devices/schema";
import { effectsFor } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import { storedFiles } from "../../core/storage/schema";
import { AccessDeniedError, ValidationError, violatedConstraint } from "../../errors";
import { endMovedLeases } from "../agent-work/host/lease";
import { endAgentTurns, endDeletedAgentWork } from "../agent-work/stop";
import { agentRefreshHints } from "../realtime/routing";
import { userAgentTriggers } from "./triggers.schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

function configuration(row: typeof userAgents.$inferSelect): AgentConfiguration {
  const result: AgentConfiguration = {
    id: row.id,
    image: managedPicturePath(row.imageFileId),
    name: row.name,
    instructions: row.instructions,
    harness: row.harness,
    enabled: row.enabled,
    useStartupDefaults: row.useStartupDefaults,
  };
  if (row.model !== null) result.model = row.model;
  return result;
}

/** `installationId` names the calling desktop, when the request came from one. */
export function createAgentRepository(
  db: DatabaseExecutor,
  userId: string,
  installationId?: string,
) {
  async function changed(tx = db) {
    for (const hint of await agentRefreshHints(tx, userId)) effectsFor(tx).hint(hint);
  }
  async function currentDevice() {
    return installationId ? findDevice(db, userId, installationId) : null;
  }
  const ownAgent = (id: string) =>
    and(eq(userAgents.id, id), eq(userAgents.userId, userId), isNull(userAgents.deletedAt));
  async function updateOwnAgent(id: string, values: Partial<typeof userAgents.$inferInsert>) {
    const [row] = await db
      .update(userAgents)
      .set(values)
      .where(ownAgent(id))
      .returning({ id: userAgents.id });
    if (!row) throw new AccessDeniedError();
    await changed();
    return null;
  }
  return {
    async list(): Promise<AgentCatalog> {
      const rows = await db
        .select({
          agent: userAgents,
          device: { id: desktopDevices.id, name: desktopDevices.name, online: deviceOnline },
        })
        .from(userAgents)
        .leftJoin(
          desktopDevices,
          and(
            eq(desktopDevices.id, userAgents.homeDeviceId),
            eq(desktopDevices.userId, userAgents.userId),
          ),
        )
        .where(and(eq(userAgents.userId, userId), isNull(userAgents.deletedAt)));
      const ids = rows.map((row) => row.agent.id);
      const overrides = ids.length
        ? await db
            .select()
            .from(userAgentTriggers)
            .where(inArray(userAgentTriggers.userAgentId, ids))
        : [];
      const current = await currentDevice();
      return {
        agents: rows.map((row) => configuration(row.agent)),
        runSettings: rows.map(({ agent, device }) => ({
          agentId: agent.id,
          homeDevice: device?.id ? { ...device, current: device.id === current?.id } : null,
          triggers: agentTriggerKinds.map((kind) => {
            const row = overrides.find(
              (override) => override.userAgentId === agent.id && override.kind === kind,
            );
            return { kind, enabled: row?.enabled ?? true };
          }),
        })),
      };
    },
    // The route parses input. The repository writes only these fields.
    async saveAgent(input: SaveAgentValues): Promise<AgentConfiguration> {
      const { id } = input;
      const values = {
        name: input.name,
        instructions: input.instructions,
        harness: input.harness,
        model: input.model ?? null,
        enabled: input.enabled,
        useStartupDefaults: input.useStartupDefaults,
      };
      // A new local agent lives on the desktop that created it.
      const [row] = id
        ? await db.update(userAgents).set(values).where(ownAgent(id)).returning()
        : await db
            .insert(userAgents)
            .values({ ...values, userId, homeDeviceId: (await currentDevice())?.id ?? null })
            .returning();
      if (!row) throw new AccessDeniedError();
      // A disabled agent stops its live turns. Its queue and routines wait until it runs again.
      if (!row.enabled) await endAgentTurns(db, row.id);
      await changed();
      return configuration(row);
    },
    /**
     * Moves the agent to the calling desktop. Its folder on the old device is not copied, and
     * its live turns there end now, so that their work resumes here.
     */
    async setHomeDevice(id: string): Promise<null> {
      const device = await currentDevice();
      if (!device) throw new ValidationError("Open Substrate on the desktop that should run it.");
      await updateOwnAgent(id, { homeDeviceId: device.id });
      await endMovedLeases(db, id, device.id);
      return null;
    },
    async saveTriggers(input: SaveAgentTriggersInput): Promise<null> {
      return db.transaction(async (tx) => {
        const [agent] = await tx
          .select({ id: userAgents.id })
          .from(userAgents)
          .where(ownAgent(input.agentId));
        if (!agent) throw new AccessDeniedError();
        // One row per kind: the last setting of a repeated kind wins.
        const triggers = [...new Map(input.triggers.map((trigger) => [trigger.kind, trigger]))];
        if (triggers.length)
          await tx
            .insert(userAgentTriggers)
            .values(triggers.map(([, trigger]) => ({ userAgentId: agent.id, ...trigger })))
            .onConflictDoUpdate({
              target: [userAgentTriggers.userAgentId, userAgentTriggers.kind],
              set: { enabled: sql`excluded.enabled`, updatedAt: new Date() },
            });
        if (triggers.length) await changed(tx);
        return null;
      });
    },
    async setPicture(id: string, fileId: string | null): Promise<AgentConfiguration> {
      return db
        .transaction(async (tx) => {
          if (fileId !== null) {
            const [file] = await tx
              .select()
              .from(storedFiles)
              .where(
                and(
                  eq(storedFiles.id, fileId),
                  eq(storedFiles.ownerUserId, userId),
                  eq(storedFiles.purpose, "avatar"),
                ),
              );
            if (!file) throw new AccessDeniedError();
          }
          const [row] = await tx
            .update(userAgents)
            .set({ imageFileId: fileId })
            .where(ownAgent(id))
            .returning();
          if (!row) throw new AccessDeniedError();
          await changed(tx);
          return configuration(row);
        })
        .catch((error: Error) => {
          // The composite foreign key arbitrates deletion after the avatar ownership read.
          if (violatedConstraint(error) === "user_agent_picture_file_owner_fk")
            throw new AccessDeniedError();
          throw error;
        });
    },
    async deleteAgent(id: string): Promise<null> {
      await updateOwnAgent(id, { deletedAt: new Date(), enabled: false, imageFileId: null });
      await endDeletedAgentWork(db, id);
      return null;
    },
  };
}
