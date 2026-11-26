import type { StorageScope } from "@substrate/contracts/files/scope";

import { fetchPrivateBytes } from "./bytes";
import { shareTemporaryFile } from "./platform";
import { privateFiles } from "./private-files";
import { safeFilename, sharePrivateFile } from "./resources";
import { attachmentDownloadURL } from "./urls";

export async function downloadAndShareFile({
  url,
  filename,
  mimeType = "application/octet-stream",
  scope,
  signal,
}: {
  url: string;
  filename: string;
  mimeType?: string;
  scope: StorageScope;
  signal?: AbortSignal;
}) {
  const file = await privateFiles.load({
    filename,
    mimeType: "application/octet-stream",
    scope,
    signal,
    load: (requestSignal) => fetchPrivateBytes(attachmentDownloadURL(url), requestSignal),
  });
  await sharePrivateFile(file, async () => {
    signal?.throwIfAborted();
    await shareTemporaryFile(file, safeFilename(filename), mimeType);
  });
}
