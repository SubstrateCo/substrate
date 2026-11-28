import type { PrivateFile } from "@/api/files/resources";
import { onPrivateStateReset } from "@/auth/private-state";

export async function shareRecordExport(
  load: (signal: AbortSignal) => Promise<PrivateFile>,
  share: (file: PrivateFile) => Promise<void>,
) {
  const controller = new AbortController();
  const unsubscribe = onPrivateStateReset(() => controller.abort());
  let file: PrivateFile | undefined;
  try {
    file = await load(controller.signal);
    controller.signal.throwIfAborted();
    await share(file);
  } finally {
    file?.release();
    unsubscribe();
  }
}
