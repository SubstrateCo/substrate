import { MAX_ATTACHMENTS, attachmentFileIds } from "@startup-os/contracts/files/attachments";

import type { Database } from "../../client";
import { resolveHumanActor } from "../../core/actors/provisioning";
import { RepositoryContext } from "../../core/repository-context";
import type { StorageScope } from "../../core/storage/repository";
import { storedFiles } from "../../core/storage/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import { messagingSession, loadConversation } from "../messaging/access";
import { taskRepository } from "../tasks/repository";
import { taskAttachmentMetadata } from "./metadata";
import { publishFiles } from "./publication";
import { messageAttachments, taskAttachments } from "./schema";
import { and, eq, sql } from "drizzle-orm";

export const attachmentReferences = sql`exists (select 1 from ${taskAttachments} where ${taskAttachments.fileId} = ${storedFiles.id})
  or exists (select 1 from ${messageAttachments} where ${messageAttachments.fileId} = ${storedFiles.id})`;

export function createAttachmentRepository(db: Database) {
  async function context(scope: StorageScope) {
    if (!scope.organizationId) throw new AccessDeniedError();
    const actor = await resolveHumanActor(db, {
      userId: scope.userId,
      organizationId: scope.organizationId,
    });
    return { organizationId: scope.organizationId, actorEntityId: actor.entityId };
  }
  async function taskContext<T>(
    scope: StorageScope,
    input: { taskEntityId: string; projectEntityId: string },
    level: "view" | "edit",
    run: (ctx: RepositoryContext) => Promise<T>,
  ) {
    const actor = await context(scope);
    return db.transaction(async (tx) => {
      const ctx = new RepositoryContext(tx, actor);
      const task = await taskRepository(ctx).get(input.taskEntityId, level, true);
      if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
      return run(ctx);
    });
  }
  return {
    async listTask(scope: StorageScope, input: { taskEntityId: string; projectEntityId: string }) {
      const actor = await context(scope);
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, actor);
        const task = await taskRepository(ctx).get(input.taskEntityId);
        if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
        return taskAttachmentMetadata(tx, task.entityId);
      });
    },
    addTask(
      scope: StorageScope,
      input: { taskEntityId: string; projectEntityId: string; attachmentFileIds: string[] },
    ) {
      return taskContext(scope, input, "edit", async (ctx) => {
        if (
          !input.attachmentFileIds.length ||
          !attachmentFileIds.safeParse(input.attachmentFileIds).success
        )
          throw new ValidationError("Select up to 10 distinct files.");
        const existing = await taskAttachmentMetadata(ctx.db, input.taskEntityId);
        if (input.attachmentFileIds.every((id) => existing.some((item) => item.fileId === id)))
          return existing;
        if (existing.length + input.attachmentFileIds.length > MAX_ATTACHMENTS)
          throw new ValidationError("A task can have up to 10 files.");
        await publishFiles(ctx, input.attachmentFileIds);
        const position = Math.max(-1, ...existing.map((item) => item.position)) + 1;
        await ctx.db.insert(taskAttachments).values(
          input.attachmentFileIds.map((fileId, index) => ({
            organizationId: ctx.scope.organizationId,
            taskEntityId: input.taskEntityId,
            fileOrganizationId: ctx.scope.organizationId,
            fileId,
            addedByActorEntityId: ctx.scope.actorEntityId,
            position: position + index,
          })),
        );
        return taskAttachmentMetadata(ctx.db, input.taskEntityId);
      });
    },
    removeTask(
      scope: StorageScope,
      input: { taskEntityId: string; projectEntityId: string; attachmentId: string },
    ) {
      return taskContext(scope, input, "edit", async (ctx) => {
        const removed = await ctx.db
          .delete(taskAttachments)
          .where(
            and(
              eq(taskAttachments.taskEntityId, input.taskEntityId),
              eq(taskAttachments.id, input.attachmentId),
            ),
          )
          .returning();
        if (!removed.length) throw new AccessDeniedError();
        return { id: input.attachmentId };
      });
    },
    async taskContent(
      scope: StorageScope,
      input: { taskEntityId: string; projectEntityId: string; attachmentId: string },
    ) {
      const actor = await context(scope);
      return db.transaction(async (tx) => {
        const task = await taskRepository(new RepositoryContext(tx, actor)).get(input.taskEntityId);
        if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
        const [row] = await tx
          .select({ file: storedFiles })
          .from(taskAttachments)
          .innerJoin(storedFiles, eq(storedFiles.id, taskAttachments.fileId))
          .where(
            and(
              eq(taskAttachments.taskEntityId, task.entityId),
              eq(taskAttachments.id, input.attachmentId),
            ),
          );
        if (!row) throw new AccessDeniedError();
        return row.file;
      });
    },
    async messageContent(
      scope: StorageScope,
      input: { conversationId: string; messageId: string; attachmentId: string },
    ) {
      if (!scope.organizationId) throw new AccessDeniedError();
      const identity = { userId: scope.userId, organizationId: scope.organizationId };
      return db.transaction(async (tx) => {
        await messagingSession(tx, identity);
        await loadConversation(tx, identity, input.conversationId);
        const [row] = await tx
          .select({ file: storedFiles })
          .from(messageAttachments)
          .innerJoin(storedFiles, eq(storedFiles.id, messageAttachments.fileId))
          .where(
            and(
              eq(messageAttachments.conversationId, input.conversationId),
              eq(messageAttachments.messageId, input.messageId),
              eq(messageAttachments.id, input.attachmentId),
            ),
          );
        if (!row) throw new AccessDeniedError();
        return row.file;
      });
    },
  };
}
