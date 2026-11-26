import type { contextSourceTask } from "@substrate/contracts/context/input";
import type {
  taskAttachmentTarget,
  taskAttachmentRequest,
} from "@substrate/contracts/files/attachments";
import { projectIcon } from "@substrate/contracts/files/pictures";

import { Platform } from "react-native";

import { prepareTaskDownload } from "./task-download";
import { safeTaskFilename } from "./task-file-helpers";
import { api, authenticatedFetch } from "@/api/client";
import { type UploadFile } from "@/api/files/uploads";
import { readResult } from "@/api/result";
import { File } from "expo-file-system";
import { z } from "zod";

export type TaskTarget = z.input<typeof taskAttachmentTarget>;
const pictureResult = z.object({ url: projectIcon.unwrap() });
type NativeFileForm = FormData & {
  append(name: string, file: File, filename?: string): void;
};

function acceptsNativeFile(form: FormData): form is NativeFileForm {
  // Expo's fetch encoder accepts Expo File.bytes() on its patched React Native form.
  // This extension is not supported by a browser's multipart implementation.
  // oxlint-disable-next-line deslop/no-runtime-typeof -- Platform API boundary: verify the native multipart implementation before using Expo's File extension.
  return Platform.OS !== "web" && "getParts" in form && typeof form.getParts === "function";
}

export const taskApi = {
  fromMessage: (json: z.input<typeof contextSourceTask>) =>
    readResult(api.context["source-tasks"].$post({ json })),
  discussion: (json: TaskTarget) => readResult(api.tasks.discussion.$post({ json })),
  attachments: (query: TaskTarget, signal?: AbortSignal) =>
    readResult(api.files.attachments.tasks.$get({ query }, { init: { signal } })),
  attach: (json: TaskTarget & { attachmentFileIds: string[] }) =>
    readResult(api.files.attachments.tasks.$post({ json })),
  remove: (json: z.input<typeof taskAttachmentRequest>) =>
    readResult(api.files.attachments.tasks.$delete({ json })),
  picture: async (organizationId: string, projectEntityId: string, picked: UploadFile) => {
    const form = new FormData();
    if (Platform.OS === "web") {
      if (!picked.file) throw new Error("Select the picture again.");
      form.append("file", picked.file, picked.name);
    } else {
      const file = new File(picked.uri);
      if (!file.exists) throw new Error("Select the picture again.");
      if (!acceptsNativeFile(form))
        throw new Error("Picture uploads are unavailable on this device.");
      form.append("file", file, picked.name);
    }
    form.append("organizationId", organizationId);
    form.append("projectEntityId", projectEntityId);
    const url = api.files.pictures[":purpose"].$url({ param: { purpose: "project-icon" } });
    const result = await readResult(authenticatedFetch(url, { method: "POST", body: form }));
    return pictureResult.parse(result);
  },
};

/** Download through the byte-serving attachment route, never the redirecting file route. */
export async function saveTaskAttachment(
  query: z.input<typeof taskAttachmentRequest>,
  filename: string,
) {
  // Ask for the destination first so a canceled picker does not fetch private bytes.
  const save = await prepareTaskDownload(safeTaskFilename(filename));
  const response = await api.files.attachments.tasks.content.$get({ query });
  if (!response.ok) throw new Error("Could not download this attachment. Check your access.");
  await save(response);
}
