import type {
  addTaskAttachments,
  taskAttachmentTarget,
  taskAttachmentRequest,
  messageAttachmentRequest,
} from "@substrate/contracts/files/attachments";
import { MAX_FILE_BYTES } from "@substrate/contracts/files/input";
import { createRepositories } from "@substrate/database";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { createS3Storage } from "../../storage/s3";
import { publishCommitted } from "../realtime/committed";
import type { z } from "zod";

const storage = createS3Storage();
async function scope(headers: Headers, organizationId: string) {
  const workspace = await workspaceSession(headers, organizationId);
  return await createRepositories(db).forSession({
    userId: workspace.session.user.id,
    organizationId: workspace.organizationId,
  });
}
export function listTaskAttachments(
  headers: Headers,
  input: z.output<typeof taskAttachmentTarget>,
) {
  return serviceResult(async () =>
    (await scope(headers, input.organizationId)).files.listTask(input),
  );
}
export function attachTaskFiles(headers: Headers, input: z.output<typeof addTaskAttachments>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const repositories = await scope(headers, input.organizationId);
    await publishCommitted(await repositories.transaction((repos) => repos.files.addTask(input)));
    return { taskEntityId: input.taskEntityId };
  });
}
export function removeTaskAttachment(
  headers: Headers,
  input: z.output<typeof taskAttachmentRequest>,
) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const repositories = await scope(headers, input.organizationId);
    await publishCommitted(
      await repositories.transaction((repos) => repos.files.removeTask(input)),
    );
    return { attachmentId: input.attachmentId };
  });
}
export function taskAttachmentContent(
  headers: Headers,
  input: z.output<typeof taskAttachmentRequest>,
) {
  return serviceResult(async () => {
    const file = await (await scope(headers, input.organizationId)).files.taskContent(input);
    return { bytes: await storage.read(file.objectKey, MAX_FILE_BYTES), filename: file.filename };
  });
}
export function messageAttachmentContent(
  headers: Headers,
  input: z.output<typeof messageAttachmentRequest>,
) {
  return serviceResult(async () => {
    const file = await (await scope(headers, input.organizationId)).files.messageContent(input);
    return { bytes: await storage.read(file.objectKey, MAX_FILE_BYTES), filename: file.filename };
  });
}
