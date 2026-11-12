import { invalidate, mount } from "../client-cache.ts";
import { call } from "../http.ts";
import { keys } from "../keys.ts";
import { think } from "../pacing.ts";
import { rng } from "../persona.ts";
import {
  completeUpload,
  messageAttachmentContent,
  putObject,
  taskAttachmentContent,
} from "../upload.ts";
import { word } from "../words.ts";
import type { Message, World } from "../world.ts";

/**
 * Attachments (components/attachments/..., composer uploads): the three-step upload
 * (api/files/attachments.ts uploadAttachment), task attachments, and a message with files.
 */

export interface Attachment {
  id: string;
  fileId: string;
  filename: string;
  size: number;
}

type Target = { projectEntityId: string; taskEntityId: string };

const types = [
  { ext: "pdf", type: "application/pdf", weight: 5 },
  { ext: "png", type: "image/png", weight: 4 },
  { ext: "jpg", type: "image/jpeg", weight: 3 },
  { ext: "txt", type: "text/plain", weight: 2 },
  { ext: "csv", type: "text/csv", weight: 2 },
  { ext: "json", type: "application/json", weight: 1 },
  { ext: "zip", type: "application/zip", weight: 1 },
  {
    ext: "docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    weight: 2,
  },
  {
    ext: "xlsx",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    weight: 2,
  },
];

function filename(ext: string) {
  const roll = rng.next();
  if (roll < 0.4) return `${word()}-${word()}.${ext}`;
  if (roll < 0.7) return `${word()} ${word()} (v${rng.int(1, 4)}).${ext}`;
  if (roll < 0.9)
    return `Screenshot 2026-${String(rng.int(1, 11)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")} at ${rng.int(9, 18)}.${String(rng.int(0, 59)).padStart(2, "0")}.${ext}`;
  return `IMG_${rng.int(1000, 9999)}.${ext}`;
}

/** A file from the person's disk: 2-200 KB, log-uniform, random bytes. */
function pickFile() {
  const kind = rng.weighted(types, (entry) => entry.weight)!;
  const size = Math.round(Math.exp(rng.between(Math.log(2048), Math.log(200 * 1024))));
  const words = new Uint32Array(Math.ceil(size / 4));
  for (let index = 0; index < words.length; index++)
    words[index] = Math.floor(rng.next() * 4294967296);
  return {
    filename: filename(kind.ext),
    contentType: kind.type,
    bytes: words.buffer.slice(0, size),
  };
}

/**
 * Picks a file in the system dialog and uploads it: ticket, PUT to storage, complete. The
 * person watches the progress bar, longer for bigger files. Resolves the file ID, or null.
 */
export async function uploadFile() {
  await think("decide");
  const file = pickFile();
  const ticket = await call<{
    uploadId: string;
    uploadUrl: string;
    headers: Record<string, string>;
  }>("files.uploads", {
    purpose: "file",
    filename: file.filename,
    contentType: file.contentType,
    size: file.bytes.byteLength,
  });
  if (!ticket) return null;
  if (!(await putObject(ticket.uploadUrl, ticket.headers, file.bytes))) return null;
  for (let sent = 0; sent < file.bytes.byteLength; sent += 80 * 1024) await think("glance");
  return completeUpload(ticket.uploadId);
}

/** The attachment list in the task inspector (task-attachments.tsx). */
export async function showTaskAttachments(world: World, target: Target) {
  const rows = await mount(
    keys.taskAttachments(world.organizationId, target.projectEntityId, target.taskEntityId),
    () => call<Attachment[]>("files.taskAttachments", target),
  );
  return rows ?? [];
}

const refreshAttachments = (world: World, target: Target) =>
  invalidate(
    [keys.taskAttachments(world.organizationId, target.projectEntityId, target.taskEntityId)],
    "mutation",
  );

export async function attachToTask(world: World, target: Target, fileIds: string[]) {
  const result = await call("files.taskAttachments.add", { ...target, attachmentFileIds: fileIds });
  if (result) await refreshAttachments(world, target);
  return !!result;
}

export async function removeTaskAttachment(world: World, target: Target, attachmentId: string) {
  const result = await call("files.taskAttachments.remove", { ...target, attachmentId });
  if (result) await refreshAttachments(world, target);
  return !!result;
}

export const openTaskAttachment = (world: World, target: Target, attachmentId: string) =>
  taskAttachmentContent({ organizationId: world.organizationId, ...target, attachmentId });

/** Clicks a file under a message, which downloads it (api/files/attachments.ts). */
export const openMessageAttachment = (world: World, message: Message, attachmentId: string) =>
  messageAttachmentContent({
    organizationId: world.organizationId,
    conversationId: message.conversationId,
    messageId: message.id,
    attachmentId,
  });

/** Sends a composer message with uploaded files, invalidating as invalidateSentMessage does. */
export async function sendWithFiles(
  world: World,
  conversationId: string,
  body: string,
  fileIds: string[],
) {
  const org = world.organizationId;
  const message = await call<Message>("messaging.messages.send", {
    conversationId,
    body,
    attachmentFileIds: fileIds,
    requestId: crypto.randomUUID(),
  });
  if (!message) return null;
  await invalidate(
    [
      keys.conversationMessages(org, conversationId),
      keys.messageTargets(org, conversationId),
      ...[keys.search(org), keys.searchPages(org)].map((prefix) => ({
        prefix,
        staleOnly: true as const,
      })),
    ],
    "mutation",
  );
  return message;
}
