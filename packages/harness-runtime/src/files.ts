import type { JsonObject, ToolCallResult } from "@substrate/contracts/harness-runtime";

import { safeId, safePath } from "./paths.ts";
import { writeFile } from "node:fs/promises";

type Download = NonNullable<Extract<ToolCallResult, { success: true }>["download"]>;
export type SavedDownload = JsonObject & { path: string };

/** A filename that is safe as one path segment on every desktop platform. */
function safeFilename(filename: string) {
  const name = filename
    .replace(/[^\w .()-]/g, "_")
    .replace(/^[ .]+|[ .]+$/g, "")
    .slice(0, 120);
  return name || "file";
}

/**
 * Writes a downloaded file to `<folder>/.substrate/files/<turnId>/<id>-<filename>` and returns
 * the result data with the relative path, so the bytes never enter the model's context.
 */
export async function saveDownload(
  folder: string,
  turnId: string,
  download: Download,
  data: JsonObject,
): Promise<SavedDownload> {
  // The path is relative to the native session's working directory, which is the folder.
  const path = `.substrate/files/${safeId(turnId)}/${safeId(download.id)}-${safeFilename(download.filename)}`;
  await writeFile(
    await safePath(folder, path, false, true),
    Buffer.from(download.base64, "base64"),
    {
      mode: 0o600,
    },
  );
  return { ...data, path };
}
