import type { McpOutput } from "@substrate/contracts/harness/tools";

import { safeId, safePath } from "./paths.ts";
import { writeFile } from "node:fs/promises";

/** A filename that is safe as one path segment on every desktop platform. */
function safeFilename(filename: string) {
  const name = filename
    .replace(/[^\w .()-]/g, "_")
    .replace(/^[ .]+|[ .]+$/g, "")
    .slice(0, 120);
  return name || "file";
}

/**
 * Writes a downloaded file to `<folder>/.substrate/files/<turnId>/<attachmentId>-<filename>` and
 * returns its metadata with the relative path, so the bytes never enter the model's context.
 */
export async function saveDownload(
  folder: string,
  turnId: string,
  download: McpOutput<"download_file">,
) {
  const { data, ...file } = download;
  // The path is relative to the native session's working directory, which is the folder.
  const path = `.substrate/files/${safeId(turnId)}/${safeId(file.file.attachmentId)}-${safeFilename(file.filename)}`;
  await writeFile(await safePath(folder, path, false, true), Buffer.from(data, "base64"), {
    mode: 0o600,
  });
  return { ...file, path };
}
