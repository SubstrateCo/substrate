import type { FilePurpose } from "@substrate/contracts/files/input";

import { Platform } from "react-native";

import { api } from "../client";
import { readResult } from "../result";
import { File } from "expo-file-system";
import { fetch } from "expo/fetch";

export interface UploadFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  /** Expo document pickers provide this for web. Native uses the picked URI. */
  file?: globalThis.File;
}

export async function uploadFile(
  file: UploadFile,
  signal?: AbortSignal,
  purpose: FilePurpose = "file",
) {
  const ticket = await readResult(
    api.files.uploads.$post(
      {
        json: {
          purpose,
          filename: file.name,
          contentType: file.mimeType || "application/octet-stream",
          size: file.size,
        },
      },
      { init: { signal } },
    ),
  );
  const body =
    Platform.OS === "web" ? await file.file?.arrayBuffer() : await new File(file.uri).arrayBuffer();
  if (!body) throw new Error("Select the file again before uploading.");
  const response = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: storageHeaders(ticket.headers),
    body,
    credentials: "omit",
    redirect: "error",
    signal,
  });
  if (!response.ok) throw new Error("Upload failed. Please try again.");
  signal?.throwIfAborted();
  const completed = await readResult(
    api.files.uploads[":id"].complete.$post(
      { param: { id: ticket.uploadId } },
      { init: { signal } },
    ),
  );
  return completed.fileId;
}

export function storageHeaders(values: Record<string, string>) {
  const headers = new Headers(values);
  for (const name of ["cookie", "authorization", "origin"]) headers.delete(name);
  return headers;
}
