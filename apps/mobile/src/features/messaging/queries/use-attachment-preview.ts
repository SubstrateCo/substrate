import { useEffect, useState } from "react";

import { attachmentPreview, type MessageAttachmentTarget } from "../api/files";
import { onPrivateStateReset } from "@/auth/private-state";

const previews = new Map<string, Promise<string>>();
onPrivateStateReset(() => previews.clear());

type PreviewState = { uri?: string; error?: Error; loading: boolean };

export function useAttachmentPreview(target: MessageAttachmentTarget, enabled: boolean) {
  const key = `${target.organizationId}:${target.attachmentId}`;
  const [state, setState] = useState<PreviewState>({ loading: enabled });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let pending = previews.get(key);
    if (!pending) {
      pending = attachmentPreview(target);
      previews.set(key, pending);
      pending.catch(() => previews.delete(key));
    }
    setState({ loading: true });
    pending.then(
      (uri) => active && setState({ uri, loading: false }),
      (error: Error) => active && setState({ error, loading: false }),
    );
    return () => {
      active = false;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `target` is a new object each render.
  }, [key, enabled, attempt]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
