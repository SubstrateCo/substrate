import {
  saveAgentInput,
  type AgentCatalog,
  type AgentConfiguration,
  type SaveAgentInput,
} from "@startup-os/contracts/agents";
import { managedPicturePath } from "@startup-os/contracts/files/pictures";

import type { Database } from "../../client";
import { userAgents } from "../../core/actors/user-agents.schema";
import { storedFiles } from "../../core/storage/schema";
import { AccessDeniedError } from "../../errors";
import { and, eq, isNull } from "drizzle-orm";

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

export function createAgentRepository(db: Database, userId: string) {
  return {
    async list(): Promise<AgentCatalog> {
      const rows = await db
        .select()
        .from(userAgents)
        .where(and(eq(userAgents.userId, userId), isNull(userAgents.deletedAt)));
      return { agents: rows.map(configuration) };
    },
    async saveAgent(raw: SaveAgentInput): Promise<AgentConfiguration> {
      const { id, model, ...fields } = saveAgentInput.parse(raw);
      const values = { ...fields, model: model ?? null };
      const [row] = id
        ? await db
            .update(userAgents)
            .set(values)
            .where(
              and(
                eq(userAgents.id, id),
                eq(userAgents.userId, userId),
                isNull(userAgents.deletedAt),
              ),
            )
            .returning()
        : await db
            .insert(userAgents)
            .values({ ...values, userId })
            .returning();
      if (!row) throw new AccessDeniedError();
      return configuration(row);
    },
    async setPicture(id: string, fileId: string | null): Promise<AgentConfiguration> {
      return db.transaction(async (tx) => {
        const [agent] = await tx
          .select()
          .from(userAgents)
          .where(
            and(eq(userAgents.id, id), eq(userAgents.userId, userId), isNull(userAgents.deletedAt)),
          )
          .for("update");
        if (!agent) throw new AccessDeniedError();
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
            )
            .for("update");
          if (!file) throw new AccessDeniedError();
        }
        const [row] = await tx
          .update(userAgents)
          .set({ imageFileId: fileId })
          .where(eq(userAgents.id, id))
          .returning();
        return configuration(row!);
      });
    },
    async deleteAgent(id: string): Promise<null> {
      const [row] = await db
        .update(userAgents)
        .set({ deletedAt: new Date(), enabled: false, imageFileId: null })
        .where(
          and(eq(userAgents.id, id), eq(userAgents.userId, userId), isNull(userAgents.deletedAt)),
        )
        .returning({ id: userAgents.id });
      if (!row) throw new AccessDeniedError();
      return null;
    },
  };
}
