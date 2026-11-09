import { mcpOutputOffloadBytes, type OffloadedOutput } from "@startup-os/contracts/harness/mcp";
import type { McpOutput, McpToolName } from "@startup-os/contracts/harness/tools";

import { safeId, safePath } from "./paths.ts";
import { writeFile } from "node:fs/promises";

const previewCharacters = 1000;

/**
 * Writes a large tool result to `<folder>/.startup-os/outputs/<turnId>/<tool>-<n>.json` and
 * returns a reference instead. Small results return undefined and stay inline.
 */
export async function offloadOutput(
  folder: string,
  turnId: string,
  tool: string,
  sequence: number,
  data: McpOutput<McpToolName>,
): Promise<OffloadedOutput | undefined> {
  const text = JSON.stringify(data);
  const bytes = Buffer.byteLength(text);
  if (bytes <= mcpOutputOffloadBytes) return undefined;
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new RangeError("Invalid sequence.");
  // The path is relative to the native session's working directory, which is the folder.
  const path = `.startup-os/outputs/${safeId(turnId)}/${safeId(tool)}-${sequence}.json`;
  await writeFile(await safePath(folder, path, false, true), text, { mode: 0o600 });
  return {
    summary: `${tool} returned ${bytes} bytes. The full JSON result is in ${path}; read that file for details. It starts with: ${text.slice(0, previewCharacters)}`,
    truncated: true,
    path,
    bytes,
  };
}
