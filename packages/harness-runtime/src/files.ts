import type { JsonObject, ToolCallResult } from "@substrate/contracts/harness-runtime";

import { safeId, safePath } from "./paths.ts";
import { writeFile } from "node:fs/promises";

type Download = NonNullable<Extract<ToolCallResult, { success: true }>["download"]>;
export type SavedDownload = JsonObject & { path: string };

function safeFilename(filename: string) {
  const name = filename
    .replace(/[^\w .()-]/g, "_")
    .replace(/^[ .]+|[ .]+$/g, "")
    .slice(0, 120);
  return name || "file";
}

export async function saveDownload(
  folder: string,
  turnId: string,
  download: Download,
  data: JsonObject,
): Promise<SavedDownload> {
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
