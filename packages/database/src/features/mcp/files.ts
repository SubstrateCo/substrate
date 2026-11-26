import {
  fileTextPage,
  type McpInput,
  type McpOutput,
} from "@substrate/contracts/agent-tools/tools";

import type { DatabaseExecutor } from "../../core/executor";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { storedFiles } from "../../core/storage/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import { containsText } from "../context/search";
import { messageAttachmentMetadata, taskAttachmentMetadata } from "../files/metadata";
import { messageAttachments, taskAttachments } from "../files/schema";
import { requireMessage, visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { liveTask } from "../tasks/access";
import { taskRepository } from "../tasks/repository";
import { tasks } from "../tasks/tasks.schema";
import { iso } from "./formatting";
import { newest, newestFirstPagination, olderThan } from "./pagination";
import { newestPage } from "./search";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";

type FileRef = Omit<McpOutput<"read_file">, "content">;
type Locator = FileRef["file"];

/**
 * Reads stored bytes for the file tools. The server supplies it, so object storage and image
 * decoding stay out of this package. Each method returns null when the object is missing; preview
 * also returns null for an image it cannot decode.
 */
export interface FileContentReader {
  /** A decoded and re-encoded WebP preview. Never the untrusted source bytes. */
  preview(objectKey: string): Promise<Uint8Array | null>;
  bytes(objectKey: string): Promise<Uint8Array | null>;
}

const previewTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const textTypes = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/javascript",
  "application/typescript",
  "application/sql",
  "application/x-sh",
]);

/** Whether read_file can return the file as text. */
function isTextType(contentType: string) {
  const type = contentType.toLowerCase();
  return (
    type.startsWith("text/") ||
    textTypes.has(type) ||
    type.endsWith("+json") ||
    type.endsWith("+xml")
  );
}

type Metadata = { id: string; filename: string; contentType: string; size: number };
const describe = (row: Metadata, file: Locator): FileRef => ({
  file,
  filename: row.filename,
  contentType: row.contentType,
  size: row.size,
});

/** The files of messages the reader can already see, keyed by message ID, in message order. */
export async function messageFiles(db: DatabaseExecutor, messageIds: string[]) {
  const rows = await messageAttachmentMetadata(db, messageIds);
  const files = new Map<string, FileRef[]>();
  for (const row of rows) {
    const list = files.get(row.messageId) ?? [];
    list.push(
      describe(row, { type: "message_attachment", messageId: row.messageId, attachmentId: row.id }),
    );
    files.set(row.messageId, list);
  }
  return files;
}

/** The files of a task the reader can already open. */
export async function taskFiles(db: DatabaseExecutor, taskId: string) {
  return (await taskAttachmentMetadata(db, taskId)).map((row) =>
    describe(row, { type: "task_attachment", taskId, attachmentId: row.id }),
  );
}

function base64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

const missing = "The file's content is missing from storage. Tell your owner.";

export function mcpFileQueries(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  reader?: FileContentReader,
) {
  const { db, scope } = ctx;

  /** The stored file behind a locator, after checking access to the record it is attached to. */
  async function resolve(locator: Locator) {
    if (locator.type === "message_attachment") {
      const { message } = await requireMessage(db, identity, locator.messageId);
      if (message.deletedAt) throw new AccessDeniedError();
      const [row] = await db
        .select({ file: storedFiles, conversationId: messageAttachments.conversationId })
        .from(messageAttachments)
        .innerJoin(storedFiles, eq(storedFiles.id, messageAttachments.fileId))
        .where(
          and(
            eq(messageAttachments.conversationId, message.conversationId),
            eq(messageAttachments.messageId, message.id),
            eq(messageAttachments.id, locator.attachmentId),
          ),
        );
      if (!row) throw new AccessDeniedError();
      return { file: row.file, ref: describe(row.file, locator), message };
    }
    const task = await taskRepository(ctx).get(locator.taskId);
    const [row] = await db
      .select({ file: storedFiles })
      .from(taskAttachments)
      .innerJoin(storedFiles, eq(storedFiles.id, taskAttachments.fileId))
      .where(
        and(
          eq(taskAttachments.organizationId, scope.organizationId),
          eq(taskAttachments.taskEntityId, task.entityId),
          eq(taskAttachments.id, locator.attachmentId),
        ),
      );
    if (!row) throw new AccessDeniedError();
    return { file: row.file, ref: describe(row.file, locator), message: null };
  }

  function requireReader() {
    if (!reader) throw new ValidationError("File content is not available in this call.");
    return reader;
  }

  return {
    resolve,

    // Message files and task files are two small newest-first queries, merged into one page.
    async list(input: McpInput<"list_files">): Promise<McpOutput<"list_files">> {
      const p = newestFirstPagination(scope, "list_files", input);
      const filters = (): SQL | undefined =>
        and(
          input.query ? containsText(storedFiles.filename, input.query) : undefined,
          input.mediaType
            ? sql`lower(${storedFiles.contentType}) like ${`${input.mediaType.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`}`
            : undefined,
        );
      const fileColumns = {
        filename: storedFiles.filename,
        contentType: storedFiles.contentType,
        size: storedFiles.size,
      };
      const branches: Promise<(FileRef & { id: string; at: Date | string })[]>[] = [];
      if (input.attachedTo !== "task") {
        const at = newest(messageAttachments.createdAt);
        branches.push(
          db
            .select({
              id: messageAttachments.id,
              messageId: messageAttachments.messageId,
              at,
              ...fileColumns,
            })
            .from(messageAttachments)
            .innerJoin(
              messagingMessages,
              and(
                eq(messagingMessages.id, messageAttachments.messageId),
                isNull(messagingMessages.deletedAt),
              ),
            )
            .innerJoin(
              messagingConversations,
              eq(messagingConversations.id, messageAttachments.conversationId),
            )
            .innerJoin(storedFiles, eq(storedFiles.id, messageAttachments.fileId))
            .where(
              and(
                visibleConversations(db, identity),
                filters(),
                olderThan(p, at, messageAttachments.id),
              ),
            )
            .orderBy(desc(at), desc(messageAttachments.id))
            .limit(p.take)
            .then((rows) =>
              rows.map((row) => ({
                ...describe(row, {
                  type: "message_attachment",
                  messageId: row.messageId,
                  attachmentId: row.id,
                }),
                id: row.id,
                at: row.at,
              })),
            ),
        );
      }
      if (input.attachedTo !== "message") {
        const at = newest(taskAttachments.createdAt);
        branches.push(
          db
            .select({
              id: taskAttachments.id,
              taskId: taskAttachments.taskEntityId,
              at,
              ...fileColumns,
            })
            .from(taskAttachments)
            .innerJoin(
              tasks,
              and(
                eq(tasks.organizationId, taskAttachments.organizationId),
                eq(tasks.entityId, taskAttachments.taskEntityId),
              ),
            )
            .innerJoin(storedFiles, eq(storedFiles.id, taskAttachments.fileId))
            .where(
              and(
                eq(taskAttachments.organizationId, scope.organizationId),
                liveTask(tasks.entityId),
                ctx.readable(tasks.entityId),
                filters(),
                olderThan(p, at, taskAttachments.id),
              ),
            )
            .orderBy(desc(at), desc(taskAttachments.id))
            .limit(p.take)
            .then((rows) =>
              rows.map((row) => ({
                ...describe(row, {
                  type: "task_attachment",
                  taskId: row.taskId,
                  attachmentId: row.id,
                }),
                id: row.id,
                at: row.at,
              })),
            ),
        );
      }
      const page = await newestPage(p, branches);
      return {
        items: page.items.map(({ id: _id, at, ...ref }) => ({
          ...ref,
          attachedAt: iso(at),
        })),
        nextCursor: page.nextCursor,
      };
    },

    async read(input: McpInput<"read_file">): Promise<McpOutput<"read_file">> {
      const { file, ref } = await resolve(input.file);
      const files = requireReader();
      if (previewTypes.has(file.contentType.toLowerCase())) {
        const preview = await files.preview(file.objectKey);
        if (!preview)
          return {
            ...ref,
            content: {
              kind: "unavailable",
              reason:
                "This image cannot be previewed. It may be damaged or too large. Use download_file to get the original.",
            },
          };
        return {
          ...ref,
          content: { kind: "image", mimeType: "image/webp", data: base64(preview) },
        };
      }
      if (!isTextType(file.contentType))
        return {
          ...ref,
          content: {
            kind: "unavailable",
            reason: `read_file cannot show ${file.contentType} files. Use download_file and open the saved file with your own tools.`,
          },
        };
      const bytes = await files.bytes(file.objectKey);
      if (!bytes) return { ...ref, content: { kind: "unavailable", reason: missing } };
      const text = new TextDecoder("utf-8").decode(bytes);
      if (input.offset > text.length)
        throw new ValidationError("offset is past the end of the file.");
      const end = Math.min(text.length, input.offset + fileTextPage);
      return {
        ...ref,
        content: {
          kind: "text",
          text: text.slice(input.offset, end),
          offset: input.offset,
          nextOffset: end < text.length ? end : null,
        },
      };
    },

    async download(input: McpInput<"download_file">): Promise<McpOutput<"download_file">> {
      const { file, ref } = await resolve(input.file);
      const bytes = await requireReader().bytes(file.objectKey);
      if (!bytes) throw new ValidationError(missing);
      return { ...ref, data: base64(bytes) };
    },
  };
}
