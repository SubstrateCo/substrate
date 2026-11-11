import { MAX_ATTACHMENTS, attachmentFileIds } from "@substrate/contracts/files/attachments";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { RepositoryContext, type Locked } from "../../core/repository-context";
import { messagingSession } from "../../core/session/messaging";
import { storedFiles } from "../../core/storage/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import { loadConversation } from "../messaging/access";
import { messagingMessages } from "../messaging/schema";
import { taskRepository } from "../tasks/repository";
import type { tasks } from "../tasks/tasks.schema";
import { taskAttachmentMetadata } from "./metadata";
import { publishFiles } from "./publication";
import { messageAttachments, taskAttachments } from "./schema";
import { and, eq, isNull, sql } from "drizzle-orm";

type Task = typeof tasks.$inferSelect;

export const attachmentReferences = sql`exists (select 1 from ${taskAttachments} where ${taskAttachments.fileId} = ${storedFiles.id})
  or exists (select 1 from ${messageAttachments} where ${messageAttachments.fileId} = ${storedFiles.id})`;

export function createAttachmentRepository(context: RepositoryContext) {
  const { db, scope } = context;
  if (!scope.userId) throw new AccessDeniedError();
  const identity = { userId: scope.userId, organizationId: scope.organizationId };
  async function taskContext<T, Level extends "view" | "edit">(
    input: { taskEntityId: string; projectEntityId: string },
    level: Level,
    run: (ctx: RepositoryContext, task: Locked<Task, Level>) => Promise<T>,
  ) {
    return context.transaction(async (ctx) => {
      const task = await taskRepository(ctx).get(input.taskEntityId, level, true);
      if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
      return run(ctx, task);
    });
  }
  return {
    async listTask(input: { taskEntityId: string; projectEntityId: string }) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        const task = await taskRepository(ctx).get(input.taskEntityId);
        if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
        return taskAttachmentMetadata(tx, task.entityId);
      });
    },
    addTask(input: { taskEntityId: string; projectEntityId: string; attachmentFileIds: string[] }) {
      return taskContext(input, "edit", async (ctx, task) => {
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
        await publishFiles(ctx, task, input.attachmentFileIds);
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
        ctx.effects.hint({
          audience: realtimeKeys.organization(scope.organizationId),
          domain: "tasks",
        });
        return taskAttachmentMetadata(ctx.db, input.taskEntityId);
      });
    },
    removeTask(input: { taskEntityId: string; projectEntityId: string; attachmentId: string }) {
      return taskContext(input, "edit", async (ctx) => {
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
        ctx.effects.hint({
          audience: realtimeKeys.organization(scope.organizationId),
          domain: "tasks",
        });
        return { id: input.attachmentId };
      });
    },
    async taskContent(input: {
      taskEntityId: string;
      projectEntityId: string;
      attachmentId: string;
    }) {
      return db.transaction(async (tx) => {
        const task = await taskRepository(new RepositoryContext(tx, scope)).get(input.taskEntityId);
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
    async messageContent(input: {
      conversationId: string;
      messageId: string;
      attachmentId: string;
    }) {
      return db.transaction(async (tx) => {
        await messagingSession(tx, identity);
        await loadConversation(tx, identity, input.conversationId);
        const [row] = await tx
          .select({ file: storedFiles })
          .from(messageAttachments)
          .innerJoin(
            messagingMessages,
            and(
              eq(messagingMessages.id, messageAttachments.messageId),
              isNull(messagingMessages.deletedAt),
            ),
          )
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
