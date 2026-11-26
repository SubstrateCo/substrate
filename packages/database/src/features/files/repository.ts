import { MAX_ATTACHMENTS, attachmentFileIds } from "@substrate/contracts/files/attachments";

import { RepositoryContext, type Authorized } from "../../core/repository-context";
import { messagingSession } from "../../core/session/messaging";
import { storedFiles } from "../../core/storage/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import { loadConversation, requireMessage } from "../messaging/access";
import { messagingMessages } from "../messaging/schema";
import { workHint } from "../realtime/routing";
import { queryTaskDetail } from "../tasks/queries";
import { taskRepository } from "../tasks/repository";
import type { tasks } from "../tasks/tasks.schema";
import { messageAttachmentMetadata, taskAttachmentMetadata } from "./metadata";
import { publishFiles } from "./publication";
import { messageAttachments, taskAttachments } from "./schema";
import { and, eq, isNull, sql } from "drizzle-orm";

type Task = typeof tasks.$inferSelect;

export const attachmentReferences = sql`(exists (select 1 from ${taskAttachments} where ${taskAttachments.fileId} = ${storedFiles.id})
  or exists (select 1 from ${messageAttachments} where ${messageAttachments.fileId} = ${storedFiles.id}))`;

export function createAttachmentRepository(context: RepositoryContext) {
  const { db, scope } = context;
  if (!scope.userId) throw new AccessDeniedError();
  const identity = { userId: scope.userId, organizationId: scope.organizationId };
  async function taskContext<T, Level extends "view" | "edit">(
    input: { taskEntityId: string; projectEntityId: string },
    level: Level,
    run: (ctx: RepositoryContext, task: Authorized<Task, Level>) => Promise<T>,
  ) {
    return context.transaction(async (ctx) => {
      const task = await taskRepository(ctx).get(input.taskEntityId, level);
      if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
      return run(ctx, task);
    });
  }
  return {
    async listTask(input: { taskEntityId: string; projectEntityId: string }) {
      const task = await taskRepository(context).get(input.taskEntityId);
      if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
      return taskAttachmentMetadata(db, task.entityId);
    },
    /**
     * The files of the message a task was created from. They keep the message's access: a
     * reader who cannot open the source message gets no source and no files.
     */
    async listTaskSource(input: { taskEntityId: string; projectEntityId: string }) {
      const task = await taskRepository(context).get(input.taskEntityId);
      if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
      const { source } = await queryTaskDetail(context, identity, task);
      if (!source) return { source: null, attachments: [] };
      const attachments = await messageAttachmentMetadata(db, [source.id]);
      return {
        source: { conversationId: source.conversationId, messageId: source.id },
        attachments: attachments.map(({ messageId: _messageId, ...attachment }) => attachment),
      };
    },
    addTask(input: { taskEntityId: string; projectEntityId: string; attachmentFileIds: string[] }) {
      return taskContext(input, "edit", async (ctx, task) => {
        if (
          !input.attachmentFileIds.length ||
          !attachmentFileIds.safeParse(input.attachmentFileIds).success
        )
          throw new ValidationError("Select up to 10 distinct files.");
        const existing = await ctx.db
          .select({ fileId: taskAttachments.fileId, position: taskAttachments.position })
          .from(taskAttachments)
          .where(eq(taskAttachments.taskEntityId, input.taskEntityId));
        const existingIds = new Set(existing.map((item) => item.fileId));
        const toAttach = input.attachmentFileIds.filter((id) => !existingIds.has(id));
        if (!toAttach.length) return;
        if (existing.length + toAttach.length > MAX_ATTACHMENTS)
          throw new ValidationError("A task can have up to 10 files.");
        await publishFiles(ctx, task, toAttach);
        const position = Math.max(-1, ...existing.map((item) => item.position)) + 1;
        await ctx.db
          .insert(taskAttachments)
          .values(
            toAttach.map((fileId, index) => ({
              organizationId: ctx.scope.organizationId,
              taskEntityId: input.taskEntityId,
              fileOrganizationId: ctx.scope.organizationId,
              fileId,
              addedByActorEntityId: ctx.scope.actorEntityId,
              position: position + index,
            })),
          )
          .onConflictDoNothing({ target: [taskAttachments.taskEntityId, taskAttachments.fileId] });
        ctx.effects.hint(workHint(scope.organizationId, task.projectEntityId, [task.entityId]));
      });
    },
    /**
     * Shares a file that is already attached to a message with a task's readers. The caller
     * must be able to edit the task and read the message. The task references the same stored
     * file, so no bytes are copied, and removing it from the task leaves the message unchanged.
     */
    addTaskFromMessage(input: {
      taskEntityId: string;
      projectEntityId: string;
      messageId: string;
      attachmentId: string;
    }) {
      return taskContext(input, "edit", async (ctx) => {
        const { message, conversation } = await requireMessage(ctx.db, identity, input.messageId);
        if (message.deletedAt) throw new AccessDeniedError();
        const [source] = await ctx.db
          .select({ fileId: storedFiles.id, organizationId: storedFiles.organizationId })
          .from(messageAttachments)
          .innerJoin(storedFiles, eq(storedFiles.id, messageAttachments.fileId))
          .where(
            and(
              eq(messageAttachments.conversationId, conversation.id),
              eq(messageAttachments.messageId, message.id),
              eq(messageAttachments.id, input.attachmentId),
            ),
          );
        // A partner organization's file stays in its own organization's records.
        if (!source || source.organizationId !== ctx.scope.organizationId)
          throw new AccessDeniedError();
        const existing = await ctx.db
          .select({
            id: taskAttachments.id,
            fileId: taskAttachments.fileId,
            position: taskAttachments.position,
          })
          .from(taskAttachments)
          .where(eq(taskAttachments.taskEntityId, input.taskEntityId));
        const attached = existing.find((item) => item.fileId === source.fileId);
        if (attached) return { id: attached.id, changed: false };
        if (existing.length >= MAX_ATTACHMENTS)
          throw new ValidationError("A task can have up to 10 files.");
        const [row] = await ctx.db
          .insert(taskAttachments)
          .values({
            organizationId: ctx.scope.organizationId,
            taskEntityId: input.taskEntityId,
            fileOrganizationId: ctx.scope.organizationId,
            fileId: source.fileId,
            addedByActorEntityId: ctx.scope.actorEntityId,
            position: Math.max(-1, ...existing.map((item) => item.position)) + 1,
          })
          .onConflictDoNothing({ target: [taskAttachments.taskEntityId, taskAttachments.fileId] })
          .returning({ id: taskAttachments.id });
        if (!row) {
          // A concurrent call attached the same file first.
          const [winner] = await ctx.db
            .select({ id: taskAttachments.id })
            .from(taskAttachments)
            .where(
              and(
                eq(taskAttachments.taskEntityId, input.taskEntityId),
                eq(taskAttachments.fileId, source.fileId),
              ),
            );
          if (!winner) throw new AccessDeniedError();
          return { id: winner.id, changed: false };
        }
        ctx.effects.hint(
          workHint(scope.organizationId, input.projectEntityId, [input.taskEntityId]),
        );
        return { id: row.id, changed: true };
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
        // taskContext checked that the task belongs to this project.
        ctx.effects.hint(
          workHint(scope.organizationId, input.projectEntityId, [input.taskEntityId]),
        );
        return { id: input.attachmentId };
      });
    },
    async taskContent(input: {
      taskEntityId: string;
      projectEntityId: string;
      attachmentId: string;
    }) {
      const task = await taskRepository(context).get(input.taskEntityId);
      if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
      const [row] = await db
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
