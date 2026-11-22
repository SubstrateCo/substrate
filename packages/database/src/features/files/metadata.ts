import type { DatabaseExecutor } from "../../core/executor";
import { storedFiles } from "../../core/storage/schema";
import { messagingMessages } from "../messaging/schema";
import { messageAttachments, taskAttachments } from "./schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

const fileMetadata = {
  fileId: storedFiles.id,
  filename: storedFiles.filename,
  size: storedFiles.size,
  contentType: storedFiles.contentType,
};
export async function messageAttachmentMetadata(db: DatabaseExecutor, messageIds: string[]) {
  if (!messageIds.length) return [];
  return db
    .select({
      id: messageAttachments.id,
      messageId: messageAttachments.messageId,
      position: messageAttachments.position,
      ...fileMetadata,
    })
    .from(messageAttachments)
    .innerJoin(
      messagingMessages,
      and(
        eq(messagingMessages.id, messageAttachments.messageId),
        isNull(messagingMessages.deletedAt),
      ),
    )
    .innerJoin(storedFiles, eq(storedFiles.id, messageAttachments.fileId))
    .where(inArray(messageAttachments.messageId, messageIds))
    .orderBy(asc(messageAttachments.position));
}
/** Attaches files to a new message in input order and returns their metadata in one statement. */
export async function insertMessageAttachments(
  db: DatabaseExecutor,
  message: {
    conversationId: string;
    messageId: string;
    fileOrganizationId: string;
    addedByActorEntityId: string;
  },
  fileIds: string[],
) {
  if (!fileIds.length) return [];
  const inserted = db.$with("inserted_attachments").as(
    db
      .insert(messageAttachments)
      .values(fileIds.map((fileId, position) => ({ ...message, fileId, position })))
      .returning({
        id: messageAttachments.id,
        messageId: messageAttachments.messageId,
        position: messageAttachments.position,
        fileId: messageAttachments.fileId,
      }),
  );
  return db
    .with(inserted)
    .select({
      id: inserted.id,
      messageId: inserted.messageId,
      position: inserted.position,
      ...fileMetadata,
    })
    .from(inserted)
    .innerJoin(storedFiles, eq(storedFiles.id, inserted.fileId))
    .orderBy(asc(inserted.position));
}
export async function taskAttachmentMetadata(db: DatabaseExecutor, taskEntityId: string) {
  return db
    .select({ id: taskAttachments.id, position: taskAttachments.position, ...fileMetadata })
    .from(taskAttachments)
    .innerJoin(storedFiles, eq(storedFiles.id, taskAttachments.fileId))
    .where(eq(taskAttachments.taskEntityId, taskEntityId))
    .orderBy(asc(taskAttachments.position));
}
