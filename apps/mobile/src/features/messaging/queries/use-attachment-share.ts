import { useMutation } from "@tanstack/react-query";

import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import type { MessageAttachmentTarget } from "../api/files";
import { useMessagingScope } from "../scope";
import { api } from "@/api/client";
import { downloadAndShareFile } from "@/api/files/downloads";

/** "Share" opens the system share sheet on native, which also offers Open in and Save to Files. */
export const shareAttachmentLabel = Platform.OS === "web" ? "Download" : "Share";

/**
 * Downloads a message attachment through the byte-serving route and hands it to the system. The
 * download stops when the row unmounts, and the private copy is removed after sharing.
 */
export function useShareAttachment(
  target: MessageAttachmentTarget,
  file: { filename: string; contentType: string },
) {
  const scope = useMessagingScope(target.organizationId);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return useMutation({
    mutationFn: () => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      return downloadAndShareFile({
        url: api.files.attachments.messages.content.$url({ query: target }).toString(),
        filename: file.filename,
        mimeType: file.contentType || undefined,
        scope,
        signal: current.signal,
      });
    },
  });
}
