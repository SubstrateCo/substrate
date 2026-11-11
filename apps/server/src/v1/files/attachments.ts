import type {
  addTaskAttachments,
  taskAttachmentTarget,
  taskAttachmentRequest,
  messageAttachmentRequest,
} from "@substrate/contracts/files/attachments";
import { MAX_FILE_BYTES } from "@substrate/contracts/files/input";
import { realtimeKeys } from "@substrate/contracts/realtime";
import { createAttachmentRepository } from "@substrate/database/files";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { createS3Storage } from "../../storage/s3";
import { publishRefresh } from "../realtime/publisher";
import type { z } from "zod";

const repository = createAttachmentRepository(db);
const storage = createS3Storage();
async function scope(headers: Headers, organizationId: string) {
  const workspace = await workspaceSession(headers, organizationId);
  return { userId: workspace.session.user.id, organizationId: workspace.organizationId };
}
export function listTaskAttachments(
  headers: Headers,
  input: z.output<typeof taskAttachmentTarget>,
) {
  return serviceResult(async () =>
    repository.listTask(await scope(headers, input.organizationId), input),
  );
}
export function attachTaskFiles(headers: Headers, input: z.output<typeof addTaskAttachments>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    await repository.addTask(await scope(headers, input.organizationId), input);
    await publishRefresh([
      { audience: realtimeKeys.organization(input.organizationId), domain: "tasks" },
    ]);
    return { taskEntityId: input.taskEntityId };
  });
}
export function removeTaskAttachment(
  headers: Headers,
  input: z.output<typeof taskAttachmentRequest>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    await repository.removeTask(await scope(headers, input.organizationId), input);
    await publishRefresh([
      { audience: realtimeKeys.organization(input.organizationId), domain: "tasks" },
    ]);
    return { attachmentId: input.attachmentId };
  });
}
export function taskAttachmentContent(
  headers: Headers,
  input: z.output<typeof taskAttachmentRequest>,
) {
  return serviceResult(async () => {
    const file = await repository.taskContent(await scope(headers, input.organizationId), input);
    return { bytes: await storage.read(file.objectKey, MAX_FILE_BYTES), filename: file.filename };
  });
}
export function messageAttachmentContent(
  headers: Headers,
  input: z.output<typeof messageAttachmentRequest>,
) {
  return serviceResult(async () => {
    const file = await repository.messageContent(await scope(headers, input.organizationId), input);
    return { bytes: await storage.read(file.objectKey, MAX_FILE_BYTES), filename: file.filename };
  });
}
