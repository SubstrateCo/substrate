import type { StorageScope } from "@substrate/contracts/files/scope";

import { fetchPrivateBytes } from "./bytes";
import { privateFiles } from "./private-files";
import { privateImageURL } from "./urls";

// oxlint-disable-next-line deslop/no-reexports-outside-entrypoints -- Stable file API facade used by messaging and task picture consumers.
export { pictureBytesURL } from "./urls";

export function loadPrivateImage(value: string, scope: StorageScope, signal?: AbortSignal) {
  const url = privateImageURL(value);
  return privateFiles.load({
    filename: "picture.webp",
    mimeType: "image/webp",
    scope,
    signal,
    load: (requestSignal) => fetchPrivateBytes(url, requestSignal, true),
  });
}
