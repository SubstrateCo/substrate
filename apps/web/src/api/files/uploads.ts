import { api, type Api } from "../client";
import { readResult } from "../result";
import type { PictureKind } from "./pictures";

export async function uploadPictureFile(
  file: File,
  purpose: PictureKind,
  signal?: AbortSignal,
  http: Api = api,
  storageFetch: typeof globalThis.fetch = globalThis.fetch,
) {
  const upload = await readResult(
    http.files.uploads.$post(
      { json: { purpose, filename: file.name, contentType: file.type, size: file.size } },
      { init: { signal } },
    ),
  );
  const response = await storageFetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.headers,
    body: file,
    credentials: "omit",
    signal,
  });
  if (!response.ok) throw new Error("The picture could not be uploaded. Please try again.");
  const { fileId } = await readResult(
    http.files.uploads[":id"].complete.$post(
      { param: { id: upload.uploadId } },
      { init: { signal } },
    ),
  );
  signal?.throwIfAborted();
  return fileId;
}
