import { mcpOutputOffloadBytes, type OffloadedOutput } from "@substrate/contracts/harness/mcp";
import type { McpOutput, McpToolName } from "@substrate/contracts/harness/tools";

import { safeId, safePath } from "./paths.ts";
import { writeFile } from "node:fs/promises";
import { z } from "zod";

const previewCharacters = 1000;
/** Fields that say whether a page has more. They follow the items, past the preview. */
const cursorFields = ["nextCursor", "nextBefore", "nextAfterEntityId"] as const;
/** A result, or a part of one such as a thread's replies, that may be one page of a list. */
const listPage = z.object({
  items: z.array(z.unknown()).optional(),
  nextCursor: z.unknown().optional(),
  nextBefore: z.unknown().optional(),
  nextAfterEntityId: z.unknown().optional(),
});

function pagingNotes(page: z.output<typeof listPage>, label: string) {
  const count = page.items ? `${page.items.length} items, ` : "";
  return cursorFields.flatMap((field) =>
    field in page ? [`${label}${count}${field}: ${JSON.stringify(page[field] ?? null)}`] : [],
  );
}

function resultPaging(data: McpOutput<McpToolName>) {
  const parts: [string, unknown][] = [["", data], ...Object.entries(data)];
  const pages = parts.flatMap(([key, value]) => {
    const page = listPage.safeParse(value);
    return page.success ? pagingNotes(page.data, key ? `${key}: ` : "") : [];
  });
  return pages.length
    ? ` Paging: ${pages.join("; ")}. A non-null cursor means more pages follow.`
    : "";
}

/**
 * Writes a large tool result to `<folder>/.substrate/outputs/<turnId>/<tool>-<n>.json` and
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
  const path = `.substrate/outputs/${safeId(turnId)}/${safeId(tool)}-${sequence}.json`;
  await writeFile(await safePath(folder, path, false, true), text, { mode: 0o600 });
  return {
    summary: `${tool} returned ${bytes} bytes.${resultPaging(data)} The full JSON result is in ${path}; read that file for details. It starts with: ${text.slice(0, previewCharacters)}`,
    truncated: true,
    path,
    bytes,
  };
}
