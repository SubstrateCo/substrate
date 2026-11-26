import type {
  addTaskAttachments,
  taskAttachmentTarget,
  taskAttachmentRequest,
  messageAttachmentRequest,
} from "@substrate/contracts/files/attachments";
import { MAX_FILE_BYTES } from "@substrate/contracts/files/input";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { ServiceError, serviceResult } from "../../shared/service-result";
import type { ObjectStorage } from "../../storage/types";
import type { ImageCodec } from "./image-codec";
import { previewAttachmentImage } from "./image-policy";
import type { z } from "zod";

export function createAttachmentService({
  storage,
  images,
  publish,
}: {
  storage: ObjectStorage;
  images: ImageCodec;
  publish: CommittedPublisher;
}) {
  return {
    listTaskAttachments(scope: WorkspaceScope, input: z.output<typeof taskAttachmentTarget>) {
      return serviceResult(() => scope.repositories.files.listTask(input));
    },
    listTaskSourceAttachments(scope: WorkspaceScope, input: z.output<typeof taskAttachmentTarget>) {
      return serviceResult(() => scope.repositories.files.listTaskSource(input));
    },
    attachTaskFiles(scope: WorkspaceScope, input: z.output<typeof addTaskAttachments>) {
      return serviceResult(async () => {
        await publish(await scope.repositories.transaction((repos) => repos.files.addTask(input)));
        return { taskEntityId: input.taskEntityId };
      });
    },
    removeTaskAttachment(scope: WorkspaceScope, input: z.output<typeof taskAttachmentRequest>) {
      return serviceResult(async () => {
        await publish(
          await scope.repositories.transaction((repos) => repos.files.removeTask(input)),
        );
        return { attachmentId: input.attachmentId };
      });
    },
    taskAttachmentContent(scope: WorkspaceScope, input: z.output<typeof taskAttachmentRequest>) {
      return serviceResult(async () => {
        const file = await scope.repositories.files.taskContent(input);
        return {
          bytes: await storage.read(file.objectKey, MAX_FILE_BYTES),
          filename: file.filename,
        };
      });
    },
    messageAttachmentPreview(
      scope: WorkspaceScope,
      input: z.output<typeof messageAttachmentRequest>,
    ) {
      return serviceResult(async () => {
        const file = await scope.repositories.files.messageContent(input);
        const bytes = await previewAttachmentImage(
          images,
          await storage.read(file.objectKey, MAX_FILE_BYTES),
        );
        if (!bytes) throw new ServiceError("INVALID_INPUT", "This file cannot be previewed.");
        return { bytes };
      });
    },
    messageAttachmentContent(
      scope: WorkspaceScope,
      input: z.output<typeof messageAttachmentRequest>,
    ) {
      return serviceResult(async () => {
        const file = await scope.repositories.files.messageContent(input);
        return {
          bytes: await storage.read(file.objectKey, MAX_FILE_BYTES),
          filename: file.filename,
        };
      });
    },
  };
}
export type AttachmentService = ReturnType<typeof createAttachmentService>;
